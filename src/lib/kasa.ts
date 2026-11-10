// Logika modułu Kasa v1 (SPEC_kasa_v1.md) — funkcje czyste, bez dostępu do
// bazy, ten sam wzorzec co kids-classes.ts/marketing.ts/task-calendar.ts.
// Warstwa importu (eFitness) żyje w lib/kasa-import.ts, zapytania/akcje w
// app/(app)/kasa.

export type PaymentCategory = "cash" | "card" | "nonfiscal" | "online" | "ignore";

// Klasyfikacja operacji eFitness (pkt 2a spec, ostateczne reguły ustalone
// 10.11.2026 na prawdziwych danych) — w eFitness KAŻDA operacja kasowa
// dostaje numer KP (wpływ) albo KW (wypływ), także zwykła sprzedaż, więc
// numeryczny "Type" z dokumentacji API (0-8) NIE wystarcza. Kierunek =
// prefiks numeru dokumentu (zawsze zgodny ze znakiem kwoty), rodzaj =
// tekst kolumny "Typ" (9 możliwych wartości potwierdzonych przez Saszę).
export const KNOWN_TYPE_LABELS = [
  "Inne",
  "Uzupełnienie portfela",
  "Wpłata do kasy",
  "Wpłata raty",
  "Wypłata raty",
  "Wypłata z baru",
  "Wypłata z kasy",
  "Zakup vouchera",
  "Zakup w barze",
] as const;
export type KnownTypeLabel = (typeof KNOWN_TYPE_LABELS)[number];

export type TxClass = "sale" | "manual_kp" | "kw_expense" | "kw_wallet" | "kw_correction" | "unknown";
export const TX_CLASS_LABELS: Record<TxClass, string> = {
  sale: "Sprzedaż",
  manual_kp: "Ręczny KP (wpłata do kasy)",
  kw_expense: "KW — wydatek",
  kw_wallet: "KW — operacja portfela klienta",
  kw_correction: "KW — zwrot/korekta klienta",
  unknown: "Nierozpoznane — do przeglądu",
};

// fullNumber: pełny numer dokumentu z eFitness ("KP/2026/11/00080" albo
// "KW/2026/11/00004"). typeLabel: wartość kolumny "Typ" (eksport Excela)
// albo przetłumaczony numeryczny Type z przyszłego Data Lake API. Nieznany
// Typ albo brak prefiksu KW/KP -> "unknown", system NICZEGO NIE ZGADUJE
// (wymóg Saszy) — takie operacje trafiają do przeglądu, nie są cicho
// wliczane do żadnej sumy.
export function classifyTransaction(fullNumber: string, typeLabel: string): TxClass {
  const isKw = fullNumber.startsWith("KW/");
  const isKp = fullNumber.startsWith("KP/");
  if ((!isKw && !isKp) || !(KNOWN_TYPE_LABELS as readonly string[]).includes(typeLabel)) return "unknown";
  if (isKp) return typeLabel === "Wpłata do kasy" ? "manual_kp" : "sale";
  if (typeLabel === "Wypłata z kasy") return "kw_expense";
  if (typeLabel === "Uzupełnienie portfela") return "kw_wallet";
  return "kw_correction";
}

// Czy ta klasa potrzebuje wiersza w cash_doc_links (pozycja na liście
// KW/KP do uzupełnienia, pkt 3-4 spec) — zwykła sprzedaż nie, reszta tak.
export function needsDocLink(txClass: TxClass): boolean {
  return txClass !== "sale";
}

// Domyślny doc_type i status nadawane automatycznie przy imporcie (pkt 2a):
// - kw_expense: zawsze "Do uzupełnienia" (prawdziwy wydatek, wymaga dokumentu)
// - kw_wallet: "Operacja portfela klienta", ale ZAWSZE "todo"/do przeglądu —
//   parowanie z KP +X (netto 0 w kasie) opisane w specyfikacji jako hipoteza
//   NIE potwierdziło się wiarygodnie na danych testowych (ani dla KW/…/00002
//   "Pobranie na poczet opłaty wpisowej", ani jednoznacznie dla KW/…/00004
//   "Zakup wody" — najbliższa kwotowo sprzedaż +3,50 zł była 7h później),
//   więc nie zgadujemy automatycznego "complete".
// - kw_correction: "Zwrot/korekta klienta", domyślnie "complete" (nie
//   wymaga dokumentu), recepcja może dodać notatkę/skan i ręcznie przełączyć
//   na jedną z opcji z pkt 4 ("wydatek").
// - manual_kp: dokument opcjonalny (pkt 4), ale zostaje "todo" żeby był
//   widoczny na liście do ewentualnego uzupełnienia.
// - unknown: "todo" + brak doc_type, zawsze do ręcznego przeglądu.
export function defaultDocForClass(txClass: TxClass): { docType: DocType | null; status: DocStatus } {
  switch (txClass) {
    case "kw_expense":
      return { docType: null, status: "todo" };
    case "kw_wallet":
      return { docType: "wallet_operation", status: "todo" };
    case "kw_correction":
      return { docType: "client_correction", status: "complete" };
    case "manual_kp":
      return { docType: null, status: "todo" };
    case "unknown":
      return { docType: null, status: "todo" };
    case "sale":
      return { docType: null, status: "complete" };
  }
}

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

