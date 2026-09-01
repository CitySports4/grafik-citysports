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

// Tolerancja na poziomie CAŁEGO dnia (suma wszystkich zmian vs suma
// wszystkich wpisów) — używana przez kalkulator wynagrodzeń i nocnego crona
// anomalii godzin, które i tak porównują zbiorczy zakres dnia ze zbiorczym
// zakresem dnia. NIE używana już przez requiresDiscrepancyNote niżej (patrz
// komentarz tam) — to osobna tolerancja dla osobnego, zbiorczego widoku.
export const DISCREPANCY_TOLERANCE_MIN = 30;

// Margines na POJEDYNCZY wpis względem NAJBLIŻSZEJ zaplanowanej zmiany:
// można zacząć maksymalnie EARLY_START_MARGIN_MIN wcześniej niż zmiana i
// skończyć maksymalnie LATE_END_MARGIN_MIN później — bez tłumaczenia.
// Węższe niż zmiana wpisy (spóźnienie na start, wcześniejsze wyjście) same w
// sobie NIE wymagają notatki — to nie problem rozliczeniowy w tę stronę,
// liczy się tylko to, co wykracza POZA zaplanowaną zmianę (bo to properly
// dodatkowe, płatne godziny, które admin powinien móc zweryfikować).
export const EARLY_START_MARGIN_MIN = 20;
export const LATE_END_MARGIN_MIN = 30;

// Czy wpisane godziny odbiegają od grafiku na tyle, że pracownik MUSI dodać
// notatkę z wyjaśnieniem (zobaczy ją admin) — brak zaplanowanej zmiany tego
// dnia też się liczy jako rozbieżność wymagająca wyjaśnienia. Współdzielone
// przez klienta (DayTimeEntryEditor — natychmiastowa informacja) i serwer
// (godziny/actions.ts — właściwe wymuszenie), żeby obie strony liczyły to
// tak samo.
//
// UWAGA: przy podzielonej zmianie (kilka osobnych okien w grafiku tego
// samego dnia) wpis dotyczy zawsze JEDNEJ konkretnej zmiany — porównanie
// go z rozpiętością min/max WSZYSTKICH zmian naraz (jak było wcześniej)
// fałszywie wyłapywało "różnicę" rzędu wielu godzin, mimo że wpis idealnie
// pasował do jednej z nich. Dlatego dopasowujemy wpis do najbliższej (po
// godzinie startu) zaplanowanej zmiany i porównujemy tylko z nią.
export function requiresDiscrepancyNote(actualStart: string, actualEnd: string, scheduled: { start_time: string; end_time: string }[]): boolean {
  if (scheduled.length === 0) return true;

  const actualStartMin = timeToMinutes(actualStart);
  const closest = scheduled.reduce((best, s) =>
    Math.abs(timeToMinutes(s.start_time) - actualStartMin) < Math.abs(timeToMinutes(best.start_time) - actualStartMin) ? s : best
  );

  const earliestAllowedStart = timeToMinutes(closest.start_time) - EARLY_START_MARGIN_MIN;
  const latestAllowedEnd = timeToMinutes(closest.end_time) + LATE_END_MARGIN_MIN;
  return actualStartMin < earliestAllowedStart || timeToMinutes(actualEnd) > latestAllowedEnd;
}
