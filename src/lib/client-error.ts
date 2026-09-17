// Przy każdym nowym wdrożeniu Next.js rotuje identyfikatory Server Actions
// (patrz node_modules/next/dist/docs — "Deployment considerations" w
// server-actions.md) — ktoś z otwartą w przeglądarce STARĄ wersją strony,
// kto kliknie akcję PO nowym wdrożeniu, dostaje błąd "Failed to find Server
// Action" (dokumentacja wprost zaleca złapać to i pokazać "odśwież"). To
// najczęstsza przyczyna dziwnych błędów zaraz po tym, jak coś tu wdrażamy —
// zwykłe odświeżenie strony naprawia sprawę.
const STALE_DEPLOY_RE = /failed to find server action/i;

// Prawdziwie NIEOCZEKIWANY błąd w Server Action (bug, nie świadomy
// `throw new Error("...")` z komunikatem dla użytkownika) w produkcji
// Next.js potrafi zwrócić generyczny, angielski tekst zamiast realnego
// komunikatu ("An error occurred in the Server Components render...") — bez
// tego użytkownik widziałby techniczny bełkot zamiast czegoś zrozumiałego.
// Świadome komunikaty walidacji (krótkie, po polsku, np. o przekroczonym
// limicie sali) przechodzą bez zmian.
const GENERIC_REDACTED_RE = /server components render|digest property/i;

export function friendlyActionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (STALE_DEPLOY_RE.test(msg)) {
    return "Strona została w międzyczasie zaktualizowana. Odśwież stronę (odciągnij w dół albo Ctrl/Cmd+R) i spróbuj ponownie.";
  }
  if (!msg || msg.length > 300 || GENERIC_REDACTED_RE.test(msg)) {
    return "Wystąpił nieoczekiwany błąd. Odśwież stronę i spróbuj ponownie.";
  }
  return msg;
}
