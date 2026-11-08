import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import { Card } from "@/components/Card";
import { ColorDot } from "@/components/ColorDot";
import { TASK_PRIORITY_LABELS, type MarketingTaskPriority, type MarketingTaskStatus } from "@/lib/marketing";
import { isTaskActiveOnDay, tileUrgency, formatDeadlineBadge } from "@/lib/task-calendar";
import { setTaskStatus } from "./actions";

type Task = {
  id: string;
  title: string;
  due_date: string;
  status: MarketingTaskStatus;
  priority: MarketingTaskPriority;
  assignee_employee_id: string | null;
};
type Assignee = { id: string; name: string; color_hex: string };

const PRIORITY_BADGE: Record<MarketingTaskPriority, string> = {
  low: "bg-zinc-100 text-zinc-500",
  normal: "bg-blue-50 text-brand-navy",
  high: "bg-red-50 text-red-600",
};
const PRIORITY_RANK: Record<MarketingTaskPriority, number> = { high: 0, normal: 1, low: 2 };
const NO_ASSIGNEE = "_brak";

function dayLink(date: string) {
  return `/marketing?tab=zadania&widokZadan=dzien&data=${date}`;
}

// Widok DZIEŃ (patrz Sprint "Widoki kalendarza zadań") — lista aktywnych
// zadań (patrz isTaskActiveOnDay) na konkretny dzień, pogrupowana wg osoby.
export async function TaskDayView({ date }: { date: string }) {
  const today = toDateKey(new Date());
  const prevDate = toDateKey(new Date(new Date(date + "T00:00:00").getTime() - 86400000));
  const nextDate = toDateKey(new Date(new Date(date + "T00:00:00").getTime() + 86400000));

  const supabase = createServerSupabaseClient();
  const [{ data: tasksRaw }, { data: assigneesRaw }] = await Promise.all([
    supabase
      .from("marketing_task")
      .select("id, title, due_date, status, priority, assignee_employee_id")
      .eq("archived", false)
      .neq("status", "done")
      .not("due_date", "is", null),
    supabase
      .from("employee")
      .select("id, name, color_hex, employee_role!inner(role)")
      .eq("active", true)
      .in("employee_role.role", ["marketing", "content_creator"])
      .order("name"),
  ]);

  const assignees = (assigneesRaw ?? []) as Assignee[];
  const assigneeById = new Map(assignees.map((a) => [a.id, a]));
  const tasks = ((tasksRaw ?? []) as Task[]).filter((t) => isTaskActiveOnDay(t.due_date, date, today));

  const byAssignee = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.assignee_employee_id ?? NO_ASSIGNEE;
    if (!byAssignee.has(key)) byAssignee.set(key, []);
    byAssignee.get(key)!.push(t);
  }
  const groups = Array.from(byAssignee.entries())
    .map(([key, list]) => ({
      key,
      assignee: key === NO_ASSIGNEE ? null : assigneeById.get(key),
      tasks: list.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]),
    }))
    .sort((a, b) => {
      if (a.key === NO_ASSIGNEE) return 1;
      if (b.key === NO_ASSIGNEE) return -1;
      return (a.assignee?.name ?? "").localeCompare(b.assignee?.name ?? "");
    });

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={dayLink(prevDate)} className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">
            ←
          </Link>
          <span className="text-base font-bold capitalize text-zinc-900">{dateLabel}</span>
          <Link href={dayLink(nextDate)} className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">
            →
          </Link>
        </div>
        {date !== today && (
          <Link href={dayLink(today)} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-600 hover:bg-zinc-200">
            Dziś
          </Link>
        )}
      </div>

      {groups.length === 0 ? (
        <Card className="text-center text-sm text-zinc-400">Brak aktywnych zadań na ten dzień.</Card>
      ) : (
        groups.map((g) => (
          <Card key={g.key}>
            <h2 className="mb-2 flex items-center gap-2 font-semibold text-zinc-900">
              {g.assignee ? (
                <>
                  <ColorDot color={g.assignee.color_hex} />
                  {g.assignee.name}
                </>
              ) : (
                "Nieprzypisane"
              )}
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">{g.tasks.length}</span>
            </h2>
            <div className="flex flex-col gap-2">
              {g.tasks.map((t) => {
                const urgency = tileUrgency(t.due_date, today);
                return (
                  <div key={t.id} className="flex items-start gap-2.5 rounded-xl border border-zinc-200 bg-white p-2.5">
                    <form action={setTaskStatus} className="pt-0.5">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="status" value="done" />
                      <button
                        type="submit"
                        aria-label="Oznacz jako zrobione"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-zinc-300 transition-colors hover:border-emerald-500"
                      />
                    </form>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900">{t.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-bold ${PRIORITY_BADGE[t.priority]}`}>{TASK_PRIORITY_LABELS[t.priority]}</span>
                        <span className={`font-semibold ${urgency !== "normal" ? "text-red-600" : "text-zinc-500"}`}>{formatDeadlineBadge(t.due_date)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
