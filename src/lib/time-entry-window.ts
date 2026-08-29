import { timeToMinutes } from "./time";

// Wpis godzin można dodać/edytować o dowolnej porze, ale tylko dla dnia nie
// starszego niż 7 dni — potem okno się zamyka (dla zwykłego pracownika;
// admin może edytować dowolny dzień, patrz /admin/godziny).
export const EDIT_WINDOW_DAYS = 7;

export function isWithinEditWindow(dateKey: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateKey + "T00:00:00");
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  return diffDays >= 0 && diffDays <= EDIT_WINDOW_DAYS;
}

// Ta sama tolerancja, w jednym miejscu, dla trzech konsumentów: kalkulatora
// wynagrodzeń (flaguje rozbieżność do sprawdzenia), nocnego crona anomalii
// godzin, i samego wpisywania godzin (wymusza notatkę z wyjaśnieniem —
// patrz requiresDiscrepancyNote niżej).
export const DISCREPANCY_TOLERANCE_MIN = 30;

// Czy wpisane godziny odbiegają od grafiku na tyle, że pracownik MUSI dodać
// notatkę z wyjaśnieniem (zobaczy ją admin) — brak zaplanowanej zmiany tego
// dnia też się liczy jako rozbieżność wymagająca wyjaśnienia. Współdzielone
// przez klienta (DayTimeEntryEditor — natychmiastowa informacja) i serwer
// (godziny/actions.ts — właściwe wymuszenie), żeby obie strony liczyły to
// tak samo.
export function requiresDiscrepancyNote(actualStart: string, actualEnd: string, scheduled: { start_time: string; end_time: string }[]): boolean {
  if (scheduled.length === 0) return true;
  const minStart = Math.min(...scheduled.map((s) => timeToMinutes(s.start_time)));
  const maxEnd = Math.max(...scheduled.map((s) => timeToMinutes(s.end_time)));
  const startDiff = Math.abs(timeToMinutes(actualStart) - minStart);
  const endDiff = Math.abs(timeToMinutes(actualEnd) - maxEnd);
  return startDiff > DISCREPANCY_TOLERANCE_MIN || endDiff > DISCREPANCY_TOLERANCE_MIN;
}
