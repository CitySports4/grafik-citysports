import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { ColorDot } from "@/components/ColorDot";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { BTN_PRIMARY, BTN_GHOST, BTN_GHOST_DANGER } from "@/components/button-styles";
import { toDateKey, mondayOfWeek } from "@/lib/schedule-month";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_LABELS,
  groupByProject,
  type MarketingTaskStatus,
  type MarketingTaskPriority,
} from "@/lib/marketing";
import { createTask, updateTask, setTaskStatus, deleteTask, postponeTask, setTaskArchived } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const INPUT_SM = "rounded-lg border-[1.5px] border-zinc-300 px-2 py-1 text-xs";

type Task = {
  id: string;
  title: string;
  description: string;
  status: MarketingTaskStatus;
  priority: MarketingTaskPriority;
  due_date: string | null;
  assignee_employee_id: string | null;
  archived: boolean;
  content_id: string | null;
  project: string;
};

type Assignee = { id: string; name: string; color_hex: string };
type Project = { id: string; name: string; color: string };

const PRIORITY_BADGE: Record<MarketingTaskPriority, string> = {
  low: "bg-zinc-100 text-zinc-500",
  normal: "bg-blue-50 text-brand-navy",
  high: "bg-red-50 text-red-600",
};

// Kolejność priorytetów w obrębie jednej kolumny statusu — bez tego 21
// zadań w "Do zrobienia" to płaska ściana posortowana tylko po terminie,
// gdzie pilne "Wysoki" ginie między niskopriorytetowymi. Termin wciąż
// decyduje przy remisie (patrz zapytanie niżej — sortowanie po due_date jest
// już zrobione w bazie, tu tylko przestawiamy priorytet NA WIERZCH, zachowując
// względną kolejność dat w obrębie tego samego priorytetu — Array.sort jest
// stabilny).
const PRIORITY_RANK: Record<MarketingTaskPriority, number> = { high: 0, normal: 1, low: 2 };

// Sentinel dla filtra "bez przypisanej osoby" w URL (?osoba=_brak) — osobny
// od braku parametru w ogóle (które znaczy "moje", patrz niżej), bo po
// imporcie z pliku część zadań regularnie ląduje bez przypisania (nazwisko z
// pliku nie pasowało 1:1 do konta w systemie) i to też trzeba dało się
// przefiltrować.
const UNASSIGNED = "_brak";
// Sentinel dla jawnego "pokaż wszystkich" (?osoba=_wszyscy) — domyślnie (brak
// parametru w ogóle) widok jest zawężony do zalogowanej osoby: "jak Oliwia
// się loguje, widzi najpierw swoje zadania, nie przeszkadzają jej cudze".
// Każdy może świadomie przełączyć się na widok całego zespołu tym chipem.
const ALL = "_wszyscy";

// Ile dni do przodu liczy się jako "bieżący i następny tydzień" — domyślny,
// zawężony widok (patrz feedback z użycia: "Wszyscy (41)" na co dzień to za
// dużo, trzeba było scrollować obok zaległych i kolumny "W trakcie" żeby
// cokolwiek znaleźć). Zaległe (due_date < dziś) liczą się zawsze, niezależnie
// od zakresu — to one najbardziej potrzebują uwagi.
const UPCOMING_DAYS = 14;

