"use client";

import { useState } from "react";
import { WEEKDAY_LABELS } from "@/lib/weekdays";
import { savePreferredDaysOff } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export function PreferredDaysOff({
  initialWeekdays,
  initialNote,
}: {
  initialWeekdays: number[];
  initialNote: string;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(initialWeekdays));

  function toggle(weekday: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(weekday)) next.delete(weekday);
      else next.add(weekday);
      return next;
    });
  }

  return (
    <form action={savePreferredDaysOff} className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500">
        Dni tygodnia, w które najchętniej miałbyś/miałabyś wolne (np. gdy nie masz wyjazdów).
        Zapisuje się między miesiącami — jeśli nie wypełnisz dyspozycyjności na kolejny miesiąc,
        te preferencje zostaną uwzględnione jako domyślne.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAY_LABELS.map((label, weekday) => (
          <label key={weekday}>
            <input
              type="checkbox"
              name="weekday"
              value={weekday}
              checked={selected.has(weekday)}
              onChange={() => toggle(weekday)}
              className="peer sr-only"
            />
            <span className="cursor-pointer rounded-full border-[1.5px] border-zinc-300 px-3 py-1.5 text-sm font-medium capitalize text-zinc-600 transition-colors peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-checked:text-white">
              {label}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-zinc-900">Notatka (opcjonalnie)</label>
        <input
          name="note"
          defaultValue={initialNote}
          className="w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <SubmitButton className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
          Zapisz preferencje
        </SubmitButton>
      </div>
    </form>
  );
}
