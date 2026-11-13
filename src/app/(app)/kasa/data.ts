import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import { sumSales, sumNonfiscal, sumKw, sumManualKp, type PaymentCategory, type TxClass, type DocType } from "@/lib/kasa";

export type CashDay = {
  id: string;
  date: string;
  rd_number: number | null;
  opening_balance: number;
  terminal_total: number | null;
  fiscal_daily_total: number | null;
  status: "open" | "closed";
  closed_by_employee_id: string | null;
  closed_at: string | null;
};

// Dzień kasowy istnieje tylko jeśli ktoś już coś policzył albo zamknął —
// otwarcie, które jeszcze nikt nie dotknął, nie musi mieć wiersza (expected
// liczymy w locie z kasa_settings/poprzedniego dnia). Tworzymy leniwie przy
// pierwszym zapisie liczenia (patrz saveCashCount w actions.ts), nie tutaj.
export async function getCashDay(date: string): Promise<CashDay | null> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("cash_days")
    .select("id, date, rd_number, opening_balance, terminal_total, fiscal_daily_total, status, closed_by_employee_id, closed_at")
    .eq("date", date)
    .maybeSingle();
  return data as CashDay | null;
}

// Saldo otwarcia dla dnia bez wiersza w cash_days jeszcze: punkt zaczepienia
// łańcucha to NAJNOWSZE naprawdę zapisane zamknięcie przed `date` (albo,
// jeśli żadnego nie ma, start systemu z kasa_settings) — NIEKONIECZNIE
// dzień bezpośrednio poprzedni: recepcja mogła nie zamykać kilku dni pod
// rząd (np. dane dociągnięte naraz z Data Lake, 10-13.11.2026). Od punktu
// zaczepienia idziemy do `date` dzień po dniu, doliczając (date po punkcie
// zaczepienia) albo odejmując (date przed, podgląd/weryfikacja okresu
// testowego, pkt 10 spec) ruch gotówkowy każdego dnia pośredniego —
// odwrotności/powtórzenia wzoru z expectedCashBalance. Zgłoszone
// 13.11.2026: licząc tylko najbliższy ISTNIEJĄCY wiersz cash_days (a nie
// pilnując, że to naprawdę dzień bezpośrednio poprzedni), 13.11 brało
// zamknięcie z 10.11 (1341,17, jedyny zamknięty dzień) i całkowicie
// pomijało 11-12.11 — zamiast prawdziwego 1458,67.
export async function resolveOpeningBalance(date: string): Promise<number> {
  const supabase = createServerSupabaseClient();

  const { data: prevCloseRow } = await supabase
    .from("cash_days")
    .select("date, cash_counts!inner(counted)")
    .eq("cash_counts.slot", "close")
    .lt("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevClose = (prevCloseRow as unknown as { date: string; cash_counts: { counted: number }[] } | null) ?? null;

  const { data: settings } = await supabase.from("kasa_settings").select("opening_balance, start_date").eq("id", 1).single();
  const openingAtStart = settings?.opening_balance ?? 0;

  const anchorDate = prevClose?.date ?? settings?.start_date ?? date;
  const anchorBalance = prevClose ? prevClose.cash_counts[0].counted : openingAtStart;
  if (date === anchorDate || !settings?.start_date) return anchorBalance;

  // JEDNO zapytanie za cały zakres (patrz getTransactionsInRange), nie N
  // sekwencyjnych zapytań dzień po dniu — tamta wersja potrafiła być bardzo
  // wolna na telefonie (każdy dzień = kolejny round-trip do bazy).
  const forward = date > anchorDate;
  const rangeTransactions = forward ? await getTransactionsInRange(anchorDate, date) : await getTransactionsInRange(date, anchorDate);
  const byDate = groupByTransactionDate(rangeTransactions);

  let balance = anchorBalance;
  let cursor = anchorDate;
  if (forward) {
    while (cursor < date) {
      const totals = computeDayTotals(byDate.get(cursor) ?? []);
      balance = balance + totals.cashFiscal - totals.kw + totals.manualKp;
      cursor = shiftDateKey(cursor, 1);
    }
  } else {
    while (cursor > date) {
      const prevDate = shiftDateKey(cursor, -1);
      const totals = computeDayTotals(byDate.get(prevDate) ?? []);
      balance = balance - totals.cashFiscal + totals.kw - totals.manualKp;
      cursor = prevDate;
    }
  }
  return Math.round(balance * 100) / 100;
}

function groupByTransactionDate(rows: (DayTransaction & { transactionDate: string })[]): Map<string, DayTransaction[]> {
  const byDate = new Map<string, DayTransaction[]>();
  for (const t of rows) {
    if (!byDate.has(t.transactionDate)) byDate.set(t.transactionDate, []);
    byDate.get(t.transactionDate)!.push(t);
  }
  return byDate;
}

function shiftDateKey(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DayTransaction = {
  id: string;
  value: number;
  tx_class: TxClass;
  transaction_at: string | null;
  full_number: string;
  contractor: string;
  description: string | null;
  type_label: string;
  category: PaymentCategory;
  docType: DocType | null;
};

type RawTxRow = Omit<DayTransaction, "category" | "docType"> & { transaction_date: string; payment_forms_map: { category: PaymentCategory } | null };

// Dokłada category (z payment_forms_map) i docType (z cash_doc_links) do
// surowych wierszy efitness_transactions — wspólne dla zapytania o jeden
// dzień i o cały zakres dat, żeby nie dublować logiki. Osobne zapytanie o
// doc_type zamiast zagnieżdżonego select — cash_doc_links ma unikalny
// transaction_id (1:1), ale kształt zwrotki zagnieżdżonej relacji bywa
// niejednoznaczny (obiekt vs tablica); mapa po id jest prostsza i pewna,
// a filtr po konkretnych id nie ciągnie całej (rosnącej z czasem) tabeli.
async function enrichTransactions<T extends RawTxRow>(supabase: ReturnType<typeof createServerSupabaseClient>, rows: T[]) {
  const ids = rows.map((r) => r.id);
  const docTypeByTx = new Map<string, DocType | null>();
  if (ids.length > 0) {
    const { data: linksRaw } = await supabase.from("cash_doc_links").select("transaction_id, doc_type").in("transaction_id", ids);
    for (const l of linksRaw ?? []) docTypeByTx.set(l.transaction_id, l.doc_type as DocType | null);
  }
  return rows.map((t) => ({
    ...t,
    category: t.payment_forms_map?.category ?? ("ignore" as PaymentCategory),
    docType: docTypeByTx.get(t.id) ?? null,
  }));
}

const TX_SELECT = "id, value, tx_class, transaction_at, full_number, contractor, description, type_label, transaction_date, payment_forms_map(category)";

export async function getDayTransactions(date: string): Promise<DayTransaction[]> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from("efitness_transactions").select(TX_SELECT).eq("transaction_date", date).order("transaction_at", { ascending: true });
  return enrichTransactions(supabase, (data ?? []) as unknown as RawTxRow[]);
}

// Wszystkie transakcje z zakresu [fromDate, toDateExclusive) w JEDNYM
// zapytaniu — używane przez resolveOpeningBalance do cofania się przez
// kilka dni naraz, zamiast odpytywać bazę osobno dla każdego dnia.
async function getTransactionsInRange(fromDate: string, toDateExclusive: string): Promise<(DayTransaction & { transactionDate: string })[]> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from("efitness_transactions").select(TX_SELECT).gte("transaction_date", fromDate).lt("transaction_date", toDateExclusive);
  const enriched = await enrichTransactions(supabase, (data ?? []) as unknown as RawTxRow[]);
  return enriched.map((t) => ({ ...t, transactionDate: t.transaction_date }));
}

