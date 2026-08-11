"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

// Admin edytuje godziny dowolnego pracownika, dla dowolnego dnia — bez
// ograniczenia 7-dniowego okna (to ograniczenie dotyczy tylko samodzielnej
// edycji przez pracownika, patrz godziny/actions.ts).
export async function saveTimeEntryAsAdmin(employeeId: string, date: string, actualStart: string, actualEnd: string, note: string) {
  await requireAdmin();

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("time_entry").upsert(
    {
      employee_id: employeeId,
      date,
      actual_start: actualStart || null,
      actual_end: actualEnd || null,
      note: note || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,date" }
  );

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/admin/godziny");
}
