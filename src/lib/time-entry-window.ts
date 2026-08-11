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
