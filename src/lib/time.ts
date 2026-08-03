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
