import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { toDateKey } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { resolveDaySlots, resolveTasksForDate, type CleaningTask } from "@/lib/cleaning";
import { Card } from "@/components/Card";
import { CleaningDayList } from "./CleaningDayList";

export default async function CleaningDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireEmployee();
  const params = await searchParams;
  const dateKey = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : toDateKey(new Date());
  const dateObj = new Date(dateKey + "T00:00:00");
  const weekday = dateObj.getDay();

  const prevDate = new Date(dateObj);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(dateObj);
  nextDate.setDate(nextDate.getDate() + 1);

  const supabase = createServerSupabaseClient();

  const [{ data: day }, { data: settings }, { data: tasks }, { data: checklistItems }, { data: employees }, { data: employeeZones }] =
    await Promise.all([
      supabase
        .from("schedule_day")
        .select("schedule_shift(start_time, employee_id), schedule_month!inner(status)")
        .eq("date", dateKey)
        .eq("schedule_month.status", "published")
        .maybeSingle(),
      supabase.from("cleaning_settings").select("cycle_start").eq("id", true).maybeSingle(),
      supabase
        .from("cleaning_task")
        .select("id, zone_id, name, time_minutes, frequency, weekday, slot, requires_ladder, active")
        .eq("active", true),
      supabase.from("cleaning_checklist_item").select("id, task_id, label, sort_order").order("sort_order"),
      supabase.from("employee").select("id, name, color_hex"),
      supabase.from("employee_cleaning_zone").select("employee_id, zone_id"),
    ]);

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
  const competencyByEmployee = new Map<string, Set<string>>();
  for (const ez of employeeZones ?? []) {
    if (!competencyByEmployee.has(ez.employee_id)) competencyByEmployee.set(ez.employee_id, new Set());
    competencyByEmployee.get(ez.employee_id)!.add(ez.zone_id);
  }
  const checklistByTask = new Map<string, { id: string; label: string }[]>();
  for (const c of checklistItems ?? []) {
    if (!checklistByTask.has(c.task_id)) checklistByTask.set(c.task_id, []);
    checklistByTask.get(c.task_id)!.push({ id: c.id, label: c.label });
  }

  const shifts = (day?.schedule_shift ?? []) as { start_time: string; employee_id: string | null }[];
  const daySlots = resolveDaySlots(shifts);

  const resolved = resolveTasksForDate(
    (tasks ?? []) as CleaningTask[],
    dateKey,
    weekday,
    settings?.cycle_start ?? null,
    daySlots,
    competencyByEmployee
  );

  const taskIds = resolved.map((r) => r.task.id);
  const { data: completions } =
    taskIds.length > 0
      ? await supabase.from("cleaning_completion").select("task_id, completed_at, checklist_done").eq("date", dateKey).in("task_id", taskIds)
      : { data: [] };
  const completionByTask = new Map((completions ?? []).map((c) => [c.task_id, c]));

  const items = resolved.map((r) => ({
    taskId: r.task.id,
    name: r.task.name,
    timeMinutes: r.task.time_minutes,
    slot: r.task.slot,
    assignee: r.employeeId ? employeeById.get(r.employeeId) ?? null : null,
    checklist: (checklistByTask.get(r.task.id) ?? []).map((c) => ({
      id: c.id,
      label: c.label,
      done: ((completionByTask.get(r.task.id)?.checklist_done as string[] | null) ?? []).includes(c.id),
    })),
    done: Boolean(completionByTask.get(r.task.id)?.completed_at),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold capitalize text-zinc-900">
            Sprzątanie — {weekdayLabel(weekday)}, {dateObj.toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}
          </h1>
          {!day && <p className="text-sm text-amber-600">Grafik na ten dzień nie jest jeszcze opublikowany — przydział może być niepełny.</p>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/sprzatanie?date=${toDateKey(prevDate)}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            ← poprzedni dzień
          </Link>
          <Link href={`/sprzatanie?date=${toDateKey(nextDate)}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            następny dzień →
          </Link>
        </div>
      </div>

      <Card>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak zadań sprzątania na ten dzień.</p>
        ) : (
          <CleaningDayList date={dateKey} items={items} />
        )}
      </Card>
    </div>
  );
}
