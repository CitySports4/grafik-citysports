"use client";

import { useState } from "react";
import { planCleaningWithAi } from "./actions";

export function AiPlanButton({ dateKeys }: { dateKeys: string[] }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await planCleaningWithAi(dateKeys);
      setMessage(
        result.consideredCount === 0
          ? "Brak decyzji do podjęcia — żadne zadanie cykliczne w tym miesiącu nie ma realnego wyboru dnia."
          : `AI zdecydowało w ${result.decidedCount} z ${result.consideredCount} przypadków, gdzie był realny wybór dnia.`
      );
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się zaplanować z AI.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={handleClick}
        title="AI wybiera, którego dnia w oknie (tydzień/2 tyg./4 tyg./kwartał) wykonać każde cykliczne zadanie sprzątania, kierując się sprawiedliwością obciążenia — spośród dni, gdzie już wiadomo kto by je zrobił. Nie dotyczy zadań codziennych ani sobotniego sprzątania."
        className="cursor-help rounded-lg border-[1.5px] border-zinc-800 bg-white px-3 py-1.5 text-sm font-bold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
      >
        {busy ? "Planowanie…" : "Ułóż cykliczne z AI ⓘ"}
      </button>
      {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
      {message && <span className="text-xs text-zinc-500">{message}</span>}
    </div>
  );
}
