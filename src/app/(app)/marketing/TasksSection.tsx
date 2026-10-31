import { createServerSupabaseClient } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ColorDot } from "@/components/ColorDot";
import { BTN_PRIMARY, BTN_GHOST, BTN_GHOST_DANGER } from "@/components/button-styles";
import { toDateKey } from "@/lib/schedule-month";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_LABELS,
  type MarketingTaskStatus,
  type MarketingTaskPriority,
} from "@/lib/marketing";
import { createTask, updateTask, setTaskStatus, deleteTask, postponeTask } from "./actions";

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
};

type Assignee = { id: string; name: string; color_hex: string };

const PRIORITY_BADGE: Record<MarketingTaskPriority, string> = {
  low: "bg-zinc-100 text-zinc-500",
  normal: "bg-blue-50 text-brand-navy",
  high: "bg-red-50 text-red-600",
};

export async function TasksSection({ currentEmployeeId }: { currentEmployeeId: string }) {
  const supabase = createServerSupabaseClient();
  const today = toDateKey(new Date());
  const [{ data: tasksRaw }, { data: assigneesRaw }] = await Promise.all([
    supabase
      .from("marketing_task")
      .select("id, title, description, status, priority, due_date, assignee_employee_id")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("employee")
      .select("id, name, color_hex, employee_role!inner(role)")
      .eq("active", true)
      .eq("employee_role.role", "marketing")
      .order("name"),
  ]);

  const tasks = (tasksRaw ?? []) as Task[];
  const assignees = (assigneesRaw ?? []) as Assignee[];
  const assigneeById = new Map(assignees.map((a) => [a.id, a]));

  const byStatus: Record<MarketingTaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
  for (const t of tasks) byStatus[t.status].push(t);

  const overdueCount = tasks.filter((t) => t.status !== "done" && t.due_date !== null && t.due_date < today).length;

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
        </div>
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
            <summary className="cursor-pointer text-xs font-semibold text-zinc-500 marker:content-none">Więcej opcji ▾</summary>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
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
            </div>
            <textarea name="description" rows={2} placeholder="Opis (opcjonalnie)" className={`${INPUT} mt-2`} />
          </details>
        </form>
      </Card>

      {overdueCount > 0 && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
          ⚠ {overdueCount} {overdueCount === 1 ? "zaległe zadanie" : "zaległych zadań"} — termin już minął.
        </p>
      )}

      {TASK_STATUS_ORDER.map((status) => (
        <Card key={status}>
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-zinc-900">
            {TASK_STATUS_LABELS[status]}
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">{byStatus[status].length}</span>
          </h2>
          {byStatus[status].length === 0 ? (
            <p className="text-sm text-zinc-400">Brak zadań.</p>
          ) : (
            <div className="flex flex-col gap-2">{byStatus[status].map(renderTask)}</div>
          )}
        </Card>
      ))}
    </div>
  );
}
