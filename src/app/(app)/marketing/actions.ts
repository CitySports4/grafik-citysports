"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canAccessMarketing } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { toDateKey } from "@/lib/schedule-month";
import { PLATFORM_LABELS, isApprovalPending, type ContentPlatform } from "@/lib/marketing";
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

// Szybkie przesunięcie terminu (patrz kwestionariusz Saszy, październik
// 2026: "system żeby pomagał przesuwać zadania, nie ignorować") — zamiast
// ręcznej edycji daty, jeden klik dokłada tydzień/miesiąc do ISTNIEJĄCEGO
// terminu (nie do dzisiejszej daty — przesuwa zaległość do przodu, nie
// resetuje jej licząc od teraz).
export async function postponeTask(formData: FormData) {
  await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const currentDueDate = String(formData.get("current_due_date") ?? "");
  const unit = String(formData.get("unit") ?? "");
  if (!id || !currentDueDate) throw new Error("Brak danych.");

  const base = new Date(currentDueDate + "T00:00:00");
  const next = new Date(base);
  if (unit === "week") next.setDate(next.getDate() + 7);
  else if (unit === "month") next.setMonth(next.getMonth() + 1);
  else throw new Error("Nieznana jednostka przesunięcia.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("marketing_task")
    .update({ due_date: toDateKey(next), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

// ---------- Kalendarz treści ----------

// Szybkie odznaczenie statusu jednym kliknięciem (patrz checkbox-przycisk w
// ContentCalendarSection) — bez otwierania pełnego formularza edycji.
export async function setContentStatus(formData: FormData) {
  const employee = await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !status) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  if (status === "opublikowane" && !employee.roles.includes("admin")) {
    await assertCanPublish(supabase, id);
  }
  const { error } = await supabase.from("marketing_content").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

// Blokada akceptacji dotyczy tylko treści oznaczonych needs_review i tylko
// DO DNIA publikacji — patrz isApprovalPending w lib/marketing.ts (tam jest
// cała reguła, w tym automatyczne zwolnienie w dniu scheduled_date, żeby
// zwłoka admina nie blokowała pracy w nieskończoność). Admin może opublikować
// zawsze — on sam jest osobą akceptującą.
async function assertCanPublish(supabase: ReturnType<typeof createServerSupabaseClient>, contentId: string) {
  const { data: current } = await supabase
    .from("marketing_content")
    .select("needs_review, approved, scheduled_date")
    .eq("id", contentId)
    .single();
  if (!current) throw new Error("Treść już nie istnieje — odśwież stronę.");
  const today = toDateKey(new Date());
  if (isApprovalPending(current, today)) {
    throw new Error(`Czeka jeszcze na akceptację — zostanie dopuszczona automatycznie ${current.scheduled_date}, jeśli nikt wcześniej nie zareaguje.`);
  }
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
  const purpose = String(formData.get("purpose") ?? "relacja");
  const needs_review = formData.get("needs_review") === "on";
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
      purpose,
      needs_review,
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
  const purpose = String(formData.get("purpose") ?? "relacja");
  const needs_review = formData.get("needs_review") === "on";
  const notes = String(formData.get("notes") ?? "").trim();
  const assignee_employee_id = String(formData.get("assignee_employee_id") ?? "") || null;
  if (!id || !title || !scheduled_date) throw new Error("Podaj tytuł i datę publikacji.");

  const supabase = createServerSupabaseClient();
  if (status === "opublikowane" && !employee.roles.includes("admin")) {
    await assertCanPublish(supabase, id);
  }
  const { error } = await supabase
    .from("marketing_content")
    .update({ title, platform, scheduled_date, status, purpose, needs_review, notes, assignee_employee_id, updated_at: new Date().toISOString() })
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

// Akceptacja/uwaga Krzysztofa (kwestionariusz, październik 2026) — tylko
// admin, bo to on jest osobą akceptującą. Jeden formularz robi oba naraz:
// zostawienie uwagi (approved zostaje false, treść wraca do autora) albo
// zaakceptowanie (approved=true, uwaga opcjonalna przy okazji).
export async function reviewContent(formData: FormData) {
  const employee = await requireMarketingAccess();
  if (!employee.roles.includes("admin")) throw new Error("Tylko admin może akceptować treści.");
  const id = String(formData.get("id") ?? "");
  const approved = formData.get("approved") === "true";
  const review_note = String(formData.get("review_note") ?? "").trim();
  if (!id) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("marketing_content")
    .update({
      approved,
      review_note,
      reviewed_by_employee_id: employee.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
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
        purpose: c.purpose ?? "relacja",
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
