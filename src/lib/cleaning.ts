import { mondayOfWeek } from "./schedule-month";

export type CleaningSlot = "otwarcie" | "srodek" | "zamkniecie";
export type CleaningFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly";

export type CleaningTask = {
  id: string;
  zone_id: string;
  name: string;
  time_minutes: number;
  frequency: CleaningFrequency;
  weekday: number | null;
  slot: CleaningSlot;
  requires_ladder: boolean;
  active: boolean;
};

// Który pracownik ma którą "rolę dnia" (otwarcie/środek/zamknięcie), na
// podstawie faktycznych zmian tego dnia posortowanych wg godziny startu.
// To jest serce zasady "sprzątanie zależy od grafiku pracy" — nie wybieramy
// nikogo niezależnie, tylko patrzymy kto i tak już tego dnia pracuje.
export function resolveDaySlots(
  shifts: { start_time: string; employee_id: string | null }[]
): Record<CleaningSlot, string | null> {
  const assigned = shifts.filter((s) => s.employee_id).slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (assigned.length === 0) return { otwarcie: null, srodek: null, zamkniecie: null };
  if (assigned.length === 1) return { otwarcie: assigned[0].employee_id, srodek: null, zamkniecie: assigned[0].employee_id };
  if (assigned.length === 2) {
    return { otwarcie: assigned[0].employee_id, srodek: null, zamkniecie: assigned[assigned.length - 1].employee_id };
  }
  return {
    otwarcie: assigned[0].employee_id,
    srodek: assigned[Math.floor(assigned.length / 2)].employee_id,
    zamkniecie: assigned[assigned.length - 1].employee_id,
  };
}

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
  if (task.frequency === "daily") return true;
  if (task.weekday === null || task.weekday !== weekday) return false;
  if (task.frequency === "weekly") return true;
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
};

// Dla zadań aktywnych danego dnia: przydziel osobę, która i tak pracuje na
// odpowiedniej "roli dnia" (otwarcie/środek/zamknięcie) ORAZ ma kompetencję
// do danej strefy. Jeśli nikt taki nie pracuje tego dnia — zadanie zostaje
// bez przypisania (podobnie jak nieobsadzona zmiana — widoczne, do ręcznej
// reakcji, a nie ukryte).
export function resolveTasksForDate(
  tasks: CleaningTask[],
  dateKey: string,
  weekday: number,
  cycleStart: string | null,
  daySlots: Record<CleaningSlot, string | null>,
  competencyByEmployee: Map<string, Set<string>>
): ResolvedCleaningTask[] {
  return tasks
    .filter((t) => isTaskDueOnDate(t, dateKey, weekday, cycleStart))
    .map((task) => {
      const candidate = daySlots[task.slot];
      const competent = candidate ? (competencyByEmployee.get(candidate)?.has(task.zone_id) ?? false) : false;
      return { task, employeeId: competent ? candidate : null };
    });
}
