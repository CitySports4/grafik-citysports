import { overlapMinutes } from "./time";
import { toDateKey } from "./schedule-month";

export type HardConstraint = { weekday: number; start_time: string | null; end_time: string | null };
export type AvailabilityMap = Map<string, Map<string, { wholeDay: boolean; slots: Set<number> }>>;

export function buildAvailabilityMap(
  entries: { availability_submission_id: string; date: string; whole_day: boolean; slot_index: number | null }[],
  employeeIdBySubmission: Map<string, string>
): AvailabilityMap {
  const map: AvailabilityMap = new Map();
  for (const e of entries) {
    const empId = employeeIdBySubmission.get(e.availability_submission_id);
    if (!empId) continue;
    if (!map.has(empId)) map.set(empId, new Map());
    const byDate = map.get(empId)!;
    if (!byDate.has(e.date)) byDate.set(e.date, { wholeDay: false, slots: new Set() });
    const entry = byDate.get(e.date)!;
    if (e.whole_day) entry.wholeDay = true;
    else if (e.slot_index !== null) entry.slots.add(e.slot_index);
  }
  return map;
}

// Naniesienie zaplanowanych nieobecności/urlopów (osobny, niezależny od
// comiesięcznego zgłaszania dyspozycyjności mechanizm) na tę samą mapę —
// każdy dzień w zakresie liczy się jak "cały dzień niedostępny".
export function applyPlannedAbsences(
  map: AvailabilityMap,
  absences: { employee_id: string; start_date: string; end_date: string }[]
): void {
  for (const a of absences) {
    if (!map.has(a.employee_id)) map.set(a.employee_id, new Map());
    const byDate = map.get(a.employee_id)!;
    const cursor = new Date(a.start_date + "T00:00:00");
    const end = new Date(a.end_date + "T00:00:00");
    while (cursor <= end) {
      const key = toDateKey(cursor);
      if (!byDate.has(key)) byDate.set(key, { wholeDay: false, slots: new Set() });
      byDate.get(key)!.wholeDay = true;
      cursor.setDate(cursor.getDate() + 1);
    }
  }
}

// Twarda niedyspozycyjność — pracownika w ogóle nie da się przypisać: albo
// sam zaznaczył, że go nie będzie, albo admin ustawił twardą regułę
// cykliczną ("unavailable") pokrywającą się czasowo z tą zmianą.
export function isHardUnavailable(
  employeeId: string,
  date: string,
  weekday: number,
  slotIndex: number,
  shiftStart: string,
  shiftEnd: string,
  availability: AvailabilityMap,
  hardConstraintsByEmployee: Map<string, HardConstraint[]>
): boolean {
  const byDate = availability.get(employeeId)?.get(date);
  if (byDate?.wholeDay) return true;
  if (byDate?.slots.has(slotIndex)) return true;

  const rules = hardConstraintsByEmployee.get(employeeId) ?? [];
  for (const r of rules) {
    if (r.weekday !== weekday) continue;
    if (!r.start_time || !r.end_time) return true;
    if (overlapMinutes(shiftStart, shiftEnd, r.start_time, r.end_time) > 0) return true;
  }
  return false;
}
