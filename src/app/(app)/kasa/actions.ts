"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import { requireEmployee, requireAdmin, canAccessKasa } from "@/lib/session";
import { hasKioskSession } from "@/lib/kiosk-session";
import { dbErrorMessage } from "@/lib/db-error";
import { uploadToDrive } from "@/lib/google-drive";
import { formatDocumentNumber, cashDifference, type CashDocumentType, type AttachmentKind } from "@/lib/kasa";
import { getCashDayDetails, computeExpected, type CashDay } from "./data";

// Dostęp z osobistego logowania (recepcja/admin) ALBO ze wspólnego
// stanowiska kioskowego na recepcji (patrz /recepcja — bez osobnej
// tożsamości). Kiosk nie niesie employee.id, więc "kto to zrobił" przy
// KW/KP/załącznikach/zamknięciu dnia jest TU zawsze jawnym polem
// employee_id z formularza (wybór z grafiku), nigdy z sesji — ten sam
// wzorzec co "kto liczył" przy liczeniu gotówki, tylko konsekwentnie
// zastosowany wszędzie, żeby działało identycznie w obu widokach.
async function requireKasaAccess(): Promise<void> {
  if (await hasKioskSession()) return;
  const employee = await requireEmployee();
  if (!canAccessKasa(employee)) throw new Error("Brak uprawnień — Kasa jest dostępna dla recepcji i administratora.");
}

function revalidateKasa(date: string) {
  revalidatePath("/kasa");
  revalidatePath(`/kasa?date=${date}`);
  revalidatePath("/kasa/historia");
  revalidatePath("/recepcja/kasa");
  revalidatePath(`/recepcja/kasa?date=${date}`);
}

async function getOpenDay(supabase: ReturnType<typeof createServerSupabaseClient>, cashDayId: string): Promise<CashDay> {
  const { data, error } = await supabase
    .from("cash_day")
    .select("id, date, rd_number, opening_balance, expected_closing, counted_closing, difference, explanation, status, closed_by_employee_id")
    .eq("id", cashDayId)
    .single();
  if (error || !data) throw new Error("Dzień kasowy nie istnieje.");
  if (data.status !== "open") throw new Error("Dzień jest już zamknięty — admin może go cofnąć do edycji.");
  return data as CashDay;
}

