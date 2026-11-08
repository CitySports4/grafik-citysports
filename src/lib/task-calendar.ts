// Logika widoków kalendarzowych zadań marketingu (Dzień/Tydzień/Miesiąc) —
// funkcje czyste, bez dostępu do bazy, analogicznie do marketing.ts.

// Reguła wspólna dla wszystkich trzech widoków: zadanie jest "aktywne" na
// dany dzień D, jeśli D mieści się w oknie [dziś, max(dziś, due_date)] —
// czyli widoczne każdego dnia od dziś do terminu włącznie (patrz
// specyfikacja: "due_date = 15.11 widoczne każdego dnia od dziś do 15.11").
// Zaległe (due_date < dziś) NIE znikają — okno kurczy się do samego "dziś"
// zamiast stawać się puste, więc przeterminowane zadanie wciąż widać (na
// czerwono) dopóki ktoś go nie zamknie. Dni sprzed "dziś" nigdy nic nie
// pokazują — to widok do planowania naprzód, nie archiwum.
export function isTaskActiveOnDay(dueDate: string, day: string, today: string): boolean {
  if (day < today) return false;
  const windowEnd = dueDate < today ? today : dueDate;
  return day <= windowEnd;
}

export type TileUrgency = "normal" | "due_today" | "overdue";

export function tileUrgency(dueDate: string, today: string): TileUrgency {
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "due_today";
  return "normal";
}

// "⏰ do 15.11" — czerwone, gdy termin dziś albo już minął (patrz
// specyfikacja, ta sama reguła na każdym kafelku we wszystkich 3 widokach).
export function formatDeadlineBadge(dueDate: string): string {
  const d = new Date(dueDate + "T00:00:00");
  return `⏰ do ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}
