// Import transakcji eFitness — na razie wyłącznie przez eksport Excela
// (eFitness → Sprzedaż → Kasa → zakres dat → "Eksport do Excela"), bo dane
// logowania do Data Lake API jeszcze nie przyszły (patrz pkt 8.0 spec).
// `parseExcelExport` to CAŁA zależność od formatu pliku — reszta systemu
// (wyliczenia, liczenia, RD, KW, RK) korzysta tylko z `ParsedTransaction`,
// tego samego kształtu co przyszły DataLakeSource ma produkować, więc
// podmiana źródła później nie dotyka niczego poza tym plikiem.
//
// UWAGA (zweryfikowane na realnych plikach, 31.10+03-09.11.2026, 222
// wiersze): Data ma godzinę "RRRR-MM-DD GG:MM" (string, nie liczba Excela)
// — potrzebne do expectedCashBalance per liczenie (pkt 3), nie tylko do
// dnia. "Dokument sprzedaży" to wewnętrzny numeryczny ID sprzedaży (np.
// "20261109204040716"), nie numer raportu kasowego — pomijamy go w opisie.
//
// "Typ" (tekst z kolumny) NIE jest tłumaczony tu na numeryczny kod — w
// eFitness każda operacja kasowa (także zwykła sprzedaż) dostaje numer KP
// albo KW, więc numeryczny Type z dokumentacji API nie wystarcza do
// klasyfikacji. Ten plik tylko PARSUJE format Excela; klasyfikacja
// (classifyTransaction, wg prefiksu numeru dokumentu + tekstu "Typ") żyje w
// lib/kasa.ts, wspólna z przyszłym DataLakeSource.
import * as XLSX from "xlsx";

export type ParsedTransaction = {
  source: "excel" | "api";
  typeLabel: string;
  value: number;
  paymentFormName: string;
  userName: string;
  contractor: string;
  memberRef: string;
  description: string;
  number: string;
  fullNumber: string;
  transactionDate: string; // YYYY-MM-DD
  transactionAt: string | null; // ISO datetime, gdy w pliku jest godzina
};

export type ImportWarning = { row: number; message: string };
export type ParseResult = { transactions: ParsedTransaction[]; warnings: ImportWarning[] };

