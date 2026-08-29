"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

// Admin edytuje godziny dowolnego pracownika, dla dowolnego dnia — bez
// ograniczenia 7-dniowego okna (to ograniczenie dotyczy tylko samodzielnej
// edycji przez pracownika, patrz godziny/actions.ts). Jeden dzień może mieć
// kilka wpisów (podzielona zmiana), stąd osobne dodaj/edytuj/usuń.

export async function addTimeEntryAsAdmin(employeeId: string, date: string, actualStart: string, actualEnd: string, note: string): Promise<{ id: string }> {
  await requireAdmin();

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("time_entry")
    .insert({
      employee_id: employeeId,
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

  revalidatePath("/admin/godziny");
  return { id: data.id };
}

export async function updateTimeEntryAsAdmin(id: string, actualStart: string, actualEnd: string, note: string) {
  await requireAdmin();

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

  revalidatePath("/admin/godziny");
}

export async function deleteTimeEntryAsAdmin(id: string) {
  await requireAdmin();

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("time_entry").delete().eq("id", id);
  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/admin/godziny");
}
