"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canAccessMarketing } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Ta sama rola co /marketing — projekty eventowe żyją w tej samej tabeli
// (marketing_project, type="event", patrz migracja 0065), więc dostęp ma
// sens trzymać spójny, zamiast wymyślać nową regułę autoryzacji tylko dla
// tej sekcji.
async function requireAccess() {
  const employee = await requireEmployee();
  if (!canAccessMarketing(employee)) {
    throw new Error("Brak uprawnień — ta sekcja jest dostępna tylko dla roli Marketing.");
  }
  return employee;
}

function revalidate() {
  revalidatePath("/projekty", "layout");
  revalidatePath("/marketing");
}

export async function createEventProject(formData: FormData) {
  await requireAccess();
  const name = String(formData.get("name") ?? "").trim();
  const colorRaw = String(formData.get("color") ?? "").trim();
  const color = HEX_COLOR_RE.test(colorRaw) ? colorRaw : "#dc2626";
  const event_date = String(formData.get("event_date") ?? "") || null;
  const status = String(formData.get("status") ?? "planowanie");
  if (!name) throw new Error("Podaj nazwę projektu.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_project").insert({ name, color, event_date, status, type: "event" });
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}

export async function updateEventProject(formData: FormData) {
  await requireAccess();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const colorRaw = String(formData.get("color") ?? "").trim();
  const color = HEX_COLOR_RE.test(colorRaw) ? colorRaw : "#dc2626";
  const event_date = String(formData.get("event_date") ?? "") || null;
  const status = String(formData.get("status") ?? "planowanie");
  if (!id || !name) throw new Error("Podaj nazwę projektu.");

  const supabase = createServerSupabaseClient();
  const { data: current } = await supabase.from("marketing_project").select("name").eq("id", id).single();
  const { error } = await supabase.from("marketing_project").update({ name, color, event_date, status }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));

  // Nazwa to jedyne "łącze" z marketing_task.project (zwykły tekst, nie
  // klucz obcy) — patrz identyczny komentarz w marketing/projekty/actions.ts.
  if (current && current.name !== name) {
    await supabase.from("marketing_task").update({ project: name }).eq("project", current.name);
  }
  revalidate();
}

export async function updateEventProjectNotes(formData: FormData) {
  await requireAccess();
  const id = String(formData.get("id") ?? "");
  const notes = String(formData.get("notes") ?? "");
  if (!id) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_project").update({ notes }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}
