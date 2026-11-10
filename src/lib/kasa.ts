// Logika modułu Kasa v1 (SPEC_kasa_v1.md) — funkcje czyste, bez dostępu do
// bazy, ten sam wzorzec co kids-classes.ts/marketing.ts/task-calendar.ts.
// Warstwa importu (eFitness) żyje w lib/kasa-import.ts, zapytania/akcje w
// app/(app)/kasa.

// Typ transakcji eFitness (pole "Type" z /transactions/, patrz pkt 1 spec).
// 7/8 (nieopłacone) pomijane już na etapie importu — nie trafiają do bazy.
export type EfitnessTransactionType = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const TX_TYPE_RATA = 0;
export const TX_TYPE_PORTFEL = 1;
export const TX_TYPE_BAR = 2;
export const TX_TYPE_KW = 3;
export const TX_TYPE_KP = 4;
export const TX_TYPE_INNE = 5;
export const TX_TYPE_PREPAID = 6;

export type PaymentCategory = "cash" | "card" | "nonfiscal" | "online" | "ignore";

export type CashCountSlot = "open" | "shift" | "close";
export const CASH_COUNT_SLOT_ORDER: CashCountSlot[] = ["open", "shift", "close"];
export const CASH_COUNT_SLOT_LABELS: Record<CashCountSlot, string> = {
  open: "Otwarcie (ok. 8:00)",
  shift: "Zmiana (ok. 14:00)",
  close: "Zamknięcie",
};

export type CashDayStatus = "open" | "closed";
export const CASH_DAY_STATUS_LABELS: Record<CashDayStatus, string> = {
  open: "Otwarty",
  closed: "Zamknięty",
};

export type CashMonthStatus = "open" | "closed";

export type DocStatus = "todo" | "complete" | "waiting";
export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  todo: "Do uzupełnienia",
  complete: "Kompletny",
  waiting: "Oczekuje",
};
export const DOC_STATUS_ICONS: Record<DocStatus, string> = {
  todo: "📄",
  complete: "✅",
  waiting: "⏳",
};

export type DocType = "receipt" | "ksef_invoice" | "foreign_invoice" | "awaiting_invoice" | "other";
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  receipt: "Paragon",
  ksef_invoice: "Faktura w KSeF",
  foreign_invoice: "Faktura spoza KSeF / bez polskiego NIP",
  awaiting_invoice: "Czekamy na fakturę",
  other: "Inne",
};
// Czy dana opcja wymaga skanu/zdjęcia (pkt 4 spec) — paragon i faktura
// spoza KSeF tak, faktura w KSeF nie (księgowa ma dostęp do KSeF).
export const DOC_TYPE_REQUIRES_ATTACHMENT: Record<DocType, boolean> = {
  receipt: true,
  ksef_invoice: false,
  foreign_invoice: true,
  awaiting_invoice: false,
  other: true,
};
// Status wynikowy po wyborze opcji — "waiting" tylko dla "czekamy na
// fakturę", reszta od razu kompletna.
export function docStatusForType(docType: DocType): DocStatus {
  return docType === "awaiting_invoice" ? "waiting" : "complete";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type TxLike = { type: number; value: number; category: PaymentCategory };

// Suma transakcji sprzedaży (pomija KW/KP, to osobne wielkości) dla danej
// kategorii formy płatności — "Gotówka fiskalna" / "Karta (eFitness)" / Niefiskalne.
export function sumSales(transactions: TxLike[], category: PaymentCategory): number {
  return round2(
    transactions.filter((t) => t.category === category && t.type !== TX_TYPE_KW && t.type !== TX_TYPE_KP).reduce((s, t) => s + t.value, 0)
  );
}

export function sumByType(transactions: { type: number; value: number }[], type: number): number {
  return round2(transactions.filter((t) => t.type === type).reduce((s, t) => s + t.value, 0));
}

export type DepositSplit = {
  depositsCard: number;
  depositsCash: number;
  // true, gdy surowe kaucje_kartą (przed przycięciem) wychodzi poza [0, nonfiscal] —
  // czerwona rozbieżność terminala wymagająca wyjaśnienia (pkt 2 spec).
  terminalDiscrepancy: boolean;
  rawDepositsCard: number;
};

// Automatyczny podział kaucji za butelki (system kaucyjny) na kartę/gotówkę
// — eFitness nie rozróżnia formy zapłaty kaucji (zawsze "Niefiskalna"), więc
// liczymy z sumy z terminala, którą recepcja i tak wpisuje przy zamknięciu:
//   kaucje_kartą   = suma_z_terminala − karta_eFitness
//   kaucje_gotówką = niefiskalne − kaucje_kartą (przycięte do [0, niefiskalne])
export function splitDeposits(terminalTotal: number, cardEfitness: number, nonfiscal: number): DepositSplit {
  const rawDepositsCard = round2(terminalTotal - cardEfitness);
  const terminalDiscrepancy = rawDepositsCard < 0 || rawDepositsCard > nonfiscal;
  const depositsCard = Math.min(Math.max(rawDepositsCard, 0), nonfiscal);
  const depositsCash = round2(nonfiscal - depositsCard);
  return { depositsCard, depositsCash, terminalDiscrepancy, rawDepositsCard };
}

// Stan gotówki oczekiwany w szufladzie = otwarcie + gotówka fiskalna +
// kaucje gotówką + KP − KW (pkt 2 spec). Karta/online nie wchodzą do
// fizycznej gotówki.
export function expectedCashBalance(params: { openingBalance: number; cashFiscal: number; depositsCash: number; kp: number; kw: number }): number {
  return round2(params.openingBalance + params.cashFiscal + params.depositsCash + params.kp - params.kw);
}

export function cashDifference(expected: number, counted: number): number {
  return round2(counted - expected);
}

// Uzgodnienie z raportem fiskalnym dobowym (FAWAG BOX), opcjonalne — różnica
// między tym, co recepcja wpisała z wydruku, a sumą gotówka+karta z eFitness
// (bez niefiskalnych, patrz pkt 2 spec).
export function fiscalReconciliationDiff(fiscalDailyTotal: number, cashFiscal: number, cardEfitness: number): number {
  return round2(fiscalDailyTotal - (cashFiscal + cardEfitness));
}

// Numer RD — kolejny, ciągły, kontynuacja papierowej numeracji (np. RD 359),
// bez odniesienia do miesiąca. Sam numer: max(rd_number)+1 albo
// kasa_settings.first_rd_number, jeśli to pierwsze zamknięcie — liczy
// wywołujący (wymaga zapytania do bazy).
export function formatRdNumber(n: number): string {
  return `RD ${n}`;
}

// Saldo otwarcia 01.11, liczone wstecz od znanego punktu kontrolnego (pkt 10
// spec, test startowy): saldo_otwarcia = saldo_znane − Σ(ruchy gotówkowe od
// otwarcia do dnia znanego salda włącznie).
export function openingBalanceFromKnownPoint(knownBalance: number, cashMovementsSinceOpening: number): number {
  return round2(knownBalance - cashMovementsSinceOpening);
}
