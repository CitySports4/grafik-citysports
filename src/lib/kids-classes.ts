// Logika zapisów na zajęcia dla dzieci — port dawnego systemu Google Apps
// Script. Funkcje czyste (bez dostępu do bazy), analogicznie do cleaning.ts
// — warstwa zapytań/akcji żyje w app/zapisy-dzieci i app/(app)/zajecia-dzieci.

export type KidsClassGroup = "poniedzialek" | "czwartek" | "obie";
export type KidsClassStatus = "nowe" | "aktywny" | "oczekuje" | "brak_oplaty" | "rezygnacja";

export const GROUP_LABELS: Record<KidsClassGroup, string> = {
  poniedzialek: "Poniedziałek",
  czwartek: "Czwartek",
  obie: "Obie grupy (2×/tydz.)",
};

export const STATUS_LABELS: Record<KidsClassStatus, string> = {
  nowe: "Nowe",
  aktywny: "Aktywny",
  oczekuje: "Oczekuje (nowy miesiąc)",
  brak_oplaty: "Nieaktywny — brak opłaty",
  rezygnacja: "Nieaktywny — rezygnacja",
};

// Statusy, które faktycznie zajmują miejsce w grupie — "oczekuje" świadomie
// pominięte (to właśnie lista oczekujących, poza limitem), rezygnacja/brak
// opłaty zwalniają miejsce.
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

// Wiek dziecka NA DANY DZIEŃ — liczony z daty urodzenia, nigdy nie
// zapisywany jako osobna wartość (patrz komentarz w migracji 0040) — dzięki
// temu zawsze aktualny, niezależnie jak dawno dziecko się zapisało.
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
  // Dzień 0 marca = ostatni dzień lutego (uwzględnia lata przestępne).
  const lastFeb = new Date(febYear, 2, 0);
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

export type Occupancy = { poniedzialek: number; czwartek: number };

// Ile miejsc w każdej grupie zajmują aktualne zgłoszenia — "obie" liczy się
// do OBU dni naraz (dziecko fizycznie zajmuje miejsce na korcie w każdym
// z nich). Liczy tylko statusy z OCCUPYING_STATUSES.
export function computeOccupancy(registrations: { group_choice: KidsClassGroup; status: KidsClassStatus }[]): Occupancy {
  let poniedzialek = 0;
  let czwartek = 0;
  for (const r of registrations) {
    if (!OCCUPYING_STATUSES.includes(r.status)) continue;
    if (r.group_choice === "poniedzialek" || r.group_choice === "obie") poniedzialek++;
    if (r.group_choice === "czwartek" || r.group_choice === "obie") czwartek++;
  }
  return { poniedzialek, czwartek };
}

// Czy wybrana grupa ma miejsce — sprawdza dokładnie te dni, na które
// dziecko by się zapisało (dla "obie" oba dni muszą mieć miejsce).
export function hasCapacity(
  groupChoice: KidsClassGroup,
  occupancy: Occupancy,
  limits: { limit_poniedzialek: number; limit_czwartek: number }
): boolean {
  const wantsMonday = groupChoice === "poniedzialek" || groupChoice === "obie";
  const wantsThursday = groupChoice === "czwartek" || groupChoice === "obie";
  if (wantsMonday && occupancy.poniedzialek >= limits.limit_poniedzialek) return false;
  if (wantsThursday && occupancy.czwartek >= limits.limit_czwartek) return false;
  return true;
}
