"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canAccessMarketing } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import type { ProjectType, EventProjectStatus } from "@/lib/marketing";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Ta sama bramka co /marketing — przebudowa (migracja 0075) złączyła dawne
// /projekty (eventowe) i /marketing/projekty (marketingowe) w jedną sekcję
// "Wydarzenia i kampanie", więc dostęp jest teraz jeden, nie dwa osobne.
async function requireAccess() {
  const employee = await requireEmployee();
  if (!canAccessMarketing(employee)) {
    throw new Error("Brak uprawnień — ta sekcja jest dostępna tylko dla roli Marketing.");
  }
  return employee;
}

function revalidate() {
  revalidatePath("/marketing", "layout");
}

function readProjectFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "marketing") as ProjectType;
  const colorRaw = String(formData.get("color") ?? "").trim();
  const color = HEX_COLOR_RE.test(colorRaw) ? colorRaw : "#7c3aed";
  const event_date = String(formData.get("event_date") ?? "") || null;
  const end_date = String(formData.get("end_date") ?? "") || null;
  const status = String(formData.get("status") ?? "planowanie") as EventProjectStatus;
  const targetPeopleRaw = String(formData.get("target_people") ?? "").trim();
  const target_people = targetPeopleRaw ? Number(targetPeopleRaw) : null;
  const actualPeopleRaw = String(formData.get("actual_people") ?? "").trim();
  const actual_people = actualPeopleRaw ? Number(actualPeopleRaw) : null;
  const target_label = String(formData.get("target_label") ?? "").trim();
  const to_confirm = String(formData.get("to_confirm") ?? "").trim();
  // "notes" celowo NIE jest tu czytane — ma własny formularz i akcję
  // (updateProjectNotes), bo to pole o zupełnie innym rytmie edycji (długi
  // tekst, zapisywany osobno) niż resztę tych pól. Czytanie go tutaj
  // wymagałoby przeciągania aktualnej wartości jako hidden input przez
  // formularz edycji nazwy/dat, inaczej każdy zapis tamtego formularza
  // wyzerowałby notatki.
  return { name, type, color, event_date, end_date, status, target_people, actual_people, target_label, to_confirm };
}

export async function createProject(formData: FormData) {
  await requireAccess();
  const fields = readProjectFields(formData);
  if (!fields.name) throw new Error("Podaj nazwę projektu.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_project").insert(fields);
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}

export async function updateProject(formData: FormData) {
  await requireAccess();
  const id = String(formData.get("id") ?? "");
  const fields = readProjectFields(formData);
  if (!id || !fields.name) throw new Error("Podaj nazwę projektu.");

  const supabase = createServerSupabaseClient();
  const { data: current } = await supabase.from("marketing_project").select("name").eq("id", id).single();
  const { error } = await supabase.from("marketing_project").update(fields).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));

  // "project" (tekst) na marketing_task/marketing_content zostaje jeszcze na
  // czas przejścia obok project_id (patrz migracja 0075) — zmiana nazwy musi
  // się rozlać na już zapisane wiersze, żeby to tekstowe pole nie rozjechało
  // się cicho z project_id (który sam w sobie zostaje poprawny, bo to FK).
  if (current && current.name !== fields.name) {
    await supabase.from("marketing_task").update({ project: fields.name }).eq("project_id", id);
    await supabase.from("marketing_content").update({ project: fields.name }).eq("project_id", id);
  }
  revalidate();
}

export async function updateProjectNotes(formData: FormData) {
  await requireAccess();
  const id = String(formData.get("id") ?? "");
  const notes = String(formData.get("notes") ?? "");
  if (!id) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_project").update({ notes }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}

export async function setProjectActive(formData: FormData) {
  await requireAccess();
  const id = String(formData.get("id") ?? "");
  const is_active = formData.get("is_active") === "true";
  if (!id) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_project").update({ is_active }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}
