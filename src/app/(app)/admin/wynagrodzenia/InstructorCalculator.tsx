"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

// Port logiki z wcześniejszego, samodzielnego prototypu (kalkulator_wynagrodzen.html).
// Dane trzymane lokalnie w przeglądarce (localStorage) — to narzędzie robocze
// dla admina, bez potrzeby osobnej tabeli w bazie na tym etapie.

const THRESH_KEY = "cs_wage_thresholds_v1";
const DELETED_KEY = "cs_wage_deleted_v1";
const CLASSES_KEY = "cs_wage_classes_v1";

type Tier = { from: number; rate: number };
type ClassEntry = { attendees: number; classType: string; dateStr: string; timeStr: string; dateSerial: number };

function lsGet<T>(key: string, def: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
}
function lsSet<T>(key: string, val: T) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // localStorage niedostępny (np. tryb prywatny) — po prostu nie zapisujemy.
  }
}

function parseExcelDateTime(serial: number): { dateStr: string; timeStr: string } {
  if (!serial || isNaN(serial)) return { dateStr: "", timeStr: "" };
  const days = Math.floor(serial);
  const timeFrac = serial - days;
  const totalMins = Math.round(timeFrac * 24 * 60);
  const hours = Math.floor(totalMins / 60) % 24;
  const mins = totalMins % 60;
  const d = new Date((days - 25569) * 86400 * 1000);
  return {
    dateStr: `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`,
    timeStr: `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`,
  };
}

function calcEarnings(classes: ClassEntry[], tiers: Tier[]) {
  if (!tiers?.length || !classes?.length) return { total: 0, breakdown: [] as { label: string; count: number; rate: number; earnings: number }[] };
  const sorted = [...tiers].sort((a, b) => a.from - b.from);
  let total = 0;
  const breakdown = sorted.map((tier, i) => {
    const nextFrom = sorted[i + 1]?.from;
    const label = nextFrom ? `${tier.from}–${nextFrom - 1} os.` : `${tier.from}+ os.`;
    const inTier = classes.filter((c) => c.attendees >= tier.from && (!nextFrom || c.attendees < nextFrom));
    const earn = inTier.length * tier.rate;
    total += earn;
    return { label, count: inTier.length, rate: tier.rate, earnings: earn };
  });
  return { total: Math.round(total * 100) / 100, breakdown };
}

