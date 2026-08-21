import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import {
  resolveDaySlots,
  resolveTasksForDate,
  resolveCarryOverrides,
  computeOverdueTasks,
  computeCoverageGaps,
  balanceSlotAssignments,
  allCycleWindows,
  type CleaningTask,
  type WindowDay,
  type OverdueTask,
  type CleaningSlot,
} from "@/lib/cleaning";

export type CleaningDayItem = {
  taskId: string;
  name: string;
  zoneName: string;
  timeMinutes: number;
  slot: CleaningSlot;
  note: string | null;
  assignee: { id: string; name: string; color_hex: string } | null;
  autoCovered: boolean;
  overdue: OverdueTask | null;
  coverageGap: boolean;
  checklist: { id: string; label: string; done: boolean }[];
  done: boolean;
};

// Ile dni wstecz liczymy "ostatnie obciążenie" osoby minutami sprzątania na
// potrzeby uczciwego wyboru dnia w resolveCyclicDueDates — ~4 tygodnie,
// spójne z długością okna "monthly" w cleaning.ts.
const RECENT_LOAD_DAYS = 28;

// Cała logika dnia sprzątania (rozwiązanie zadań cyklicznych względem
// grafiku, carry, skip-with, zaległości, balansowanie) wydzielona z
// /sprzatanie, żeby móc jej użyć też z /zadania (skrócony podgląd dnia) bez
// duplikowania zapytań i obliczeń.
//
// `includeDraft` — domyślnie widok dnia liczy się tylko z OPUBLIKOWANEGO
// grafiku (ktoś może dziś realnie na to liczyć). Podgląd miesiąca
// (getCleaningMonthPreview) potrzebuje tego samego wyliczenia dla miesiąca,
// który admin dopiero układa — stąd opcja pominięcia filtra "published".
export async function getCleaningDayItems(
  dateKey: string,
  opts?: { includeDraft?: boolean }
): Promise<{ items: CleaningDayItem[]; todayPublished: boolean }> {
  const dateObj = new Date(dateKey + "T00:00:00");
  const weekday = dateObj.getDay();
  const yesterdayKey = toDateKey(new Date(dateObj.getTime() - 86400000));
  const recentStartKey = toDateKey(new Date(dateObj.getTime() - RECENT_LOAD_DAYS * 86400000));

  const supabase = createServerSupabaseClient();

  const { data: settings } = await supabase.from("cleaning_settings").select("cycle_start").eq("id", true).maybeSingle();
  const cycleStart = settings?.cycle_start ?? null;
  const windows = allCycleWindows(dateKey, cycleStart);
  const allWindowDates = new Set<string>([dateKey, ...windows.flat()]);
  const sortedWindowDates = [...allWindowDates].sort();
  const rangeStart = sortedWindowDates[0];
  const rangeEnd = sortedWindowDates[sortedWindowDates.length - 1];

  let windowDaysQuery = supabase
    .from("schedule_day")
    .select("date, schedule_shift(start_time, employee_id), schedule_month!inner(status)")
    .gte("date", rangeStart)
    .lte("date", rangeEnd);
  if (!opts?.includeDraft) windowDaysQuery = windowDaysQuery.eq("schedule_month.status", "published");

  const [
    { data: windowDays },
    { data: tasks },
    { data: allActiveNonDaily },
    { data: checklistItems },
    { data: templateItems },
    { data: employees },
    { data: employeeZones },
    { data: timeBudgets },
    { data: recentCompletions },
    { data: zones },
  ] = await Promise.all([
    windowDaysQuery,
    supabase
      .from("cleaning_task")
      .select(
        "id, zone_id, name, time_minutes, frequency, slot, active, day_constraint, note, carry_pair_task_id, skip_with_task_id, checklist_template_id"
      )
      .eq("active", true),
    supabase
      .from("cleaning_task")
      .select("id, zone_id, name, time_minutes, frequency, slot, active, day_constraint, note, carry_pair_task_id, skip_with_task_id, checklist_template_id")
      .eq("active", true)
      .neq("frequency", "daily"),
    supabase.from("cleaning_checklist_item").select("id, task_id, label, sort_order").order("sort_order"),
    supabase.from("cleaning_checklist_template_item").select("id, template_id, label, sort_order").order("sort_order"),
    supabase.from("employee").select("id, name, color_hex"),
    supabase.from("employee_cleaning_zone").select("employee_id, zone_id"),
    supabase.from("cleaning_time_budget").select("employee_id, slot, budget_minutes"),
    supabase
      .from("cleaning_completion")
      .select("employee_id, task_id, date")
      .gte("date", recentStartKey)
      .lt("date", dateKey)
      .not("completed_at", "is", null)
      .not("employee_id", "is", null),
    supabase.from("cleaning_zone").select("id, name, sort_order"),
  ]);

  const budgetBySlotAndEmployee = new Map((timeBudgets ?? []).map((b) => [`${b.employee_id}|${b.slot}`, b.budget_minutes]));

  // Minuty sprzątania z ostatnich ~4 tygodni per osoba — patrz komentarz przy
  // resolveCyclicDueDates w cleaning.ts. Budowane z rzeczywistych wpisów
  // wykonania (cleaning_completion.employee_id), nie z "kto był przypisany"
  // (to się nigdzie nie zapisuje — przydział liczy się na żywo).
  const timeMinutesByTaskId = new Map<string, number>((tasks ?? []).map((t) => [t.id, t.time_minutes]));
  const recentMinutesByEmployee = new Map<string, number>();
  for (const c of recentCompletions ?? []) {
    if (!c.employee_id) continue;
    const minutes = timeMinutesByTaskId.get(c.task_id) ?? 0;
    recentMinutesByEmployee.set(c.employee_id, (recentMinutesByEmployee.get(c.employee_id) ?? 0) + minutes);
  }

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
  const zoneNameById = new Map((zones ?? []).map((z) => [z.id, z.name]));
  const zoneSortById = new Map((zones ?? []).map((z) => [z.id, z.sort_order]));
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

  // Wybory AI (patrz cleaning-generator-ai.ts) dla okien cyklicznych zadań
  // dotykających tego dnia — tylko konkretne window_start z `windows`
  // wyliczone dla `dateKey`, nie szeroki zakres dat. Zawsze rewalidowane w
  // resolveCyclicDueDates, nigdy ślepo zaufane.
  const windowStarts = [...new Set(windows.map((w) => w[0]).filter((d): d is string => !!d))];
  const { data: aiChoices } =
    windowStarts.length > 0
      ? await supabase.from("cleaning_ai_day_choice").select("task_id, window_start, chosen_date").in("window_start", windowStarts)
      : { data: [] };
  const aiChosenDatesByTaskWindow = new Map<string, Set<string>>();
  for (const c of aiChoices ?? []) {
    const key = `${c.task_id}|${c.window_start}`;
    if (!aiChosenDatesByTaskWindow.has(key)) aiChosenDatesByTaskWindow.set(key, new Set());
    aiChosenDatesByTaskWindow.get(key)!.add(c.chosen_date);
  }

  let resolved = resolveTasksForDate(
    (tasks ?? []) as CleaningTask[],
    dateKey,
    weekday,
    cycleStart,
    daySlots,
    windowDaySlotsByDate,
    competencyByEmployee,
    recentMinutesByEmployee,
    aiChosenDatesByTaskWindow
  );

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
  resolved = balanceSlotAssignments(resolved, competencyByEmployee, budgetBySlotAndEmployee);

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
  // Zawsze pokaż zaległość, nawet gdy dziś akurat nikt kompetentny nie
  // pracuje na właściwym slocie — inaczej zaległe zadanie znika z widoku w
  // dni, gdy nie ma go komu automatycznie przypisać, zamiast zostać
  // widoczną luką (tak jak nieobsadzona zmiana) do ręcznej reakcji.
  for (const o of overdue) {
    const candidate = daySlots[o.task.slot];
    const competent = candidate ? (competencyByEmployee.get(candidate)?.has(o.task.zone_id) ?? false) : false;
    resolved.push({ task: o.task, employeeId: competent ? candidate : null, autoCovered: false });
  }
  const overdueByTask = new Map(overdue.map((o) => [o.task.id, o]));

  // Zadania cykliczne, które w BIEŻĄCYM oknie nie mają ani jednego dnia z
  // kompetentną osobą — nigdy nie staną się "due" i (jeśli nigdy wcześniej
  // nie zostały zrobione) nigdy nie trafią do `overdue` powyżej, bo ta
  // ścieżka wymaga historii wykonań. Bez tego są całkowicie niewidoczne.
  const resolvedIds2 = new Set(resolved.map((r) => r.task.id));
  const coverageGaps = computeCoverageGaps(
    (allActiveNonDaily ?? []) as CleaningTask[],
    dateKey,
    cycleStart,
    windowDaySlotsByDate,
    competencyByEmployee
  ).filter((g) => !resolvedIds2.has(g.task.id));
  for (const g of coverageGaps) {
    resolved.push({ task: g.task, employeeId: null, autoCovered: false });
  }
  const coverageGapIds = new Set(coverageGaps.map((g) => g.task.id));

  // Kolejność w obrębie każdego slotu odzwierciedla fizyczną bliskość stref
  // w klubie (patrz cleaning_zone.sort_order, migracja 0024) — osoba
  // sprzątająca robi zadania w sąsiadujących miejscach po kolei, zamiast
  // skakać między odległymi strefami. Sortowanie samego `resolved` (nie
  // dopiero `items`), bo CleaningDayList grupuje po slocie zachowując
  // kolejność z tej tablicy.
  resolved.sort((a, b) => (zoneSortById.get(a.task.zone_id) ?? 0) - (zoneSortById.get(b.task.zone_id) ?? 0));

  const taskIds = resolved.map((r) => r.task.id);
  const { data: completions } =
    taskIds.length > 0
      ? await supabase.from("cleaning_completion").select("task_id, completed_at, checklist_done").eq("date", dateKey).in("task_id", taskIds)
      : { data: [] };
  const completionByTask = new Map((completions ?? []).map((c) => [c.task_id, c]));

  const items: CleaningDayItem[] = resolved.map((r) => ({
    taskId: r.task.id,
    name: r.task.name,
    zoneName: zoneNameById.get(r.task.zone_id) ?? "?",
    timeMinutes: r.task.time_minutes,
    slot: r.task.slot,
    note: r.task.note,
    assignee: r.employeeId ? employeeById.get(r.employeeId) ?? null : null,
    autoCovered: r.autoCovered,
    overdue: overdueByTask.get(r.task.id) ?? null,
    coverageGap: coverageGapIds.has(r.task.id),
    checklist: checklistFor(r.task).map((c) => ({
      id: c.id,
      label: c.label,
      done: ((completionByTask.get(r.task.id)?.checklist_done as { item_id?: string }[] | string[] | null) ?? [])
        .map((x) => (typeof x === "string" ? x : x.item_id))
        .includes(c.id),
    })),
    done: Boolean(completionByTask.get(r.task.id)?.completed_at),
  }));

  return { items, todayPublished };
}

export type CleaningMonthPreviewDay = { date: string; weekday: number; items: CleaningDayItem[] };

// Zbiorczy podgląd całego miesiąca — kto sprząta co, którego dnia — liczony
// z draftu grafiku, ZANIM admin go opublikuje (stąd includeDraft: true; bez
// tego nic by się nie wyliczyło, bo /sprzatanie na co dzień celowo liczy się
// tylko z opublikowanego grafiku). Ponownie używa getCleaningDayItems per
// dzień (ta sama logika co codzienny widok, żadnej równoległej reimplementacji
// do utrzymania) — dni liczone równolegle, bo to i tak strona admina
// odpalana na żądanie, nie ścieżka o którą trzeba martwić się per request.
export async function getCleaningMonthPreview(dateKeys: string[]): Promise<CleaningMonthPreviewDay[]> {
  const results = await Promise.all(
    dateKeys.map(async (date) => {
      const weekday = new Date(date + "T00:00:00").getDay();
      const { items } = await getCleaningDayItems(date, { includeDraft: true });
      return { date, weekday, items };
    })
  );
  return results;
}
