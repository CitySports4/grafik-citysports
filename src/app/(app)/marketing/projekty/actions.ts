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
  revalidatePath("/marketing/projekty");
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
