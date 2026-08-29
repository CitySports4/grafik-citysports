"use client";

import { useState } from "react";

export type TimeEntryRow = { id: string; actualStart: string; actualEnd: string; note: string };

const INPUT = "w-full rounded-lg border-[1.5px] border-zinc-300 px-2 py-1.5 text-sm";

// Edytor wpisów godzin dla JEDNEGO dnia — jeden dzień może mieć kilka
// niezależnych przedziałów (podzielona zmiana z przerwą, np. 08:00–10:00 i
// 15:00–22:00), stąd lista wierszy zamiast jednego pola. Nowy, jeszcze
// niezapisany wiersz ma tymczasowe id "new-…" — po zapisaniu (addAction)
// dostaje prawdziwe id z bazy i od tej pory zapisy idą przez updateAction.
// Współdzielone przez /godziny (lista miesiąca), /admin/godziny (dowolny
// pracownik, bez okna edycji) i /grafik (wpis "przy okazji" swojej zmiany).
export function DayTimeEntryEditor({
  dateKey,
  initialEntries,
  addAction,
  updateAction,
  deleteAction,
}: {
  dateKey: string;
  initialEntries: TimeEntryRow[];
  addAction: (date: string, actualStart: string, actualEnd: string, note: string) => Promise<{ id: string }>;
  updateAction: (id: string, actualStart: string, actualEnd: string, note: string) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<TimeEntryRow[]>(initialEntries);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState<Record<string, boolean>>({});

  function addBlankRow() {
    setRows((prev) => [...prev, { id: `new-${Date.now()}`, actualStart: "", actualEnd: "", note: "" }]);
  }

  function updateField(id: string, field: "actualStart" | "actualEnd" | "note", value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setSavedFlash((prev) => ({ ...prev, [id]: false }));
  }

  async function handleSave(row: TimeEntryRow) {
    setPending(row.id);
    setError((prev) => ({ ...prev, [row.id]: "" }));
    try {
      if (row.id.startsWith("new-")) {
        const { id } = await addAction(dateKey, row.actualStart, row.actualEnd, row.note);
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, id } : r)));
        setSavedFlash((prev) => ({ ...prev, [id]: true }));
      } else {
        await updateAction(row.id, row.actualStart, row.actualEnd, row.note);
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
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-end gap-2">
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
          <div className="flex min-w-[120px] flex-1 flex-col gap-1">
            <label className="text-xs font-semibold text-zinc-600">Notatka (opcjonalnie)</label>
            <input value={row.note} onChange={(e) => updateField(row.id, "note", e.target.value)} className={INPUT} />
          </div>
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
            className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Usuń
          </button>
          {savedFlash[row.id] && <span className="text-xs font-semibold text-emerald-600">✓ Zapisano</span>}
          {error[row.id] && <span className="text-xs font-semibold text-red-600">{error[row.id]}</span>}
        </div>
      ))}
      <button type="button" onClick={addBlankRow} className="self-start text-xs font-semibold text-brand-orange hover:underline">
        + Dodaj zmianę{rows.length > 0 ? " (np. po przerwie)" : ""}
      </button>
    </div>
  );
}
