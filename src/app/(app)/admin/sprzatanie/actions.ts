"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

function parseNumber(value: FormDataEntryValue | null, fallback = 0): number {
  const n = Number(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

export async function addZone(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const group_code = String(formData.get("group_code") ?? "").trim();
  if (!name) throw new Error("Podaj nazwę strefy.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("cleaning_zone").insert({ name, group_code: group_code || null });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/admin/sprzatanie");
}

export async function deleteZone(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("cleaning_zone").delete().eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/admin/sprzatanie");
}

export async function addTask(formData: FormData) {
  await requireAdmin();
  const zone_id = String(formData.get("zone_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const time_minutes = parseNumber(formData.get("time_minutes"), 10);
  const frequency = String(formData.get("frequency") ?? "daily");
  const weekdayRaw = String(formData.get("weekday") ?? "");
  const weekday = weekdayRaw === "" ? null : Number(weekdayRaw);
  const slot = String(formData.get("slot") ?? "otwarcie");
  const requires_ladder = formData.get("requires_ladder") === "on";

  if (!zone_id || !name) throw new Error("Podaj nazwę zadania.");
  if (frequency !== "daily" && weekday === null) {
    throw new Error("Dla częstotliwości innej niż codziennie trzeba wybrać dzień tygodnia.");
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("cleaning_task").insert({
    zone_id,
    name,
    time_minutes,
    frequency,
    weekday,
    slot,
    requires_ladder,
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/admin/sprzatanie");
}

export async function toggleTaskActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "true") === "true";
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("cleaning_task").update({ active: !active }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/admin/sprzatanie");
}

export async function deleteTask(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("cleaning_task").delete().eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/admin/sprzatanie");
}

export async function addChecklistItem(formData: FormData) {
  await requireAdmin();
  const task_id = String(formData.get("task_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!task_id || !label) throw new Error("Podaj treść punktu checklisty.");

  const supabase = createServerSupabaseClient();
  const { count } = await supabase
    .from("cleaning_checklist_item")
    .select("id", { count: "exact", head: true })
    .eq("task_id", task_id);
  const { error } = await supabase.from("cleaning_checklist_item").insert({
    task_id,
    label,
    sort_order: count ?? 0,
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/admin/sprzatanie");
}

export async function deleteChecklistItem(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("cleaning_checklist_item").delete().eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/admin/sprzatanie");
}

export async function setCycleStart(formData: FormData) {
  await requireAdmin();
  const cycle_start = String(formData.get("cycle_start") ?? "");
  if (!cycle_start) throw new Error("Podaj datę.");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("cleaning_settings").update({ cycle_start }).eq("id", true);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/admin/sprzatanie");
}

export async function setEmployeeZones(formData: FormData) {
  await requireAdmin();
  const employee_id = String(formData.get("employee_id") ?? "");
  const zoneIds = formData.getAll("zone_ids").map(String);
  if (!employee_id) throw new Error("Brak pracownika.");

  const supabase = createServerSupabaseClient();
  await supabase.from("employee_cleaning_zone").delete().eq("employee_id", employee_id);
  if (zoneIds.length > 0) {
    const { error } = await supabase
      .from("employee_cleaning_zone")
      .insert(zoneIds.map((zone_id) => ({ employee_id, zone_id })));
    if (error) throw new Error(dbErrorMessage(error));
  }
  revalidatePath("/admin/sprzatanie");
  revalidatePath(`/admin/pracownicy/${employee_id}`);
}
