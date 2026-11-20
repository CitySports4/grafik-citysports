"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canAccessMarketing, isContentCreator } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { toDateKey } from "@/lib/schedule-month";
import { isApprovalPending, type ProjectType } from "@/lib/marketing";
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
  // "layout" ogarnia całe poddrzewo /marketing/wydarzenia, łącznie z
  // dynamicznym /marketing/wydarzenia/[id] (tablica projektu) — bez tego
  // odhaczenie zadania na tamtej stronie zapisałoby się w bazie, ale UI
  // zostałby nieodświeżony do ręcznego przeładowania.
  revalidatePath("/marketing/wydarzenia", "layout");
}

// ---------- Projekty ----------

export type MarketingProjectOption = { id: string; name: string; color: string; type: ProjectType };

// Czytane przez useMarketingProjects() (hook, komponenty kliencie) — Server
// Action zamiast bezpośredniego zapytania do Supabase z przeglądarki: w tej
// bazie NIE MA RLS na większości tabel (autoryzacja jest wyłącznie na
// poziomie appki, patrz requireMarketingAccess; marketing_project/content/task
// mają już RLS od migracji 0075, ale to tylko domyka dostęp dla anon — appka
// i tak zawsze używa service_role, który RLS omija). Server Action trzyma
// zapytanie po stronie serwera, za tą samą bramką co reszta modułu, a dla
// przeglądarki wygląda jak zwykłe wywołanie funkcji.
//
// Wszystkie typy projektu naraz (migracja 0075 — dawny podział na /projekty
// "eventowe" i /marketing/projekty "marketingowe" to teraz jedna lista pod
// "Wydarzenia i kampanie"), żeby dropdown projektu w zadaniu/treści mógł
// wskazać na którykolwiek z nich.
export async function getActiveMarketingProjects(): Promise<MarketingProjectOption[]> {
  await requireMarketingAccess();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("marketing_project").select("id, name, color, type").eq("is_active", true).order("name");
  if (error) throw new Error(dbErrorMessage(error));
  return (data ?? []) as MarketingProjectOption[];
}

// project_id (klucz obcy, migracja 0075) zamiast dawnego dopasowania po
// tekście — "project" zostaje zapisywane RÓWNOLEGLE (nazwa projektu) na czas
// przejścia, bo kilka starszych widoków (tablice projektów, grupowanie w
// Kanbanie) wciąż czyta to pole tekstowe. Puste project_id = brak projektu
// ("Ogólne" ma swój wiersz w bazie, ale wybranie "— bez projektu —" w
// formularzu to świadomie inna rzecz niż przypisanie do "Ogólne").
async function resolveProjectFields(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  formData: FormData
): Promise<{ project: string; project_id: string | null }> {
  const project_id = String(formData.get("project_id") ?? "") || null;
  if (!project_id) return { project: "", project_id: null };
  const { data } = await supabase.from("marketing_project").select("name").eq("id", project_id).single();
  return { project: data?.name ?? "", project_id };
}

// ---------- Zadania ----------

// Pola nagraniowe (Sprint D, D1) — zawsze opcjonalne, nie blokują zapisu
// nawet gdy ktoś wypełni format bez treści czy odwrotnie (patrz brak walidacji
// poniżej poza samym check constraintem formatu w bazie).
function readRecordingFields(formData: FormData) {
  const recording_format = String(formData.get("recording_format") ?? "").trim() || null;
  const recording_look_for = String(formData.get("recording_look_for") ?? "").trim();
  const recording_mood = String(formData.get("recording_mood") ?? "").trim();
  return { recording_format, recording_look_for, recording_mood };
}

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
    ...(await resolveProjectFields(supabase, formData)),
    ...readRecordingFields(formData),
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
    .update({
      title,
      description,
      assignee_employee_id,
      priority,
      due_date,
      updated_at: new Date().toISOString(),
      ...(await resolveProjectFields(supabase, formData)),
      ...readRecordingFields(formData),
    })
    .eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

// Jedyna akcja z tego pliku, którą wolno wywołać osobie z samą rolą
// content_creator (Sprint A) — i tylko dla WŁASNEGO zadania, stąd osobna
// (nie requireMarketingAccess) bramka tutaj. Pełny zespół (marketing/admin)
// ma bez zmian dostęp do każdego zadania, jak dotąd.
export async function setTaskStatus(formData: FormData) {
  const employee = await requireEmployee();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !status) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  if (!canAccessMarketing(employee)) {
    if (!isContentCreator(employee)) {
      throw new Error("Brak uprawnień — ta sekcja jest dostępna tylko dla roli Marketing.");
    }
    const { data: task } = await supabase.from("marketing_task").select("assignee_employee_id").eq("id", id).single();
    if (!task || task.assignee_employee_id !== employee.id) {
      throw new Error("Możesz oznaczać jako zrobione tylko własne zadania.");
    }
  }
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

  // Odłożenie liczy się od DZIŚ (strefa PL), a nie od starego terminu: zaległe
  // zadanie przesunięte o tydzień od dawnego terminu dalej jest zaległe i wraca
  // na listę codziennie, dopóki ktoś go nie zrobi.
  const todayKey = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
  const base = new Date(todayKey + "T00:00:00");
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

