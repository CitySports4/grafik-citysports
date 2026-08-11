// Postgres zwraca kolumny `time` jako "HH:MM:SS" — do wyświetlania
// obcinamy sekundy niezależnie od tego, ile znaków przyszło z bazy.
export function formatHm(t: string): string {
  return t.slice(0, 5);
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hoursBetween(start: string, end: string): number {
  const diff = timeToMinutes(end) - timeToMinutes(start);
  return Math.round((diff / 60) * 100) / 100;
}

export function overlapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const start = Math.max(timeToMinutes(aStart), timeToMinutes(bStart));
  const end = Math.min(timeToMinutes(aEnd), timeToMinutes(bEnd));
  return Math.max(0, end - start);
}

// Godziny zmiany pomniejszone o czas zajęć instruktora, które nakładają się
// na tę zmianę tego dnia tygodnia — instruktor w tym czasie uczy, nie
// obsługuje klubu, więc nie powinno się to liczyć do jego godzin pracy.
export function effectiveShiftHours(
  start: string,
  end: string,
  weekday: number,
  classes: { weekday: number; start_time: string; end_time: string }[]
): number {
  let minutes = timeToMinutes(end) - timeToMinutes(start);
  for (const c of classes) {
    if (c.weekday !== weekday) continue;
    minutes -= overlapMinutes(start, end, c.start_time, c.end_time);
  }
  return Math.max(0, Math.round((minutes / 60) * 100) / 100);
}

export function shiftsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return overlapMinutes(aStart, aEnd, bStart, bEnd) > 0;
}

// Godziny jednego pracownika w jednym dniu, liczone z sumy przedziałów
// czasowych PO POŁĄCZENIU nakładających się zmian (żeby np. zmiana 14–21 i
// 17–22 przypisane tej samej osobie nie liczyły się podwójnie za 17–21), a
// następnie pomniejszone o nakładające się zajęcia instruktora.
export function dailyEffectiveHours(
  shifts: { start_time: string; end_time: string }[],
  weekday: number,
  classes: { weekday: number; start_time: string; end_time: string }[]
): number {
  if (shifts.length === 0) return 0;

  const intervals = shifts
    .map((s): [number, number] => [timeToMinutes(s.start_time), timeToMinutes(s.end_time)])
    .sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  let [curStart, curEnd] = intervals[0];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    if (s <= curEnd) {
      curEnd = Math.max(curEnd, e);
    } else {
      merged.push([curStart, curEnd]);
      [curStart, curEnd] = [s, e];
    }
  }
  merged.push([curStart, curEnd]);

  let totalMinutes = 0;
  for (const [s, e] of merged) {
    let minutes = e - s;
    for (const c of classes) {
      if (c.weekday !== weekday) continue;
      const cs = timeToMinutes(c.start_time);
      const ce = timeToMinutes(c.end_time);
      minutes -= Math.max(0, Math.min(e, ce) - Math.max(s, cs));
    }
    totalMinutes += Math.max(0, minutes);
  }
  return Math.round((totalMinutes / 60) * 100) / 100;
}
