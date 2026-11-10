"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getSessionEmployee } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { expectedCashBalance, cashDifference, splitDeposits, docStatusForType, type DocType, type CashCountSlot } from "@/lib/kasa";
import { getDayTransactions, computeDayTotals, resolveOpeningBalance } from "./data";

function revalidate(date: string) {
  revalidatePath("/kasa");
  revalidatePath("/recepcja/kasa");
  revalidatePath(`/kasa?date=${date}`);
}

async function requireCountingEmployee(formData: FormData): Promise<string> {
  const session = await getSessionEmployee();
  if (session) return session.id;
  const picked = String(formData.get("employee_id") ?? "");
  if (!picked) throw new Error("Wybierz osobę, która liczy.");
  return picked;
}

// Pobiera dzień kasowy, a jeśli jeszcze nie istnieje — tworzy go z saldem
// otwarcia z poprzedniego dnia (albo kasa_settings, jeśli to start systemu).
async function getOrCreateCashDayId(date: string): Promise<string> {
  const supabase = createServerSupabaseClient();
  const { data: existing } = await supabase.from("cash_days").select("id").eq("date", date).maybeSingle();
  if (existing) return existing.id;

  const openingBalance = await resolveOpeningBalance(date);
  const { data: created, error } = await supabase.from("cash_days").insert({ date, opening_balance: openingBalance }).select("id").single();
  if (error || !created) throw new Error(dbErrorMessage(error, "Nie udało się utworzyć dnia kasowego."));
  return created.id;
}

// Jedno liczenie (otwarcie/zmiana/zamknięcie) — pkt 3 spec. "expected"
// liczony z transakcji JUŻ zaimportowanych w chwili zapisu: dla "open" to
// po prostu saldo otwarcia (bez ruchów dnia, zgodnie ze specyfikacją), dla
// "shift"/"close" doliczamy sprzedaż gotówkową dnia do tej pory. Kaucje
// (depositsCash) wchodzą do wzoru tylko przy "close", bo dopiero tam
// recepcja podaje sumę z terminala — przed tym nie da się ich rozdzielić.
export async function saveCashCount(formData: FormData) {
  const date = String(formData.get("date") ?? "");
  const slot = String(formData.get("slot") ?? "") as CashCountSlot;
  if (!date || !["open", "shift", "close"].includes(slot)) throw new Error("Nieprawidłowe dane liczenia.");

  const countedRaw = String(formData.get("counted") ?? "").trim().replace(",", ".");
  const counted = Number(countedRaw);
  if (!Number.isFinite(counted)) throw new Error("Podaj poprawną kwotę gotówki w szufladzie.");

  const employeeId = await requireCountingEmployee(formData);
  const supabase = createServerSupabaseClient();
  const cashDayId = await getOrCreateCashDayId(date);
  const { data: day } = await supabase.from("cash_days").select("opening_balance, status").eq("id", cashDayId).single();
  if (!day) throw new Error("Nie znaleziono dnia kasowego.");
  if (day.status === "closed") throw new Error("Dzień jest zamknięty — korekta tylko przez admina.");

  const transactions = await getDayTransactions(date);
  const totals = computeDayTotals(transactions);

  let expected: number;
  let terminalTotal: number | null = null;
  let fiscalDailyTotal: number | null = null;

  if (slot === "open") {
    expected = day.opening_balance;
  } else if (slot === "shift") {
    expected = expectedCashBalance({ openingBalance: day.opening_balance, cashFiscal: totals.cashFiscal, depositsCash: 0, kp: totals.manualKp, kw: totals.kw });
  } else {
    const terminalRaw = String(formData.get("terminal_total") ?? "").trim().replace(",", ".");
    terminalTotal = Number(terminalRaw);
    if (!Number.isFinite(terminalTotal)) throw new Error("Podaj sumę z wydruku terminala.");
    const fiscalRaw = String(formData.get("fiscal_daily_total") ?? "").trim().replace(",", ".");
    fiscalDailyTotal = fiscalRaw ? Number(fiscalRaw) : null;
    const split = splitDeposits(terminalTotal, totals.card, totals.nonfiscal);
    expected = expectedCashBalance({ openingBalance: day.opening_balance, cashFiscal: totals.cashFiscal, depositsCash: split.depositsCash, kp: totals.manualKp, kw: totals.kw });
  }

  const difference = cashDifference(expected, counted);
  const explanation = String(formData.get("explanation") ?? "").trim();
  if (difference !== 0 && !explanation) throw new Error("Przy różnicy innej niż 0 wyjaśnienie jest obowiązkowe.");

  const { error } = await supabase.from("cash_counts").upsert(
    { cash_day_id: cashDayId, slot, counted, expected, difference, explanation, employee_id: employeeId },
    { onConflict: "cash_day_id,slot" }
  );
  if (error) throw new Error(dbErrorMessage(error));

  if (slot === "close") {
    const { error: dayError } = await supabase.from("cash_days").update({ terminal_total: terminalTotal, fiscal_daily_total: fiscalDailyTotal, updated_at: new Date().toISOString() }).eq("id", cashDayId);
    if (dayError) throw new Error(dbErrorMessage(dayError));
  }

  revalidate(date);
}