// Chowa zadanie z bieżącego widoku i z licznika zaległych bez usuwania — np.
// stare, historyczne zadania z importu, które nie mają już znaczenia, ale
// szkoda kasować (patrz feedback z użycia: zaległe zadania z przesz łych dat
// straszyły czerwonym ostrzeżeniem na stałe).
export async function setTaskArchived(formData: FormData) {
  await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const archived = formData.get("archived") === "true";
  if (!id) throw new Error("Brak danych.");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_task").update({ archived }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

// ---------- Kalendarz treści ----------

// Gotowe pola treści z przyciskiem "Kopiuj" w UI (propozycja Marketing ->
// Grafik, 18.11.2026, krok 2) — zawsze opcjonalne, jak notes.
function readContentFields(formData: FormData) {
  return {
    hook: String(formData.get("hook") ?? "").trim(),
    content_fb: String(formData.get("content_fb") ?? "").trim(),
    content_ig: String(formData.get("content_ig") ?? "").trim(),
    screen_captions: String(formData.get("screen_captions") ?? "").trim(),
    what_to_record: String(formData.get("what_to_record") ?? "").trim(),
    hashtags: String(formData.get("hashtags") ?? "").trim(),
    to_confirm: String(formData.get("to_confirm") ?? "").trim(),
    link_utm: String(formData.get("link_utm") ?? "").trim(),
  };
}

// Szybkie odznaczenie statusu jednym kliknięciem (patrz checkbox-przycisk w
// ContentCalendarSection) — bez otwierania pełnego formularza edycji.
// Dostępne też dla samej roli content_creator (Oliwia) — jej uproszczony
// widok (CreatorView) pokazuje teraz treści przypisane do niej wprost, nie
// tylko zadania (patrz CreatorContent), więc musi móc oznaczać JE jako
// gotowe/opublikowane — ten sam wzorzec ograniczenia "tylko własne", co
// setTaskStatus.
export async function setContentStatus(formData: FormData) {
  const employee = await requireEmployee();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !status) throw new Error("Brak danych.");

  const supabase = createServerSupabaseClient();
  if (!canAccessMarketing(employee)) {
    if (!isContentCreator(employee)) {
      throw new Error("Brak uprawnień — ta sekcja jest dostępna tylko dla roli Marketing.");
    }
    const { data: content } = await supabase.from("marketing_content").select("assignee_employee_id").eq("id", id).single();
    if (!content || content.assignee_employee_id !== employee.id) {
      throw new Error("Możesz oznaczać jako zrobione tylko własne treści.");
    }
  }
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

export async function createContent(formData: FormData) {
  const employee = await requireMarketingAccess();
  const title = String(formData.get("title") ?? "").trim();
  const platform = String(formData.get("platform") ?? "inne");
  const scheduled_date = String(formData.get("scheduled_date") ?? "");
  const status = String(formData.get("status") ?? "pomysl");
  const purpose = String(formData.get("purpose") ?? "relacja");
  const format = String(formData.get("format") ?? "post");
  const needs_review = formData.get("needs_review") === "on";
  const notes = String(formData.get("notes") ?? "").trim();
  const assignee_employee_id = String(formData.get("assignee_employee_id") ?? "") || null;
  if (!title || !scheduled_date) throw new Error("Podaj tytuł i datę publikacji.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("marketing_content").insert({
    title,
    platform,
    scheduled_date,
    status,
    purpose,
    format,
    needs_review,
    notes,
    assignee_employee_id,
    created_by_employee_id: employee.id,
    ...(await resolveProjectFields(supabase, formData)),
    ...readContentFields(formData),
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidateMarketing();
}

// Pola tekstowe wpisu, które updateContent zapisuje TYLKO gdy są w formularzu.
// Brak pola = "nie ruszaj" (nie "wyczyść") — formularz wysyła tylko pola
// zmienione przez użytkownika, a zwinięta/nieobecna sekcja nie może już
// skasować treści (wpis 368dd994…, 18.11 i 19.11.2026).
const PARTIAL_TEXT_FIELDS = [
  "notes",
  "hook",
  "content_fb",
  "content_ig",
  "screen_captions",
  "what_to_record",
  "hashtags",
  "to_confirm",
  "link_utm",
] as const;

function readPresentTextFields(formData: FormData) {
  const out: Partial<Record<(typeof PARTIAL_TEXT_FIELDS)[number], string>> = {};
  for (const key of PARTIAL_TEXT_FIELDS) {
    if (formData.has(key)) out[key] = String(formData.get(key) ?? "").trim();
  }
  return out;
}

export async function updateContent(formData: FormData) {
  const employee = await requireMarketingAccess();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const platform = String(formData.get("platform") ?? "inne");
  const scheduled_date = String(formData.get("scheduled_date") ?? "");
  const status = String(formData.get("status") ?? "pomysl");
  const purpose = String(formData.get("purpose") ?? "relacja");
  const format = String(formData.get("format") ?? "post");
  const needs_review = formData.get("needs_review") === "on";
  const assignee_employee_id = String(formData.get("assignee_employee_id") ?? "") || null;
  if (!id || !title || !scheduled_date) throw new Error("Podaj tytuł i datę publikacji.");

  const supabase = createServerSupabaseClient();
  if (status === "opublikowane" && !employee.roles.includes("admin")) {
    await assertCanPublish(supabase, id);
  }
  const { error } = await supabase
    .from("marketing_content")
    .update({
      title,
      platform,
      scheduled_date,
      status,
      purpose,
      format,
      needs_review,
      assignee_employee_id,
      updated_at: new Date().toISOString(),
      ...(formData.has("project_id") ? await resolveProjectFields(supabase, formData) : {}),
      ...readPresentTextFields(formData),
    })
    .eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
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
  // Odrzucenie bez uwagi niczego by nie mówiło autorowi, co poprawić —
  // "Zostaw uwagę" (propozycja Marketing -> Grafik, 18.11.2026, krok 3) ma
  // sens tylko z treścią uwagi, inaczej to po prostu "jeszcze nie patrzyłem".
  if (!approved && !review_note) throw new Error("Przy uwadze do poprawki napisz, co poprawić.");

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

  // Uwaga do poprawki cofa wpis z "Gotowe" do "W przygotowaniu" — żeby lista
  // "gotowych do publikacji" naprawdę znaczyła gotowe, nie "gotowe, ale z
  // uwagą czekającą na poprawkę". Nie rusza "Opublikowane" (nikt nie
  // zostawia uwagi na czymś, co już wyszło) ani "Pomysł" (nie ma z czego
  // cofać).
  if (!approved) {
    await supabase.from("marketing_content").update({ status: "w_przygotowaniu" }).eq("id", id).eq("status", "gotowe");
  }
  revalidateMarketing();
}

// Licznik dla Krzysztofa (propozycja Marketing -> Grafik, 18.11.2026, krok
// 3) — ile treści naprawdę czeka na JEGO pierwsze spojrzenie: needs_review,
// jeszcze nie zaakceptowane ani nie odrzucone (reviewed_at puste) i termin
// jeszcze nie minął (po terminie i tak przechodzi automatycznie, patrz
// isApprovalPending — to już nie jest "czeka na niego"). Treści z uwagą do
// poprawki (needs_changes) świadomie pominięte: piłka jest wtedy po stronie
// autora, nie Krzysztofa, dopóki ktoś nie poprawi i nie zmieni statusu.
export async function getPendingApprovalCount(): Promise<{ count: number; nearestDate: string | null }> {
  const supabase = createServerSupabaseClient();
  const today = toDateKey(new Date());
  const { data } = await supabase
    .from("marketing_content")
    .select("scheduled_date")
    .eq("needs_review", true)
    .eq("approved", false)
    .is("reviewed_at", null)
    .gt("scheduled_date", today)
    .order("scheduled_date", { ascending: true });
  const rows = data ?? [];
  return { count: rows.length, nearestDate: rows[0]?.scheduled_date ?? null };
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
    .in("employee_role.role", ["marketing", "content_creator"]);
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
    const { error } = await supabase.from("marketing_content").insert({
      title: c.title.trim(),
      platform: c.platform ?? "inne",
      purpose: c.purpose ?? "relacja",
      format: c.format ?? "post",
      scheduled_date: c.scheduled_date,
      status: c.status ?? "pomysl",
      notes: c.notes?.trim() ?? "",
      assignee_employee_id,
      created_by_employee_id: employee.id,
    });
    if (error) {
      contentSkipped++;
      continue;
    }
    contentCount++;
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
