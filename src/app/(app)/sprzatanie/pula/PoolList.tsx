"use client";

import { useMemo, useState, useTransition } from "react";
import { completeFromPool } from "../actions";

type PoolItem = {
  id: string;
  name: string;
  zoneName: string;
  timeMinutes: number;
  frequency: string;
  frequencyLabel: string;
  lastDone: string | null;
  doneToday: boolean;
};

export function PoolList({ items, today, freqLabels }: { items: PoolItem[]; today: string; freqLabels: Record<string, string> }) {
  const [query, setQuery] = useState("");
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set(items.filter((i) => i.doneToday).map((i) => i.id)));
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.zoneName.toLowerCase().includes(q));
  }, [items, query]);

  const groups = useMemo(() => {
    const byFreq = new Map<string, PoolItem[]>();
    for (const item of filtered) {
      if (!byFreq.has(item.frequency)) byFreq.set(item.frequency, []);
      byFreq.get(item.frequency)!.push(item);
    }
    return byFreq;
  }, [filtered]);

  function handleDo(id: string) {
    setPendingId(id);
    setDoneIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      try {
        await completeFromPool(id, today);
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Szukaj zadania lub strefy…"
        className="w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none focus:border-brand-blue"
      />
      {[...groups.entries()].map(([freq, freqItems]) => (
        <div key={freq}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{freqLabels[freq] ?? freq}</h3>
          <div className="flex flex-col gap-1.5">
            {freqItems.map((item) => {
              const isDone = doneIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-2.5 ${
                    isDone ? "border-zinc-100 bg-zinc-50 opacity-60" : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900">{item.name}</div>
                    <div className="text-xs text-zinc-500">
                      {item.zoneName} · {item.timeMinutes} min
                      {item.lastDone && <> · ostatnio: {item.lastDone}</>}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isDone || pendingId === item.id}
                    onClick={() => handleDo(item.id)}
                    className="shrink-0 rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
                  >
                    {isDone ? "✓ Zrobione dziś" : pendingId === item.id ? "Zapisywanie…" : "Zrób teraz"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <p className="text-sm text-zinc-400">Brak wyników.</p>}
    </div>
  );
}
