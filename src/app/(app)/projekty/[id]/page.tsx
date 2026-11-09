import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canAccessMarketing } from "@/lib/session";
import { Card } from "@/components/Card";
import { BackLink } from "@/components/BackLink";
import { ColorDot } from "@/components/ColorDot";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { BTN_GHOST, BTN_GHOST_DANGER } from "@/components/button-styles";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_LABELS,
  type MarketingTaskStatus,
  type MarketingTaskPriority,
  type EventProjectStatus,
} from "@/lib/marketing";
import { setTaskStatus, createTask, updateTask, deleteTask } from "../../marketing/actions";
import { updateEventProjectNotes } from "../actions";
import { EventProjectHeader } from "../EventProjectHeader";

const INPUT_SM = "rounded-lg border-[1.5px] border-zinc-300 px-2 py-1 text-xs";
const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

type Project = { id: string; name: string; color: string; event_date: string | null; status: EventProjectStatus; notes: string; type: "marketing" | "event" };
type Task = {
  id: string;
  title: string;
  status: MarketingTaskStatus;
  priority: MarketingTaskPriority;
  due_date: string | null;
  assignee_employee_id: string | null;
};
type EmployeeOption = { id: string; name: string; color_hex: string };

const PRIORITY_BADGE: Record<MarketingTaskPriority, string> = {
  low: "bg-zinc-100 text-zinc-500",
  normal: "bg-blue-50 text-brand-navy",
  high: "bg-red-50 text-red-600",
};

// Tablica wydarzenia — zadania i assignee NIE są ograniczone do roli
// "marketing" (w przeciwieństwie do /marketing/projekty/[id]): Wigilię czy
// Półkolonie równie dobrze organizuje recepcja albo trenerzy, nie tylko
// zespół marketingu. Zadania łączą się z projektem po project.name (zwykły
// tekst — patrz migracje 0062/0065), ten sam mechanizm co w marketingu.
export default async function EventProjectWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const employee = await requireEmployee();
  if (!canAccessMarketing(employee)) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">Nie masz dostępu do tej sekcji.</p>
      </div>
    );
  }

  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { data: projectRaw } = await supabase.from("marketing_project").select("id, name, color, event_date, status, notes, type").eq("id", id).single();
  const project = projectRaw as Project | null;

  if (!project) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href="/projekty" label="Wydarzenia" />
        <p className="text-sm text-zinc-500">Nie znaleziono wydarzenia.</p>
      </div>
    );
  }

  if (project.type !== "event") {
    return (
      <div className="flex flex-col gap-6">
        <BackLink href="/projekty" label="Wydarzenia" />
        <p className="text-sm text-zinc-500">
          „{project.name}” to projekt marketingowy — zarządzaj nim w{" "}
          <Link href={`/marketing/projekty/${project.id}`} className="font-semibold text-brand-orange hover:underline">
            Projektach marketingu
          </Link>
          .
        </p>
      </div>
    );
  }

  const [{ data: tasksRaw }, { data: employeesRaw }] = await Promise.all([
    supabase
      .from("marketing_task")
      .select("id, title, status, priority, due_date, assignee_employee_id")
      .eq("project", project.name)
      .eq("archived", false)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("employee").select("id, name, color_hex").eq("active", true).order("name"),
  ]);
  const tasks = (tasksRaw ?? []) as Task[];
  const employees = (employeesRaw ?? []) as EmployeeOption[];
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const today = new Date().toISOString().slice(0, 10);

  const byStatus: Record<MarketingTaskStatus, Task[]> = { todo: [], in_progress: [], gotowe: [], opublikowane: [] };
  for (const t of tasks) byStatus[t.status].push(t);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/projekty" label="Wydarzenia" />
      <EventProjectHeader project={project} />

      <Card>
        <h2 className="mb-2 font-semibold text-zinc-900">Notatki</h2>
        <form action={updateEventProjectNotes} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={project.id} />
          <textarea name="notes" defaultValue={project.notes} rows={4} placeholder="Notatki do wydarzenia…" className={INPUT} />
          <SubmitButton className="self-start rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
            Zapisz notatki
          </SubmitButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Dodaj zadanie</h2>
        <form action={createTask} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="project" value={project.name} />
          <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700">Tytuł</label>
            <input name="title" required className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700">Osoba</label>
            <select name="assignee_employee_id" defaultValue="" className={INPUT}>
              <option value="">— nieprzypisane —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700">Termin</label>
            <input type="date" name="due_date" className={INPUT} />
          </div>
          <SubmitButton className="shrink-0 rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
            Dodaj
          </SubmitButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">
          Zadania <span className="text-sm font-normal text-zinc-400">({tasks.length})</span>
        </h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak zadań.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {TASK_STATUS_ORDER.map((status) => {
              const list = byStatus[status];
              if (list.length === 0) return null;
              return (
                <div key={status}>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400">
                    {TASK_STATUS_LABELS[status]} ({list.length})
                  </p>
                  <div className="flex flex-col gap-2">
                    {list.map((t) => {
                      const assignee = t.assignee_employee_id ? employeeById.get(t.assignee_employee_id) : null;
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
                            <details className="mt-1.5">
                              <summary className={`${BTN_GHOST} inline-block cursor-pointer !px-0 [&::-webkit-details-marker]:hidden`}>Edytuj</summary>
                              <form action={updateTask} className="mt-2 flex flex-col gap-2 rounded-xl bg-zinc-50 p-3">
                                <input type="hidden" name="id" value={t.id} />
                                <input type="hidden" name="project" value={project.name} />
                                <input name="title" defaultValue={t.title} required className={INPUT_SM} placeholder="Tytuł" />
                                <div className="flex flex-wrap gap-2">
                                  <select name="assignee_employee_id" defaultValue={t.assignee_employee_id ?? ""} className={INPUT_SM}>
                                    <option value="">— nieprzypisane —</option>
                                    {employees.map((e) => (
                                      <option key={e.id} value={e.id}>
                                        {e.name}
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
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
