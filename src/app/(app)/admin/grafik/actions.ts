"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { generateMonthStructure, runDraftGenerator } from "@/lib/schedule-generator";

export async function generateStructure(formData: FormData) {
  await requireAdmin();
  const scheduleMonthId = String(formData.get("schedule_month_id") ?? "");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  await generateMonthStructure(scheduleMonthId, year, month);
  revalidatePath("/admin/grafik");
}

export async function runDraft(formData: FormData) {
  await requireAdmin();
  const scheduleMonthId = String(formData.get("schedule_month_id") ?? "");
  await runDraftGenerator(scheduleMonthId);
  revalidatePath("/admin/grafik");
}

export async function assignShift(formData: FormData) {
  await requireAdmin();
  const shiftId = String(formData.get("shift_id") ?? "");
  const employeeIdRaw = String(formData.get("employee_id") ?? "");
  const supabase = createServerSupabaseClient();

  if (employeeIdRaw === "__closed__") {
    const { error } = await supabase
      .from("schedule_shift")
      .update({ employee_id: null, is_closed: true })
      .eq("id", shiftId);
    if (error) throw new Error(dbErrorMessage(error));
  } else {
    const employee_id = employeeIdRaw || null;
    const { error } = await supabase
      .from("schedule_shift")
      .update({ employee_id, is_closed: false })
      .eq("id", shiftId);
    if (error) throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/admin/grafik");
}

export async function updateShiftTimes(formData: FormData) {
  await requireAdmin();
  const shiftId = String(formData.get("shift_id") ?? "");
  const start_time = String(formData.get("start_time") ?? "");
  const end_time = String(formData.get("end_time") ?? "");
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("schedule_shift")
    .update({ start_time, end_time })
    .eq("id", shiftId);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/grafik");
}

export async function addEvent(formData: FormData) {
  await requireAdmin();
  const schedule_day_id = String(formData.get("schedule_day_id") ?? "");
  const type = String(formData.get("type") ?? "custom");
  const start_time = String(formData.get("start_time") ?? "") || null;
  const label = String(formData.get("label") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const participant_employee_ids = formData.getAll("participant_employee_ids").map(String);

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("schedule_event").insert({
    schedule_day_id,
    type,
    start_time,
    label,
    note,
    participant_employee_ids,
  });
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/grafik");
}

// Zamyka wszystkie zmiany danego dnia jednym kliknięciem — do świąt i innych
// niestandardowych dni, kiedy klub w ogóle nie działa.
export async function closeWholeDay(formData: FormData) {
  await requireAdmin();
  const schedule_day_id = String(formData.get("schedule_day_id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("schedule_shift")
    .update({ employee_id: null, is_closed: true })
    .eq("schedule_day_id", schedule_day_id);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/grafik");
}

// Dodaje niestandardową zmianę do konkretnego dnia (np. inne godziny w
// święto) — niezależnie od szablonu dla danego dnia tygodnia.
export async function addCustomShift(formData: FormData) {
  await requireAdmin();
  const schedule_day_id = String(formData.get("schedule_day_id") ?? "");
  const start_time = String(formData.get("start_time") ?? "");
  const end_time = String(formData.get("end_time") ?? "");

  if (!start_time || !end_time) {
    throw new Error("Podaj godziny rozpoczęcia i zakończenia zmiany.");
  }

  const supabase = createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("schedule_shift")
    .select("slot_index")
    .eq("schedule_day_id", schedule_day_id)
    .order("slot_index", { ascending: false })
    .limit(1);
  const nextSlotIndex = (existing?.[0]?.slot_index ?? -1) + 1;

  const { error } = await supabase.from("schedule_shift").insert({
    schedule_day_id,
    slot_index: nextSlotIndex,
    start_time,
    end_time,
  });
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/grafik");
}

export async function deleteShift(formData: FormData) {
  await requireAdmin();
  const shiftId = String(formData.get("shift_id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("schedule_shift").delete().eq("id", shiftId);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/grafik");
}

// Przypisuje uczestników wydarzenia (np. liga) do pustych zmian danego dnia,
// w kolejności zmian — szybki sposób ułożenia dnia z ligą.
export async function assignEventParticipantsToShifts(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "");
  const supabase = createServerSupabaseClient();

  const { data: event } = await supabase
    .from("schedule_event")
    .select("schedule_day_id, participant_employee_ids")
    .eq("id", eventId)
    .single();
  if (!event) throw new Error("Nie znaleziono wydarzenia.");

  const participantIds: string[] = event.participant_employee_ids ?? [];
  if (participantIds.length === 0) {
    throw new Error("To wydarzenie nie ma przypisanych pracowników.");
  }

  const { data: shifts } = await supabase
    .from("schedule_shift")
    .select("id, slot_index")
    .eq("schedule_day_id", event.schedule_day_id)
    .order("slot_index");

  for (let i = 0; i < (shifts?.length ?? 0) && i < participantIds.length; i++) {
    await supabase
      .from("schedule_shift")
      .update({ employee_id: participantIds[i], is_closed: false })
      .eq("id", shifts![i].id);
  }

  revalidatePath("/admin/grafik");
}

export async function updateEventTime(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "");
  const start_time = String(formData.get("start_time") ?? "") || null;
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("schedule_event").update({ start_time }).eq("id", eventId);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/grafik");
}

export async function deleteEvent(formData: FormData) {
  await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("schedule_event").delete().eq("id", eventId);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/grafik");
}

export async function publishMonth(formData: FormData) {
  await requireAdmin();
  const scheduleMonthId = String(formData.get("schedule_month_id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("schedule_month")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", scheduleMonthId);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/grafik");
  revalidatePath("/grafik");
}

export async function unpublishMonth(formData: FormData) {
  await requireAdmin();
  const scheduleMonthId = String(formData.get("schedule_month_id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("schedule_month")
    .update({ status: "draft", published_at: null })
    .eq("id", scheduleMonthId);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/grafik");
  revalidatePath("/grafik");
}