export async function TasksSection({
  currentEmployeeId,
  assigneeFilter,
  showAll,
  view,
}: {
  currentEmployeeId: string;
  assigneeFilter?: string;
  // ?zakres=wszystkie — bez tego domyślny widok pokazuje tylko zaległe +
  // najbliższe UPCOMING_DAYS dni + zadania bez terminu.
  showAll?: boolean;
  // ?widok=tydzien — "Mój tydzień": zastępuje cały normalny widok jedną,
  // płaską listą MOICH zadań z terminem w bieżącym tygodniu, niezależnie od
  // projektu czy statusu (patrz WEEK_VIEW niżej) — osobny tryb, nie kolejny
  // filtr do połączenia z resztą.
  view?: string;
}) {
  const supabase = createServerSupabaseClient();
  const todayDate = new Date();
  const today = toDateKey(todayDate);
  const horizonDate = new Date(todayDate);
  horizonDate.setDate(horizonDate.getDate() + UPCOMING_DAYS);
  const horizon = toDateKey(horizonDate);
  const weekMonday = mondayOfWeek(today);
  const weekSunday = toDateKey(new Date(new Date(weekMonday + "T00:00:00").getTime() + 6 * 86400000));
  const [{ data: tasksRaw }, { data: assigneesRaw }, { data: projectsRaw }] = await Promise.all([
    supabase
      .from("marketing_task")
      .select("id, title, description, status, priority, due_date, assignee_employee_id, archived, content_id, project")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("employee")
      .select("id, name, color_hex, employee_role!inner(role)")
      .eq("active", true)
      .eq("employee_role.role", "marketing")
      .order("name"),
    // Projekty zarządzane z /marketing/projekty (patrz migracja 0063) —
    // tylko aktywne w dropdownie, ale dropdown w Edytuj MUSI dołożyć też
    // projekt już zapisanego zadania, nawet jeśli go zarchiwizowano od tej
    // pory (patrz renderTask niżej), żeby select nie zgubił cicho wartości.
    supabase.from("marketing_project").select("id, name, color").eq("is_active", true).order("name"),
  ]);

  const allTasksRaw = (tasksRaw ?? []) as Task[];
  const activeProjects = (projectsRaw ?? []) as Project[];
  const projectColorByName = new Map(activeProjects.map((p) => [p.name, p.color]));
  const assignees = (assigneesRaw ?? []) as Assignee[];
  const assigneeById = new Map(assignees.map((a) => [a.id, a]));

  const allTasks = allTasksRaw.filter((t) => !t.archived);
  const archivedTasks = allTasksRaw.filter((t) => t.archived);

  // Brak parametru w URL = "moje" (currentEmployeeId), nie "wszyscy" — patrz
  // komentarz przy ALL. effectiveFilter jest tym, co faktycznie podświetla
  // się jako aktywny chip i co filtruje listę.
  const effectiveFilter = assigneeFilter ?? currentEmployeeId;
  const byAssignee =
    effectiveFilter === ALL
      ? allTasks
      : effectiveFilter === UNASSIGNED
        ? allTasks.filter((t) => !t.assignee_employee_id)
        : allTasks.filter((t) => t.assignee_employee_id === effectiveFilter);

  const inScope = (t: Task) => !t.due_date || t.due_date <= horizon;
  const tasks = showAll ? byAssignee : byAssignee.filter(inScope);
  const hiddenByScopeCount = showAll ? 0 : byAssignee.filter((t) => !inScope(t)).length;

  const byStatus: Record<MarketingTaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
  for (const t of tasks) byStatus[t.status].push(t);
  for (const status of TASK_STATUS_ORDER) {
    byStatus[status].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  }

  const overdueCount = byAssignee.filter((t) => t.status !== "done" && t.due_date !== null && t.due_date < today).length;

  // "Mój tydzień" — zadania przypisane do mnie z terminem w bieżącym
  // tygodniu (poniedziałek–niedziela), NIEZALEŻNIE od projektu i statusu —
  // liczy się od allTasks (wszystkie nieprzypisane, bez filtra osoby/zakresu
  // z góry strony), bo to osobny, zawsze-"moje" widok.
  const myWeekTasks = allTasks
    .filter((t) => t.assignee_employee_id === currentEmployeeId && t.due_date !== null && t.due_date >= weekMonday && t.due_date <= weekSunday)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]));

  function renderTask(t: Task) {
    const assignee = t.assignee_employee_id ? assigneeById.get(t.assignee_employee_id) : null;
    const done = t.status === "done";
    const overdue = !done && t.due_date !== null && t.due_date < today;

    return (
      <div key={t.id} className={`rounded-xl border p-3 ${overdue ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"}`}>
        <div className="flex items-start gap-2.5">
          {/* Checkbox jednym kliknięciem — klik zaznacza jako zrobione, klik
              na już zrobionym cofa na "Do zrobienia". To GŁÓWNA, najczęstsza
              interakcja (patrz Todoist/Asana), więc dostaje duży, wygodny
              obszar dotyku zamiast małego linku tekstowego. */}
          <form action={setTaskStatus} className="pt-0.5">
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="status" value={done ? "todo" : "done"} />
            <button
              type="submit"
              aria-label={done ? "Cofnij na Do zrobienia" : "Oznacz jako zrobione"}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                done ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 hover:border-emerald-500"
              }`}
            >
              {done && "✓"}
            </button>
          </form>

          <div className="min-w-0 flex-1">
            <p className={`font-semibold ${done ? "text-zinc-400 line-through" : "text-zinc-900"}`}>{t.title}</p>
            {t.description && <p className={`mt-0.5 whitespace-pre-wrap text-sm ${done ? "text-zinc-400" : "text-zinc-600"}`}>{t.description}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              {/* To zadanie nie jest osobnym bytem — powstało automatycznie z
                  wpisu w kalendarzu treści (patrz createLinkedTaskIfNeeded w
                  actions.ts), żeby ktoś przypisany dostał przypomnienie "to do
                  zrobienia". Bez tej plakietki wyglądało jak zdublowana,
                  przypadkowa kopia tego samego posta (patrz feedback z
                  użycia) — link prowadzi od razu do tego miesiąca kalendarza. */}
              {t.content_id && t.due_date && (
                <Link
                  href={`/marketing?tab=kalendarz&year=${t.due_date.slice(0, 4)}&month=${Number(t.due_date.slice(5, 7))}`}
                  className="rounded-full bg-sky-50 px-2 py-0.5 font-bold text-sky-700 hover:bg-sky-100"
                >
                  📅 Treść z kalendarza
                </Link>
              )}
              <span className={`rounded-full px-2 py-0.5 font-bold ${PRIORITY_BADGE[t.priority]}`}>{TASK_PRIORITY_LABELS[t.priority]}</span>
              {t.project && (
                <span
                  className="rounded-full px-2 py-0.5 font-bold"
                  style={{ backgroundColor: `${projectColorByName.get(t.project) ?? "#7c3aed"}1a`, color: projectColorByName.get(t.project) ?? "#7c3aed" }}
                >
                  {t.project}
                </span>
              )}
              {assignee && (
                <span className="flex items-center gap-1 text-zinc-500">
                  <ColorDot color={assignee.color_hex} />
                  {assignee.name}
                </span>
              )}
              {t.due_date && (
                <span className={overdue ? "font-semibold text-red-600" : "text-zinc-500"}>
                  {overdue ? "⚠ termin: " : "termin: "}
                  {new Date(t.due_date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
                </span>
              )}
              {/* Szybkie przesunięcie terminu (patrz kwestionariusz Saszy,
                  październik 2026: system ma pomagać przesuwać zadania, nie
                  je ignorować) — zamiast grzebania w "Edytuj" za każdym
                  razem, gdy coś się po prostu nie zdąży na czas. */}
              {t.due_date && !done && (
                <span className="flex items-center gap-1">
                  <form action={postponeTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="current_due_date" value={t.due_date} />
                    <input type="hidden" name="unit" value="week" />
                    <button type="submit" className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-200">
                      ↻ tydzień
                    </button>
                  </form>
                  <form action={postponeTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="current_due_date" value={t.due_date} />
                    <input type="hidden" name="unit" value="month" />
                    <button type="submit" className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-200">
                      ↻ miesiąc
                    </button>
                  </form>
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {t.status === "todo" && (
                <form action={setTaskStatus}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="status" value="in_progress" />
                  <button type="submit" className={BTN_GHOST}>
                    ▶ Rozpocznij
                  </button>
                </form>
              )}
              {t.status === "in_progress" && (
                <form action={setTaskStatus}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="status" value="todo" />
                  <button type="submit" className={BTN_GHOST}>
                    ↺ Cofnij
                  </button>
                </form>
              )}
              <details className="inline-block">
                <summary className={`${BTN_GHOST} cursor-pointer [&::-webkit-details-marker]:hidden`}>Edytuj</summary>
                <form action={updateTask} className="mt-2 flex flex-col gap-2 rounded-xl bg-zinc-50 p-3">
                  <input type="hidden" name="id" value={t.id} />
                  <input name="title" defaultValue={t.title} required className={INPUT_SM} placeholder="Tytuł" />
                  <textarea name="description" defaultValue={t.description} rows={2} className={INPUT_SM} placeholder="Opis" />
                  <div className="flex flex-wrap gap-2">
                    <select name="assignee_employee_id" defaultValue={t.assignee_employee_id ?? ""} className={INPUT_SM}>
                      <option value="">— nieprzypisane —</option>
                      {assignees.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <select name="priority" defaultValue={t.priority} className={INPUT_SM}>
                      {(Object.entries(TASK_PRIORITY_LABELS) as [MarketingTaskPriority, string][]).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <input type="date" name="due_date" defaultValue={t.due_date ?? ""} className={INPUT_SM} />
                    <select name="project" defaultValue={t.project} className={INPUT_SM}>
                      <option value="">— bez projektu —</option>
                      {/* Projekt zadania mógł zostać zarchiwizowany od ostatniej
                          edycji — dokładamy go jako dodatkową opcję, żeby select
                          nie gubił cicho wartości. */}
                      {t.project && !activeProjects.some((p) => p.name === t.project) && <option value={t.project}>{t.project} (zarchiwizowany)</option>}
                      {activeProjects.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <SubmitButton className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
                      Zapisz
                    </SubmitButton>
                    <ConfirmButton formAction={deleteTask} confirmText={`Usunąć zadanie "${t.title}"?`} className={BTN_GHOST_DANGER}>
                      Usuń
                    </ConfirmButton>
                  </div>
                </form>
              </details>
              {/* Archiwizacja — chowa zadanie z widoku bez usuwania (patrz
                  feedback z użycia: stare, historyczne zadania straszyły na
                  stałe czerwonym "zaległe"). Osobny przycisk od "Usuń", bo to
                  odwracalne i nie traci danych. */}
              <form action={setTaskArchived}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="archived" value={String(!t.archived)} />
                <button type="submit" className={BTN_GHOST}>
                  {t.archived ? "↩ Przywróć" : "🗄 Archiwizuj"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Grupowanie po projekcie wewnątrz każdej kolumny statusu (patrz
  // groupByProject w lib/marketing.ts) — bez nagłówka grupy, gdy wszystko i
  // tak ląduje w jednej grupie (np. nikt jeszcze nie przypisał projektów),
  // żeby nie pokazywać pustego "Bez projektu" nad każdą listą.
  function renderTaskList(list: Task[]) {
    const groups = groupByProject(list, (t) => t.project);
    if (groups.length <= 1) {
      return <div className="flex flex-col gap-2">{list.map(renderTask)}</div>;
    }
    return (
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.project}>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400">
              {g.label} <span className="normal-case">({g.items.length})</span>
            </p>
            <div className="flex flex-col gap-2">{g.items.map(renderTask)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        {/* Szybkie dodawanie — sam tytuł wystarczy, Enter/przycisk od razu
            tworzy zadanie. Resztę (priorytet, osoba, termin) da się
            uzupełnić później przez "Edytuj", albo od razu rozwijając "Więcej
            opcji" poniżej — bez zmuszania do wypełniania wszystkiego za
            każdym razem. */}
        <form action={createTask} className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input name="title" required placeholder="Dodaj nowe zadanie…" className={`${INPUT} flex-1`} />
            <SubmitButton className={`${BTN_PRIMARY} shrink-0`}>Dodaj</SubmitButton>
          </div>
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-zinc-500 marker:content-none">
              Więcej opcji (osoba, priorytet, termin) ▾
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select name="assignee_employee_id" defaultValue={currentEmployeeId} className={INPUT}>
                <option value="">— nieprzypisane —</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select name="priority" defaultValue="normal" className={INPUT}>
                {(Object.entries(TASK_PRIORITY_LABELS) as [MarketingTaskPriority, string][]).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <input type="date" name="due_date" className={INPUT} />
              <select name="project" defaultValue="" className={INPUT}>
                <option value="">— bez projektu —</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea name="description" rows={2} placeholder="Opis (opcjonalnie)" className={`${INPUT} mt-2`} />
          </details>
        </form>
      </Card>

      {/* Filtr po osobie — domyślnie (bez parametru w URL) zawężony do
          zalogowanej osoby: "jak Oliwia się loguje, widzi najpierw swoje
          zadania, nie przeszkadzają jej cudze" — patrz ALL/effectiveFilter
          wyżej. Linki, nie przyciski JS (ten sam wzorzec co
          prevLink/nextLink w kalendarzu treści) — stan filtra żyje w URL,
          więc działa bez JS i da się wysłać komuś link "zobacz zadania
          Oliwii". Dokładamy &zakres, gdy user jest w widoku "wszystkie",
          żeby przełączenie osoby nie resetowało go po cichu z powrotem na
          zawężony. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* "Mój tydzień" — osobny tryb, nie kolejny filtr do połączenia z
            resztą (patrz komentarz przy myWeekTasks wyżej), dlatego osobny
            wygląd (fioletowy) zamiast dopasowywania się do reszty chipów. */}
        <Link
          href="/marketing?tab=zadania&widok=tydzien"
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${view === "tydzien" ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700 hover:bg-violet-100"}`}
        >
          📅 Mój tydzień ({myWeekTasks.length})
        </Link>
        {(() => {
          const myCount = allTasks.filter((t) => t.assignee_employee_id === currentEmployeeId).length;
          return (
            <Link
              href={`/marketing?tab=zadania${showAll ? "&zakres=wszystkie" : ""}`}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${view !== "tydzien" && effectiveFilter === currentEmployeeId ? "bg-brand-orange text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
            >
              Moje zadania ({myCount})
            </Link>
          );
        })()}
        <Link
          href={`/marketing?tab=zadania&osoba=${ALL}${showAll ? "&zakres=wszystkie" : ""}`}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${effectiveFilter === ALL ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
        >
          Wszyscy ({allTasks.length})
        </Link>
        {assignees
          .filter((a) => a.id !== currentEmployeeId)
          .map((a) => {
            const count = allTasks.filter((t) => t.assignee_employee_id === a.id).length;
            return (
              <Link
                key={a.id}
                href={`/marketing?tab=zadania&osoba=${a.id}${showAll ? "&zakres=wszystkie" : ""}`}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  effectiveFilter === a.id ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                <ColorDot color={a.color_hex} />
                {a.name} ({count})
              </Link>
            );
          })}
        {(() => {
          const unassignedCount = allTasks.filter((t) => !t.assignee_employee_id).length;
          return unassignedCount > 0 ? (
            <Link
              href={`/marketing?tab=zadania&osoba=${UNASSIGNED}${showAll ? "&zakres=wszystkie" : ""}`}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                effectiveFilter === UNASSIGNED ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              Nieprzypisane ({unassignedCount})
            </Link>
          ) : null;
        })()}
      </div>

      {view === "tydzien" ? (
        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-zinc-900">
            📅 Mój tydzień
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">{myWeekTasks.length}</span>
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            {new Date(weekMonday + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} –{" "}
            {new Date(weekSunday + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} — Twoje zadania z terminem w tym tygodniu,
            niezależnie od projektu.
          </p>
          {myWeekTasks.length === 0 ? (
            <p className="text-sm text-zinc-400">Brak Twoich zadań z terminem w tym tygodniu.</p>
          ) : (
            <div className="flex flex-col gap-2">{myWeekTasks.map(renderTask)}</div>
          )}
        </Card>
      ) : (
        <>
          {overdueCount > 0 && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
              ⚠ {overdueCount} {overdueCount === 1 ? "zaległe zadanie" : "zaległych zadań"} — termin już minął.
            </p>
          )}

          {/* Domyślnie pokazujemy tylko zaległe + najbliższe UPCOMING_DAYS dni +
              zadania bez terminu — reszta jest tu, jeden klik dalej, nie
              usunięta. Bez tego "Wszyscy" na co dzień to ściana zadań z całego
              roku naraz (patrz feedback z użycia). */}
          {!showAll && hiddenByScopeCount > 0 && (
            <Link
              href={`/marketing?tab=zadania${assigneeFilter ? `&osoba=${assigneeFilter}` : ""}&zakres=wszystkie`}
              className="rounded-xl bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-500 hover:bg-zinc-100"
            >
              Pokazuję zaległe + najbliższe {UPCOMING_DAYS} dni. Ukryto {hiddenByScopeCount} {hiddenByScopeCount === 1 ? "dalsze zadanie" : "dalszych zadań"} — pokaż wszystkie →
            </Link>
          )}
          {showAll && (
            <Link
              href={`/marketing?tab=zadania${assigneeFilter ? `&osoba=${assigneeFilter}` : ""}`}
              className="self-start rounded-xl bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-500 hover:bg-zinc-100"
            >
              ← Pokazujesz wszystkie zadania — zawęź do zaległych + najbliższych {UPCOMING_DAYS} dni
            </Link>
          )}

          {TASK_STATUS_ORDER.map((status) => {
            const list = byStatus[status];
            // "Zrobione" zwinięte domyślnie, gdy jest ich sporo — to już
            // zakończona praca, nie potrzeba jej mieć stale rozwiniętej przed
            // oczami, ten sam wzorzec co zarchiwizowane plany w PlansSection.
            const collapsible = status === "done" && list.length > 5;
            return (
              <Card key={status}>
                <h2 className="mb-3 flex items-center gap-2 font-semibold text-zinc-900">
                  {TASK_STATUS_LABELS[status]}
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">{list.length}</span>
                </h2>
                {list.length === 0 ? (
                  <p className="text-sm text-zinc-400">Brak zadań.</p>
                ) : collapsible ? (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-zinc-500 marker:content-none">Pokaż ({list.length}) ▾</summary>
                    <div className="mt-2">{renderTaskList(list)}</div>
                  </details>
                ) : (
                  renderTaskList(list)
                )}
              </Card>
            );
          })}

          {archivedTasks.length > 0 && (
            <details className="rounded-2xl border border-dashed border-zinc-300 p-3">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-zinc-500 marker:content-none">
                <span>Pokaż zarchiwizowane ({archivedTasks.length})</span>
              </summary>
              <div className="mt-3 flex flex-col gap-2">{archivedTasks.map(renderTask)}</div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
