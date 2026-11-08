"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canAccessMarketing } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

async function requireMarketingAccess() {
  const employee = await requireEmployee();
  if (!canAccessMarketing(employee)) {
    throw new Error("Brak uprawnień — ta sekcja jest dostępna tylko dla roli Marketing.");
  }
  return employee;
}

function revalidate() {
  // "layout" ogarnia też dynamiczny /marketing/projekty/[id] (tablica
  // projektu) — zmiana nazwy/koloru albo archiwizacja ma się tam odświeżyć,
  // nie tylko na liście.
  revalidatePath("/marketing/projekty", "layout");
  revalidatePath("/marketing");
}

export async function createProject(formData: FormData) {
  await requireMarketingAccess();
  const name = String(formData.get("name") ?? "").trim();
  const colorRaw = String(formData.get("color") ?? "").trim();
  const color = HEX_COLOR_RE.test(colorRaw) ? colorRaw : "#7c3aed";
  if (!name) throw new Error("Podaj nazwę projektu.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_project").insert({ name, color });
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}

export async function updateProject(formData: FormData) {
  await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const colorRaw = String(formData.get("color") ?? "").trim();
  const color = HEX_COLOR_RE.test(colorRaw) ? colorRaw : "#7c3aed";
  if (!id || !name) throw new Error("Podaj nazwę projektu.");

  const supabase = createServerSupabaseClient();
  const { data: current } = await supabase.from("marketing_project").select("name").eq("id", id).single();
  const { error } = await supabase.from("marketing_project").update({ name, color }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));

  // Nazwa projektu to jedyne "łącze" z marketing_task.project/
  // marketing_content.project (zwykły tekst, nie klucz obcy — patrz migracje
  // 0062/0063) — zmiana nazwy musi się rozlać na już istniejące zadania i
  // treści, inaczej po cichu się rozjadą (zostaną przypisane do nazwy, która
  // już nigdzie nie istnieje).
  if (current && current.name !== name) {
    await supabase.from("marketing_task").update({ project: name }).eq("project", current.name);
    await supabase.from("marketing_content").update({ project: name }).eq("project", current.name);
  }
  revalidate();
}

export async function setProjectActive(formData: FormData) {
  await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const is_active = formData.get("is_active") === "true";
  if (!id) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_project").update({ is_active }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}
