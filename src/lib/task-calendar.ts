// Logika widoków kalendarzowych zadań marketingu (Dzień/Tydzień/Miesiąc) —
// funkcje czyste, bez dostępu do bazy, analogicznie do marketing.ts.

// Sentinele filtra po osobie, współdzielone przez Kanban (TasksSection) i
// wszystkie 3 widoki kalendarzowe — KAŻDY z czterech trybów domyślnie (brak
// parametru w URL) zawęża się do zalogowanej osoby, nie pokazuje całego
// zespołu (świadoma decyzja: jeden spójny domyślny filtr we wszystkich
// trybach Zadań, nie tylko w Kanbanie).
export const ASSIGNEE_ALL = "_wszyscy";
export const ASSIGNEE_UNASSIGNED = "_brak";

// Zawęża listę zadań do wybranej osoby — effectiveFilter to już
// ROZSTRZYGNIĘTA wartość (assigneeFilter ?? currentEmployeeId, patrz
// TasksSection), więc "brak filtra" nigdy tu nie dociera jako taki.
export function filterByAssignee<T extends { assignee_employee_id: string | null }>(tasks: T[], effectiveFilter: string): T[] {
  if (effectiveFilter === ASSIGNEE_ALL) return tasks;
  if (effectiveFilter === ASSIGNEE_UNASSIGNED) return tasks.filter((t) => !t.assignee_employee_id);
  return tasks.filter((t) => t.assignee_employee_id === effectiveFilter);
}

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
