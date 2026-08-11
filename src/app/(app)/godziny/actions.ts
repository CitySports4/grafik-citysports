"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

// Wpis godzin można dodać/edytować o dowolnej porze, ale tylko dla dnia nie
// starszego niż 7 dni — potem okno się zamyka.
const EDIT_WINDOW_DAYS = 7;

function isWithinEditWindow(dateKey: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateKey + "T00:00:00");
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  return diffDays >= 0 && diffDays <= EDIT_WINDOW_DAYS;
}

export async function saveTimeEntry(date: string, actualStart: string, actualEnd: string, note: string) {
  const employee = await requireEmployee();

  if (!isWithinEditWindow(date)) {
    throw new Error("Można wpisywać/edytować godziny tylko do 7 dni po danym dniu.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("time_entry").upsert(
    {
      employee_id: employee.id,
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

  revalidatePath("/godziny");
}
