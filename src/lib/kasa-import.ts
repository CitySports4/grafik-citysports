// Import transakcji eFitness — na razie wyłącznie przez eksport Excela
// (eFitness → Sprzedaż → Kasa → zakres dat → "Eksport do Excela"), bo dane
// logowania do Data Lake API jeszcze nie przyszły (patrz pkt 8.0 spec).
// `parseExcelExport` to CAŁA zależność od formatu pliku — reszta systemu
// (wyliczenia, liczenia, RD, KW, RK) korzysta tylko z `ParsedTransaction`,
// tego samego kształtu co przyszły DataLakeSource ma produkować, więc
// podmiana źródła później nie dotyka niczego poza tym plikiem.
//
// UWAGA: kolumny i mapowanie "Typ" (TYPE_LABEL_MAP) są oparte na opisie ze
// specyfikacji, NIE na realnym pliku — jeszcze nie dostaliśmy prawdziwego
// eksportu Excela (dostaliśmy tylko PDF-y gotowych "Raportów kasowych",
// które mają inne kolumny: brak Kontrahenta/Typu/Użytkownika/Salda per
// wiersz). Do zweryfikowania i poprawienia po pierwszym realnym imporcie —
// patrz warnings poniżej, zbierają właśnie takie niespodzianki.
import * as XLSX from "xlsx";

export type ParsedTransaction = {
  source: "excel";
  type: number;
  value: number;
  paymentFormName: string;
  userName: string;
  contractor: string;
  memberRef: string;
  description: string;
  number: string;
  fullNumber: string;
  transactionDate: string; // YYYY-MM-DD
};

export type ImportWarning = { row: number; message: string };
export type ParseResult = { transactions: ParsedTransaction[]; warnings: ImportWarning[] };

// Potwierdzone w specyfikacji (pkt 8.0): 0 rata, 1 portfel, 2 bar, 3 KW, 4 KP.
// Etykiety dla 5 (inne)/6 (prepaid) nieznane — nierozpoznany tekst trafia do
// "inne" (5) z warningiem, żeby dało się dopisać brakującą etykietę.
const TYPE_LABEL_MAP: Record<string, number> = {
  "Wpłata raty": 0,
  "Uzupełnienie portfela": 1,
  "Zakup w barze": 2,
  "Wypłata z kasy": 3,
  "Wpłata do kasy": 4,
};

function excelDateToIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (typeof value === "string") {
    const dmy = value.trim().match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[0];
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
    const date = excelDateToIso(row["Data"]);
    if (!date) {
      warnings.push({ row: rowNum, message: `Nie rozpoznano daty: "${String(row["Data"])}"` });
      return;
    }
    const value = parseAmount(row["Wartość"]);
    if (value === null) {
      warnings.push({ row: rowNum, message: `Nie rozpoznano kwoty: "${String(row["Wartość"])}"` });
      return;
    }
    const typLabel = cell(row, "Typ");
    let type = TYPE_LABEL_MAP[typLabel];
    if (type === undefined) {
      type = 5;
      warnings.push({ row: rowNum, message: `Nierozpoznany "Typ": "${typLabel}" — przypisano jako "inne"` });
    }

    const opis = cell(row, "Opis");
    const dokumentSprzedazy = cell(row, "Dokument sprzedaży");
    const description = [dokumentSprzedazy, opis].filter(Boolean).join(" — ");

    transactions.push({
      source: "excel",
      type,
      value,
      paymentFormName: cell(row, "Forma płatności"),
      userName: cell(row, "Użytkownik"),
      contractor: cell(row, "Kontrahent"),
      memberRef: cell(row, "ID klubowicza"),
      description,
      number: cell(row, "Numer dokumentu"),
      fullNumber: cell(row, "Numer dokumentu"),
      transactionDate: date,
    });
  });

  return { transactions, warnings };
}
