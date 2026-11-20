import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getDayTransactions, computeDayTotals, getDayCounts, getDayDocLinks, type DocLinkRow } from "@/app/(app)/kasa/data";
import { DOC_TYPE_LABELS, DOC_STATUS_LABELS, type DocType } from "@/lib/kasa";
import { monthLabel } from "@/lib/schedule-month";

// Raport kasowy (RK) za miesiąc i paczka ZIP (pkt 6 — ekran "Miesiąc").
// RK składa się z dni kasowych (cash_days) danego miesiąca: otwarcie, sprzedaż
// gotówką, KP, KW, oczekiwane i policzone zamknięcie, różnica. Paczka ZIP
// zawiera RK (PDF) + skany KW/KP z miesiąca + listę dokumentów (CSV).

export type MonthDay = {
  date: string;
  rdNumber: number | null;
  status: "open" | "closed";
  openingBalance: number;
  cashFiscal: number;
  kp: number;
  kw: number;
  expectedClose: number | null;
  countedClose: number | null;
  differenceClose: number | null;
};

export type MonthDoc = DocLinkRow & { date: string };

export type MonthReport = {
  year: number;
  month: number;
  days: MonthDay[];
  docs: MonthDoc[];
};

export function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(year, month, 0).getDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last)}` };
}

export async function loadMonthReport(year: number, month: number): Promise<MonthReport> {
  const { from, to } = monthRange(year, month);
  const supabase = createServerSupabaseClient();
  const { data: dayRows } = await supabase
    .from("cash_days")
    .select("id, date, rd_number, opening_balance, status")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  const days: MonthDay[] = [];
  const docs: MonthDoc[] = [];

  for (const row of dayRows ?? []) {
    const [transactions, counts, docLinks] = await Promise.all([
      getDayTransactions(row.date),
      getDayCounts(row.id),
      getDayDocLinks(row.date),
    ]);
    const totals = computeDayTotals(transactions);
    const close = counts.find((c) => c.slot === "close") ?? null;
    days.push({
      date: row.date,
      rdNumber: row.rd_number,
      status: row.status,
      openingBalance: row.opening_balance,
      cashFiscal: totals.cashFiscal,
      kp: totals.manualKp,
      kw: totals.kw,
      expectedClose: close?.expected ?? null,
      countedClose: close?.counted ?? null,
      differenceClose: close?.difference ?? null,
    });
    for (const d of docLinks) docs.push({ ...d, date: row.date });
  }

  return { year, month, days, docs };
}

// Ścieżki skanów KW/KP z miesiąca (kind='kw_doc') razem z numerem dokumentu,
// do wrzucenia do ZIP. Pobieramy bytes z prywatnego bucketa przez service role.
export async function loadMonthAttachments(docIds: string[]): Promise<{ linkId: string; name: string; path: string }[]> {
  if (docIds.length === 0) return [];
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("cash_attachments")
    .select("link_id, storage_path, original_name")
    .in("link_id", docIds)
    .eq("kind", "kw_doc")
    .order("uploaded_at", { ascending: true });
  return (data ?? []).map((r) => ({ linkId: r.link_id as string, name: r.original_name as string, path: r.storage_path as string }));
}

const money = (n: number) => n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DAY_COLUMNS = [
  { key: "date", label: "Data", width: 70 },
  { key: "rd", label: "RD", width: 48 },
  { key: "opening", label: "Saldo otwarcia", width: 92 },
  { key: "cash", label: "Sprzedaż gotówką", width: 92 },
  { key: "kp", label: "KP", width: 70 },
  { key: "kw", label: "KW", width: 70 },
  { key: "expected", label: "Oczekiwano (zamknięcie)", width: 110 },
  { key: "counted", label: "Policzono", width: 92 },
  { key: "diff", label: "Różnica", width: 80 },
] as const;

function cell(day: MonthDay, key: (typeof DAY_COLUMNS)[number]["key"]): string {
  switch (key) {
    case "date":
      return day.date;
    case "rd":
      return day.rdNumber ? String(day.rdNumber) : "—";
    case "opening":
      return money(day.openingBalance);
    case "cash":
      return money(day.cashFiscal);
    case "kp":
      return money(day.kp);
    case "kw":
      return money(day.kw);
    case "expected":
      return day.expectedClose === null ? "—" : money(day.expectedClose);
    case "counted":
      return day.countedClose === null ? "—" : money(day.countedClose);
    case "diff":
      return day.differenceClose === null ? "—" : (day.differenceClose > 0 ? "+" : "") + money(day.differenceClose);
  }
}

// RK w PDF (A4 poziomo). Geist (OFL) wbudowany w public/fonts, bo standardowe
// fonty PDF nie mają polskich ąęłńóśźż.
export async function buildRkPdf(report: MonthReport, rkNumber: number | null, fontBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font: PDFFont = await doc.embedFont(fontBytes, { subset: true });
  // Jeden font (Geist) do wszystkiego: StandardFonts nie obsługują polskich liter.
  const bold = font;

  const PAGE_W = 841.89;
  const PAGE_H = 595.28;
  const M = 36;
  const ROW_H = 16;
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.45, 0.45, 0.5);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const header = (p: PDFPage) => {
    const title = `Raport kasowy (RK) — ${monthLabel(report.month)} ${report.year}`;
    p.drawText(title, { x: M, y: PAGE_H - M, size: 15, font: bold, color: ink });
    const sub = `Numer RK: ${rkNumber ?? "—"} · dni w raporcie: ${report.days.length}`;
    p.drawText(sub, { x: M, y: PAGE_H - M - 16, size: 9, font, color: muted });
    let x = M;
    for (const col of DAY_COLUMNS) {
      p.drawText(col.label, { x, y: PAGE_H - M - 38, size: 8, font: bold, color: muted, maxWidth: col.width - 4 });
      x += col.width;
    }
    p.drawLine({ start: { x: M, y: PAGE_H - M - 44 }, end: { x: PAGE_W - M, y: PAGE_H - M - 44 }, thickness: 0.5, color: muted });
    return PAGE_H - M - 56;
  };

  y = header(page);

  for (const day of report.days) {
    if (y < M + 60) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = header(page);
    }
    let x = M;
    for (const col of DAY_COLUMNS) {
      page.drawText(cell(day, col.key), { x, y, size: 8.5, font, color: ink, maxWidth: col.width - 6 });
      x += col.width;
    }
    y -= ROW_H;
  }

  // Suma wierszy: sprzedaż gotówką, KP, KW, różnica tylko tam, gdzie liczona.
  const sum = (f: (d: MonthDay) => number | null) => report.days.reduce((acc, d) => acc + (f(d) ?? 0), 0);
  const first = report.days[0];
  const last = [...report.days].reverse().find((d) => d.countedClose !== null) ?? null;
  const totals: Record<string, string> = {
    date: "RAZEM",
    rd: "",
    opening: first ? money(first.openingBalance) : "—",
    cash: money(sum((d) => d.cashFiscal)),
    kp: money(sum((d) => d.kp)),
    kw: money(sum((d) => d.kw)),
    expected: "",
    counted: last?.countedClose != null ? money(last.countedClose) : "—",
    diff: money(sum((d) => d.differenceClose)),
  };
  if (y < M + 60) {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = header(page);
  }
  page.drawLine({ start: { x: M, y: y + 10 }, end: { x: PAGE_W - M, y: y + 10 }, thickness: 0.5, color: muted });
  let tx = M;
  for (const col of DAY_COLUMNS) {
    page.drawText(totals[col.key] ?? "", { x: tx, y, size: 8.5, font: bold, color: ink, maxWidth: col.width - 6 });
    tx += col.width;
  }
  y -= ROW_H;

  const open = report.days.filter((d) => d.status !== "closed").length;
  const footer = `Wygenerowano ${new Date().toLocaleString("pl-PL")} · dni niezamkniętych: ${open}`;
  page.drawText(footer, { x: M, y: M - 6, size: 7.5, font, color: muted });

  return doc.save();
}

export function docsCsv(docs: MonthDoc[]): string {
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ["data", "numer", "kontrahent", "opis", "wartosc", "typ", "status", "notatka"];
  const lines = docs.map((d) =>
    [
      d.date,
      d.full_number,
      d.contractor ?? "",
      d.description ?? "",
      d.value.toFixed(2),
      DOC_TYPE_LABELS[(d.doc_type as DocType) ?? "other"] ?? "",
      DOC_STATUS_LABELS[d.status] ?? "",
      d.note ?? "",
    ].map((v) => esc(String(v))).join(";")
  );
  return "﻿" + [header.join(";"), ...lines].join("\n");
}

// Paczka ZIP: RK (PDF) + skany KW/KP + lista dokumentów (CSV).
export async function buildMonthZip(report: MonthReport, rkNumber: number | null, fontBytes: Uint8Array): Promise<Uint8Array> {
  const zip = new JSZip();
  const tag = `${report.year}-${String(report.month).padStart(2, "0")}`;
  zip.file(`RK_${tag}.pdf`, await buildRkPdf(report, rkNumber, fontBytes));
  zip.file(`dokumenty_KW_KP_${tag}.csv`, docsCsv(report.docs));

  const supabase = createServerSupabaseClient();
  const attachments = await loadMonthAttachments(report.docs.map((d) => d.id));
  for (const a of attachments) {
    const { data, error } = await supabase.storage.from("kasa-dokumenty").download(a.path);
    if (error || !data) continue;
    const safe = a.name.replace(/[^\w.-]+/g, "_");
    zip.file(`skany/${a.linkId}_${safe}`, await data.arrayBuffer());
  }

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
