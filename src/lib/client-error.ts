// Next.js przy NIEOCZEKIWANYM błędzie w Server Action (np. prawdziwy bug, nie
// świadomy `throw new Error("...")` z komunikatem dla użytkownika) w
// produkcji potrafi zwrócić generyczny, angielski tekst zamiast realnego
// komunikatu ("An error occurred in the Server Components render...") — bez
// tego użytkownik widziałby techniczny bełkot zamiast czegoś zrozumiałego.
// Świadome komunikaty walidacji (krótkie, po polsku) przechodzą bez zmian.
export function friendlyActionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (!msg || msg.length > 300 || /server components render|digest property/i.test(msg)) {
    return "Wystąpił nieoczekiwany błąd. Spróbuj ponownie za chwilę.";
  }
  return msg;
}
