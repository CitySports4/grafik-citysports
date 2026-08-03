import { overlapMinutes } from "./time";

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
