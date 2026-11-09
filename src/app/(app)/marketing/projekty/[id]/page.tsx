import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canAccessMarketing } from "@/lib/session";
import { Card } from "@/components/Card";
import { BackLink } from "@/components/BackLink";
import { ColorDot } from "@/components/ColorDot";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_LABELS,
  CONTENT_STATUS_LABELS,
  CONTENT_FORMAT_ICONS,
  type MarketingTaskStatus,
  type MarketingTaskPriority,
  type ContentStatus,
  type ContentFormat,
} from "@/lib/marketing";
import { setTaskStatus } from "../../actions";

type Project = { id: string; name: string; color: string; is_active: boolean };
type Task = {
  id: string;
  title: string;
  status: MarketingTaskStatus;
  priority: MarketingTaskPriority;
  due_date: string | null;
  assignee_employee_id: string | null;
};
type ContentItem = { id: string; title: string; status: ContentStatus; format: ContentFormat; scheduled_date: string };
type Assignee = { id: string; name: string; color_hex: string };

const PRIORITY_BADGE: Record<MarketingTaskPriority, string> = {
  low: "bg-zinc-100 text-zinc-500",
  normal: "bg-blue-50 text-brand-navy",
  high: "bg-red-50 text-red-600",
};
const CONTENT_STATUS_PILL: Record<ContentStatus, string> = {
  pomysl: "bg-zinc-100 text-zinc-600",
  w_przygotowaniu: "bg-amber-100 text-amber-700",
  gotowe: "bg-sky-100 text-sky-700",
  opublikowane: "bg-emerald-100 text-emerald-700",
};

// Tablica projektu (F2, audyt UX) — dotąd /marketing/projekty była tylko
// listą z jedyną akcją "Archiwizuj", bez odpowiedzi na "ile zadań, ile
// treści, jaki status, co zostało" dla danego projektu. Tu te odpowiedzi są
// wprost. Zadania/treści łączą się z projektem PO NAZWIE (zwykły tekst, nie
// klucz obcy — patrz migracje 0062/0063), więc zapytania filtrują po
// project.name, nie project.id.
export default async function ProjectWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const employee = await requireEmployee();
  if (!canAccessMarketing(employee)) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">Nie masz dostępu do narzędzia marketingu.</p>
      </div>
    );
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { data: projectRaw } = await supabase.from("marketing_project").select("id, name, color, is_active, type").eq("id", id).single();
  const project = projectRaw as (Project & { type: "marketing" | "event" }) | null;

  if (!project) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href="/marketing/projekty" label="Projekty" />
        <p className="text-sm text-zinc-500">Nie znaleziono projektu.</p>
      </div>
    );
  }

  // Projekty eventowe mają teraz własną tablicę pod /projekty/[id] (patrz
  // migracja 0065 i Sprint D, D2) — ten widok jest tylko dla marketingowych.
  if (project.type === "event") {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href="/marketing/projekty" label="Projekty" />
        <p className="text-sm text-zinc-500">
          „{project.name}” to projekt eventowy — zarządzaj nim w{" "}
          <Link href={`/projekty/${project.id}`} className="font-semibold text-brand-orange hover:underline">
            sekcji Wydarzenia
          </Link>
          .
        </p>
      </div>
    );
  }

  const [{ data: tasksRaw }, { data: contentRaw }, { data: assigneesRaw }] = await Promise.all([
    supabase
      .from("marketing_task")
      .select("id, title, status, priority, due_date, assignee_employee_id")
      .eq("project", project.name)
      .eq("archived", false)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("marketing_content").select("id, title, status, format, scheduled_date").eq("project", project.name).order("scheduled_date"),
    // "content_creator" dołożony obok "marketing" (Sprint A) — żeby nazwa
    // Oliwii dalej się tu rozwiązywała, jeśli jest przypisana do zadania.
    supabase
      .from("employee")
      .select("id, name, color_hex, employee_role!inner(role)")
      .eq("active", true)
      .in("employee_role.role", ["marketing", "content_creator"]),
  ]);

  const tasks = (tasksRaw ?? []) as Task[];
  const content = (contentRaw ?? []) as ContentItem[];
  const assigneeById = new Map(((assigneesRaw ?? []) as Assignee[]).map((a) => [a.id, a]));
  const today = new Date().toISOString().slice(0, 10);

  const tasksByStatus: Record<MarketingTaskStatus, Task[]> = { todo: [], in_progress: [], gotowe: [], opublikowane: [] };
  for (const t of tasks) tasksByStatus[t.status].push(t);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/marketing/projekty" label="Projekty" />

      <div className="flex flex-wrap items-center gap-2">
        <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
        <h1 className="text-lg font-bold text-zinc-900">{project.name}</h1>
        {!project.is_active && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">Zarchiwizowany</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TASK_STATUS_ORDER.map((status) => (
          <Card key={status} className="!p-3 text-center">
            <p className="text-2xl font-bold text-zinc-900">{tasksByStatus[status].length}</p>
            <p className="text-xs text-zinc-500">{TASK_STATUS_LABELS[status]}</p>
          </Card>
        ))}
        <Card className="!p-3 text-center">
          <p className="text-2xl font-bold text-zinc-900">{content.length}</p>
          <p className="text-xs text-zinc-500">Treści kalendarza</p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">
          Zadania <span className="text-sm font-normal text-zinc-400">({tasks.length})</span>
        </h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak zadań przypisanych do tego projektu.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((t) => {
              const assignee = t.assignee_employee_id ? assigneeById.get(t.assignee_employee_id) : null;
              const published = t.status === "opublikowane";
              const overdue = !published && t.due_date !== null && t.due_date < today;
              return (
                <div key={t.id} className={`flex items-start gap-2.5 rounded-xl border p-2.5 ${overdue ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"}`}>
                  <form action={setTaskStatus} className="pt-0.5">
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="status" value={published ? "todo" : "opublikowane"} />
                    <button
                      type="submit"
                      aria-label={published ? "Cofnij na Do zrobienia" : "Oznacz jako opublikowane"}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] transition-colors ${
                        published ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 hover:border-emerald-500"
                      }`}
                    >
                      {published && "✓"}
                    </button>
                  </form>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className={`font-semibold ${published ? "text-zinc-400 line-through" : "text-zinc-900"}`}>{t.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${PRIORITY_BADGE[t.priority]}`}>{TASK_PRIORITY_LABELS[t.priority]}</span>
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">
          Treści kalendarza <span className="text-sm font-normal text-zinc-400">({content.length})</span>
        </h2>
        {content.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak treści kalendarza przypisanych do tego projektu.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {content.map((c) => {
              const year = c.scheduled_date.slice(0, 4);
              const month = Number(c.scheduled_date.slice(5, 7));
              return (
                <Link
                  key={c.id}
                  href={`/marketing?tab=kalendarz&year=${year}&month=${month}`}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2.5 text-sm hover:bg-zinc-50"
                >
                  <span>{CONTENT_FORMAT_ICONS[c.format]}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{c.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${CONTENT_STATUS_PILL[c.status]}`}>{CONTENT_STATUS_LABELS[c.status]}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {new Date(c.scheduled_date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
