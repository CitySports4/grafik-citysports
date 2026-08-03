// Supabase/Postgres zwraca komunikaty błędów po angielsku — nie pokazujemy
// ich bezpośrednio adminowi. Logujemy oryginał po swojej stronie (do
// debugowania), a admin dostaje krótki, zrozumiały komunikat po polsku.
export function dbErrorMessage(
  error: { message: string; code?: string } | null | undefined,
  fallback = "Wystąpił błąd podczas zapisu. Spróbuj ponownie."
): string {
  if (!error) return fallback;
  console.error("Błąd bazy danych:", error.code, error.message);

  switch (error.code) {
    case "23505":
      return "Taki wpis już istnieje (np. ten numer telefonu jest już zajęty).";
    case "23503":
      return "Nie można wykonać tej operacji — dane są powiązane z innym wpisem.";
    case "23502":
      return "Brakuje wymaganych danych.";
    case "22P02":
      return "Nieprawidłowy format danych.";
    default:
      return fallback;
  }
}
