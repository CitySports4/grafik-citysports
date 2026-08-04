// Postgres zwraca kolumny `time` jako "HH:MM:SS" — do wyświetlania
// obcinamy sekundy niezależnie od tego, ile znaków przyszło z bazy.
export function formatHm(t: string): string {
  return t.slice(0, 5);
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
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
