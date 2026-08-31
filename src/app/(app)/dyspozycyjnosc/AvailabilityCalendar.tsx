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
  absenceDates = [],
}: {
  scheduleMonthId: string;
  days: { dateKey: string; day: number; weekday: number }[];
  entriesByDate: Record<string, DayEntry>;
  shiftsByWeekday: Record<number, ShiftSlot[]>;
  // Dni pokryte zgłoszonym urlopem (patrz Urlopy i nieobecności) — te dni są
  // niedostępne "z automatu", więc pokazujemy je jako zablokowane zamiast
  // dawać do ręcznego zaznaczenia (i tak liczą się jak "cały dzień" przy
  // układaniu grafiku, patrz applyPlannedAbsences w lib/unavailability.ts).
  absenceDates?: string[];
}) {
  const [state, setState] = useState(entriesByDate);
  const [, startTransition] = useTransition();
  const absenceSet = new Set(absenceDates);

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
      {/* Nagłówek dni tygodnia — tylko od tabletu wzwyż, bo na telefonie
          kalendarz jest listą jednokolumnową (nazwa dnia jest wtedy w
          każdej karcie), nie siatką. */}
      <div className="mb-2 hidden grid-cols-7 gap-1.5 text-center text-xs font-semibold uppercase text-zinc-500 sm:grid">
        {WEEK_DISPLAY_ORDER.map((weekday) => (
          <div key={weekday}>{weekdayLabel(weekday).slice(0, 3)}</div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7 sm:gap-1.5">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} className="hidden sm:block" />
        ))}
        {days.map(({ dateKey, day, weekday }) => {
          const entry = state[dateKey];
          const slots = shiftsByWeekday[weekday] ?? [];

          if (absenceSet.has(dateKey)) {
            return (
              <div
                key={dateKey}
                className="flex flex-col gap-1.5 rounded-xl border border-sky-200 bg-sky-50 p-2 text-xs sm:min-h-[92px] sm:gap-1 sm:p-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-zinc-700">{day}</span>
                  <span className="text-[11px] capitalize text-zinc-400 sm:hidden">{weekdayLabel(weekday)}</span>
                </div>
                <span className="rounded-lg bg-sky-100 px-2 py-1.5 text-[12px] font-semibold text-sky-700 sm:px-1.5 sm:py-1 sm:text-[11px]">
                  🏖 Urlop — niedostępny/a
                </span>
              </div>
            );
          }

          return (
            <div
              key={dateKey}
              className={`flex flex-col gap-1.5 rounded-xl border p-2 text-xs sm:min-h-[92px] sm:gap-1 sm:p-1.5 ${
                entry?.wholeDay ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-zinc-700">{day}</span>
                <span className="text-[11px] capitalize text-zinc-400 sm:hidden">{weekdayLabel(weekday)}</span>
              </div>
              <div className="flex flex-wrap items-stretch gap-1.5 sm:flex-col sm:gap-1">
                <button
                  type="button"
                  onClick={() => handleWholeDay(dateKey)}
                  className={`rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-colors sm:px-1.5 sm:py-1 sm:text-[11px] ${
                    entry?.wholeDay
                      ? "bg-red-600 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {entry?.wholeDay ? "Cały dzień ✕" : "Cały dzień"}
                </button>
                {!entry?.wholeDay &&
                  slots.map((s) => {
                    const active = entry?.slots.includes(s.slot_index);
                    return (
                      <button
                        key={s.slot_index}
                        type="button"
                        onClick={() => handleSlot(dateKey, s.slot_index)}
                        className={`rounded-lg px-2 py-1.5 text-left text-[12px] font-medium transition-colors sm:px-1.5 sm:py-0.5 sm:text-[10.5px] ${
                          active
                            ? "bg-amber-500 text-white"
                            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                        }`}
                      >
                        {s.label || `${formatHm(s.default_start_time)}–${formatHm(s.default_end_time)}`}
                      </button>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Jeśli nie będzie Cię cały dzień, zaznacz &quot;Cały dzień&quot; zamiast każdej zmiany osobno. Dni
        zgłoszonego urlopu (zakładka &quot;Urlopy i nieobecności&quot;) oznaczają się tu same — nie trzeba ich
        dodatkowo zaznaczać.
      </p>
    </div>
  );
}
