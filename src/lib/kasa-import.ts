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
  source: "excel";
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
