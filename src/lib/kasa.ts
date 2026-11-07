// Logika modułu Kasa (zamknięcie dnia, KW/KP, numeracja) — funkcje czyste,
// bez dostępu do bazy, ten sam wzorzec co kids-classes.ts/marketing.ts.
// Warstwa zapytań/akcji żyje w app/(app)/kasa.

export type CashDayStatus = "open" | "closed" | "corrected";
export const CASH_DAY_STATUS_LABELS: Record<CashDayStatus, string> = {
  open: "Otwarty",
  closed: "Zamknięty",
  corrected: "Skorygowany",
};

export type CashCountSlot = "08:00" | "14:00" | "zamkniecie";
export const CASH_COUNT_SLOT_ORDER: CashCountSlot[] = ["08:00", "14:00", "zamkniecie"];
export const CASH_COUNT_SLOT_LABELS: Record<CashCountSlot, string> = {
  "08:00": "Liczenie 08:00",
  "14:00": "Liczenie 14:00",
  zamkniecie: "Zamknięcie",
};

export type CashIncomeWindow = "do_8" | "8_14" | "14_zamkniecie";
export const CASH_INCOME_WINDOW_ORDER: CashIncomeWindow[] = ["do_8", "8_14", "14_zamkniecie"];
export const CASH_INCOME_WINDOW_LABELS: Record<CashIncomeWindow, string> = {
  do_8: "Do 8:00",
  "8_14": "8:00–14:00",
  "14_zamkniecie": "14:00–zamknięcie",
};

export type CashDocumentType = "KW" | "KP";
export const CASH_DOCUMENT_TYPE_LABELS: Record<CashDocumentType, string> = {
  KW: "Rozchód (KW)",
  KP: "Przychód spoza sprzedaży (KP)",
};

export type AttachmentKind = "paragon" | "faktura" | "raport_okresowy" | "terminal" | "potwierdzenie_karty" | "inne";
export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  paragon: "Paragon",
  faktura: "Faktura",
  raport_okresowy: "Raport okresowy (kasa fiskalna)",
  terminal: "Wydruk z terminala",
  potwierdzenie_karty: "Potwierdzenie kartowe",
  inne: "Inne",
};

// Suma wpływów gotówką ze wszystkich okien dnia — jedyna część wpływów,
// która faktycznie zmienia stan FIZYCZNEJ gotówki w szufladzie (karta nie).
export function totalCashIncome(entries: { cash_amount: number }[]): number {
  return Math.round(entries.reduce((sum, e) => sum + e.cash_amount, 0) * 100) / 100;
}

// Stan oczekiwany w kasie = otwarcie + gotówka ze sprzedaży + KP − KW.
// Karta i online NIE wchodzą do fizycznej gotówki, więc nie wliczamy
// cash_income_entry.card_amount — to jest osobna, zgadzana z terminalem
// liczba (patrz "Uzgodnienia" w specyfikacji, Faza 6, jeszcze nie
// zaimplementowana).
export function expectedClosing(
  openingBalance: number,
  incomeEntries: { cash_amount: number }[],
  documents: { type: CashDocumentType; amount: number }[]
): number {
  const income = totalCashIncome(incomeEntries);
  const kp = documents.filter((d) => d.type === "KP").reduce((s, d) => s + d.amount, 0);
  const kw = documents.filter((d) => d.type === "KW").reduce((s, d) => s + d.amount, 0);
  return Math.round((openingBalance + income + kp - kw) * 100) / 100;
}

export function cashDifference(expected: number, counted: number): number {
  return Math.round((counted - expected) * 100) / 100;
}

// Numer dokumentu RRRR/M/NNNNN (miesiąc BEZ zera wiodącego, 5 cyfr pozycji w
// miesiącu) — dokładnie jak na dotychczasowych papierowych KW (patrz
// specyfikacja, przykład "2026/9/00014"). countThisMonthSoFar = ile
// dokumentów TEGO SAMEGO typu już istnieje w tym miesiącu (liczone przez
// wywołującego, bo wymaga zapytania do bazy).
export function formatDocumentNumber(date: string, countThisMonthSoFar: number): string {
  const [year, month] = date.split("-");
  const seq = String(countThisMonthSoFar + 1).padStart(5, "0");
  return `${year}/${Number(month)}/${seq}`;
}

// Numer RD — kolejny, ciągły, bez odniesienia do miesiąca (patrz
// specyfikacja: RD 326 … RD 358 ciągiem przez wrzesień). Sam numer bierzemy
// z kasa_settings.next_rd_number (wywołujący inkrementuje po użyciu).
export function formatRdNumber(n: number): string {
  return `RD ${n}`;
}
