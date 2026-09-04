"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, tracksHours } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { isWithinEditWindow, requiresDiscrepancyNote, DISCREPANCY_START_MARGIN_MIN, DISCREPANCY_END_MARGIN_MIN } from "@/lib/time-entry-window";

// Jeden dzień może mieć KILKA wpisów godzin (podzielona zmiana z przerwą,
// np. 08:00–10:00 i 15:00–22:00) — stąd osobne dodaj/edytuj/usuń zamiast
// jednego upsert na (employee_id, date), jak było wcześniej.

// Gdy wpisane godziny wykraczają poza margines wokół najbliższej
// zaplanowanej zmiany (albo nie ma tego dnia w ogóle żadnej zmiany),
// notatka z wyjaśnieniem jest OBOWIĄZKOWA — zobaczy ją admin przy
// rozliczaniu wynagrodzeń (patrz admin/wynagrodzenia). Sprawdzane tu, po
// stronie serwera — DayTimeEntryEditor robi to samo wcześniej po stronie
// klienta, ale to tylko wygoda, nie zabezpieczenie.
async function assertDiscrepancyExplained(
  employeeId: string,
  date: string,
  actualStart: string,
  actualEnd: string,
  note: string,
  allowUnscheduled: boolean
) {
  if (!actualStart || !actualEnd) return; // niepełny wpis — nic do porównania

  const supabase = createServerSupabaseClient();
  const { data: shiftRows } = await supabase
    .from("schedule_shift")
    .select("start_time, end_time, schedule_day!inner(date, schedule_month!inner(status))")
    .eq("employee_id", employeeId)
    .eq("schedule_day.date", date)
    .eq("schedule_day.schedule_month.status", "published");

  const scheduled = (shiftRows ?? []).map((s) => ({ start_time: s.start_time, end_time: s.end_time }));
  if (requiresDiscrepancyNote(actualStart, actualEnd, scheduled, allowUnscheduled) && !note.trim()) {
    throw new Error(
      `Godziny odbiegają od zmiany o więcej niż ${DISCREPANCY_START_MARGIN_MIN} min na starcie lub ${DISCREPANCY_END_MARGIN_MIN} min na końcu, albo nie masz tego dnia zmiany w grafiku — dodaj notatkę z wyjaśnieniem, zobaczy ją admin.`
    );
  }
}

export async function addTimeEntry(date: string, actualStart: string, actualEnd: string, note: string, isRemote: boolean): Promise<{ id: string }> {
  const employee = await requireEmployee();

  // Wpisywanie godzin dotyczy tego, kto ma ustawioną stawkę godzinową — kto
  // jej nie ma (np. szef na stałej pensji), nie powinien tego w ogóle
  // zaczynać, nawet gdyby ominął ukrycie tego w UI.
  if (!tracksHours(employee)) {
    throw new Error("Wpisywanie godzin dotyczy tylko osób z ustawioną stawką godzinową.");
  }

  if (!isWithinEditWindow(date)) {
    throw new Error("Można wpisywać/edytować godziny tylko do 7 dni po danym dniu.");
  }
  await assertDiscrepancyExplained(employee.id, date, actualStart, actualEnd, note, employee.allowRemoteWork);

  // Oznaczenie "praca zdalna" ma sens tylko dla kogoś z tą zgodą — nawet
  // gdyby ktoś ominął ukrycie checkboxa w UI, serwer je ignoruje.
  const finalIsRemote = employee.allowRemoteWork && isRemote;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("time_entry")
    .insert({
      employee_id: employee.id,
      date,
      actual_start: actualStart || null,
      actual_end: actualEnd || null,
      note: note || null,
      is_remote: finalIsRemote,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/godziny");
  revalidatePath("/grafik");
  return { id: data.id };
}

export async function updateTimeEntry(id: string, actualStart: string, actualEnd: string, note: string, isRemote: boolean) {
  const employee = await requireEmployee();

  const { data: existing } = await createServerSupabaseClient().from("time_entry").select("employee_id, date").eq("id", id).single();
  if (!existing || existing.employee_id !== employee.id) throw new Error("Nie znaleziono wpisu.");
  if (!isWithinEditWindow(existing.date)) {
    throw new Error("Można wpisywać/edytować godziny tylko do 7 dni po danym dniu.");
  }
  await assertDiscrepancyExplained(employee.id, existing.date, actualStart, actualEnd, note, employee.allowRemoteWork);

  const finalIsRemote = employee.allowRemoteWork && isRemote;

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("time_entry")
    .update({
      actual_start: actualStart || null,
      actual_end: actualEnd || null,
      note: note || null,
      is_remote: finalIsRemote,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/godziny");
  revalidatePath("/grafik");
}

export async function deleteTimeEntry(id: string) {
  const employee = await requireEmployee();

  const supabase = createServerSupabaseClient();
  const { data: existing } = await supabase.from("time_entry").select("employee_id, date").eq("id", id).single();
  if (!existing || existing.employee_id !== employee.id) throw new Error("Nie znaleziono wpisu.");
  if (!isWithinEditWindow(existing.date)) {
    throw new Error("Można wpisywać/edytować godziny tylko do 7 dni po danym dniu.");
  }

  const { error } = await supabase.from("time_entry").delete().eq("id", id);
  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/godziny");
  revalidatePath("/grafik");
}
