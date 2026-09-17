"use client";

import { useState } from "react";
import { PT_DURATIONS_MIN } from "@/lib/personal-training";
import { friendlyActionError } from "@/lib/client-error";

const INPUT = "w-full rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm";
const LABEL = "text-xs font-semibold text-zinc-600";

// Formularz nowego treningu (jednorazowego albo cyklicznego) — używany pod
// "+ Nowy trening" w każdym dniu. Przy konflikcie (sala pełna/zamknięta)
// serwer zwraca błąd z podpowiedzią najbliższej wolnej godziny w treści —
// wyłapujemy ją stąd (ostatnie HH:MM w komunikacie) i pokazujemy jako
// klikalny przycisk, który od razu podstawia tę godzinę do formularza.
export function NewPersonalTrainingForm({
  action,
  defaultDate,
  roomCapacity,
  trainerOptions,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultDate: string;
  // Górna granica listy "Liczba osób" — nie da się wybrać więcej niż
  // dopuszcza limit sali ustawiony przez klub, nawet jeśli akurat o tej
  // porze byłoby jeszcze mniej wolnych miejsc (to sprawdza dopiero serwer
  // po wybraniu godziny, patrz błąd + podpowiedź niżej).
  roomCapacity: number;
  trainerOptions?: { id: string; name: string }[];
}) {
  const [trainerId, setTrainerId] = useState(trainerOptions?.[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [clientCount, setClientCount] = useState(1);
  const [clientName, setClientName] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"until" | "count">("until");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [repeatCount, setRepeatCount] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  async function handleSubmit() {
    if (!startTime) {
      setError("Podaj godzinę startu.");
      return;
    }
    setPending(true);
    setError("");
    setSuggestion(null);
    try {
      const fd = new FormData();
      if (trainerOptions) fd.set("trainer_employee_id", trainerId);
      fd.set("date", date);
      fd.set("start_time", startTime);
      fd.set("duration_minutes", String(durationMinutes));
      fd.set("client_count", String(clientCount));
      fd.set("client_name", clientName);
      if (repeat) {
        fd.set("repeat", "on");
        if (repeatMode === "until") fd.set("repeat_until", repeatUntil);
        else fd.set("repeat_count", repeatCount);
      }
      await action(fd);
      setStartTime("");
      setClientName("");
      setClientCount(1);
      setRepeat(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(friendlyActionError(err));
      const match = raw.match(/(\d{2}:\d{2})\.?\s*$/);
      if (match) setSuggestion(match[1]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-brand-orange/40 bg-brand-orange/5 p-3">
      {trainerOptions && (
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Trener</label>
          <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className={INPUT}>
            {trainerOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Dzień</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT} w-[150px]`} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Godzina startu</label>
          <input type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${INPUT} w-[110px]`} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Czas trwania</label>
          <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className={`${INPUT} w-[100px]`}>
            {PT_DURATIONS_MIN.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Liczba osób</label>
          <select value={clientCount} onChange={(e) => setClientCount(Number(e.target.value))} className={`${INPUT} w-[90px]`}>
            {Array.from({ length: Math.max(roomCapacity, 1) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className={LABEL}>Imię klienta (widoczne tylko dla Ciebie, opcjonalnie)</label>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={INPUT} />
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-2.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="h-3.5 w-3.5" />
          Powtarzaj co tydzień
        </label>
        {repeat && (
          <div className="flex flex-wrap items-center gap-2 pl-5">
            <label className="flex items-center gap-1 text-xs text-zinc-600">
              <input type="radio" checked={repeatMode === "until"} onChange={() => setRepeatMode("until")} /> do daty
            </label>
            <input
              type="date"
              disabled={repeatMode !== "until"}
              value={repeatUntil}
              onChange={(e) => setRepeatUntil(e.target.value)}
              className={`${INPUT} w-[150px] disabled:opacity-40`}
            />
            <label className="flex items-center gap-1 text-xs text-zinc-600">
              <input type="radio" checked={repeatMode === "count"} onChange={() => setRepeatMode("count")} /> liczba powtórzeń
            </label>
            <input
              type="number"
              min={1}
              disabled={repeatMode !== "count"}
              value={repeatCount}
              onChange={(e) => setRepeatCount(e.target.value)}
              className={`${INPUT} w-[90px] disabled:opacity-40`}
            />
          </div>
        )}
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
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={handleSubmit}
          className="rounded-lg bg-brand-orange px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : "Dodaj trening"}
        </button>
        {savedFlash && <span className="text-xs font-semibold text-emerald-600">✓ Dodano</span>}
      </div>
    </div>
  );
}
