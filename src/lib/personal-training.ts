import { timeToMinutes } from "./time";
import { toDateKey } from "./schedule-month";

export const PT_DURATIONS_MIN = [30, 40, 50, 60, 70, 90] as const;
export type PtDuration = (typeof PT_DURATIONS_MIN)[number];

export const PT_SLOT_STEP_MIN = 5;

export type RoomWindow = { start_time: string; end_time: string };

// Trening musi zmieścić się CAŁY w jednym oknie dostępności sali tego dnia
// (nie może "przeskoczyć" przez przerwę między dwoma oknami).
export function fitsInRoomHours(startMin: number, endMin: number, windows: RoomWindow[]): boolean {
  return windows.some((w) => timeToMinutes(w.start_time) <= startMin && endMin <= timeToMinutes(w.end_time));
}

export type OtherSession = { start_time: string; end_time_min?: number; end_time?: string; client_count: number };

function sessionMinutes(s: { start_time: string; duration_minutes?: number; end_time?: string }): [number, number] {
  const start = timeToMinutes(s.start_time);
  const end = s.end_time ? timeToMinutes(s.end_time) : start + (s.duration_minutes ?? 0);
  return [start, end];
}

// Maksymalna liczba osób jednocześnie w sali w przedziale [candidateStart,
// candidateEnd), licząc TYLKO istniejące treningi (bez kandydata) — sweep po
// punktach startu/końca każdego treningu przyciętych do kandydata, bo suma
// zmienia się tylko w tych punktach.
export function maxConcurrentClients(
  candidateStart: number,
  candidateEnd: number,
  sessions: { start_time: string; duration_minutes: number; client_count: number }[]
): number {
  const points = new Set<number>([candidateStart, candidateEnd]);
  const clipped: { start: number; end: number; count: number }[] = [];
  for (const s of sessions) {
    const [start, end] = sessionMinutes(s);
    const clipStart = Math.max(start, candidateStart);
    const clipEnd = Math.min(end, candidateEnd);
    if (clipStart < clipEnd) {
      points.add(clipStart);
      points.add(clipEnd);
      clipped.push({ start: clipStart, end: clipEnd, count: s.client_count });
    }
  }
  const sorted = [...points].sort((a, b) => a - b);
  let max = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const mid = (sorted[i] + sorted[i + 1]) / 2;
    const sum = clipped.reduce((acc, c) => (c.start <= mid && mid < c.end ? acc + c.count : acc), 0);
    max = Math.max(max, sum);
  }
  return max;
}

// Szuka najbliższego wolnego terminu TEGO SAMEGO dnia — na przemian w przód
// i w tył od żądanej godziny (co 5 min), więc wygrywa ten bliższy. Samo "w
// przód" nie wystarczało: przy treningu proszonym tuż przed zamknięciem
// sali (np. żądane 16:00/60 min, sala zamyka 16:50) w przód nigdy nic się
// nie zmieści — dopiero cofnięcie o 10 min (do 15:50) daje wolny termin, a
// bez szukania wstecz trener dostawał tylko "brak wolnego terminu", mimo że
// chwilę wcześniej sala była wolna.
export function findAvailableStart(
  requestedStartMin: number,
  durationMin: number,
  clientCount: number,
  roomCapacity: number,
  roomWindows: RoomWindow[],
  otherSessionsThatDay: { start_time: string; duration_minutes: number; client_count: number }[]
): number | null {
  if (roomWindows.length === 0) return null;
  const dayStart = Math.min(...roomWindows.map((w) => timeToMinutes(w.start_time)));
  const dayEnd = Math.max(...roomWindows.map((w) => timeToMinutes(w.end_time)));

  function fitsAt(candidate: number): boolean {
    const candidateEnd = candidate + durationMin;
    if (!fitsInRoomHours(candidate, candidateEnd, roomWindows)) return false;
    const concurrent = maxConcurrentClients(candidate, candidateEnd, otherSessionsThatDay);
    return concurrent + clientCount <= roomCapacity;
  }

  for (let offset = 0; ; offset += PT_SLOT_STEP_MIN) {
    const forward = requestedStartMin + offset;
    const backward = requestedStartMin - offset;
    const forwardInRange = forward + durationMin <= dayEnd;
    const backwardInRange = backward >= dayStart;
    if (!forwardInRange && !backwardInRange) return null;
    if (forwardInRange && fitsAt(forward)) return forward;
    if (offset > 0 && backwardInRange && fitsAt(backward)) return backward;
  }
}

// Czy skrócenie treningu (przy TEJ SAMEJ godzinie startu) do jednego z
// dostępnych, krótszych czasów trwania (patrz PT_DURATIONS_MIN) zmieściłoby
// się — alternatywa dla przesunięcia godziny, gdy np. sala zamyka się za
// mniej czasu niż żądany trening. Zwraca najdłuższy pasujący czas.
export function maxFittingDuration(
  startMin: number,
  requestedDurationMin: number,
  clientCount: number,
  roomCapacity: number,
  roomWindows: RoomWindow[],
  otherSessionsThatDay: { start_time: string; duration_minutes: number; client_count: number }[]
): number | null {
  const shorterOptions = PT_DURATIONS_MIN.filter((d) => d < requestedDurationMin).sort((a, b) => b - a);
  for (const d of shorterOptions) {
    const end = startMin + d;
    if (!fitsInRoomHours(startMin, end, roomWindows)) continue;
    const concurrent = maxConcurrentClients(startMin, end, otherSessionsThatDay);
    if (concurrent + clientCount <= roomCapacity) return d;
  }
  return null;
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Kwota za jeden trening = stawka (zamrożona w chwili utworzenia) × liczba
// osób — patrz rate_per_person_snapshot w migracji 0031, żeby późniejsza
// zmiana globalnej stawki nie przepisywała historii już zaplanowanych treningów.
export function sessionAmount(ratePerPersonSnapshot: number, clientCount: number): number {
  return Math.round(ratePerPersonSnapshot * clientCount * 100) / 100;
}

// Maksymalna liczba wystąpień jednej serii (~2 lata co tydzień) — czysto
// zabezpieczenie przed wpisaniem absurdalnie dużej liczby powtórzeń albo
// bardzo odległej daty końcowej, co wygenerowałoby tysiące wierszy w jednym
// zapisie.
const MAX_SERIES_OCCURRENCES = 104;

// Daty kolejnych wystąpień cyklicznego treningu (co tydzień, ten sam dzień
// tygodnia co pierwszy termin), aż do (włącznie) daty końcowej albo do
// osiągnięcia liczby powtórzeń — cokolwiek trener podał przy tworzeniu serii.
export function weeklyOccurrenceDates(firstDate: string, untilDate: string | null, occurrences: number | null): string[] {
  const dates: string[] = [];
  const cursor = new Date(firstDate + "T00:00:00");
  const until = untilDate ? new Date(untilDate + "T00:00:00") : null;
  const maxCount = Math.min(occurrences ?? Infinity, MAX_SERIES_OCCURRENCES);
  while (dates.length < maxCount) {
    if (until && cursor > until) break;
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
}
