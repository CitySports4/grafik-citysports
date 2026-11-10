import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import { sumSales, sumNonfiscal, sumKw, sumManualKp, type PaymentCategory, type TxClass } from "@/lib/kasa";

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

// Saldo otwarcia dla dnia bez wiersza w cash_days jeszcze: zamknięcie
// poprzedniego dnia (cash_counts slot="close" counted), albo
// kasa_settings.opening_balance jeśli to dzień startu systemu.
export async function resolveOpeningBalance(date: string): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { data: prevDay } = await supabase.from("cash_days").select("id, date").lt("date", date).order("date", { ascending: false }).limit(1).maybeSingle();
  if (prevDay) {
    const { data: prevClose } = await supabase.from("cash_counts").select("counted").eq("cash_day_id", prevDay.id).eq("slot", "close").maybeSingle();
    if (prevClose) return prevClose.counted;
  }
  const { data: settings } = await supabase.from("kasa_settings").select("opening_balance, start_date").eq("id", 1).single();
  return settings?.opening_balance ?? 0;
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
};

export async function getDayTransactions(date: string): Promise<DayTransaction[]> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("efitness_transactions")
    .select("id, value, tx_class, transaction_at, full_number, contractor, description, type_label, payment_forms_map(category)")
    .eq("transaction_date", date)
    .order("transaction_at", { ascending: true });
  return ((data ?? []) as unknown as (Omit<DayTransaction, "category"> & { payment_forms_map: { category: PaymentCategory } | null })[]).map((t) => ({
    ...t,
    category: t.payment_forms_map?.category ?? "ignore",
  }));
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
