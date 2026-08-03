"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

async function getOrCreateSubmission(employeeId: string, scheduleMonthId: string) {
  const supabase = createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("availability_submission")
    .select("id, status")
    .eq("employee_id", employeeId)
    .eq("schedule_month_id", scheduleMonthId)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("availability_submission")
    .insert({ employee_id: employeeId, schedule_month_id: scheduleMonthId })
    .select("id, status")
    .single();

  if (error || !created) {
    throw new Error(dbErrorMessage(error, "Nie udało się utworzyć zgłoszenia dyspozycyjności."));
  }
  return created;
}

export async function toggleWholeDayUnavailable(scheduleMonthId: string, date: string) {
  const employee = await requireEmployee();
  const supabase = createServerSupabaseClient();
  const submission = await getOrCreateSubmission(employee.id, scheduleMonthId);

  const { data: existing } = await supabase
    .from("availability_entry")
    .select("id")
    .eq("availability_submission_id", submission.id)
    .eq("date", date)
    .eq("whole_day", true)
    .maybeSingle();

  if (existing) {
    await supabase.from("availability_entry").delete().eq("id", existing.id);
  } else {
    // Zaznaczenie całego dnia zastępuje pojedyncze zmiany tego dnia.
    await supabase
      .from("availability_entry")
      .delete()
      .eq("availability_submission_id", submission.id)
      .eq("date", date);
    await supabase.from("availability_entry").insert({
      availability_submission_id: submission.id,
      date,
      whole_day: true,
    });
  }

  revalidatePath("/dyspozycyjnosc");
}

export async function toggleSlotUnavailable(
  scheduleMonthId: string,
  date: string,
  slotIndex: number
) {
  const employee = await requireEmployee();
  const supabase = createServerSupabaseClient();
  const submission = await getOrCreateSubmission(employee.id, scheduleMonthId);

  const { data: existing } = await supabase
    .from("availability_entry")
    .select("id")
    .eq("availability_submission_id", submission.id)
    .eq("date", date)
    .eq("whole_day", false)
    .eq("slot_index", slotIndex)
    .maybeSingle();

  if (existing) {
    await supabase.from("availability_entry").delete().eq("id", existing.id);
  } else {
    await supabase.from("availability_entry").insert({
      availability_submission_id: submission.id,
      date,
      whole_day: false,
      slot_index: slotIndex,
    });
  }

  revalidatePath("/dyspozycyjnosc");
}

export async function submitAvailability(formData: FormData) {
  const employee = await requireEmployee();
  const scheduleMonthId = String(formData.get("schedule_month_id") ?? "");
  const supabase = createServerSupabaseClient();
  const submission = await getOrCreateSubmission(employee.id, scheduleMonthId);

  const { error } = await supabase
    .from("availability_submission")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", submission.id);

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/dyspozycyjnosc");
}

export async function savePreferredDaysOff(formData: FormData) {
  const employee = await requireEmployee();
  const supabase = createServerSupabaseClient();

  const selectedWeekdays = formData.getAll("weekday").map((w) => Number(w));
  const note = String(formData.get("note") ?? "").trim() || null;

  const { error: deleteError } = await supabase
    .from("preferred_day_off")
    .delete()
    .eq("employee_id", employee.id);
  if (deleteError) {
    throw new Error(dbErrorMessage(deleteError));
  }

  if (selectedWeekdays.length > 0) {
    const rows = selectedWeekdays.map((weekday) => ({
      employee_id: employee.id,
      weekday,
      note,
    }));
    const { error: insertError } = await supabase.from("preferred_day_off").insert(rows);
    if (insertError) {
      throw new Error(dbErrorMessage(insertError));
    }
  }

  revalidatePath("/dyspozycyjnosc");
}
