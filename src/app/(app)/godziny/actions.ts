"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { isWithinEditWindow } from "@/lib/time-entry-window";

// Jeden dzień może mieć KILKA wpisów godzin (podzielona zmiana z przerwą,
// np. 08:00–10:00 i 15:00–22:00) — stąd osobne dodaj/edytuj/usuń zamiast
// jednego upsert na (employee_id, date), jak było wcześniej.

export async function addTimeEntry(date: string, actualStart: string, actualEnd: string, note: string): Promise<{ id: string }> {
  const employee = await requireEmployee();

  if (!isWithinEditWindow(date)) {
    throw new Error("Można wpisywać/edytować godziny tylko do 7 dni po danym dniu.");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("time_entry")
    .insert({
      employee_id: employee.id,
      date,
      actual_start: actualStart || null,
      actual_end: actualEnd || null,
      note: note || null,
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

export async function updateTimeEntry(id: string, actualStart: string, actualEnd: string, note: string) {
  const employee = await requireEmployee();

  const { data: existing } = await createServerSupabaseClient().from("time_entry").select("employee_id, date").eq("id", id).single();
  if (!existing || existing.employee_id !== employee.id) throw new Error("Nie znaleziono wpisu.");
  if (!isWithinEditWindow(existing.date)) {
    throw new Error("Można wpisywać/edytować godziny tylko do 7 dni po danym dniu.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("time_entry")
    .update({
      actual_start: actualStart || null,
      actual_end: actualEnd || null,
      note: note || null,
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
