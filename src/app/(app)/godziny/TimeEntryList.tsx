"use client";

import { useState } from "react";
import { saveTimeEntry } from "./actions";

type DayEntry = {
  dateKey: string;
  label: string;
  scheduled: string;
  entry: { actualStart: string; actualEnd: string; note: string };
};

const INPUT = "w-full rounded-lg border-[1.5px] border-zinc-300 px-2 py-1.5 text-sm";

export function TimeEntryList({ days }: { days: DayEntry[] }) {
  const [state, setState] = useState<Record<string, { actualStart: string; actualEnd: string; note: string }>>(
    Object.fromEntries(days.map((d) => [d.dateKey, d.entry]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string>>({});

  function updateField(dateKey: string, field: "actualStart" | "actualEnd" | "note", value: string) {
    setState((prev) => ({ ...prev, [dateKey]: { ...prev[dateKey], [field]: value } }));
    setSavedAt((prev) => ({ ...prev, [dateKey]: false }));
  }

  async function handleSave(dateKey: string) {
    setSaving(dateKey);
    setError((prev) => ({ ...prev, [dateKey]: "" }));
    try {
      const { actualStart, actualEnd, note } = state[dateKey];
      await saveTimeEntry(dateKey, actualStart, actualEnd, note);
      setSavedAt((prev) => ({ ...prev, [dateKey]: true }));
    } catch (err) {
      setError((prev) => ({ ...prev, [dateKey]: err instanceof Error ? err.message : "Nie udało się zapisać." }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col divide-y divide-zinc-100">
      {days.map((day) => {
        const row = state[day.dateKey];
        return (
          <div key={day.dateKey} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-end sm:gap-3">
            <div className="min-w-[120px]">
              <div className="text-sm font-semibold capitalize text-zinc-900">{day.label}</div>
              {day.scheduled && <div className="text-xs text-zinc-500">Grafik: {day.scheduled}</div>}
            </div>
            <div className="flex flex-1 flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-600">Od</label>
                <input
                  type="time"
                  value={row.actualStart}
                  onChange={(e) => updateField(day.dateKey, "actualStart", e.target.value)}
                  className={`${INPUT} w-[110px]`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-600">Do</label>
                <input
                  type="time"
                  value={row.actualEnd}
                  onChange={(e) => updateField(day.dateKey, "actualEnd", e.target.value)}
                  className={`${INPUT} w-[110px]`}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-600">Notatka (opcjonalnie)</label>
                <input
                  value={row.note}
                  onChange={(e) => updateField(day.dateKey, "note", e.target.value)}
                  className={INPUT}
                />
              </div>
              <button
                type="button"
                disabled={saving === day.dateKey}
                onClick={() => handleSave(day.dateKey)}
                className="rounded-lg bg-brand-orange px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
              >
                {saving === day.dateKey ? "Zapisywanie…" : "Zapisz"}
              </button>
              {savedAt[day.dateKey] && <span className="text-xs font-semibold text-emerald-600">✓ Zapisano</span>}
              {error[day.dateKey] && <span className="text-xs font-semibold text-red-600">{error[day.dateKey]}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
