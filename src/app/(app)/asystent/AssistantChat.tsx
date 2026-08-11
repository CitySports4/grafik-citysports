"use client";

import { useState } from "react";
import { askScheduleQuestion } from "./actions";

type Turn = { question: string; answer: string };

export function AssistantChat() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk() {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await askScheduleQuestion(q);
      setTurns((prev) => [...prev, { question: q, answer }]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się uzyskać odpowiedzi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="self-start rounded-xl rounded-bl-sm bg-zinc-100 px-3 py-2 text-sm text-zinc-800">{t.question}</div>
            <div className="self-start rounded-xl rounded-bl-sm bg-brand-orange/10 px-3 py-2 text-sm text-zinc-900">{t.answer}</div>
          </div>
        ))}
        {turns.length === 0 && <p className="text-sm text-zinc-400">Brak historii — zadaj pierwsze pytanie.</p>}
      </div>

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

      <div className="flex items-end gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAsk();
            }
          }}
          placeholder="np. kto ma zmianę w sobotę?"
          rows={2}
          className="w-full rounded-xl border-[1.5px] border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy || !question.trim()}
          onClick={handleAsk}
          className="shrink-0 rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
        >
          {busy ? "…" : "Zapytaj"}
        </button>
      </div>
    </div>
  );
}