function printInstructor(name: string, classes: ClassEntry[], tiers: Tier[]) {
  const sorted = [...classes].sort((a, b) => a.dateSerial - b.dateSerial);
  const { breakdown } = calcEarnings(classes, tiers);
  const minDate = sorted[0]?.dateStr || "";
  const maxDate = sorted[sorted.length - 1]?.dateStr || "";
  const classRows = sorted
    .map((c) => `<tr><td>${c.dateStr}</td><td>${c.classType}</td><td>${c.timeStr}</td><td style="text-align:center">${c.attendees}</td></tr>`)
    .join("");
  const active = breakdown.filter((b) => b.count > 0);
  const tierRows = active.length
    ? active.map((b, i) => `<tr><td>Próg ${i + 1}</td><td>${b.label}</td><td style="text-align:center">${b.count}</td></tr>`).join("")
    : '<tr><td colspan="3" style="color:#aaa">Brak progów</td></tr>';
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${name}</title>
<style>
body{font-family:Arial,sans-serif;padding:36px 44px;color:#111;max-width:760px;margin:0 auto}
.club{font-size:11px;color:#aaa;margin-bottom:18px;text-transform:uppercase;letter-spacing:.08em}
h1{font-size:22px;font-weight:700;margin-bottom:6px}
.meta{font-size:13px;color:#666;margin-bottom:30px;line-height:1.7}
h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#999;margin:28px 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{padding:8px 10px;text-align:left;background:#f5f5f3;border-bottom:2px solid #ddd;font-weight:700;font-size:12px}
td{padding:8px 10px;border-bottom:1px solid #eee}
.sum-table{max-width:400px}
.footer{font-size:11px;color:#bbb;margin-top:36px}
@media print{@page{margin:1.5cm}body{padding:0}}
</style></head><body>
<div class="club">City Sports · Wrocław</div>
<h1>${name}</h1>
<div class="meta">Okres: <strong>${minDate} – ${maxDate}</strong><br>Łącznie zajęć: <strong>${classes.length}</strong></div>
<h2>Zajęcia</h2>
<table><thead><tr><th>Data</th><th>Typ zajęć</th><th>Godzina</th><th>Liczba osób</th></tr></thead>
<tbody>${classRows}</tbody></table>
<h2>Podsumowanie – progi</h2>
<table class="sum-table"><thead><tr><th>Próg</th><th>Zakres (osoby)</th><th>Liczba zajęć</th></tr></thead>
<tbody>${tierRows}</tbody></table>
<div class="footer">Wygenerowano: ${new Date().toLocaleDateString("pl-PL")}</div>
</body></html>`);
  w.document.close();
  w.print();
}

function NumInput({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  onCommit: (val: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => setLocal(String(value)), [value]);
  return (
    <input
      type="number"
      value={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const n = parseFloat(local);
        if (!isNaN(n) && n >= 0) onCommit(n);
        else setLocal(String(value));
      }}
      className="w-full rounded-lg border-[1.5px] border-zinc-300 px-2 py-1.5 text-sm disabled:bg-zinc-100 disabled:text-zinc-400"
    />
  );
}

function TierEditor({
  name,
  classes,
  tiers,
  onUpdate,
  onDelete,
  onPrint,
}: {
  name: string;
  classes: ClassEntry[];
  tiers: Tier[];
  onUpdate: (tiers: Tier[]) => void;
  onDelete: (name: string) => void;
  onPrint: (name: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const withIdx = tiers.map((t, i) => ({ ...t, _i: i }));
  const sorted = [...withIdx].sort((a, b) => a.from - b.from);
  const { total: earn, breakdown } = calcEarnings(classes, tiers);
  const missingRate = tiers.some((t) => !t.rate);
  const totalCls = classes?.length || 0;
  const avgAtt = totalCls ? Math.round(classes.reduce((s, c) => s + c.attendees, 0) / totalCls) : 0;

  const addTier = () => {
    const maxFrom = sorted.length ? Math.max(...sorted.map((t) => t.from)) + 5 : 1;
    onUpdate([...tiers, { from: maxFrom, rate: 0 }]);
  };
  const commitTier = (idx: number, field: "from" | "rate", val: number) =>
    onUpdate(tiers.map((t, i) => (i === idx ? { ...t, [field]: val } : t)));
  const removeTier = (idx: number) => {
    if (tiers.length <= 1) return;
    onUpdate(tiers.filter((_, i) => i !== idx));
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-50"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-zinc-900">{name}</span>
          <span className="text-xs text-zinc-500">
            {totalCls} zaj. · śr. {avgAtt} os./zaj.
          </span>
          {missingRate && (
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
              uzupełnij stawkę
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-sm font-semibold text-zinc-900">
            {earn.toFixed(2)} PLN
          </span>
          <span className={`text-xs text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-zinc-100 bg-zinc-50 p-3">
          <div className="mb-2 grid grid-cols-[100px_110px_100px_70px_30px] gap-2 text-[11px] font-semibold uppercase text-zinc-400">
            <span>Od ilu osób</span>
            <span>Stawka (PLN)</span>
            <span>Zakres</span>
            <span>Zaj. w progu</span>
            <span></span>
          </div>
          {sorted.map((tier, di) => {
            const nextFrom = sorted[di + 1]?.from;
            const bd = breakdown[di];
            return (
              <div key={`${tier._i}-${tier.from}`} className="mb-2 grid grid-cols-[100px_110px_100px_70px_30px] items-center gap-2">
                <NumInput value={tier.from} disabled={di === 0} onCommit={(val) => commitTier(tier._i, "from", val)} />
                <NumInput value={tier.rate} onCommit={(val) => commitTier(tier._i, "rate", val)} />
                <span className="text-xs text-zinc-500">{nextFrom ? `${tier.from}–${nextFrom - 1} os.` : `${tier.from}+ os.`}</span>
                <span className="text-sm font-semibold">{bd?.count ?? 0}</span>
                <button
                  type="button"
                  disabled={tiers.length <= 1}
                  onClick={() => removeTier(tier._i)}
                  className="text-red-500 hover:underline disabled:text-zinc-300"
                >
                  ✕
                </button>
              </div>
            );
          })}
          <button type="button" onClick={addTier} className="mt-1 rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-white">
            + Dodaj próg
          </button>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-200 pt-3">
            <button type="button" onClick={() => onPrint(name)} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50">
              Drukuj zestawienie
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Usunąć ${name} z listy?\n\nUstawione stawki zostaną zapamiętane.`)) onDelete(name);
              }}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Usuń instruktora
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function InstructorCalculator() {
  const [thresholds, setThresholds] = useState<Record<string, Tier[]>>({});
  const [deletedArr, setDeletedArr] = useState<string[]>([]);
  const [instrClasses, setInstrClasses] = useState<Record<string, ClassEntry[]>>({});
  const [reportName, setReportName] = useState("");
  const [reportMeta, setReportMeta] = useState<{ loadedAt: string; totalRows: number; instructors: number } | null>(null);
  const [tab, setTab] = useState<"upload" | "thresholds" | "results">("upload");
  const [showDeleted, setShowDeleted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const deletedRef = useRef<string[]>([]);

  useEffect(() => {
    setThresholds(lsGet(THRESH_KEY, {}));
    const del = lsGet<string[]>(DELETED_KEY, []);
    setDeletedArr(del);
    deletedRef.current = del;
    setInstrClasses(lsGet(CLASSES_KEY, {}));
    setReportName(lsGet("cs_wage_report_name", ""));
    setReportMeta(lsGet("cs_wage_report_meta", null));
  }, []);

  const parseFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }) as unknown[][];
        if (!rows.length) {
          alert("Pusty plik.");
          return;
        }
        const header = rows[0].map(String);

        const instrIdx = header.indexOf("Instruktor");
        const attendIdx = header.indexOf("Obecnych");
        const typeIdx = header.indexOf("Typ zajęć");
        const dateIdx = header.indexOf("Data");
        if (instrIdx === -1) {
          alert("Brak kolumny 'Instruktor'.");
          return;
        }
        if (attendIdx === -1) {
          alert("Brak kolumny 'Obecnych'.");
          return;
        }

        const deleted = new Set(deletedRef.current);
        const data: Record<string, ClassEntry[]> = {};
        let totalRows = 0;

        for (let i = 1; i < rows.length; i++) {
          const name = String(rows[i][instrIdx] || "").trim();
          if (!name) continue;
          if (deleted.has(name)) continue;
          totalRows++;
          const attendees = parseInt(String(rows[i][attendIdx])) || 0;
          const classType = typeIdx >= 0 ? String(rows[i][typeIdx] || "").trim() : "";
          const rawDate = dateIdx >= 0 ? rows[i][dateIdx] : 0;
          let dateSerial = 0;
          if (typeof rawDate === "number") dateSerial = rawDate;
          else if (rawDate instanceof Date) dateSerial = rawDate.getTime() / 86400000 + 25569;
          const { dateStr, timeStr } = parseExcelDateTime(dateSerial);
          if (!data[name]) data[name] = [];
          data[name].push({ attendees, classType, dateStr, timeStr, dateSerial });
        }

        const meta = {
          loadedAt: new Date().toLocaleString("pl-PL"),
          totalRows,
          instructors: Object.keys(data).length,
        };

        lsSet(CLASSES_KEY, data);
        lsSet("cs_wage_report_name", file.name);
        lsSet("cs_wage_report_meta", meta);

        setInstrClasses(data);
        setReportName(file.name);
        setReportMeta(meta);

        setThresholds((prev) => {
          const upd = { ...prev };
          let changed = false;
          Object.keys(data).forEach((n) => {
            if (!upd[n]) {
              upd[n] = [{ from: 1, rate: 0 }];
              changed = true;
            }
          });
          if (changed) lsSet(THRESH_KEY, upd);
          return upd;
        });

        setTab("thresholds");
      } catch (err) {
        alert("Błąd podczas wczytywania pliku:\n" + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.onerror = () => alert("Nie udało się odczytać pliku.");
    reader.readAsArrayBuffer(file);
  }, []);

  const updateInstr = (name: string, tiers: Tier[]) => {
    const upd = { ...thresholds, [name]: tiers };
    setThresholds(upd);
    lsSet(THRESH_KEY, upd);
  };

  const deleteInstr = (name: string) => {
    const newArr = [...new Set([...deletedArr, name])];
    setDeletedArr(newArr);
    deletedRef.current = newArr;
    lsSet(DELETED_KEY, newArr);
    setInstrClasses((prev) => {
      const upd = { ...prev };
      delete upd[name];
      lsSet(CLASSES_KEY, upd);
      return upd;
    });
  };

  const restoreInstr = (name: string) => {
    const newArr = deletedArr.filter((n) => n !== name);
    setDeletedArr(newArr);
    deletedRef.current = newArr;
    lsSet(DELETED_KEY, newArr);
  };

  const handlePrint = (name: string) => printInstructor(name, instrClasses[name] || [], thresholds[name] || []);

  const allNames = Object.keys(instrClasses).sort();
  const totalSum = allNames.reduce((s, n) => s + calcEarnings(instrClasses[n] || [], thresholds[n] || []).total, 0);
  const hasData = allNames.length > 0;

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const sumRows: (string | number)[][] = [["Instruktor", "Liczba zajęć", "Próg", "Zakres", "Zajęcia w progu"]];
    allNames.forEach((name) => {
      const cls = instrClasses[name] || [];
      const { breakdown } = calcEarnings(cls, thresholds[name] || []);
      if (!breakdown.length) {
        sumRows.push([name, cls.length, "—", "—", cls.length]);
        return;
      }
      breakdown.forEach((b, i) => sumRows.push(i === 0 ? [name, cls.length, `Próg ${i + 1}`, b.label, b.count] : ["", "", `Próg ${i + 1}`, b.label, b.count]));
    });
    const ws = XLSX.utils.aoa_to_sheet(sumRows);
    ws["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, "Zestawienie");
    allNames.forEach((name) => {
      const cls = [...(instrClasses[name] || [])].sort((a, b) => a.dateSerial - b.dateSerial);
      const { breakdown } = calcEarnings(cls, thresholds[name] || []);
      const rows2: (string | number)[][] = [
        [`Instruktor: ${name}`],
        [`Liczba zajęć: ${cls.length}`],
        [],
        ["Data", "Typ zajęć", "Godzina", "Liczba osób"],
        ...cls.map((c) => [c.dateStr, c.classType, c.timeStr, c.attendees]),
        [],
        ["Próg", "Zakres (os.)", "Zajęcia w progu"],
        ...breakdown.filter((b) => b.count > 0).map((b, i) => [`Próg ${i + 1}`, b.label, b.count]),
      ];
      const iws = XLSX.utils.aoa_to_sheet(rows2);
      iws["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 10 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, iws, name.slice(0, 31));
    });
    XLSX.writeFile(wb, `Wynagrodzenia_${new Date().toLocaleDateString("pl-PL").replace(/\./g, "-")}.xlsx`);
  };

  const TAB_BTN = (id: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`px-3 py-2 text-sm font-semibold ${tab === id ? "border-b-2 border-brand-orange text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
        <span className="text-[11px] font-semibold uppercase text-zinc-400">Raport</span>
        {reportMeta ? (
          <span className="flex-1 truncate text-zinc-700">
            <strong>{reportName}</strong> — {reportMeta.instructors} instruktorów · {reportMeta.totalRows} zajęć · załadowano{" "}
            {reportMeta.loadedAt}
          </span>
        ) : (
          <span className="flex-1 text-zinc-400">Brak załadowanego raportu</span>
        )}
        <button
          type="button"
          onClick={() => {
            setTab("upload");
            setTimeout(() => fileRef.current?.click(), 100);
          }}
          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-zinc-100"
        >
          {hasData ? "Zmień raport" : "Załaduj raport"}
        </button>
      </div>

      <div className="mb-3 flex border-b border-zinc-200">
        {TAB_BTN("upload", "Wgraj raport")}
        {TAB_BTN("thresholds", "Progi")}
        {TAB_BTN("results", "Wyniki")}
      </div>

      {tab === "upload" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) parseFile(e.dataTransfer.files[0]);
          }}
          onClick={() => fileRef.current?.click()}
          className="cursor-pointer rounded-xl border-2 border-dashed border-zinc-300 bg-white p-10 text-center hover:border-zinc-400 hover:bg-zinc-50"
        >
          <div className="mb-2 text-sm font-semibold text-zinc-900">Wrzuć raport frekwencji (.xlsx)</div>
          <div className="text-xs text-zinc-500">lub kliknij, żeby wybrać plik — zastąpi poprzedni raport</div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) parseFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {tab === "thresholds" &&
        (!hasData && !deletedArr.length ? (
          <p className="py-8 text-center text-sm text-zinc-400">Załaduj raport frekwencji, żeby zacząć.</p>
        ) : (
          <>
            <p className="mb-3 rounded-lg border-l-4 border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-600">
              Stawka za dane zajęcia zależy od liczby osób, które na nie przyszły. Stawki zapisują się automatycznie i
              zostają przy kolejnych raportach.
            </p>
            <div className="flex flex-col gap-2">
              {allNames.map((name) => (
                <TierEditor
                  key={name}
                  name={name}
                  classes={instrClasses[name] || []}
                  tiers={thresholds[name] || [{ from: 1, rate: 0 }]}
                  onUpdate={(tiers) => updateInstr(name, tiers)}
                  onDelete={deleteInstr}
                  onPrint={handlePrint}
                />
              ))}
            </div>
            {deletedArr.length > 0 && (
              <div className="mt-4">
                <button type="button" onClick={() => setShowDeleted((s) => !s)} className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-semibold hover:bg-zinc-50">
                  {showDeleted ? "Ukryj" : "Pokaż"} usuniętych ({deletedArr.length})
                </button>
                {showDeleted &&
                  deletedArr.map((name) => (
                    <div key={name} className="mt-2 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm opacity-70">
                      <span className="text-zinc-600">{name} (ukryty)</span>
                      <button type="button" onClick={() => restoreInstr(name)} className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-semibold hover:bg-zinc-50">
                        Przywróć
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </>
        ))}

      {tab === "results" &&
        (!hasData ? (
          <p className="py-8 text-center text-sm text-zinc-400">Załaduj raport frekwencji, żeby zobaczyć wyniki.</p>
        ) : (
          <>
            <button type="button" onClick={exportExcel} className="mb-3 rounded-xl bg-brand-orange px-4 py-2 text-sm font-bold text-white hover:bg-brand-orange-dark">
              Pobierz Excel (wszyscy)
            </button>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Instruktor</th>
                    <th className="px-3 py-2">Zajęcia</th>
                    <th className="px-3 py-2">Śr. osób</th>
                    <th className="px-3 py-2">Progi</th>
                    <th className="px-3 py-2 text-right">Wynagrodzenie</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {allNames.map((name) => {
                    const cls = instrClasses[name] || [];
                    const avgAtt = cls.length ? Math.round(cls.reduce((s, c) => s + c.attendees, 0) / cls.length) : 0;
                    const { total: earn, breakdown } = calcEarnings(cls, thresholds[name] || []);
                    return (
                      <tr key={name}>
                        <td className="px-3 py-2 font-semibold text-zinc-900">{name}</td>
                        <td className="px-3 py-2">{cls.length}</td>
                        <td className="px-3 py-2">{avgAtt}</td>
                        <td className="px-3 py-2">
                          {breakdown.length
                            ? breakdown.map((b, i) => (
                                <span key={i} className="mr-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[11px]">
                                  P{i + 1}: {b.count} zaj.
                                </span>
                              ))
                            : <span className="text-xs text-zinc-400">brak progów</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{earn.toFixed(2)} PLN</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => handlePrint(name)} className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-semibold hover:bg-zinc-50">
                            Drukuj
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold">
                    <td colSpan={4} className="px-3 py-2 text-right text-xs text-zinc-500">
                      Suma łączna
                    </td>
                    <td className="px-3 py-2 text-right">{totalSum.toFixed(2)} PLN</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ))}
    </div>
  );
}
