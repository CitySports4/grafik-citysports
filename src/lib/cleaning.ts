import { mondayOfWeek, toDateKey } from "./schedule-month";

export type CleaningSlot = "otwarcie" | "srodek" | "zamkniecie" | "po_zamknieciu";
export type CleaningFrequency = "daily" | "2xweek" | "3xweek" | "weekly" | "biweekly" | "monthly" | "quarterly";

export type CleaningTask = {
  id: string;
  zone_id: string;
  name: string;
  time_minutes: number;
  frequency: CleaningFrequency;
  weekdays: number[];
  slot: CleaningSlot;
  requires_ladder: boolean;
  active: boolean;
  day_constraint: "mon_fri" | "not_weekend" | null;
  note: string | null;
  carry_pair_task_id: string | null;
  skip_with_task_id: string | null;
  checklist_template_id: string | null;
};

// Który pracownik ma którą "rolę dnia" (otwarcie/środek/zamknięcie/po
// zamknięciu), na podstawie faktycznych zmian tego dnia posortowanych wg
// godziny startu. To jest serce zasady "sprzątanie zależy od grafiku pracy"
// — nie wybieramy nikogo niezależnie, tylko patrzymy kto i tak już tego dnia
// pracuje. "Po zamknięciu" robi ta sama osoba co "zamknięcie".
export function resolveDaySlots(
  shifts: { start_time: string; employee_id: string | null }[]
): Record<CleaningSlot, string | null> {
  const assigned = shifts.filter((s) => s.employee_id).slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (assigned.length === 0) return { otwarcie: null, srodek: null, zamkniecie: null, po_zamknieciu: null };
  if (assigned.length === 1) {
    return { otwarcie: assigned[0].employee_id, srodek: null, zamkniecie: assigned[0].employee_id, po_zamknieciu: assigned[0].employee_id };
  }
  if (assigned.length === 2) {
    const closer = assigned[assigned.length - 1].employee_id;
    return { otwarcie: assigned[0].employee_id, srodek: null, zamkniecie: closer, po_zamknieciu: closer };
  }
  const closer = assigned[assigned.length - 1].employee_id;
  return {
    otwarcie: assigned[0].employee_id,
    srodek: assigned[Math.floor(assigned.length / 2)].employee_id,
    zamkniecie: closer,
    po_zamknieciu: closer,
  };
}

const FREQ_DAYS: Record<CleaningFrequency, number> = {
  daily: 1,
  "3xweek": 3,
  "2xweek": 4,
  weekly: 7,
  biweekly: 14,
  monthly: 28,
  quarterly: 84,
};

// Ile pełnych tygodni minęło od daty odniesienia (poniedziałek tygodnia
// cyklu startowego) do poniedziałku tygodnia danej daty.
function weeksSinceCycleStart(dateKey: string, cycleStart: string): number {
  const startMonday = new Date(mondayOfWeek(cycleStart) + "T00:00:00");
  const dateMonday = new Date(mondayOfWeek(dateKey) + "T00:00:00");
  const diffMs = dateMonday.getTime() - startMonday.getTime();
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
}

export function isTaskDueOnDate(task: CleaningTask, dateKey: string, weekday: number, cycleStart: string | null): boolean {
  if (!task.active) return false;
  if ((task.day_constraint === "mon_fri" || task.day_constraint === "not_weekend") && (weekday === 0 || weekday === 6)) {
    return false;
  }
  if (task.frequency === "daily") return true;
  if (!task.weekdays.includes(weekday)) return false;
  if (task.frequency === "2xweek" || task.frequency === "3xweek" || task.frequency === "weekly") return true;
  if (!cycleStart) return false; // cykl nieustawiony — rzadsze zadania nie są jeszcze liczone
  const weeks = weeksSinceCycleStart(dateKey, cycleStart);
  if (weeks < 0) return false;
  if (task.frequency === "biweekly") return weeks % 2 === 0;
  if (task.frequency === "monthly") return weeks % 4 === 0;
  if (task.frequency === "quarterly") return weeks % 12 === 0;
  return false;
}

export type ResolvedCleaningTask = {
  task: CleaningTask;
  employeeId: string | null;
  autoCovered: boolean;
};

// Dla zadań aktywnych danego dnia: przydziel osobę, która i tak pracuje na
// odpowiedniej "roli dnia" ORAZ ma kompetencję do danej strefy. Jeśli nikt
// taki nie pracuje tego dnia — zadanie zostaje bez przypisania (podobnie jak
// nieobsadzona zmiana — widoczne, do ręcznej reakcji, a nie ukryte).
export function resolveTasksForDate(
  tasks: CleaningTask[],
  dateKey: string,
  weekday: number,
  cycleStart: string | null,
  daySlots: Record<CleaningSlot, string | null>,
  competencyByEmployee: Map<string, Set<string>>
): ResolvedCleaningTask[] {
  const due = tasks.filter((t) => isTaskDueOnDate(t, dateKey, weekday, cycleStart));
  const afterSkip = applySkipWith(due);
  return afterSkip.map((task) => {
    const candidate = daySlots[task.slot];
    const competent = candidate ? (competencyByEmployee.get(candidate)?.has(task.zone_id) ?? false) : false;
    return { task, employeeId: competent ? candidate : null, autoCovered: false };
  });
}

