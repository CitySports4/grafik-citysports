// Logika zapisów na zajęcia dla dzieci. Funkcje czyste (bez dostępu do
// bazy), analogicznie do cleaning.ts — warstwa zapytań/akcji żyje w
// app/zapisy-dzieci i app/(app)/zajecia-dzieci.
//
// Grupa (dzień/godzina/pojemność) to edytowalna tabela (kids_class_group),
// nie sztywny enum — dziecko może należeć do dowolnej liczby grup naraz,
// każda ze swoim statusem (kids_class_enrollment), patrz migracja 0044.

import { weekdayLabel } from "./weekdays";
import { formatHm } from "./time";

export type KidsClassStatus = "nowe" | "aktywny" | "oczekuje" | "brak_oplaty" | "rezygnacja";

export const STATUS_LABELS: Record<KidsClassStatus, string> = {
  nowe: "Nowe",
  aktywny: "Aktywny",
  oczekuje: "Oczekuje (nowy miesiąc)",
  brak_oplaty: "Nieaktywny — brak opłaty",
  rezygnacja: "Nieaktywny — rezygnacja",
};

// Statusy, które faktycznie zajmują miejsce w grupie — "oczekuje" świadomie
// pominięte (to właśnie lista oczekujących, poza limitem).
export const OCCUPYING_STATUSES: KidsClassStatus[] = ["nowe", "aktywny"];

export const SEASON_MONTHS = [
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
] as const;

export type KidsClassGroup = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  label: string | null;
  capacity: number;
  active: boolean;
  sort_order: number;
  monthly_fee: number;
};

// Etykieta grupy do wyświetlenia — własna nazwa (jeśli admin ją ustawił) z
// dopiskiem dnia/godziny, albo sam dzień/godzina, gdy nazwy nie ma.
export function groupLabel(group: KidsClassGroup): string {
  const dayTime = `${capitalize(weekdayLabel(group.weekday))} ${formatHm(group.start_time)}–${formatHm(group.end_time)}`;
  return group.label ? `${group.label} (${dayTime})` : dayTime;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Wiek dziecka NA DANY DZIEŃ — liczony z daty urodzenia, nigdy nie
// zapisywany jako osobna wartość — zawsze aktualny, niezależnie jak dawno
// dziecko się zapisało.
export function ageOnDate(birthDateKey: string, referenceDateKey: string): number {
  const dob = new Date(birthDateKey + "T00:00:00");
  const ref = new Date(referenceDateKey + "T00:00:00");
  let age = ref.getFullYear() - dob.getFullYear();
  const m = ref.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) age--;
  return age;
}

// Koniec pierwszej połowy sezonu (ostatni dzień lutego) — granica, do
// której dziecko musi mieć ukończone 8 lat, żeby dołączyć w BIEŻĄCYM
// sezonie (wrzesień–czerwiec). Lipiec–grudzień → luty przyszłego roku
// kalendarzowego; styczeń–czerwiec → luty tego samego roku.
export function seasonSecondHalfCutoff(todayKey: string): string {
  const today = new Date(todayKey + "T00:00:00");
  const month = today.getMonth(); // 0 = styczeń
  const febYear = month >= 6 ? today.getFullYear() + 1 : today.getFullYear();
  const lastFeb = new Date(febYear, 2, 0); // dzień 0 marca = ostatni dzień lutego
  return toDateKeyLocal(lastFeb);
}

function toDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type AgeEligibility = { ok: true } | { ok: false; reason: string };

// Reguły wieku zajęć: 8–14 lat dziś, i musi mieć ukończone 8 lat najpóźniej
// do końca lutego bieżącego sezonu (żeby zdążyć skorzystać z sensownej
// części sezonu, nie dołączyć na 2 miesiące przed końcem).
export function checkAgeEligibility(birthDateKey: string, todayKey: string): AgeEligibility {
  const ageToday = ageOnDate(birthDateKey, todayKey);
  if (ageToday > 14) return { ok: false, reason: "Zajęcia są dla dzieci w wieku 8–14 lat." };
  const ageAtCutoff = ageOnDate(birthDateKey, seasonSecondHalfCutoff(todayKey));
  if (ageAtCutoff < 8) {
    return { ok: false, reason: "Dziecko musi mieć ukończone 8 lat najpóźniej do końca lutego, żeby dołączyć w tym sezonie." };
  }
  return { ok: true };
}

export type Enrollment = {
  id: string;
  group_id: string;
  status: KidsClassStatus;
  effective_from: string;
  effective_until: string | null;
};

// Czy dany zapis na grupę obowiązuje AKTUALNIE (na dany dzień) — wspiera
// zaplanowaną zmianę grupy "od nowego miesiąca": stary zapis przestaje
// obowiązywać dokładnie w dniu effective_until, nowy zaczyna dokładnie w
// dniu effective_from.
export function isEnrollmentEffective(enrollment: { effective_from: string; effective_until: string | null }, todayKey: string): boolean {
  if (enrollment.effective_from > todayKey) return false;
  if (enrollment.effective_until && enrollment.effective_until < todayKey) return false;
  return true;
}

// Ile miejsc w KAŻDEJ grupie zajmują aktualnie obowiązujące zapisy (patrz
// isEnrollmentEffective) ze statusem z OCCUPYING_STATUSES.
export function computeGroupOccupancy(enrollments: Enrollment[], todayKey: string): Map<string, number> {
  const occupancy = new Map<string, number>();
  for (const e of enrollments) {
    if (!OCCUPYING_STATUSES.includes(e.status)) continue;
    if (!isEnrollmentEffective(e, todayKey)) continue;
    occupancy.set(e.group_id, (occupancy.get(e.group_id) ?? 0) + 1);
  }
  return occupancy;
}

export function hasGroupCapacity(group: KidsClassGroup, occupancy: Map<string, number>): boolean {
  return (occupancy.get(group.id) ?? 0) < group.capacity;
}

// Wszystkie daty konkretnego dnia tygodnia w danym miesiącu (np. każdy
// poniedziałek września) — do widoku frekwencji, gdzie sesje NIE są
// przechowywane osobno, tylko wynikają wprost z dnia tygodnia grupy.
export function sessionDatesInMonth(weekday: number, year: number, month: number): string[] {
  const dates: string[] = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    if (d.getDay() === weekday) dates.push(toDateKeyLocal(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}
