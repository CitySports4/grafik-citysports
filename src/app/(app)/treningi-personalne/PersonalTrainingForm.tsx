"use client";

import { useMemo, useState } from "react";
import { PT_DURATIONS_MIN, maxConcurrentClients, minutesToTime, type RoomWindow } from "@/lib/personal-training";
import { timeToMinutes } from "@/lib/time";
import { friendlyActionError } from "@/lib/client-error";

const INPUT = "w-full rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm";
const LABEL = "text-xs font-semibold text-zinc-600";

type ExistingSession = { start_time: string; duration_minutes: number; client_count: number };

// Krok siatki godzin do wyboru — grubszy niż PT_SLOT_STEP_MIN (5 min, do
// precyzyjnego szukania wolnego terminu na serwerze), żeby nie wypisywać
// dziesiątek prawie identycznych przycisków co 5 minut, ale wciąż dość
// drobny, żeby nie zmuszać do sztywnych "pełnych godzin".
const GRID_STEP_MIN = 10;

// Trener wcześniej musiał sam wpisać godzinę startu i "liczbę osób" bez
// żadnej podpowiedzi, ile miejsc w sali jest akurat wolne — łatwo było
// pomylić "liczbę osób NA MOIM treningu" z "limitem sali" i trafić w
// konflikt dopiero po zapisaniu (patrz błąd + podpowiedź niżej, który wciąż
// zostaje jako siatka bezpieczeństwa). Teraz, gdy rodzic przekaże godziny
// otwarcia sali i już zaplanowane treningi TEGO dnia (dayWindows/daySessions
// — tylko dla defaultDate, patrz hasGridData), pokazujemy klikalną siatkę
// godzin pokolorowaną według obłożenia, a "Liczba osób" ogranicza się sama
// do tego, ile miejsc naprawdę zostało wolne o wybranej porze.
export function NewPersonalTrainingForm({
  action,
  defaultDate,
  roomCapacity,
  trainerOptions,
  dayWindows,
  daySessions,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultDate: string;
  // Górna granica listy "Liczba osób", gdy nie znamy jeszcze obłożenia
  // konkretnej godziny (np. inny dzień niż defaultDate) — patrz freeAtSelection.
  roomCapacity: number;
  trainerOptions?: { id: string; name: string }[];
  dayWindows?: RoomWindow[];
  daySessions?: ExistingSession[];
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

  // Siatka jest wiarygodna tylko dla dnia, dla którego rodzic ją policzył —
  // jeśli trener ręcznie zmieni pole "Dzień" na inny termin, znikamy ją
  // zamiast pokazywać obłożenie z niewłaściwego dnia.
  const hasGridData = date === defaultDate && !!dayWindows && !!daySessions;

  // Siatka zależy od WYBRANEGO czasu trwania — dlatego "Czas trwania" jest w
  // formularzu wyżej niż "Godzina" (trener najpierw mówi, na jak długo, a
  // dopiero potem widzi, o której faktycznie może zacząć). Warunek pętli
  // (t + durationMinutes <= endMin) gwarantuje, że żaden pokazany przycisk
  // nie pozwoli treningowi wystawać poza koniec okna dostępności sali —
  // to nie tylko kolor/disabled, taki przycisk w ogóle się nie pojawia.
  const slotsByWindow = useMemo(() => {
    if (!hasGridData || !dayWindows) return [];
    return dayWindows.map((w) => {
      const startMin = timeToMinutes(w.start_time);
      const endMin = timeToMinutes(w.end_time);
      const slots: { time: string; free: number }[] = [];
      for (let t = startMin; t + durationMinutes <= endMin; t += GRID_STEP_MIN) {
        const occupied = maxConcurrentClients(t, t + durationMinutes, daySessions ?? []);
        slots.push({ time: minutesToTime(t), free: Math.max(0, roomCapacity - occupied) });
      }
      return { window: w, slots };
    });
  }, [hasGridData, dayWindows, daySessions, roomCapacity, durationMinutes]);

  // Ile miejsc naprawdę zostało wolnych DLA WYBRANEJ godziny — to samo, co
  // liczy siatka dla godzin z jej kroku (GRID_STEP_MIN), ale działa też dla
  // "Dokładnej godziny" wpisanej ręcznie poza tym krokiem. Serwer i tak
  // przelicza to jeszcze raz przy zapisie (patrz obsługa błędu niżej) — to
  // tylko podpowiedź w formularzu.
  const freeAtSelection = useMemo(() => {
    if (!hasGridData || !startTime) return null;
    const startMin = timeToMinutes(startTime);
    const occupied = maxConcurrentClients(startMin, startMin + durationMinutes, daySessions ?? []);
    return Math.max(0, roomCapacity - occupied);
  }, [hasGridData, startTime, durationMinutes, daySessions, roomCapacity]);

  // Pochodna, wyliczana na bieżąco przy renderze zamiast trzymana w osobnym
  // stanie synchronizowanym efektem — jeśli po zmianie godziny/czasu trwania
  // wolnych miejsc zrobi się mniej niż wcześniej wybrane clientCount, select
  // po prostu pokazuje i wysyła przyciętą wartość, bez dodatkowego re-rendera.
  const clientCountMax = Math.max(freeAtSelection ?? roomCapacity, 1);
  const effectiveClientCount = Math.min(clientCount, clientCountMax);

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
      fd.set("client_count", String(effectiveClientCount));
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
      <div className="flex flex-col gap-1">
        <label className={LABEL}>Dzień</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT} w-[150px]`} />
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
        <label className={LABEL}>Godzina — wybierz wolny termin (co {GRID_STEP_MIN} min)</label>
        {hasGridData ? (
          slotsByWindow.length === 0 ? (
            <p className="text-xs text-zinc-400">Sala niedostępna tego dnia.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {slotsByWindow.map(({ window, slots }) => (
                <div key={`${window.start_time}-${window.end_time}`} className="flex flex-wrap gap-1">
                  {slots.map((slot) => {
                    const isFull = slot.free === 0;
                    const isSelected = slot.time === startTime;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={isFull}
                        title={isFull ? "Brak wolnych miejsc o tej porze" : `Wolne miejsca: ${slot.free}/${roomCapacity}`}
                        onClick={() => setStartTime(slot.time)}
                        className={`rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                          isSelected
                            ? "bg-brand-orange text-white"
                            : isFull
                              ? "cursor-not-allowed bg-red-50 text-red-300 line-through"
                              : slot.free < roomCapacity
                                ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )
        ) : (
          <input type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${INPUT} w-[110px]`} />
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {hasGridData && (
          <div className="flex flex-col gap-1">
            <label className={LABEL}>Dokładna godzina</label>
            <input type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${INPUT} w-[110px]`} />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className={LABEL}>Liczba osób{freeAtSelection !== null && ` (wolne: ${freeAtSelection})`}</label>
          <select value={effectiveClientCount} onChange={(e) => setClientCount(Number(e.target.value))} className={`${INPUT} w-[90px]`}>
            {Array.from({ length: clientCountMax }, (_, i) => i + 1).map((n) => (
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