// Zwraca { date: "RRRR-MM-DD", at: ISO string | null }. Obsługuje string
// "RRRR-MM-DD GG:MM" (format realnego eksportu), DD.MM.RRRR/DD-MM-RRRR i
// liczbowe daty Excela (na wszelki wypadek, inny arkusz/wersja eksportu).
function excelDateToIso(value: unknown): { date: string; at: string | null } | null {
  if (value instanceof Date) return { date: value.toISOString().slice(0, 10), at: value.toISOString() };
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const date = `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    const at = `${date}T${String(parsed.H ?? 0).padStart(2, "0")}:${String(parsed.M ?? 0).padStart(2, "0")}:00`;
    return { date, at };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const isoWithTime = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (isoWithTime) return { date: `${isoWithTime[1]}-${isoWithTime[2]}-${isoWithTime[3]}`, at: `${trimmed.replace(" ", "T")}:00` };
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return { date: iso[0], at: null };
    const dmy = trimmed.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})/);
    if (dmy) return { date: `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`, at: null };
  }
  return null;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
    if (normalized === "") return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cell(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v === undefined || v === null) return "";
  const s = String(v).trim();
  return s === "-" ? "" : s;
}

export function parseExcelExport(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const transactions: ParsedTransaction[] = [];
  const warnings: ImportWarning[] = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // +1 nagłówek, +1 bo indeksy od 1
    const parsedDate = excelDateToIso(row["Data"]);
    if (!parsedDate) {
      warnings.push({ row: rowNum, message: `Nie rozpoznano daty: "${String(row["Data"])}"` });
      return;
    }
    const value = parseAmount(row["Wartość"]);
    if (value === null) {
      warnings.push({ row: rowNum, message: `Nie rozpoznano kwoty: "${String(row["Wartość"])}"` });
      return;
    }
    transactions.push({
      source: "excel",
      typeLabel: cell(row, "Typ"),
      value,
      paymentFormName: cell(row, "Forma płatności"),
      userName: cell(row, "Użytkownik"),
      contractor: cell(row, "Kontrahent"),
      memberRef: cell(row, "ID klubowicza"),
      description: cell(row, "Opis"),
      number: cell(row, "Numer dokumentu"),
      fullNumber: cell(row, "Numer dokumentu"),
      transactionDate: parsedDate.date,
      transactionAt: parsedDate.at,
    });
  });

  return { transactions, warnings };
}

// --- Data Lake API (krok 1 specyfikacji) ----------------------------------
//
// Zweryfikowane na żywych danych (ClubId 1977, 13.11.2026, GET /transactions/
// ?UpdatedFrom=2026-11-01, 391 wierszy; GET /paymentforms/, 12 form):
// - FullNumber DAJE numer KP/KW (np. "KW/2026/11/00003" — KW Rossmann
//   05.11, zgodny z papierem). Kierunek z prefiksu = zawsze zgodny ze
//   znakiem Value (0 niezgodności na próbce — tak jak już zakładał
//   classifyTransaction).
// - CreationDate/LastUpdateDate NIE MAJĄ godziny — tylko "RRRR-MM-DD", mimo
//   że spec liczyła na godzinę do podziału na okna 8:00/14:00. transactionAt
//   zostaje null dla źródła "api" (tak jak już jest obsłużone dla części
//   wierszy Excela) — obecny kod nie wymaga godziny (liczenia są per dzień,
//   nie per okno), więc to nie blokuje importu, tylko dokumentujemy różnicę.
// - KAŻDA operacja (także zwykła sprzedaż barowa, Type=2) dostaje numer KP
//   albo KW — potwierdza komentarz wyżej (parseExcelExport): numeryczny Type
//   NIE wystarcza do klasyfikacji, trzeba go przetłumaczyć na tekstowy "Typ"
//   znany classifyTransaction (patrz typeLabelFromDataLake).
// - SystemType w /paymentforms/ nie rozróżnia Gotówki od Niefiskalnej (obie
//   "cash") — mapowanie na kategorię idzie po Id/Name (payment_forms_map),
//   nie po SystemType; Value bywa z błędem zmiennoprzecinkowym
//   ("-63.259999999999998" = -63,26 zł) — zaokrąglamy do groszy.
// - Niefiskalna (kaucje) nie wystąpiła w oknie 1–13.11.2026 — brak próbki na
//   żywo, ale forma istnieje w /paymentforms/ (Id 17417), mapowanie zadziała
//   gdy się pojawi.

export type DataLakeTransaction = {
  Id: string;
  Value: string;
  Type: string;
  Evidence: string | null;
  PaymentFormId: string | null;
  UserId: string | null;
  MemberId: string | null;
  Contractor: string | null;
  Description: string | null;
  Number: string | null;
  FullNumber: string | null;
  CreationDate: string | null;
};

export type DataLakePaymentForm = { Id: string; Name: string; SystemType: string | null };

function dataLakeConfig() {
  const login = process.env.DATALAKE_LOGIN;
  const password = process.env.DATALAKE_PASSWORD;
  if (!login || !password) throw new Error("Brak DATALAKE_LOGIN/DATALAKE_PASSWORD w env.");
  return {
    baseUrl: process.env.DATALAKE_BASE_URL ?? "https://datalake2.efitness.com.pl",
    clubId: process.env.DATALAKE_CLUB_ID ?? "1977",
    authHeader: "Basic " + Buffer.from(`${login}:${password}`).toString("base64"),
  };
}

async function dataLakeGet<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const { baseUrl, clubId, authHeader } = dataLakeConfig();
  const url = new URL(path, baseUrl);
  url.searchParams.set("ClubId", clubId);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Authorization: authHeader } });
  if (!res.ok) throw new Error(`Data Lake ${path}: HTTP ${res.status}`);
  return (await res.json()) as T[];
}

export async function fetchDataLakePaymentForms(): Promise<DataLakePaymentForm[]> {
  return dataLakeGet<DataLakePaymentForm>("/paymentforms/", {});
}

// Numeryczny Type (0-8, dokumentacja Data Lake) + kierunek (Evidence
// KP/KW) -> tekstowa etykieta znana classifyTransaction. Tłumaczymy TYLKO
// kombinacje potwierdzone (pkt 2a spec: Type 3=CashDeskOut zawsze KW =
// "Wypłata z kasy", Type 4=CashDeskIn zawsze KP = "Wpłata do kasy"; Type
// 1=portfel KW = "Uzupełnienie portfela", potwierdzone przy uzgadnianiu sald
// 10.11.2026) albo jednoznacznie nazwane w spec (Type 6=prepaid =
// "Zakup vouchera"). Type 1=portfel KP (zawsze forma Online/Karta
// kredytowa na próbce, NIGDY Gotówka) to depozyt/kaucja wpłacona online —
// Sasza potwierdziła 13.11.2026: ani wpłata kaucji online, ani jej
// późniejsze pobranie (np. za nieodwołaną wizytę) nie dotykają fizycznej
// gotówki, więc dostaje "Uzupełnienie portfela" tak jak KW (isKp w
// classifyTransaction i tak zamienia to na "sale" — liczy się tylko do
// kategorii formy płatności, a Online/Karta nigdy nie wpada do
// cashFiscal). Każda inna, naprawdę nieprzewidziana kombinacja zostaje
// nieprzetłumaczona -> classifyTransaction zwróci "unknown" i trafi do
// przeglądu. System niczego nie zgaduje — lepiej "do przeglądu" niż źle
// zaklasyfikowane.
function typeLabelFromDataLake(type: string, evidence: string | null): string | null {
  const isKp = evidence === "KP";
  const isKw = evidence === "KW";
  switch (type) {
    case "0": // rata
      if (isKp) return "Wpłata raty";
      if (isKw) return "Wypłata raty";
      return null;
    case "1": // portfel
      return isKw || isKp ? "Uzupełnienie portfela" : null;
    case "2": // bar
      if (isKp) return "Zakup w barze";
      if (isKw) return "Wypłata z baru";
      return null;
    case "3": // CashDeskOut
      return isKw ? "Wypłata z kasy" : null;
    case "4": // CashDeskIn
      return isKp ? "Wpłata do kasy" : null;
    case "5": // inne
      return "Inne";
    case "6": // prepaid
      return isKp ? "Zakup vouchera" : null;
    default: // 7/8 nieopłacone — odfiltrowane wcześniej, nigdy nie powinny tu trafić
      return null;
  }
}

// updatedFrom/updatedTo: "RRRR-MM-DD", liczone po dacie ZMIANY rekordu (pkt
// 1 spec, max 6 mies.). Paginacja przez ResultsPage, dopóki strona wraca z
// pełnym limitem ResultsLimit — ostatnia niepełna strona kończy pętlę.
export async function fetchDataLakeTransactions(updatedFrom: string, updatedTo?: string): Promise<ParseResult> {
  const forms = await fetchDataLakePaymentForms();
  const formById = new Map(forms.map((f) => [f.Id, f.Name]));

  const limit = 10000;
  const baseParams: Record<string, string> = { UpdatedFrom: updatedFrom, ResultsLimit: String(limit) };
  if (updatedTo) baseParams.UpdatedTo = updatedTo;

  const all: DataLakeTransaction[] = [];
  let page = 1;
  while (true) {
    const batch = await dataLakeGet<DataLakeTransaction>("/transactions/", { ...baseParams, ResultsPage: String(page) });
    all.push(...batch);
    if (batch.length < limit) break;
    page += 1;
  }

  const transactions: ParsedTransaction[] = [];
  const warnings: ImportWarning[] = [];
  all.forEach((t, idx) => {
    if (t.Type === "7" || t.Type === "8") return; // nieopłacone — pomijamy całkowicie (pkt 1 spec)
    if (!t.CreationDate || !/^\d{4}-\d{2}-\d{2}/.test(t.CreationDate)) {
      warnings.push({ row: idx, message: `Transakcja ${t.Id ?? "?"}: brak rozpoznawalnej CreationDate ("${t.CreationDate}")` });
      return;
    }
    const typeLabel = typeLabelFromDataLake(t.Type, t.Evidence) ?? `Nieznany typ ${t.Type}/${t.Evidence ?? "?"}`;
    transactions.push({
      source: "api",
      typeLabel,
      value: Math.round(Number(t.Value) * 100) / 100,
      paymentFormName: (t.PaymentFormId && formById.get(t.PaymentFormId)) || "",
      userName: t.UserId ?? "", // mapowanie UserId -> nazwa pracownika (/users/) nie podłączone jeszcze
      contractor: t.Contractor ?? "",
      memberRef: t.MemberId ?? "",
      description: t.Description ?? "",
      number: t.Number ?? "",
      fullNumber: t.FullNumber ?? "",
      transactionDate: t.CreationDate.slice(0, 10),
      transactionAt: null, // CreationDate bez godziny — patrz komentarz wyżej
    });
  });
  return { transactions, warnings };
}