// "client_correction"/"wallet_operation" — dwie automatyczne kategorie dla
// KW innych niż "wydatek" (pkt 2a), nadawane przy imporcie, patrz
// defaultDocForClass. Pozostałe pięć to ręczny wybór recepcji przy
// uzupełnianiu dokumentu (pkt 4).
export type DocType = "receipt" | "ksef_invoice" | "foreign_invoice" | "awaiting_invoice" | "client_correction" | "wallet_operation" | "other";
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  receipt: "Paragon",
  ksef_invoice: "Faktura w KSeF",
  foreign_invoice: "Faktura spoza KSeF / bez polskiego NIP",
  awaiting_invoice: "Czekamy na fakturę",
  client_correction: "Zwrot / korekta klienta",
  wallet_operation: "Operacja portfela klienta",
  other: "Inne",
};
// Czy dana opcja wymaga skanu/zdjęcia (pkt 4 spec) — paragon i faktura
// spoza KSeF tak, reszta nie.
export const DOC_TYPE_REQUIRES_ATTACHMENT: Record<DocType, boolean> = {
  receipt: true,
  ksef_invoice: false,
  foreign_invoice: true,
  awaiting_invoice: false,
  client_correction: false,
  wallet_operation: false,
  other: true,
};
// Status wynikowy po wyborze opcji — "waiting" tylko dla "czekamy na
// fakturę", reszta od razu kompletna. (defaultDocForClass nadpisuje to przy
// imporcie dla "wallet_operation", które mimo braku wymaganego załącznika
// zostaje "todo" — do przeglądu, nie automatycznie kompletne.)
export function docStatusForType(docType: DocType): DocStatus {
  return docType === "awaiting_invoice" ? "waiting" : "complete";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type TxLike = { value: number; category: PaymentCategory; txClass: TxClass };

// "Gotówka fiskalna" / "Karta (eFitness)" — suma zwykłej sprzedaży
// (tx_class="sale") dla danej kategorii formy płatności (pkt 2a: KP + forma
// + Typ≠"Wpłata do kasy", co classifyTransaction już koduje jako "sale").
export function sumSales(transactions: TxLike[], category: PaymentCategory): number {
  return round2(transactions.filter((t) => t.txClass === "sale" && t.category === category).reduce((s, t) => s + t.value, 0));
}

// "Niefiskalne" (kaucje za butelki) — wszystko z formą Niefiskalna,
// niezależnie od tx_class (w praktyce zawsze "sale", ale pkt 2a nie zawęża).
export function sumNonfiscal(transactions: { value: number; category: PaymentCategory }[]): number {
  return round2(transactions.filter((t) => t.category === "nonfiscal").reduce((s, t) => s + t.value, 0));
}

// Czy ta transakcja FAKTYCZNIE pomniejszyła fizyczną gotówkę w kasie —
// kw_expense zawsze tak (prawdziwy wydatek, "Wypłata z kasy"). kw_wallet i
// kw_correction NIE, dopóki recepcja ręcznie nie potwierdzi wydatku,
// zmieniając typ dokumentu z automatycznie przypisanego
// (wallet_operation/client_correction, patrz defaultDocForClass) na jedną z
// "prawdziwych" opcji. Odkryte 10.11.2026 przy uzgadnianiu sald z Saszą:
// "Pobranie na poczet opłaty wpisowej" (Uzupełnienie portfela) miało netto 0
// w kasie, a "Zakup wody" — TEN SAM eFitness Typ! — fizycznie zmniejszyło
// gotówkę. Sam tx_class więc nie wystarcza, trzeba ręcznego potwierdzenia
// per transakcja (dokładnie to, co pkt 2a nazywa "z możliwością... zmiany
// na wydatek").
export function kwReducesCash(txClass: TxClass, docType: DocType | null): boolean {
  if (txClass === "kw_expense") return true;
  if (txClass === "kw_wallet" || txClass === "kw_correction") {
    return docType !== null && docType !== "wallet_operation" && docType !== "client_correction";
  }
  return false;
}

// "KW" do raportu i do stanu kasy (pkt 2a: "Wszystkie KW [czyli każdy
// WYPŁYW GOTÓWKI] trafiają do RK jako rozchód") — tylko forma Gotówka
// (karta/online nie powinny się tu zdarzać, ale gdyby się trafiły, nie mają
// zmniejszać stanu fizycznej gotówki) i tylko transakcje, które faktycznie
// zmniejszyły gotówkę (patrz kwReducesCash).
export function sumKw(transactions: { value: number; category: PaymentCategory; txClass: TxClass; docType: DocType | null }[]): number {
  return round2(
    transactions.filter((t) => kwReducesCash(t.txClass, t.docType) && t.category === "cash").reduce((s, t) => s + Math.abs(t.value), 0)
  );
}

// "KP ręczny" (pkt 2a: rzadkie, np. zasilenie kasy z banku) — tylko
// tx_class="manual_kp", forma Gotówka.
export function sumManualKp(transactions: { value: number; category: PaymentCategory; txClass: TxClass }[]): number {
  return round2(transactions.filter((t) => t.txClass === "manual_kp" && t.category === "cash").reduce((s, t) => s + t.value, 0));
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
