// 0 = niedziela .. 6 = sobota (zgodnie z JS Date#getDay()).
export const WEEKDAY_LABELS = [
  "niedziela",
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
] as const;

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? "?";
}

// Kolejność wyświetlania dni tygodnia zaczynająca się od poniedziałku —
// wartości liczbowe dnia tygodnia (0=niedziela..6=sobota, zgodnie z
// Date#getDay()) zostają bez zmian, zmienia się tylko kolejność w siatkach.
export const WEEK_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
