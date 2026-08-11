"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { toDateKey } from "@/lib/schedule-month";
import { dbErrorMessage } from "@/lib/db-error";

// Można zgłosić nieobecność z maksymalnie 6-miesięcznym wyprzedzeniem.
const MAX_MONTHS_AHEAD = 6;

export async function addPlannedAbsence(formData: FormData) {
  const employee = await requireEmployee();

  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!startDate || !endDate) {
    throw new Error("Podaj datę początku i końca.");
  }
  if (endDate < startDate) {
    throw new Error("Data końca nie może być wcześniejsza niż data początku.");
  }

  const today = toDateKey(new Date());
  if (startDate < today) {
    throw new Error("Nie można zgłosić nieobecności wstecz.");
  }

  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + MAX_MONTHS_AHEAD);
  if (startDate > toDateKey(maxDate)) {
    throw new Error(`Nieobecność można zgłosić najwyżej ${MAX_MONTHS_AHEAD} miesięcy wcześniej.`);
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("planned_absence").insert({
    employee_id: employee.id,
    start_date: startDate,
    end_date: endDate,
    note: note || null,
  });

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/nieobecnosci");
}

export async function deletePlannedAbsence(formData: FormData) {
  const employee = await requireEmployee();
  const id = String(formData.get("id") ?? "");

  const supabase = createServerSupabaseClient();
  const { data: absence } = await supabase.from("planned_absence").select("employee_id").eq("id", id).single();

  if (!absence || (absence.employee_id !== employee.id && !employee.roles.includes("admin"))) {
    throw new Error("Nie możesz usunąć tej nieobecności.");
  }

  const { error } = await supabase.from("planned_absence").delete().eq("id", id);
  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/nieobecnosci");
  revalidatePath("/admin/pracownicy");
}
