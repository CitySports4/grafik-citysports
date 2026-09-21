"use client";

import { useState } from "react";
import { friendlyActionError } from "@/lib/client-error";

const INPUT = "w-full rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm";
const LABEL = "text-xs font-semibold text-zinc-600";

// Formularz blokady sali (admin) — dowolny fragment dnia, od 15 minut po
// kilka godzin, niezależnie od zwykłych treningów: "wynajęliśmy salkę",
// "potrzebujemy jej na coś swojego". Godzina od/do zamiast listy czasów
// trwania (jak przy treningu) — blokada nie ma z góry narzuconej długości.
export function RoomBlockForm({ action, defaultDate }: { action: (formData: FormData) => Promise<void>; defaultDate: string }) {
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  async function handleSubmit() {
    if (!startTime || !endTime) {
      setError("Podaj godzinę od i do.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("date", date);
      fd.set("start_time", startTime);
      fd.set("end_time", endTime);
      fd.set("reason", reason);
      await action(fd);
      setStartTime("");
      setEndTime("");
      setReason("");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      setError(friendlyActionError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-zinc-400/50 bg-zinc-100/60 p-3">
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Dzień</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT} w-[150px]`} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Od</label>
          <input type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${INPUT} w-[110px]`} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Do</label>
          <input type="time" step={300} value={endTime} onChange={(e) => setEndTime(e.target.value)} className={`${INPUT} w-[110px]`} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL}>Powód (opcjonalnie, widoczny dla trenerów)</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="np. wynajem, sprzątanie" className={INPUT} />
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={handleSubmit}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : "Zablokuj salę"}
        </button>
        {savedFlash && <span className="text-xs font-semibold text-emerald-600">✓ Zablokowano</span>}
      </div>
    </div>
  );
}