export type DayTotals = {
  cashFiscal: number;
  card: number;
  nonfiscal: number;
  kw: number;
  manualKp: number;
};

export function computeDayTotals(transactions: DayTransaction[]): DayTotals {
  const withTxClass = transactions.map((t) => ({ ...t, txClass: t.tx_class }));
  return {
    cashFiscal: sumSales(withTxClass, "cash"),
    card: sumSales(withTxClass, "card"),
    nonfiscal: sumNonfiscal(withTxClass),
    kw: sumKw(withTxClass),
    manualKp: sumManualKp(withTxClass),
  };
}

export type CashCount = {
  slot: "open" | "shift" | "close";
  counted: number;
  expected: number;
  difference: number;
  explanation: string;
  employee_id: string | null;
};

export async function getDayCounts(cashDayId: string | null): Promise<CashCount[]> {
  if (!cashDayId) return [];
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from("cash_counts").select("slot, counted, expected, difference, explanation, employee_id").eq("cash_day_id", cashDayId);
  return (data ?? []) as CashCount[];
}

export type DocLinkRow = {
  id: string;
  transaction_id: string;
  doc_type: string | null;
  status: "todo" | "complete" | "waiting";
  note: string;
  ksef_number: string | null;
  full_number: string;
  contractor: string;
  description: string | null;
  value: number;
  tx_class: TxClass;
  transaction_date: string;
};

export async function getDayDocLinks(date: string): Promise<DocLinkRow[]> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("cash_doc_links")
    .select(
      "id, transaction_id, doc_type, status, note, ksef_number, efitness_transactions!inner(full_number, contractor, description, value, tx_class, transaction_date)"
    )
    .eq("efitness_transactions.transaction_date", date)
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as {
    id: string;
    transaction_id: string;
    doc_type: string | null;
    status: "todo" | "complete" | "waiting";
    note: string;
    ksef_number: string | null;
    efitness_transactions: { full_number: string; contractor: string; description: string | null; value: number; tx_class: TxClass; transaction_date: string };
  }[]).map((d) => ({
    id: d.id,
    transaction_id: d.transaction_id,
    doc_type: d.doc_type,
    status: d.status,
    note: d.note,
    ksef_number: d.ksef_number,
    full_number: d.efitness_transactions.full_number,
    contractor: d.efitness_transactions.contractor,
    description: d.efitness_transactions.description,
    value: d.efitness_transactions.value,
    tx_class: d.efitness_transactions.tx_class,
    transaction_date: d.efitness_transactions.transaction_date,
  }));
}

export type ShiftEmployee = { id: string; name: string; color_hex: string };

// Kto miał zmianę danego dnia — do wyboru "kto liczy" na kiosku recepcji
// (bez osobistego logowania, patrz /recepcja/kasa). W /kasa (zalogowany
// użytkownik) liczący to po prostu bieżąca sesja, bez wyboru.
export async function getEmployeesOnShift(date: string): Promise<ShiftEmployee[]> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("schedule_day")
    .select("schedule_shift(employee_id, employee:employee_id(id, name, color_hex))")
    .eq("date", date)
    .maybeSingle();
  const shifts = (data?.schedule_shift ?? []) as unknown as { employee_id: string | null; employee: ShiftEmployee | null }[];
  const byId = new Map<string, ShiftEmployee>();
  for (const s of shifts) {
    if (s.employee) byId.set(s.employee.id, s.employee);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function today(): string {
  return toDateKey(new Date());
}