// Zamknięcie dnia (pkt 3) — numer RD kolejny, ciągły (max dotąd + 1, albo
// kasa_settings.first_rd_number jeśli to pierwsze zamknięcie), dzień potem
// tylko do odczytu.
export async function closeCashDay(formData: FormData) {
  const date = String(formData.get("date") ?? "");
  if (!date) throw new Error("Brak daty.");
  const employeeId = await requireCountingEmployee(formData);

  const supabase = createServerSupabaseClient();
  const { data: day } = await supabase.from("cash_days").select("id, status").eq("date", date).maybeSingle();
  if (!day) throw new Error("Najpierw zapisz liczenie na zamknięcie.");
  if (day.status === "closed") throw new Error("Dzień jest już zamknięty.");

  const { data: closeCount } = await supabase.from("cash_counts").select("id").eq("cash_day_id", day.id).eq("slot", "close").maybeSingle();
  if (!closeCount) throw new Error("Najpierw zapisz liczenie na zamknięcie.");

  const { data: lastDay } = await supabase.from("cash_days").select("rd_number").not("rd_number", "is", null).order("rd_number", { ascending: false }).limit(1).maybeSingle();
  let rdNumber: number;
  if (lastDay?.rd_number) {
    rdNumber = lastDay.rd_number + 1;
  } else {
    const { data: settings } = await supabase.from("kasa_settings").select("first_rd_number").eq("id", 1).single();
    rdNumber = settings?.first_rd_number ?? 1;
  }

  const { error } = await supabase
    .from("cash_days")
    .update({ status: "closed", rd_number: rdNumber, closed_by_employee_id: employeeId, closed_at: new Date().toISOString() })
    .eq("id", day.id);
  if (error) throw new Error(dbErrorMessage(error));

  revalidate(date);
}

// Uzupełnienie jednego dokumentu KW/KP (pkt 4) — pojedyncze, bez presji
// czasowej. Załącznik (skan/zdjęcie) dochodzi w kolejnym kroku (ekran
// hurtowy); tu można już wybrać typ dokumentu i dodać notatkę/nr faktury.
export async function saveDocLink(formData: FormData) {
  const employee = await getSessionEmployee();
  const id = String(formData.get("id") ?? "");
  const docType = String(formData.get("doc_type") ?? "") as DocType;
  const validTypes: DocType[] = ["receipt", "ksef_invoice", "foreign_invoice", "awaiting_invoice", "client_correction", "wallet_operation", "other"];
  if (!id || !validTypes.includes(docType)) throw new Error("Nieprawidłowe dane dokumentu.");

  const note = String(formData.get("note") ?? "").trim();
  const ksefNumber = String(formData.get("ksef_number") ?? "").trim();
  const status = docStatusForType(docType);

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("cash_doc_links")
    .update({ doc_type: docType, note, ksef_number: ksefNumber || null, status, updated_by_employee_id: employee?.id ?? null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/kasa");
  revalidatePath("/recepcja/kasa");
}
