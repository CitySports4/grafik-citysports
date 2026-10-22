"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canAccessMarketing } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { PLATFORM_LABELS, type ContentPlatform } from "@/lib/marketing";

// Bramka wspólna dla wszystkich akcji tego modułu — rola marketing albo
// admin (patrz canAccessMarketing), ta sama reguła co przy wejściu na samą
// stronę /marketing.
async function requireMarketingAccess() {
  const employee = await requireEmployee();
  if (!canAccessMarketing(employee)) {
    throw new Error("Brak uprawnień — ta sekcja jest dostępna tylko dla roli Marketing.");
  }
  return employee;
}

function revalidateMarketing() {
  revalidatePath("/marketing");
}

// ---------- Zadania ----------

export async function createTask(formData: FormData) {
  const employee = await requireMarketingAccess();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const assignee_employee_id = String(formData.get("assignee_employee_id") ?? "") || null;
  const priority = String(formData.get("priority") ?? "normal");
  const due_date = String(formData.get("due_date") ?? "") || null;
  if (!title) throw new Error("Podaj tytuł zadania.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_task").insert({
    title,
    description,
    assignee_employee_id,
    priority,
    due_date,
    created_by_employee_id: employee.id,
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

export async function updateTask(formData: FormData) {
  await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const assignee_employee_id = String(formData.get("assignee_employee_id") ?? "") || null;
  const priority = String(formData.get("priority") ?? "normal");
  const due_date = String(formData.get("due_date") ?? "") || null;
  if (!id || !title) throw new Error("Podaj tytuł zadania.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("marketing_task")
    .update({ title, description, assignee_employee_id, priority, due_date, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

export async function setTaskStatus(formData: FormData) {
  await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !status) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_task").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

export async function deleteTask(formData: FormData) {
  await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_task").delete().eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

// ---------- Kalendarz treści ----------

// Szybkie odznaczenie statusu jednym kliknięciem (patrz checkbox-przycisk w
// ContentCalendarSection) — bez otwierania pełnego formularza edycji.
export async function setContentStatus(formData: FormData) {
  await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !status) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_content").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

// Treść z przypisaną osobą dostaje automatycznie powiązane zadanie (patrz
// migracja 0054) — bez przypisanej osoby nie ma kogo by miał dotyczyć, więc
// nic się nie tworzy. Zadanie żyje potem niezależnie: nie odznacza się samo,
// gdy treść dostanie status "Opublikowane", i odwrotnie — to świadomie dwie
// osobne rzeczy do odhaczenia.
async function createLinkedTaskIfNeeded(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  contentId: string,
  title: string,
  platform: string,
  scheduled_date: string,
  assignee_employee_id: string,
  created_by_employee_id: string
) {
  const { error } = await supabase.from("marketing_task").insert({
    title,
    description: `Z kalendarza treści — ${PLATFORM_LABELS[platform as ContentPlatform] ?? platform}, publikacja ${scheduled_date}.`,
    due_date: scheduled_date,
    assignee_employee_id,
    content_id: contentId,
    created_by_employee_id,
  });
  if (error) throw new Error(dbErrorMessage(error));
}

export async function createContent(formData: FormData) {
  const employee = await requireMarketingAccess();
  const title = String(formData.get("title") ?? "").trim();
  const platform = String(formData.get("platform") ?? "inne");
  const scheduled_date = String(formData.get("scheduled_date") ?? "");
  const status = String(formData.get("status") ?? "pomysl");
  const notes = String(formData.get("notes") ?? "").trim();
  const assignee_employee_id = String(formData.get("assignee_employee_id") ?? "") || null;
  if (!title || !scheduled_date) throw new Error("Podaj tytuł i datę publikacji.");

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("marketing_content")
    .insert({
      title,
      platform,
      scheduled_date,
      status,
      notes,
      assignee_employee_id,
      created_by_employee_id: employee.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(dbErrorMessage(error));

  if (assignee_employee_id) {
    await createLinkedTaskIfNeeded(supabase, data.id, title, platform, scheduled_date, assignee_employee_id, employee.id);
  }
  revalidateMarketing();
}

export async function updateContent(formData: FormData) {
  const employee = await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const platform = String(formData.get("platform") ?? "inne");
  const scheduled_date = String(formData.get("scheduled_date") ?? "");
  const status = String(formData.get("status") ?? "pomysl");
  const notes = String(formData.get("notes") ?? "").trim();
  const assignee_employee_id = String(formData.get("assignee_employee_id") ?? "") || null;
  if (!id || !title || !scheduled_date) throw new Error("Podaj tytuł i datę publikacji.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("marketing_content")
    .update({ title, platform, scheduled_date, status, notes, assignee_employee_id, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));

  // Osoba przypisana dopiero teraz (przy tworzeniu nie było komu dać
  // zadania) — dociąga je, ale tylko jeśli jeszcze nie istnieje (patrz
  // content_id), żeby edycja w kółko nie mnożyła duplikatów.
  if (assignee_employee_id) {
    const { data: existingTask } = await supabase.from("marketing_task").select("id").eq("content_id", id).maybeSingle();
    if (!existingTask) {
      await createLinkedTaskIfNeeded(supabase, id, title, platform, scheduled_date, assignee_employee_id, employee.id);
    }
  }
  revalidateMarketing();
}

export async function deleteContent(formData: FormData) {
  await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_content").delete().eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

// ---------- Strategie i plany ----------

export async function createPlan(formData: FormData) {
  const employee = await requireMarketingAccess();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const type = String(formData.get("type") ?? "plan");
  if (!title) throw new Error("Podaj tytuł.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_plan").insert({ title, body, type, created_by_employee_id: employee.id });
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

export async function updatePlan(formData: FormData) {
  await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const type = String(formData.get("type") ?? "plan");
  if (!id || !title) throw new Error("Podaj tytuł.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("marketing_plan")
    .update({ title, body, type, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

export async function setPlanArchived(formData: FormData) {
  await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const archived = formData.get("archived") === "true";
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_plan").update({ archived }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

export async function deletePlan(formData: FormData) {
  await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_plan").delete().eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}
