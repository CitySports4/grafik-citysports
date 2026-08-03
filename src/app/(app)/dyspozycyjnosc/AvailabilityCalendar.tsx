"use client";

import { useState, useTransition } from "react";
import { toggleWholeDayUnavailable, toggleSlotUnavailable } from "./actions";
import { WEEK_DISPLAY_ORDER, weekdayLabel } from "@/lib/weekdays";
import { formatHm } from "@/lib/time";

type ShiftSlot = { slot_index: number; default_start_time: string; default_end_time: string; label: string | null };
type DayEntry = { wholeDay: boolean; slots: number[] };

export function AvailabilityCalendar({
  scheduleMonthId,
  days,
  entriesByDate,
  shiftsByWeekday,
}: {
  scheduleMonthId: string;
  days: { dateKey: string; day: number; weekday: number }[];
  entriesByDate: Record<string, DayEntry>;
  shiftsByWeekday: Record<number, ShiftSlot[]>;
}) {
  const [state, setState] = useState(entriesByDate);
  const [, startTransition] = useTransition();

  function handleWholeDay(dateKey: string) {
    setState((prev) => {
      const current = prev[dateKey];
      const nowWholeDay = !current?.wholeDay;
      return { ...prev, [dateKey]: { wholeDay: nowWholeDay, slots: [] } };
    });
    startTransition(() => {
      toggleWholeDayUnavailable(scheduleMonthId, dateKey);
    });
  }

  function handleSlot(dateKey: string, slotIndex: number) {
    setState((prev) => {
      const current = prev[dateKey] ?? { wholeDay: false, slots: [] };
      const has = current.slots.includes(slotIndex);
      const slots = has ? current.slots.filter((s) => s !== slotIndex) : [...current.slots, slotIndex];
      return { ...prev, [dateKey]: { wholeDay: false, slots } };
    });
    startTransition(() => {
      toggleSlotUnavailable(scheduleMonthId, dateKey, slotIndex);
    });
  }

  // Tydzień zaczyna się w poniedziałek — kolumna 0 to poniedziałek (weekday
  // 1), kolumna 6 to niedziela (weekday 0), stąd przesunięcie (weekday+6)%7.
  const leadingBlanks = days.length > 0 ? (days[0].weekday + 6) % 7 : 0;

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-xs font-semibold uppercase text-zinc-500">
        {WEEK_DISPLAY_ORDER.map((weekday) => (
          <div key={weekday}>{weekdayLabel(weekday).slice(0, 3)}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map(({ dateKey, day, weekday }) => {
          const entry = state[dateKey];
          const slots = shiftsByWeekday[weekday] ?? [];
          return (
            <div
              key={dateKey}
              className={`flex min-h-[92px] flex-col gap-1 rounded-xl border p-1.5 text-xs ${
                entry?.wholeDay ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-700">{day}</span>
              </div>
              <button
                type="button"
                onClick={() => handleWholeDay(dateKey)}
                className={`rounded-lg px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                  entry?.wholeDay
                    ? "bg-red-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {entry?.wholeDay ? "Cały dzień ✕" : "Cały dzień"}
              </button>
              {!entry?.wholeDay && slots.length > 0 && (
                <div className="flex flex-col gap-1">
                  {slots.map((s) => {
                    const active = entry?.slots.includes(s.slot_index);
                    return (
                      <button
                        key={s.slot_index}
                        type="button"
                        onClick={() => handleSlot(dateKey, s.slot_index)}
                        className={`rounded-lg px-1.5 py-0.5 text-left text-[10.5px] font-medium transition-colors ${
                          active
                            ? "bg-amber-500 text-white"
                            : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
                        }`}
                      >
                        {s.label || `${formatHm(s.default_start_time)}–${formatHm(s.default_end_time)}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Zaznacz tylko dni/zmiany, w których <strong>nie będziesz</strong> dostępny. Jeśli nie
        będzie Cię cały dzień, zaznacz &quot;Cały dzień&quot; zamiast każdej zmiany osobno.
      </p>
    </div>
  );
}
