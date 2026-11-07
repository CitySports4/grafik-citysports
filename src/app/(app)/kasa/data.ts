import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import {
  expectedClosing,
  type CashDayStatus,
  type CashCountSlot,
  type CashIncomeWindow,
  type CashDocumentType,
  type AttachmentKind,
} from "@/lib/kasa";

export type CashDay = {
  id: string;
  date: string;
  rd_number: number | null;
  opening_balance: number;
  expected_closing: number | null;
  counted_closing: number | null;
  difference: number | null;
  explanation: string;
  status: CashDayStatus;
  closed_by_employee_id: string | null;
};

// Pobiera dzień kasowy na datę, a jeśli nie istnieje — tworzy go z
// opening_balance = counted_closing poprzedniego dnia (albo 0, jeśli to
// pierwszy dzień w systemie). Ten sam wzorzec co getOrCreateScheduleMonth
// (zapis wewnątrz odczytu dla stron server-component) — ciągłość stanu kasy
// między dniami jest sednem tego ekranu, więc dzień MUSI istnieć, żeby
// cokolwiek dalej policzyć.
export async function getOrCreateCashDay(date: string): Promise<CashDay> {
  const supabase = createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("cash_day")
    .select("id, date, rd_number, opening_balance, expected_closing, counted_closing, difference, explanation, status, closed_by_employee_id")
    .eq("date", date)
    .maybeSingle();
  if (existing) return existing as CashDay;

  const { data: prevDay } = await supabase
    .from("cash_day")
    .select("counted_closing")
    .lt("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const openingBalance = prevDay?.counted_closing ?? 0;

  const { data: created, error } = await supabase
    .from("cash_day")
    .insert({ date, opening_balance: openingBalance })
    .select("id, date, rd_number, opening_balance, expected_closing, counted_closing, difference, explanation, status, closed_by_employee_id")
    .single();
  if (error || !created) throw new Error("Nie udało się utworzyć dnia kasowego.");
  return created as CashDay;
}

export type CashCount = { slot: CashCountSlot; counted_amount: number; employee_id: string | null };
export type CashIncomeEntry = { time_window: CashIncomeWindow; cash_amount: number; card_amount: number };
export type CashDocument = {
  id: string;
  type: CashDocumentType;
  number: string;
  counterparty: string;
  source_doc_number: string;
  amount: number;
  category: string | null;
  description: string;
  created_at: string;
};
export type CashAttachment = {
  id: string;
  document_id: string | null;
  cash_day_id: string | null;
  kind: AttachmentKind;
  drive_url: string;
  file_name: string;
};
export type ShiftEmployee = { id: string; name: string; color_hex: string };

export async function getCashDayDetails(cashDayId: string) {
  const supabase = createServerSupabaseClient();
  const [{ data: counts }, { data: incomeEntries }, { data: documents }, { data: attachments }] = await Promise.all([
    supabase.from("cash_count").select("slot, counted_amount, employee_id").eq("cash_day_id", cashDayId),
    supabase.from("cash_income_entry").select("time_window, cash_amount, card_amount").eq("cash_day_id", cashDayId),
    supabase
      .from("cash_document")
      .select("id, type, number, counterparty, source_doc_number, amount, category, description, created_at")
      .eq("cash_day_id", cashDayId)
      .order("created_at"),
    supabase.from("cash_attachment").select("id, document_id, cash_day_id, kind, drive_url, file_name").eq("cash_day_id", cashDayId),
  ]);
  return {
    counts: (counts ?? []) as CashCount[],
    incomeEntries: (incomeEntries ?? []) as CashIncomeEntry[],
    documents: (documents ?? []) as CashDocument[],
    dayAttachments: (attachments ?? []) as CashAttachment[],
  };
}

export async function getDocumentAttachments(documentIds: string[]): Promise<Record<string, CashAttachment[]>> {
  if (documentIds.length === 0) return {};
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("cash_attachment")
    .select("id, document_id, cash_day_id, kind, drive_url, file_name")
    .in("document_id", documentIds);
  const byDocument: Record<string, CashAttachment[]> = {};
  for (const a of (data ?? []) as CashAttachment[]) {
    if (!a.document_id) continue;
    if (!byDocument[a.document_id]) byDocument[a.document_id] = [];
    byDocument[a.document_id].push(a);
  }
  return byDocument;
}

// Kto miał zmianę danego dnia — do wyboru "kto liczył" (patrz specyfikacja:
// "osobę bierzemy z grafiku pracy", bez podpisów). Każdy przypisany
// employee_id z dowolnej zmiany tego dnia, bez duplikatów.
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

export function computeExpected(day: CashDay, incomeEntries: CashIncomeEntry[], documents: CashDocument[]): number {
  return expectedClosing(
    day.opening_balance,
    incomeEntries.map((e) => ({ cash_amount: e.cash_amount })),
    documents.map((d) => ({ type: d.type, amount: d.amount }))
  );
}

export function today(): string {
  return toDateKey(new Date());
}