export async function saveCashCount(formData: FormData) {
  await requireKasaAccess();
  const cash_day_id = String(formData.get("cash_day_id") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const counted_amount = Number(formData.get("counted_amount"));
  const employee_id = String(formData.get("employee_id") ?? "") || null;
  if (!cash_day_id || !slot || !Number.isFinite(counted_amount)) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  await getOpenDay(supabase, cash_day_id);
  const { error } = await supabase
    .from("cash_count")
    .upsert({ cash_day_id, slot, counted_amount, employee_id }, { onConflict: "cash_day_id,slot" });
  if (error) throw new Error(dbErrorMessage(error));

  // Liczenie "zamknięcie" aktualizuje też counted_closing/expected_closing
  // na samym dniu — to one napędzają widok różnicy na bieżąco, bez
  // czekania na formalne "Zamknij dzień".
  if (slot === "zamkniecie") {
    const day = await getOpenDay(supabase, cash_day_id);
    const { incomeEntries, documents } = await getCashDayDetails(cash_day_id);
    const expected = computeExpected(day, incomeEntries, documents);
    await supabase
      .from("cash_day")
      .update({ expected_closing: expected, counted_closing: counted_amount, difference: cashDifference(expected, counted_amount), updated_at: new Date().toISOString() })
      .eq("id", cash_day_id);
  }
  revalidateKasa((await getOpenDay(supabase, cash_day_id)).date);
}

export async function saveIncomeEntry(formData: FormData) {
  await requireKasaAccess();
  const cash_day_id = String(formData.get("cash_day_id") ?? "");
  const time_window = String(formData.get("time_window") ?? "");
  const cash_amount = Number(formData.get("cash_amount") || 0);
  const card_amount = Number(formData.get("card_amount") || 0);
  if (!cash_day_id || !time_window) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  const day = await getOpenDay(supabase, cash_day_id);
  const { error } = await supabase
    .from("cash_income_entry")
    .upsert({ cash_day_id, time_window, cash_amount, card_amount }, { onConflict: "cash_day_id,time_window" });
  if (error) throw new Error(dbErrorMessage(error));
  revalidateKasa(day.date);
}

export async function updateExplanation(formData: FormData) {
  await requireKasaAccess();
  const cash_day_id = String(formData.get("cash_day_id") ?? "");
  const explanation = String(formData.get("explanation") ?? "").trim();
  if (!cash_day_id) throw new Error("Brak danych.");
  const supabase = createServerSupabaseClient();
  const day = await getOpenDay(supabase, cash_day_id);
  const { error } = await supabase.from("cash_day").update({ explanation, updated_at: new Date().toISOString() }).eq("id", cash_day_id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateKasa(day.date);
}

function slugify(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "dokument"
  );
}

export type AddDocumentResult = { ok: true } | { ok: false; error: string };

// KW/KP — numer nadawany TU (nie w formularzu), żeby dwa jednoczesne zapisy
// nie dostały tego samego numeru częściej niż się da uniknąć bez osobnej
// sekwencji w bazie (patrz komentarz w migracji — to jest test, gapless
// sequence to ulepszenie na później, gdy ruch będzie większy niż jedna
// recepcja na miejscu).
export async function addCashDocument(formData: FormData): Promise<AddDocumentResult> {
  try {
    await requireKasaAccess();
    const cash_day_id = String(formData.get("cash_day_id") ?? "");
    const type = String(formData.get("type") ?? "") as CashDocumentType;
    const counterparty = String(formData.get("counterparty") ?? "").trim();
    const source_doc_number = String(formData.get("source_doc_number") ?? "").trim();
    const amount = Number(formData.get("amount"));
    const category = String(formData.get("category") ?? "") || null;
    const description = String(formData.get("description") ?? "").trim();
    const employee_id = String(formData.get("employee_id") ?? "");
    const file = formData.get("file") as File | null;
    if (!cash_day_id || (type !== "KW" && type !== "KP") || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: "Podaj poprawną kwotę i typ dokumentu." };
    }
    if (!employee_id) return { ok: false, error: "Wybierz, kto dodaje dokument (z grafiku)." };
    if (!file || file.size === 0) return { ok: false, error: "Zdjęcie lub skan dokumentu jest obowiązkowe." };

    const supabase = createServerSupabaseClient();
    const day = await getOpenDay(supabase, cash_day_id);
    const [year, month] = day.date.split("-");
    const monthStart = `${year}-${month}-01`;
    const monthEnd = toDateKey(new Date(Number(year), Number(month), 1)); // month (string) jest 1-indexed, więc jako argument Date to już "pierwszy dzień kolejnego miesiąca"

    const { data: monthDays } = await supabase.from("cash_day").select("id").gte("date", monthStart).lt("date", monthEnd);
    const monthDayIds = (monthDays ?? []).map((d) => d.id);
    const { count } =
      monthDayIds.length > 0
        ? await supabase.from("cash_document").select("id", { count: "exact", head: true }).eq("type", type).in("cash_day_id", monthDayIds)
        : { count: 0 };
    const number = formatDocumentNumber(day.date, count ?? 0);

    const { data: created, error } = await supabase
      .from("cash_document")
      .insert({ type, number, cash_day_id, counterparty, source_doc_number, amount, category, description, created_by_employee_id: employee_id })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: dbErrorMessage(error) };

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const fileName = `${number.replace(/\//g, "-")}_${slugify(counterparty)}.${ext}`;
    const upload = await uploadToDrive(buffer, fileName, file.type || "application/octet-stream", [year, String(Number(month)), type]);

    const { error: attachError } = await supabase.from("cash_attachment").insert({
      document_id: created.id,
      kind: source_doc_number.toLowerCase().includes("fv") || source_doc_number.toLowerCase().includes("faktura") ? "faktura" : "paragon",
      drive_file_id: upload.fileId,
      drive_url: upload.webViewLink,
      file_name: fileName,
      uploaded_by_employee_id: employee_id,
    });
    if (attachError) return { ok: false, error: dbErrorMessage(attachError) };

    revalidateKasa(day.date);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Coś poszło nie tak." };
  }
}

export async function deleteCashDocument(formData: FormData) {
  await requireKasaAccess();
  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { data: doc } = await supabase.from("cash_document").select("cash_day_id, cash_day:cash_day_id(date, status)").eq("id", id).single();
  const dayInfo = doc?.cash_day as unknown as { date: string; status: string } | null;
  if (dayInfo?.status !== "open") throw new Error("Dzień jest już zamknięty — admin może go cofnąć do edycji.");
  const { error } = await supabase.from("cash_document").delete().eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  if (dayInfo) revalidateKasa(dayInfo.date);
}

