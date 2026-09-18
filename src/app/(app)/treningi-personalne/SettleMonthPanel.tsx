"use client";

import { useState } from "react";
import { friendlyActionError } from "@/lib/client-error";
import { formatHm } from "@/lib/time";

export type SettleSession = {
  id: string;
  date: string;
  startTime: string;
  clientCount: number;
  amount: number;
  isSettled: boolean;
};

// Rozwijana lista treningów danego trenera w danym miesiącu, z możliwością
// oznaczenia płatności za CAŁOŚĆ jednym kliknięciem albo za wybraną CZĘŚĆ
// (zaznaczone checkboxami) — zamiast musieć wchodzić w grafik/historię i
// przełączać każdy trening z osobna.
export function SettleMonthPanel({
  sessions,
  trainerId,
  startDate,
  endDate,
  settleSessionsAction,
  settleAllAction,
}: {
  sessions: SettleSession[];
  trainerId: string;
  startDate: string;
  endDate: string;
  settleSessionsAction: (formData: FormData) => Promise<void>;
  settleAllAction: (formData: FormData) => Promise<void>;
}) {
  const unsettled = sessions.filter((s) => !s.isSettled);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<"selected" | "all" | null>(null);
  const [error, setError] = useState("");

  if (sessions.length === 0) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSettleSelected() {
    setPending("selected");
    setError("");
    try {
      const fd = new FormData();
      selected.forEach((id) => fd.append("id", id));
      await settleSessionsAction(fd);
      setSelected(new Set());
    } catch (err) {
      setError(friendlyActionError(err));
    } finally {
      setPending(null);
    }
  }

  async function handleSettleAll() {
    if (!window.confirm(`Oznaczyć WSZYSTKIE ${unsettled.length} nierozliczonych treningów w tym miesiącu jako opłacone?`)) return;
    setPending("all");
    setError("");
    try {
      const fd = new FormData();
      fd.set("trainer_employee_id", trainerId);
      fd.set("start_date", startDate);
      fd.set("end_date", endDate);
      await settleAllAction(fd);
    } catch (err) {
      setError(friendlyActionError(err));
    } finally {
      setPending(null);
    }
  }

  const selectedAmount = sessions.filter((s) => selected.has(s.id)).reduce((sum, s) => sum + s.amount, 0);
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  return (
    <div className="mt-2 border-t border-zinc-100 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-brand-orange hover:underline">
          {open ? "Ukryj treningi ▾" : "Pokaż treningi i oznacz płatność ▸"}
        </button>
        {unsettled.length > 0 && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={handleSettleAll}
            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending === "all" ? "Zapisywanie…" : `Oznacz cały miesiąc jako rozliczone (${unsettled.length})`}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {sorted.map((s) => {
            const dateLabel = new Date(s.date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
            return (
              <label
                key={s.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                  s.isSettled ? "bg-emerald-50 text-emerald-700" : "bg-zinc-50 text-zinc-700"
                }`}
              >
                <span className="flex items-center gap-2">
                  {!s.isSettled ? (
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="h-3.5 w-3.5" />
                  ) : (
                    <span>✓</span>
                  )}
                  {dateLabel} · {formatHm(s.startTime)} · {s.clientCount} {s.clientCount === 1 ? "osoba" : "osób"}
                </span>
                <span className="font-semibold">{s.amount.toFixed(2)} PLN</span>
              </label>
            );
          })}
          {selected.size > 0 && (
            <div className="mt-1">
              <button
                type="button"
                disabled={pending !== null}
                onClick={handleSettleSelected}
                className="rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
              >
                {pending === "selected"
                  ? "Zapisywanie…"
                  : `Oznacz zaznaczone jako rozliczone (${selected.size} · ${selectedAmount.toFixed(2)} PLN)`}
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
