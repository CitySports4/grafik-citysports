"use client";

import { useRef, useState } from "react";
import { WEEK_DISPLAY_ORDER, weekdayLabel } from "@/lib/weekdays";
import { savePreferredDaysOff } from "./actions";

export function PreferredDaysOff({
  initialWeekdays,
  initialNote,
}: {
  initialWeekdays: number[];
  initialNote: string;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(initialWeekdays));
  const [note, setNote] = useState(initialNote);
  const [pending, setPending] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function toggle(weekday: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(weekday)) next.delete(weekday);
      else next.add(weekday);
      return next;
    });
  }

  // Wysyłka ręczna (bez natywnego action={}) — formularze z action={} są przez
  // Reacta resetowane do stanu z pierwszego renderu po udanym zapisie, co
  // cofałoby zaznaczone dni z powrotem do tego, co było przy wejściu na stronę.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const formData = new FormData();
    for (const weekday of selected) {
      formData.append("weekday", String(weekday));
    }
    formData.append("note", note);
    try {
      await savePreferredDaysOff(formData);
      setShowSaved(true);
      if (savedTimeout.current) clearTimeout(savedTimeout.current);
      savedTimeout.current = setTimeout(() => setShowSaved(false), 2500);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500">
        Dni tygodnia, w które najchętniej miałbyś/miałabyś wolne (np. gdy nie masz wyjazdów).
        Zapisuje się między miesiącami — jeśli nie wypełnisz dyspozycyjności na kolejny miesiąc,
        te preferencje zostaną uwzględnione jako domyślne.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {WEEK_DISPLAY_ORDER.map((weekday) => (
          <label key={weekday}>
            <input
              type="checkbox"
              value={weekday}
              checked={selected.has(weekday)}
              onChange={() => toggle(weekday)}
              className="peer sr-only"
            />
            <span className="cursor-pointer rounded-full border-[1.5px] border-zinc-300 px-3 py-1.5 text-sm font-medium capitalize text-zinc-600 transition-colors peer-checked:border-brand-orange peer-checked:bg-brand-orange peer-checked:text-white">
              {weekdayLabel(weekday)}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-zinc-900">Notatka (opcjonalnie)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none focus:border-brand-blue"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-brand-orange px-4 py-2 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : "Zapisz preferencje"}
        </button>
        {showSaved && <span className="text-sm font-semibold text-emerald-600">✓ Zapisano</span>}
      </div>
    </form>
  );
}
