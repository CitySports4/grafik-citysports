import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { toDateKey } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import {
  resolveDaySlots,
  resolveTasksForDate,
  resolveCarryOverrides,
  computeOverdueTasks,
  balanceSlotAssignments,
  allCycleWindows,
  type CleaningTask,
  type WindowDay,
} from "@/lib/cleaning";
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
  const yesterdayKey = toDateKey(new Date(dateObj.getTime() - 86400000));

  const prevDate = new Date(dateObj);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(dateObj);
  nextDate.setDate(nextDate.getDate() + 1);

  const supabase = createServerSupabaseClient();

  // Cykl trzeba znać zanim wyznaczymy zakres dat do pobrania grafiku (okna
  // różnej długości dla różnych częstotliwości), więc ta jedna zapytanie
  // idzie osobno, przed resztą.
  const { data: settings } = await supabase.from("cleaning_settings").select("cycle_start").eq("id", true).maybeSingle();
  const cycleStart = settings?.cycle_start ?? null;
  const windows = allCycleWindows(dateKey, cycleStart);
  const allWindowDates = new Set<string>([dateKey, ...windows.flat()]);
  const sortedWindowDates = [...allWindowDates].sort();
  const rangeStart = sortedWindowDates[0];
  const rangeEnd = sortedWindowDates[sortedWindowDates.length - 1];

  const [
    { data: windowDays },
    { data: tasks },
    { data: allActiveNonDaily },
    { data: checklistItems },
    { data: templateItems },
    { data: employees },
    { data: employeeZones },
  ] = await Promise.all([
    // Grafik dla całego zakresu dat obejmującego wszystkie okna cykli
    // (tydzień / 2-tyg. / 4-tyg. / 12-tyg.) — potrzebny, by dynamicznie
    // wybrać, który dzień w oknie ma przypadać dane zadanie cykliczne.
    supabase
      .from("schedule_day")
      .select("date, schedule_shift(start_time, employee_id), schedule_month!inner(status)")
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .eq("schedule_month.status", "published"),
    supabase
      .from("cleaning_task")
      .select(
        "id, zone_id, name, time_minutes, frequency, slot, requires_ladder, active, day_constraint, note, carry_pair_task_id, skip_with_task_id, checklist_template_id"
      )
      .eq("active", true),
    supabase
      .from("cleaning_task")
      .select("id, zone_id, name, time_minutes, frequency, slot, requires_ladder, active, day_constraint, note, carry_pair_task_id, skip_with_task_id, checklist_template_id")
      .eq("active", true)
      .neq("frequency", "daily"),
    supabase.from("cleaning_checklist_item").select("id, task_id, label, sort_order").order("sort_order"),
    supabase.from("cleaning_checklist_template_item").select("id, template_id, label, sort_order").order("sort_order"),
    supabase.from("employee").select("id, name, color_hex, no_ladder"),
    supabase.from("employee_cleaning_zone").select("employee_id, zone_id"),
  ]);

  const windowDaySlotsByDate = new Map<string, WindowDay>();
  for (const dk of allWindowDates) {
    windowDaySlotsByDate.set(dk, {
      dateKey: dk,
      weekday: new Date(dk + "T00:00:00").getDay(),
      daySlots: { otwarcie: null, srodek: null, zamkniecie: null, po_zamknieciu: null },
    });
  }
  for (const wd of windowDays ?? []) {
    const shifts = (wd.schedule_shift ?? []) as { start_time: string; employee_id: string | null }[];
    const entry = windowDaySlotsByDate.get(wd.date);
    if (entry) entry.daySlots = resolveDaySlots(shifts);
  }
  const todayPublished = (windowDays ?? []).some((wd) => wd.date === dateKey);

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
  const noLadderByEmployee = new Set((employees ?? []).filter((e) => e.no_ladder).map((e) => e.id));
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
  const templateItemsByTemplate = new Map<string, { id: string; label: string }[]>();
  for (const it of templateItems ?? []) {
    if (!templateItemsByTemplate.has(it.template_id)) templateItemsByTemplate.set(it.template_id, []);
    templateItemsByTemplate.get(it.template_id)!.push({ id: it.id, label: it.label });
  }
  function checklistFor(task: CleaningTask): { id: string; label: string }[] {
    if (task.checklist_template_id) return templateItemsByTemplate.get(task.checklist_template_id) ?? [];
    return checklistByTask.get(task.id) ?? [];
  }

  const daySlots = windowDaySlotsByDate.get(dateKey)!.daySlots;

  let resolved = resolveTasksForDate(
    (tasks ?? []) as CleaningTask[],
    dateKey,
    weekday,
    cycleStart,
    daySlots,
    windowDaySlotsByDate,
    competencyByEmployee
  );

  // Powiązania carry: potrzebujemy odhaczeń z wczoraj (zadania rano) i dziś
  // (zadania wieczór/po zamknięciu) dla wszystkich zadań, które są czyimś
  // partnerem carry — nie tylko tych już w `resolved`.
  const carryPairIds = [...new Set(resolved.map((r) => r.task.carry_pair_task_id).filter((x): x is string => !!x))];
  const { data: carryCompletions } =
    carryPairIds.length > 0
      ? await supabase
          .from("cleaning_completion")
          .select("task_id, date, completed_at")
          .in("task_id", carryPairIds)
          .in("date", [dateKey, yesterdayKey])
      : { data: [] };
  const completedTaskDateKeys = new Set(
    (carryCompletions ?? []).filter((c) => c.completed_at).map((c) => `${c.task_id}|${c.date}`)
  );
  resolved = resolveCarryOverrides(resolved, dateKey, completedTaskDateKeys);
  resolved = balanceSlotAssignments(resolved, competencyByEmployee, noLadderByEmployee);

  // Zaległości: ostatnie wykonanie każdego niedziennego aktywnego zadania.
  const nonDailyIds = (allActiveNonDaily ?? []).map((t) => t.id);
  const { data: historyCompletions } =
    nonDailyIds.length > 0
      ? await supabase
          .from("cleaning_completion")
          .select("task_id, date, completed_at")
          .in("task_id", nonDailyIds)
          .not("completed_at", "is", null)
          .order("date", { ascending: false })
      : { data: [] };
  const lastDoneByTask = new Map<string, string>();
  for (const c of historyCompletions ?? []) {
    if (!lastDoneByTask.has(c.task_id)) lastDoneByTask.set(c.task_id, c.date);
  }
  const resolvedIds = new Set(resolved.map((r) => r.task.id));
  const overdue = computeOverdueTasks((allActiveNonDaily ?? []) as CleaningTask[], lastDoneByTask, dateKey).filter(
    (o) => !resolvedIds.has(o.task.id)
  );
  for (const o of overdue) {
    const candidate = daySlots[o.task.slot];
    const competent = candidate ? (competencyByEmployee.get(candidate)?.has(o.task.zone_id) ?? false) : false;
    if (!competent) continue; // brak kompetentnej osoby dziś — nie pokazuj jako "do zrobienia teraz"
    resolved.push({ task: o.task, employeeId: candidate, autoCovered: false });
  }
  const overdueByTask = new Map(overdue.map((o) => [o.task.id, o]));

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
    note: r.task.note,
    assignee: r.employeeId ? employeeById.get(r.employeeId) ?? null : null,
    autoCovered: r.autoCovered,
    overdue: overdueByTask.get(r.task.id) ?? null,
    checklist: checklistFor(r.task).map((c) => ({
      id: c.id,
      label: c.label,
      done: ((completionByTask.get(r.task.id)?.checklist_done as { item_id?: string }[] | string[] | null) ?? [])
        .map((x) => (typeof x === "string" ? x : x.item_id))
        .includes(c.id),
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
          {!todayPublished && <p className="text-sm text-amber-600">Grafik na ten dzień nie jest jeszcze opublikowany — przydział może być niepełny.</p>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/sprzatanie?date=${toDateKey(prevDate)}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            ← poprzedni dzień
          </Link>
          <Link href={`/sprzatanie?date=${toDateKey(nextDate)}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            następny dzień →
          </Link>
          <Link href="/sprzatanie/pula" className="rounded-lg bg-zinc-800 px-3 py-1.5 font-semibold text-white hover:bg-zinc-900">
            Pula zadań
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
