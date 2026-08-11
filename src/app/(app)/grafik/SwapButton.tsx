"use client";

import { useState, useTransition } from "react";
import { getSwapSuggestions, createSwapRequest, type SwapSuggestion } from "../zamiany/actions";
import { formatHm } from "@/lib/time";
import { ColorDot } from "@/components/ColorDot";

function dateLabel(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

// Przycisk na własnej zmianie w "Mój grafik" — klik pokazuje gotową,
// przefiltrowaną listę osób i ich zmian, z którymi sensownie da się
// zamienić (system sam sugeruje, zamiast nieczytelnej listy wszystkiego).
export function SwapButton({ shiftId }: { shiftId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SwapSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleOpen() {
    setOpen((v) => !v);
    if (!open && suggestions === null) {
      setLoading(true);
      setError(null);
      try {
        setSuggestions(await getSwapSuggestions(shiftId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nie udało się pobrać sugestii.");
      } finally {
        setLoading(false);
      }
    }
  }

  function handlePick(s: SwapSuggestion) {
    setSentId(s.theirShiftId);
    startTransition(async () => {
      try {
        await createSwapRequest(shiftId, s.theirShiftId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nie udało się wysłać prośby.");
        setSentId(null);
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-lg bg-white/20 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-white/30"
        title="Zamień się"
      >
        🔄
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-zinc-200 bg-white p-2.5 text-left shadow-lg">
          <p className="mb-1.5 text-xs font-semibold text-zinc-700">Zamień się z kim?</p>
          {loading && <p className="text-xs text-zinc-400">Szukam dostępnych osób…</p>}
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          {!loading && suggestions?.length === 0 && (
            <p className="text-xs text-zinc-400">Nikt na razie nie pasuje — nikt nie jest wolny w tym terminie albo wszyscy już wtedy pracują.</p>
          )}
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {suggestions?.map((s) => (
              <button
                key={s.theirShiftId}
                type="button"
                disabled={sentId !== null}
                onClick={() => handlePick(s)}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-zinc-50 disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5">
                  <ColorDot color={s.colorHex} />
                  <span className="font-semibold text-zinc-800">{s.employeeName}</span>
                </span>
                <span className="text-zinc-500">
                  {dateLabel(s.theirDate)}, {formatHm(s.theirStartTime)}–{formatHm(s.theirEndTime)}
                </span>
              </button>
            ))}
          </div>
          {sentId && <p className="mt-1.5 text-xs font-semibold text-emerald-600">✓ Wysłano prośbę o zamianę.</p>}
        </div>
      )}
    </div>
  );
}
