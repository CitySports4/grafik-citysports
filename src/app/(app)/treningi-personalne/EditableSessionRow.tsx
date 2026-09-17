"use client";

import { useState } from "react";
import { PT_DURATIONS_MIN } from "@/lib/personal-training";
import { SettleToggle } from "./SettleToggle";

const INPUT = "w-full rounded-lg border-[1.5px] border-zinc-300 px-2 py-1.5 text-sm";

export type EditableSession = {
  id: string;
  seriesId: string | null;
  date: string;
  startTime: string;
  durationMinutes: number;
  clientCount: number;
  clientName: string;
  isSettled: boolean;
  settledNote: string | null;
  amount: number;
};

// Wiersz WŁASNEGO treningu trenera — od razu edytowalny (jak w
// DayTimeEntryEditor), bez osobnego trybu "podgląd"/"edycja": zmień pole,
// kliknij Zapisz. Usuń dotyczy tylko tego jednego wystąpienia; jeśli
// trening jest częścią cyklicznej serii, obok pojawia się dodatkowo "Usuń
// całą serię".
export function EditableSessionRow({
  session,
  trainerEmployeeId,
  updateAction,
  cancelAction,
  cancelSeriesAction,
  toggleAction,
}: {
  session: EditableSession;
  // Id trenera, którego dotyczy trening — admin edytuje cudze treningi, więc
  // serwer musi wiedzieć, w czyim imieniu działa (patrz resolveTrainerActor).
  trainerEmployeeId: string;
  updateAction: (formData: FormData) => Promise<void>;
  cancelAction: (formData: FormData) => Promise<void>;
  cancelSeriesAction: (formData: FormData) => Promise<void>;
  // Podane tylko dla recepcji/admina — plain trener nie może sam sobie
  // oznaczać rozliczenia (patrz canPreviewPersonalTraining), widzi wtedy
  // tylko statyczną plakietkę niżej.
  toggleAction?: (formData: FormData) => Promise<void>;
}) {
  const [date, setDate] = useState(session.date);
  const [startTime, setStartTime] = useState(session.startTime);
  const [durationMinutes, setDurationMinutes] = useState(session.durationMinutes);
  const [clientCount, setClientCount] = useState(session.clientCount);
  const [clientName, setClientName] = useState(session.clientName);
  const [pending, setPending] = useState<"save" | "delete" | "delete-series" | null>(null);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  async function handleSave() {
    setPending("save");
    setError("");
    setSuggestion(null);
    try {
      const fd = new FormData();
      fd.set("id", session.id);
      fd.set("trainer_employee_id", trainerEmployeeId);
      fd.set("date", date);
      fd.set("start_time", startTime);
      fd.set("duration_minutes", String(durationMinutes));
      fd.set("client_count", String(clientCount));
      fd.set("client_name", clientName);
      await updateAction(fd);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Nie udało się zapisać.";
      setError(msg);
      const match = msg.match(/(\d{2}:\d{2})\.?\s*$/);
      if (match) setSuggestion(match[1]);
    } finally {
      setPending(null);
    }
  }

  async function handleDelete(series: boolean) {
    if (!window.confirm(series ? "Usunąć CAŁĄ serię przyszłych treningów?" : "Usunąć ten trening?")) return;
    setPending(series ? "delete-series" : "delete");
    setError("");
    try {
      const fd = new FormData();
      fd.set("trainer_employee_id", trainerEmployeeId);
      if (series) {
        fd.set("series_id", session.seriesId!);
        await cancelSeriesAction(fd);
      } else {
        fd.set("id", session.id);
        await cancelAction(fd);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się usunąć.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-zinc-600">Dzień</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT} w-[140px]`} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-zinc-600">Start</label>
          <input type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${INPUT} w-[100px]`} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-zinc-600">Czas</label>
          <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className={`${INPUT} w-[90px]`}>
            {PT_DURATIONS_MIN.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-zinc-600">Osoby</label>
          <input
            type="number"
            min={1}
            value={clientCount}
            onChange={(e) => setClientCount(Number(e.target.value))}
            className={`${INPUT} w-[70px]`}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-zinc-600">Imię klienta (widoczne tylko dla Ciebie)</label>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={INPUT} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {toggleAction ? (
          <SettleToggle sessionId={session.id} initialSettled={session.isSettled} toggleAction={toggleAction} />
        ) : (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              session.isSettled ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {session.isSettled ? "✓ rozliczone" : "nierozliczone"}
          </span>
        )}
        <span className="text-xs text-zinc-500">{session.amount.toFixed(2)} PLN</span>
        {session.settledNote && <span className="text-xs text-zinc-400">{session.settledNote}</span>}
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
          {suggestion && (
            <button
              type="button"
              onClick={() => {
                setStartTime(suggestion);
                setError("");
                setSuggestion(null);
              }}
              className="ml-2 rounded-md bg-red-600 px-2 py-0.5 font-bold text-white hover:bg-red-700"
            >
              Zastosuj {suggestion}
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending !== null}
          onClick={handleSave}
          className="rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
        >
          {pending === "save" ? "Zapisywanie…" : "Zapisz"}
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => handleDelete(false)}
          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {pending === "delete" ? "Usuwanie…" : "Usuń"}
        </button>
        {session.seriesId && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => handleDelete(true)}
            className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {pending === "delete-series" ? "Usuwanie…" : "Usuń całą serię"}
          </button>
        )}
        {savedFlash && <span className="text-xs font-semibold text-emerald-600">✓ Zapisano</span>}
      </div>
    </div>
  );
}
