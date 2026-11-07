"use client";

import { useState } from "react";
import { BTN_GHOST_DANGER, BTN_DANGER_SOLID } from "@/components/button-styles";

export function ReopenDayForm({ cashDayId, action }: { cashDayId: string; action: (formData: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={BTN_GHOST_DANGER}>
        Cofnij zamknięcie
      </button>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action(new FormData(e.currentTarget));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-[220px] flex-col gap-1.5">
      <input type="hidden" name="cash_day_id" value={cashDayId} />
      <input
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        required
        placeholder="Powód korekty…"
        className="w-full rounded-lg border-[1.5px] border-zinc-300 px-2 py-1 text-xs"
      />
      {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={`${BTN_DANGER_SOLID} !px-2.5 !py-1 !text-xs`}>
          {busy ? "Cofanie…" : "Potwierdź"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-zinc-500 hover:underline">
          Anuluj
        </button>
      </div>
    </form>
  );
}
