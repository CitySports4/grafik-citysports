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

// Margines na POJEDYNCZY wpis względem NAJBLIŻSZEJ zaplanowanej zmiany —
// symetrycznie wcześniej/później na każdym krańcu, ale z osobnym progiem
// na start i na koniec (przy zamykaniu jest po prostu więcej naturalnych
// powodów na drobne opóźnienie niż przy rozpoczęciu).
export const DISCREPANCY_START_MARGIN_MIN = 20;
export const DISCREPANCY_END_MARGIN_MIN = 30;

// Łączy stykające się/nakładające okna (posortowane po starcie) w jedno
// ciągłe — np. sprzątanie 07:30–09:00 tuż przed zmianą 09:00–15:00 to w
// praktyce jeden ciągły blok 07:30–15:00, nie dwa osobne okna z "dziurą" w
// środku. Prawdziwa przerwa (np. zmiana 08–10 i 15–21) zostaje osobnymi
// oknami, bo między nimi jest realny odstęp.
function mergeAdjacentWindows(
  windows: { start_time: string; end_time: string }[]
): { start_time: string; end_time: string }[] {
  const sorted = [...windows].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  const merged: { start_time: string; end_time: string }[] = [];
  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (last && timeToMinutes(w.start_time) <= timeToMinutes(last.end_time)) {
      if (timeToMinutes(w.end_time) > timeToMinutes(last.end_time)) last.end_time = w.end_time;
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

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
// pasował do jednej z nich. Dlatego NAJPIERW łączymy stykające się okna
// (patrz mergeAdjacentWindows — np. wydarzenie tuż przed zmianą, bez przerwy
// między nimi), a dopiero potem dopasowujemy wpis do najbliższego (po
// godzinie startu) ciągłego okna i porównujemy tylko z nim. Bez tego
// łączenia wpis obejmujący i wydarzenie, i następującą po nim zmianę (np.
// sprzątanie 07:30–09:00 + zmiana 09:00–15:00, wpis 07:20–15:10) dopasowałby
// się do bliższego startem wydarzenia, ale jego koniec (15:10) porównałby
// się z końcem TEGO wydarzenia (09:00) — fałszywa różnica rzędu godzin.
//
// `allowUnscheduled` — zgoda tej konkretnej osoby na pracę zdalną (patrz
// employee.allow_remote_work / SessionEmployee.allowRemoteWork) — dla niej
// brak JAKIEJKOLWIEK zmiany w grafiku tego dnia to normalna, oczekiwana
// sytuacja, nie rozbieżność wymagająca tłumaczenia.
export function requiresDiscrepancyNote(
  actualStart: string,
  actualEnd: string,
  scheduled: { start_time: string; end_time: string }[],
  allowUnscheduled = false
): boolean {
  if (scheduled.length === 0) return !allowUnscheduled;

  const windows = mergeAdjacentWindows(scheduled);
  const actualStartMin = timeToMinutes(actualStart);
  const closest = windows.reduce((best, s) =>
    Math.abs(timeToMinutes(s.start_time) - actualStartMin) < Math.abs(timeToMinutes(best.start_time) - actualStartMin) ? s : best
  );

  const startDiff = Math.abs(actualStartMin - timeToMinutes(closest.start_time));
  const endDiff = Math.abs(timeToMinutes(actualEnd) - timeToMinutes(closest.end_time));
  return startDiff > DISCREPANCY_START_MARGIN_MIN || endDiff > DISCREPANCY_END_MARGIN_MIN;
}
