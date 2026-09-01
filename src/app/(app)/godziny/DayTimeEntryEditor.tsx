"use client";

import { useState } from "react";
import { requiresDiscrepancyNote, EARLY_START_MARGIN_MIN, LATE_START_MARGIN_MIN, LATE_END_MARGIN_MIN } from "@/lib/time-entry-window";

export type TimeEntryRow = { id: string; actualStart: string; actualEnd: string; note: string; isRemote: boolean };

const INPUT = "w-full rounded-lg border-[1.5px] border-zinc-300 px-2 py-1.5 text-sm";

// Edytor wpisów godzin dla JEDNEGO dnia — jeden dzień może mieć kilka
// niezależnych przedziałów (podzielona zmiana z przerwą, np. 08:00–10:00 i
// 15:00–22:00), stąd lista wierszy zamiast jednego pola. Nowy, jeszcze
// niezapisany wiersz ma tymczasowe id "new-…" — po zapisaniu (addAction)
// dostaje prawdziwe id z bazy i od tej pory zapisy idą przez updateAction.
// Współdzielone przez /godziny (lista miesiąca), /admin/godziny (dowolny
// pracownik, bez okna edycji) i /grafik (wpis "przy okazji" swojej zmiany).
//
// `scheduled` — godziny zaplanowanej zmiany tego dnia (do porównania z
// wpisanymi) — gdy różnica przekracza DISCREPANCY_TOLERANCE_MIN (albo w
// ogóle nie ma tu zmiany w grafiku), notatka staje się WYMAGANA — to samo
// sprawdza serwer (godziny/actions.ts), tu tylko dla natychmiastowej
// informacji zamiast dowiadywania się dopiero po nieudanym zapisie.
// Zostaw `undefined` (panel admina), żeby CAŁKOWICIE wyłączyć tę walidację —
// wymóg notatki dotyczy pracownika tłumaczącego SIEBIE, nie admina
// poprawiającego cudzy wpis (dlatego to undefined, nie pusta tablica: pusta
// tablica oznacza realny "brak zmiany tego dnia", co SAMO w sobie wymaga
// wyjaśnienia).
export function DayTimeEntryEditor({
  dateKey,
  initialEntries,
  scheduled,
  allowUnscheduled = false,
  addAction,
  updateAction,
  deleteAction,
}: {
  dateKey: string;
  initialEntries: TimeEntryRow[];
  scheduled?: { start_time: string; end_time: string }[];
  // Zgoda tej osoby na pracę zdalną (SessionEmployee.allowRemoteWork) — dla
  // niej brak zmiany w grafiku tego dnia (scheduled: []) sam w sobie NIE
  // wymaga notatki, i pokazuje się checkbox "Praca zdalna" niżej (osobne
  // oznaczenie wpisu, niezależne od tego). Bez znaczenia, gdy
  // scheduled===undefined (panel admina) — tam checkbox pokazuje się zawsze,
  // admin poprawia/oznacza dowolny wpis.
  allowUnscheduled?: boolean;
  addAction: (date: string, actualStart: string, actualEnd: string, note: string, isRemote: boolean) => Promise<{ id: string }>;
  updateAction: (id: string, actualStart: string, actualEnd: string, note: string, isRemote: boolean) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<TimeEntryRow[]>(initialEntries);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState<Record<string, boolean>>({});

  // Checkbox "Praca zdalna" ma sens tylko tam, gdzie w ogóle może wystąpić
  // wpis bez zmiany w grafiku: panel admina (scheduled===undefined, admin
  // poprawia dowolny wpis) albo pracownik ze zgodą na pracę zdalną.
  const showRemoteCheckbox = scheduled === undefined || allowUnscheduled;

  function addBlankRow() {
    // Domyślnie zaznacz "zdalna", gdy tego dnia i tak nie ma żadnej zmiany w
    // grafiku — to prawie na pewno dokładnie ta sytuacja, mniej klikania.
    const defaultRemote = allowUnscheduled === true && (scheduled?.length ?? 0) === 0;
    setRows((prev) => [...prev, { id: `new-${Date.now()}`, actualStart: "", actualEnd: "", note: "", isRemote: defaultRemote }]);
  }

  function updateField(id: string, field: "actualStart" | "actualEnd" | "note", value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setSavedFlash((prev) => ({ ...prev, [id]: false }));
  }

  function toggleRemote(id: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isRemote: !r.isRemote } : r)));
    setSavedFlash((prev) => ({ ...prev, [id]: false }));
  }

  function noteRequiredFor(row: TimeEntryRow): boolean {
    if (scheduled === undefined) return false;
    if (!row.actualStart || !row.actualEnd) return false;
    return requiresDiscrepancyNote(row.actualStart, row.actualEnd, scheduled, allowUnscheduled);
  }

  async function handleSave(row: TimeEntryRow) {
    if (noteRequiredFor(row) && !row.note.trim()) {
      setError((prev) => ({
        ...prev,
        [row.id]: `Zaczynasz więcej niż ${EARLY_START_MARGIN_MIN} min przed zmianą albo ${LATE_START_MARGIN_MIN} min po jej rozpoczęciu, albo kończysz więcej niż ${LATE_END_MARGIN_MIN} min po jej zakończeniu — dodaj notatkę z wyjaśnieniem.`,
      }));
      return;
    }
    setPending(row.id);
    setError((prev) => ({ ...prev, [row.id]: "" }));
    try {
      if (row.id.startsWith("new-")) {
        const { id } = await addAction(dateKey, row.actualStart, row.actualEnd, row.note, row.isRemote);
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, id } : r)));
        setSavedFlash((prev) => ({ ...prev, [id]: true }));
      } else {
        await updateAction(row.id, row.actualStart, row.actualEnd, row.note, row.isRemote);
        setSavedFlash((prev) => ({ ...prev, [row.id]: true }));
      }
    } catch (err) {
      setError((prev) => ({ ...prev, [row.id]: err instanceof Error ? err.message : "Nie udało się zapisać." }));
    } finally {
      setPending(null);
    }
  }

  async function handleDelete(row: TimeEntryRow) {
    if (row.id.startsWith("new-")) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      return;
    }
    setPending(row.id);
    setError((prev) => ({ ...prev, [row.id]: "" }));
    try {
      await deleteAction(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      setError((prev) => ({ ...prev, [row.id]: err instanceof Error ? err.message : "Nie udało się usunąć." }));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const noteRequired = noteRequiredFor(row);
        return (
          // Każdy wpis we własnej, wyraźnie odgraniczonej "karcie" — luźno
          // rzucone pola bez żadnej ramki (jak było wcześniej) wyglądały
          // przypadkowo, zwłaszcza gdy kilka wierszy stało jeden pod drugim.
          <div
            key={row.id}
            className={`flex flex-col gap-2 rounded-xl border p-2.5 ${
              noteRequired && !row.note.trim() ? "border-red-300 bg-red-50/40" : "border-zinc-200 bg-zinc-50/60"
            }`}
          >
            {/* Od/Do, checkbox i przyciski w OSOBNYCH, jawnie ułożonych rzędach —
                jeden wspólny flex-wrap (jak było wcześniej) na wąskim ekranie
                zawijał się nieprzewidywalnie: checkbox lądował wciśnięty obok
                pól godzin, przyciski osobno pod spodem, całość wyglądała
                przypadkowo. */}
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-600">Od</label>
                <input
                  type="time"
                  value={row.actualStart}
                  onChange={(e) => updateField(row.id, "actualStart", e.target.value)}
                  className={`${INPUT} w-[110px]`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-600">Do</label>
                <input
                  type="time"
                  value={row.actualEnd}
                  onChange={(e) => updateField(row.id, "actualEnd", e.target.value)}
                  className={`${INPUT} w-[110px]`}
                />
              </div>
            </div>
            {showRemoteCheckbox && (
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
                <input type="checkbox" checked={row.isRemote} onChange={() => toggleRemote(row.id)} className="h-3.5 w-3.5" />
                🏠 Praca zdalna
              </label>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending === row.id}
                onClick={() => handleSave(row)}
                className="rounded-lg bg-brand-orange px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
              >
                {pending === row.id ? "Zapisywanie…" : "Zapisz"}
              </button>
              <button
                type="button"
                disabled={pending === row.id}
                onClick={() => handleDelete(row)}
                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Usuń
              </button>
              {savedFlash[row.id] && <span className="text-xs font-semibold text-emerald-600">✓ Zapisano</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label className={`text-xs font-semibold ${noteRequired && !row.note.trim() ? "text-red-600" : "text-zinc-600"}`}>
                Notatka {noteRequired ? "(wymagana — odbiega od grafiku)" : "(opcjonalnie)"}
              </label>
              <input
                value={row.note}
                onChange={(e) => updateField(row.id, "note", e.target.value)}
                className={`${INPUT} bg-white ${noteRequired && !row.note.trim() ? "border-red-400" : ""}`}
              />
            </div>
            {error[row.id] && <p className="text-xs font-semibold text-red-600">{error[row.id]}</p>}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addBlankRow}
        className="self-start rounded-lg border-[1.5px] border-dashed border-brand-orange/50 px-3 py-1.5 text-xs font-bold text-brand-orange hover:border-brand-orange hover:bg-brand-orange/5"
      >
        + Dodaj zmianę{rows.length > 0 ? " (np. po przerwie)" : ""}
      </button>
    </div>
  );
}