export async function addDayAttachment(formData: FormData): Promise<AddDocumentResult> {
  try {
    await requireKasaAccess();
    const cash_day_id = String(formData.get("cash_day_id") ?? "");
    const kind = String(formData.get("kind") ?? "inne") as AttachmentKind;
    const employee_id = String(formData.get("employee_id") ?? "");
    const file = formData.get("file") as File | null;
    if (!cash_day_id || !file || file.size === 0) return { ok: false, error: "Wybierz plik." };
    if (!employee_id) return { ok: false, error: "Wybierz, kto dodaje załącznik (z grafiku)." };

    const supabase = createServerSupabaseClient();
    const day = await getOpenDay(supabase, cash_day_id);
    const [year, month] = day.date.split("-");

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const fileName = `${day.date}_${kind}.${ext}`;
    const upload = await uploadToDrive(buffer, fileName, file.type || "application/octet-stream", [year, String(Number(month)), "dzien"]);

    const { error } = await supabase.from("cash_attachment").insert({
      cash_day_id,
      kind,
      drive_file_id: upload.fileId,
      drive_url: upload.webViewLink,
      file_name: fileName,
      uploaded_by_employee_id: employee_id,
    });
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidateKasa(day.date);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Coś poszło nie tak." };
  }
}

export type CloseDayResult = { ok: true } | { ok: false; error: string };

// Zamknięcie dnia — nadaje RD dopiero teraz (patrz migracja), wymaga
// policzonego "zamknięcie" i wyjaśnienia, jeśli różnica ≠ 0 (dokładnie jak
// w specyfikacji, pkt 3.1.4).
export async function closeCashDay(formData: FormData): Promise<CloseDayResult> {
  try {
    await requireKasaAccess();
    const cash_day_id = String(formData.get("cash_day_id") ?? "");
    const employee_id = String(formData.get("employee_id") ?? "");
    if (!cash_day_id) return { ok: false, error: "Brak danych." };
    if (!employee_id) return { ok: false, error: "Wybierz, kto zamyka dzień (z grafiku)." };

    const supabase = createServerSupabaseClient();
    const day = await getOpenDay(supabase, cash_day_id);
    const { incomeEntries, documents } = await getCashDayDetails(cash_day_id);
    const expected = computeExpected(day, incomeEntries, documents);

    if (day.counted_closing === null) return { ok: false, error: "Policz gotówkę przy zamknięciu, zanim zatwierdzisz dzień." };
    const difference = cashDifference(expected, day.counted_closing);
    if (difference !== 0 && !day.explanation.trim()) {
      return { ok: false, error: `Jest różnica ${difference.toFixed(2)} zł — uzupełnij pole "Wyjaśnienia", zanim zamkniesz dzień.` };
    }

    const { data: settings } = await supabase.from("kasa_settings").select("next_rd_number").eq("id", 1).single();
    const rdNumber = settings?.next_rd_number ?? 1;

    const { error } = await supabase
      .from("cash_day")
      .update({
        status: "closed",
        rd_number: rdNumber,
        expected_closing: expected,
        difference,
        closed_by_employee_id: employee_id,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", cash_day_id);
    if (error) return { ok: false, error: dbErrorMessage(error) };

    await supabase.from("kasa_settings").update({ next_rd_number: rdNumber + 1, updated_at: new Date().toISOString() }).eq("id", 1);

    revalidateKasa(day.date);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Coś poszło nie tak." };
  }
}

// Cofnięcie zamknięcia — tylko admin, zawsze z powodem (patrz cash_audit_log
// w migracji) — dzień wraca do edycji, ale ZATRZYMUJE swój RD (nie oddajemy
// numeru do puli, żeby nie dublować z dniem, który już go dostał).
export async function reopenCashDay(formData: FormData) {
  const employee = await requireAdmin();
  const cash_day_id = String(formData.get("cash_day_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!cash_day_id || !note) throw new Error("Podaj powód korekty.");

  const supabase = createServerSupabaseClient();
  const { data: day } = await supabase.from("cash_day").select("date").eq("id", cash_day_id).single();
  const { error } = await supabase.from("cash_day").update({ status: "corrected", updated_at: new Date().toISOString() }).eq("id", cash_day_id);
  if (error) throw new Error(dbErrorMessage(error));
  await supabase.from("cash_audit_log").insert({ cash_day_id, employee_id: employee.id, action: "reopen", note });
  if (day) revalidateKasa(day.date);
}
