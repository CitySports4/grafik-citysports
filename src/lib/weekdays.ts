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
