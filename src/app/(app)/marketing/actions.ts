"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canAccessMarketing } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { PLATFORM_LABELS, type ContentPlatform } from "@/lib/marketing";
import { extractMarketingImport } from "@/lib/marketing-import";

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

// ---------- Import z pliku ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ImportResult = {
  tasksCount: number;
  contentCount: number;
  contentSkipped: number;
  plansCount: number;
  unmatchedNames: string[];
};

// Wrzucony plik (patrz IMPORT_TEMPLATE) trafia od razu do systemu — bez
// osobnego ekranu "zatwierdź podgląd" (świadoma decyzja: wszystko i tak da
// się potem poprawić przez zwykłe Edytuj, plik ma tylko przyspieszyć
// pierwsze wpisanie, nie być jedynym źródłem prawdy). Nazwa osoby z pliku
// dopasowywana jest do rzeczywistych kont z rolą marketing PO TEKŚCIE
// (dokładne dopasowanie, bez rozróżniania wielkości liter) — bez trafienia
// wpis zostaje nieprzypisany, nigdy nie zgaduje "najbliższej" osoby.
export async function importMarketingFile(formData: FormData): Promise<ImportResult> {
  const employee = await requireMarketingAccess();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Wybierz plik.");
  const text = await file.text();
  if (!text.trim()) throw new Error("Plik jest pusty.");

  const supabase = createServerSupabaseClient();
  const { data: assigneesRaw } = await supabase
    .from("employee")
    .select("id, name, employee_role!inner(role)")
    .eq("active", true)
    .eq("employee_role.role", "marketing");
  const assignees = (assigneesRaw ?? []) as { id: string; name: string }[];

  const extracted = await extractMarketingImport(text);

  const unmatchedNames = new Set<string>();
  function resolveAssignee(name: string | undefined): string | null {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    const match = assignees.find((a) => a.name.toLowerCase() === trimmed.toLowerCase());
    if (match) return match.id;
    unmatchedNames.add(trimmed);
    return null;
  }

  let tasksCount = 0;
  for (const t of extracted.tasks) {
    if (!t.title?.trim()) continue;
    const { error } = await supabase.from("marketing_task").insert({
      title: t.title.trim(),
      description: t.description?.trim() ?? "",
      priority: t.priority ?? "normal",
      due_date: t.due_date && DATE_RE.test(t.due_date) ? t.due_date : null,
      assignee_employee_id: resolveAssignee(t.assignee_name),
      created_by_employee_id: employee.id,
    });
    if (!error) tasksCount++;
  }

  let contentCount = 0;
  let contentSkipped = 0;
  for (const c of extracted.content) {
    if (!c.title?.trim() || !c.scheduled_date || !DATE_RE.test(c.scheduled_date)) {
      contentSkipped++;
      continue;
    }
    const assignee_employee_id = resolveAssignee(c.assignee_name);
    const { data, error } = await supabase
      .from("marketing_content")
      .insert({
        title: c.title.trim(),
        platform: c.platform ?? "inne",
        scheduled_date: c.scheduled_date,
        status: c.status ?? "pomysl",
        notes: c.notes?.trim() ?? "",
        assignee_employee_id,
        created_by_employee_id: employee.id,
      })
      .select("id")
      .single();
    if (error || !data) {
      contentSkipped++;
      continue;
    }
    contentCount++;
    if (assignee_employee_id) {
      await createLinkedTaskIfNeeded(supabase, data.id, c.title.trim(), c.platform ?? "inne", c.scheduled_date, assignee_employee_id, employee.id);
    }
  }

  let plansCount = 0;
  for (const p of extracted.plans) {
    if (!p.title?.trim()) continue;
    const { error } = await supabase.from("marketing_plan").insert({
      title: p.title.trim(),
      body: p.body?.trim() ?? "",
      type: p.type ?? "plan",
      created_by_employee_id: employee.id,
    });
    if (!error) plansCount++;
  }

  revalidateMarketing();
  return { tasksCount, contentCount, contentSkipped, plansCount, unmatchedNames: Array.from(unmatchedNames) };
}
