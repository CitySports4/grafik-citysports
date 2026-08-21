"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { normalizePhone } from "@/lib/phone";

function parseNumber(value: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function parseRoles(formData: FormData): string[] {
  const roles = formData.getAll("role").map(String);
  return roles.length > 0 ? roles : ["recepcja"];
}

// Zastępuje cały zestaw ról pracownika (delete+insert), analogicznie do
// setEmployeeZones dla kompetencji sprzątania.
async function setEmployeeRoles(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  employeeId: string,
  roles: string[]
) {
  await supabase.from("employee_role").delete().eq("employee_id", employeeId);
  const { error } = await supabase
    .from("employee_role")
    .insert(roles.map((role) => ({ employee_id: employeeId, role })));
  if (error) {
    throw new Error(dbErrorMessage(error));
  }
}

export async function createEmployee(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const roles = parseRoles(formData);
  const color_hex = String(formData.get("color_hex") ?? "#3b82f6");
  const is_instructor = formData.get("is_instructor") === "on";
  const min_hours_month = parseNumber(formData.get("min_hours_month"));
  const target_hours_month = parseNumber(formData.get("target_hours_month"));
  const hourly_rate = parseNumber(formData.get("hourly_rate"));

  if (!name || !phone) {
    throw new Error("Podaj imię i numer telefonu.");
  }

  const supabase = createServerSupabaseClient();

  // Bez hasła — pracownik ustawia je sam przy pierwszym logowaniu. Kto może
  // sprzątać ustawia się w Konfiguracja sprzątania → Kompetencje (strefy),
  // nie tutaj.
  const { data, error } = await supabase
    .from("employee")
    .insert({
      name,
      phone,
      color_hex,
      is_instructor,
      min_hours_month,
      target_hours_month,
      hourly_rate,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(dbErrorMessage(error));
  }

  await setEmployeeRoles(supabase, data.id, roles);

  revalidatePath("/admin/pracownicy");
}

export async function updateEmployee(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const roles = parseRoles(formData);
  const color_hex = String(formData.get("color_hex") ?? "#3b82f6");
  const is_instructor = formData.get("is_instructor") === "on";
  const min_hours_month = parseNumber(formData.get("min_hours_month"));
  const target_hours_month = parseNumber(formData.get("target_hours_month"));
  const hourly_rate = parseNumber(formData.get("hourly_rate"));
  const active = formData.get("active") === "on";

  if (!id || !name || !phone) {
    throw new Error("Podaj imię i numer telefonu.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("employee")
    .update({
      name,
      phone,
      color_hex,
      is_instructor,
      min_hours_month,
      target_hours_month,
      hourly_rate,
      active,
    })
    .eq("id", id);

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  await setEmployeeRoles(supabase, id, roles);

  revalidatePath("/admin/pracownicy");
  revalidatePath(`/admin/pracownicy/${id}`);
}

// Czyści hasło pracownika — przy kolejnym logowaniu system poprosi go o
// ustawienie nowego (np. gdy zapomni hasła).
export async function clearEmployeePassword(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("employee").update({ password_hash: null }).eq("id", id);

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath(`/admin/pracownicy/${id}`);
}

export async function deleteEmployee(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("employee").delete().eq("id", id);

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  redirect("/admin/pracownicy");
}

export async function addClassScheduleEntry(formData: FormData) {
  await requireAdmin();

  const employee_id = String(formData.get("employee_id") ?? "");
  const weekday = Number(formData.get("weekday"));
  const start_time = String(formData.get("start_time") ?? "");
  const end_time = String(formData.get("end_time") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!employee_id || !start_time || !end_time) {
    throw new Error("Uzupełnij dzień i godziny zajęć.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("employee_class_schedule").insert({
    employee_id,
    weekday,
    start_time,
    end_time,
    note,
  });

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath(`/admin/pracownicy/${employee_id}`);
}

export async function deleteClassScheduleEntry(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const employee_id = String(formData.get("employee_id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("employee_class_schedule").delete().eq("id", id);

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath(`/admin/pracownicy/${employee_id}`);
}

export async function addRecurringConstraint(formData: FormData) {
  await requireAdmin();

  const employee_id = String(formData.get("employee_id") ?? "");
  const weekday = Number(formData.get("weekday"));
  const start_time = String(formData.get("start_time") ?? "") || null;
  const end_time = String(formData.get("end_time") ?? "") || null;
  const type = String(formData.get("type") ?? "unavailable");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!employee_id) {
    throw new Error("Brak pracownika.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("weekly_recurring_constraint").insert({
    employee_id,
    weekday,
    start_time,
    end_time,
    type,
    note,
  });

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath(`/admin/pracownicy/${employee_id}`);
}

export async function deleteRecurringConstraint(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const employee_id = String(formData.get("employee_id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("weekly_recurring_constraint").delete().eq("id", id);

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath(`/admin/pracownicy/${employee_id}`);
}
