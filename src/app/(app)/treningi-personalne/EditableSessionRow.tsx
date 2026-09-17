"use client";

import { useState } from "react";
import { formatHm, timeToMinutes } from "@/lib/time";
import { minutesToTime } from "@/lib/personal-training";
import { friendlyActionError } from "@/lib/client-error";
import { SettleToggle } from "./SettleToggle";

const INPUT_SM = "w-full rounded-lg border-[1.5px] border-zinc-300 px-2 py-1.5 text-sm";

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

// Wiersz WŁASNEGO treningu trenera — domyślnie zwinięty do jednej linii
// (to ma służyć za czytelny grafik "kiedy i z kim", nie formularz edycji
// zawsze rozłożony na pełną szerokość). "Przenieś" otwiera mały panel zmiany
// terminu — dla serii cyklicznej pyta najpierw, czy dotyczy tylko tego
// wystąpienia, czy całej serii od teraz (cała seria zmienia tylko GODZINĘ,
// każde wystąpienie zostaje na swojej dacie). "Usuń"/"Usuń całą serię"
// odwołuje.
export function EditableSessionRow({
  session,
  trainerEmployeeId,
  updateAction,
  moveSeriesAction,
  cancelAction,
  cancelSeriesAction,
  toggleAction,
}: {
  session: EditableSession;
  // Id trenera, którego dotyczy trening — potrzebne serwerowi, patrz
  // resolveTrainerActor w actions.ts.
  trainerEmployeeId: string;
  updateAction: (formData: FormData) => Promise<void>;
  moveSeriesAction: (formData: FormData) => Promise<void>;
  cancelAction: (formData: FormData) => Promise<void>;
  cancelSeriesAction: (formData: FormData) => Promise<void>;
  // Podane tylko dla recepcji/admina — plain trener nie oznacza sam sobie
  // rozliczenia (patrz canPreviewPersonalTraining), widzi wtedy tylko
  // statyczną plakietkę.
  toggleAction?: (formData: FormData) => Promise<void>;
}) {
  const [showMove, setShowMove] = useState(false);
  const [moveScope, setMoveScope] = useState<"single" | "series">("single");
  const [moveDate, setMoveDate] = useState(session.date);
  const [moveTime, setMoveTime] = useState(session.startTime);
  const [pending, setPending] = useState<"move" | "delete" | "delete-series" | null>(null);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const endTime = minutesToTime(timeToMinutes(session.startTime) + session.durationMinutes);

  async function handleMove() {
    setPending("move");
    setError("");
    setSuggestion(null);
    try {
      const fd = new FormData();
      fd.set("trainer_employee_id", trainerEmployeeId);
      if (moveScope === "series" && session.seriesId) {
        fd.set("series_id", session.seriesId);
        fd.set("start_time", moveTime);
        await moveSeriesAction(fd);
      } else {
        fd.set("id", session.id);
        fd.set("date", moveDate);
        fd.set("start_time", moveTime);
        fd.set("duration_minutes", String(session.durationMinutes));
        fd.set("client_count", String(session.clientCount));
        fd.set("client_name", session.clientName);
        await updateAction(fd);
      }
      setShowMove(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(friendlyActionError(err));
      const match = raw.match(/(\d{2}:\d{2})\.?\s*$/);
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
      setError(friendlyActionError(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-zinc-200 bg-white p-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-semibold text-zinc-900">
            {formatHm(session.startTime)}–{endTime}
          </span>
          <span className="text-zinc-700"> · {session.clientName || "(bez imienia klienta)"}</span>
          <span className="text-zinc-400">
            {" "}
            · {session.clientCount} {session.clientCount === 1 ? "osoba" : "osób"}
          </span>
        </span>
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
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span>{session.amount.toFixed(2)} PLN</span>
        {session.settledNote && <span className="text-zinc-400">· {session.settledNote}</span>}
      </div>

      {showMove && (
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-2.5">
          {session.seriesId && (
            <div className="flex flex-wrap gap-3 text-xs font-semibold text-zinc-700">
              <label className="flex items-center gap-1">
                <input type="radio" checked={moveScope === "single"} onChange={() => setMoveScope("single")} /> tylko ten trening
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={moveScope === "series"} onChange={() => setMoveScope("series")} /> cała seria (od teraz)
              </label>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            {moveScope === "single" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-600">Nowy dzień</label>
                <input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} className={`${INPUT_SM} w-[140px]`} />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-zinc-600">Nowa godzina</label>
              <input type="time" step={300} value={moveTime} onChange={(e) => setMoveTime(e.target.value)} className={`${INPUT_SM} w-[110px]`} />
            </div>
            <button
              type="button"
              disabled={pending !== null}
              onClick={handleMove}
              className="rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
            >
              {pending === "move" ? "Przenoszenie…" : "Zastosuj"}
            </button>
            <button
              type="button"
              onClick={() => setShowMove(false)}
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
          {suggestion && (
            <button
              type="button"
              onClick={() => {
                setMoveTime(suggestion);
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
          onClick={() => setShowMove((v) => !v)}
          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {showMove ? "Zwiń" : "Przenieś"}
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
