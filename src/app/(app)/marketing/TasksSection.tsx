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
import { createTask, updateTask, setTaskStatus, deleteTask } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";
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

const PRIORITY_DOT: Record<MarketingTaskPriority, string> = {
  low: "bg-zinc-300",
  normal: "bg-brand-blue",
  high: "bg-red-500",
};

const NEXT_STATUS: Record<MarketingTaskStatus, { next: MarketingTaskStatus; label: string } | null> = {
  todo: { next: "in_progress", label: "→ W trakcie" },
  in_progress: { next: "done", label: "✓ Zrobione" },
  done: null,
};
const PREV_STATUS: Record<MarketingTaskStatus, { prev: MarketingTaskStatus; label: string } | null> = {
  todo: null,
  in_progress: { prev: "todo", label: "↺ Cofnij" },
  done: { prev: "in_progress", label: "↺ Cofnij" },
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

  function renderTask(t: Task) {
    const assignee = t.assignee_employee_id ? assigneeById.get(t.assignee_employee_id) : null;
    const overdue = t.status !== "done" && t.due_date !== null && t.due_date < today;
    const next = NEXT_STATUS[t.status];
    const prev = PREV_STATUS[t.status];
    return (
      <div key={t.id} className={`rounded-xl border p-3 ${overdue ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} title={`Priorytet: ${TASK_PRIORITY_LABELS[t.priority]}`} />
            <div>
              <p className="font-semibold text-zinc-900">{t.title}</p>
              {t.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-600">{t.description}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                {assignee && (
                  <span className="flex items-center gap-1">
                    <ColorDot color={assignee.color_hex} />
                    {assignee.name}
                  </span>
                )}
                {t.due_date && (
                  <span className={overdue ? "font-semibold text-red-600" : ""}>
                    {overdue ? "⚠ termin: " : "termin: "}
                    {new Date(t.due_date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {next && (
            <form action={setTaskStatus}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="status" value={next.next} />
              <button type="submit" className={BTN_GHOST}>
                {next.label}
              </button>
            </form>
          )}
          {prev && (
            <form action={setTaskStatus}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="status" value={prev.prev} />
              <button type="submit" className={BTN_GHOST}>
                {prev.label}
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
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand-orange marker:content-none">+ Nowe zadanie</summary>
          <form action={createTask} className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>Tytuł</label>
              <input name="title" required className={INPUT} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>Opis (opcjonalnie)</label>
              <textarea name="description" rows={2} className={INPUT} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className={LABEL}>Przypisane do</label>
                <select name="assignee_employee_id" defaultValue={currentEmployeeId} className={INPUT}>
                  <option value="">— nieprzypisane —</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={LABEL}>Priorytet</label>
                <select name="priority" defaultValue="normal" className={INPUT}>
                  {(Object.entries(TASK_PRIORITY_LABELS) as [MarketingTaskPriority, string][]).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={LABEL}>Termin (opcjonalnie)</label>
                <input type="date" name="due_date" className={INPUT} />
              </div>
            </div>
            <div>
              <SubmitButton className={BTN_PRIMARY}>Dodaj zadanie</SubmitButton>
            </div>
          </form>
        </details>
      </Card>

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
