// Etykieta do ZWARTYCH widoków grafiku (siatka zmian) — nigdy do archiwum
// godzin, wynagrodzeń ani karty/listy pracownika, gdzie musi zostać pełne
// imię i nazwisko (`name`), bo to dane pełniące rolę dokumentu potwierdzenia.
export function scheduleDisplayName(employee: { name: string; short_name: string | null }): string {
  return employee.short_name?.trim() || employee.name;
}