// Pomija zadanie, jeśli jego "nadrzędne" zadanie (skip_with_task_id) jest
// dziś też należne — np. cotygodniowe mycie z zalewaniem zastępuje codzienny
// mop tego samego dnia.
export function applySkipWith(dueTasks: CleaningTask[]): CleaningTask[] {
  const dueIds = new Set(dueTasks.map((t) => t.id));
  return dueTasks.filter((t) => !(t.skip_with_task_id && dueIds.has(t.skip_with_task_id)));
}

// Zadania "carry" (rano ↔ wieczór, ta sama czynność) — jeśli sparowane
// zadanie zostało zrobione (rano: wieczorem dnia poprzedniego; wieczór/po
// zamknięciu: rano tego samego dnia), dzisiejsze wystąpienie jest oznaczone
// jako już pokryte — widoczne, ale nieobowiązkowe.
export function resolveCarryOverrides(
  resolved: ResolvedCleaningTask[],
  dateKey: string,
  completedTaskDateKeys: Set<string>
): ResolvedCleaningTask[] {
  const yesterday = toDateKey(new Date(new Date(dateKey + "T00:00:00").getTime() - 86400000));
  return resolved.map((r) => {
    if (!r.task.carry_pair_task_id) return r;
    const checkDate = r.task.slot === "otwarcie" ? yesterday : dateKey;
    const covered = completedTaskDateKeys.has(`${r.task.carry_pair_task_id}|${checkDate}`);
    return covered ? { ...r, autoCovered: true } : r;
  });
}

export type OverdueTask = { task: CleaningTask; daysLate: number; alert: boolean };

// Zadania niedzienne, które powinny były zostać zrobione ponownie już jakiś
// czas temu wg swojej częstotliwości, a nie zostały — niezależnie od tego,
// czy dziś akurat wypadają na "swój" dzień tygodnia. Wstrzykiwane do widoku
// dnia jako osobna, widoczna zaległość (z liczbą dni spóźnienia).
export function computeOverdueTasks(
  tasks: CleaningTask[],
  lastDoneByTask: Map<string, string>,
  dateKey: string
): OverdueTask[] {
  const today = new Date(dateKey + "T12:00:00");
  const result: OverdueTask[] = [];
  for (const task of tasks) {
    if (!task.active || task.frequency === "daily") continue;
    const lastDone = lastDoneByTask.get(task.id);
    if (!lastDone) continue; // nigdy nie zrobione — nie liczymy jako "zaległe", tylko jako nowe
    const last = new Date(lastDone + "T12:00:00");
    const daysSince = Math.floor((today.getTime() - last.getTime()) / 86400000);
    const max = FREQ_DAYS[task.frequency] ?? 7;
    if (daysSince <= max) continue;
    const daysLate = daysSince - max;
    result.push({ task, daysLate, alert: daysLate >= 2 });
  }
  return result;
}

// Dla dni, gdy w tym samym slocie pracuje więcej niż jedna osoba (rzadkie —
// głównie soboty z dodatkową obsadą), wyrównuje sumę minut między nimi
// względem budżetów czasowych. Nie przenosi zadań na drabinie do osób z
// no_ladder, ani zadań spoza kompetencji strefy danej osoby.
export function balanceSlotAssignments(
  resolved: ResolvedCleaningTask[],
  competencyByEmployee: Map<string, Set<string>>,
  noLadderByEmployee: Set<string>
): ResolvedCleaningTask[] {
  const bySlot = new Map<CleaningSlot, ResolvedCleaningTask[]>();
  for (const r of resolved) {
    if (!bySlot.has(r.task.slot)) bySlot.set(r.task.slot, []);
    bySlot.get(r.task.slot)!.push(r);
  }

  const out: ResolvedCleaningTask[] = [];
  for (const items of bySlot.values()) {
    const persons = [...new Set(items.map((i) => i.employeeId).filter((x): x is string => !!x))];
    if (persons.length < 2) {
      out.push(...items);
      continue;
    }
    let working = items.map((i) => ({ ...i }));
    for (let iter = 0; iter < 10; iter++) {
      const totals = new Map<string, number>();
      for (const p of persons) totals.set(p, 0);
      for (const w of working) {
        if (w.employeeId) totals.set(w.employeeId, (totals.get(w.employeeId) ?? 0) + w.task.time_minutes);
      }
      const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
      const [highPerson, highTotal] = sorted[0];
      const [lowPerson, lowTotal] = sorted[sorted.length - 1];
      if (highPerson === lowPerson || highTotal - lowTotal < 20) break;

      const movable = working
        .filter(
          (w) =>
            w.employeeId === highPerson &&
            !w.autoCovered &&
            !(w.task.requires_ladder && noLadderByEmployee.has(lowPerson)) &&
            (competencyByEmployee.get(lowPerson)?.has(w.task.zone_id) ?? false)
        )
        .sort(
          (a, b) =>
            Math.abs(highTotal - a.task.time_minutes - (lowTotal + a.task.time_minutes)) -
            Math.abs(highTotal - b.task.time_minutes - (lowTotal + b.task.time_minutes))
        );
      if (movable.length === 0) break;

      const idx = working.findIndex((w) => w.task.id === movable[0].task.id && w.employeeId === highPerson);
      if (idx >= 0) working[idx] = { ...working[idx], employeeId: lowPerson };
    }
    out.push(...working);
  }
  return out;
}
