"use client";

import { useState } from "react";
import { DayTimeEntryEditor, type TimeEntryRow } from "./DayTimeEntryEditor";
import { addTimeEntry, updateTimeEntry, deleteTimeEntry } from "./actions";
import { WEEK_DISPLAY_ORDER, weekdayLabel } from "@/lib/weekdays";

type DayEntry = {
  dateKey: string;
  day: number;
  weekday: number;
  label: string;
  scheduled: string;
  scheduledRaw: { start_time: string; end_time: string }[];
  editable: boolean;
  entries: TimeEntryRow[];
};

// Widok kalendarza (siatka 7 kolumn, jak w Dyspozycyjności) zamiast płaskiej
// listy dni — od razu widać rozkład miesiąca, a kolor komórki mówi o
// statusie (zielony = wpisano, żółty = czeka na wpis, czerwony = okno
// edycji minęło bez wpisu) bez czytania każdej linijki osobno.
// Klik na dzień nie rozwija się W MIEJSCU (formularz z 3 polami + przyciski
// nie zmieściłby się w wąskiej kolumnie siatki) — pod spodem pokazuje się
// jeden, pełnej szerokości panel edycji dla wybranego dnia.
export function TimeEntryCalendar({ days }: { days: DayEntry[] }) {
  const [selected, setSelected] = useState<string | null>(() => {
    const pending = days.find((d) => d.scheduledRaw.length > 0 && d.entries.length === 0 && d.editable);
    return pending?.dateKey ?? null;
  });

  const leadingBlanks = days.length > 0 ? (days[0].weekday + 6) % 7 : 0;
  const selectedDay = days.find((d) => d.dateKey === selected) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 hidden grid-cols-7 gap-1.5 text-center text-xs font-semibold uppercase text-zinc-500 sm:grid">
          {WEEK_DISPLAY_ORDER.map((weekday) => (
            <div key={weekday}>{weekdayLabel(weekday).slice(0, 3)}</div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7 sm:gap-1.5">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} className="hidden sm:block" />
          ))}
          {days.map((day) => (
            <DayCell key={day.dateKey} day={day} selected={day.dateKey === selected} onSelect={() => setSelected(day.dateKey)} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> wpisano
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> czeka na wpis
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> brak wpisu — okno minęło
          </span>
        </div>
      </div>

      {selectedDay && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
          <div className="mb-2">
            <div className="text-sm font-semibold capitalize text-zinc-900">{selectedDay.label}</div>
            {selectedDay.scheduled && <div className="text-xs text-zinc-500">Grafik: {selectedDay.scheduled}</div>}
          </div>
          {selectedDay.editable ? (
            <DayTimeEntryEditor
              dateKey={selectedDay.dateKey}
              initialEntries={selectedDay.entries}
              scheduled={selectedDay.scheduledRaw}
              addAction={addTimeEntry}
              updateAction={updateTimeEntry}
              deleteAction={deleteTimeEntry}
            />
          ) : selectedDay.entries.length > 0 ? (
            <div className="text-sm text-zinc-600">
              {selectedDay.entries.map((e) => (
                <div key={e.id}>
                  {e.actualStart}–{e.actualEnd}
                  {e.note && <span className="text-zinc-400"> · {e.note}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Brak wpisu — okno edycji (7 dni) minęło.</p>
          )}
        </div>
      )}
    </div>
  );
}

function DayCell({ day, selected, onSelect }: { day: DayEntry; selected: boolean; onSelect: () => void }) {
  const hasSchedule = day.scheduledRaw.length > 0;
  const hasEntries = day.entries.length > 0;
  const isEmpty = !hasSchedule && !hasEntries;
  const entriesLabel = day.entries.map((e) => `${e.actualStart}–${e.actualEnd}`).join(", ");

  const boxClass = hasEntries
    ? "border-emerald-200 bg-emerald-50"
    : !hasSchedule
      ? "border-zinc-100 bg-zinc-50/60"
      : day.editable
        ? "border-amber-200 bg-amber-50"
        : "border-red-200 bg-red-50";

  const content = (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className={`font-semibold ${isEmpty ? "text-zinc-300" : "text-zinc-700"}`}>{day.day}</span>
        <span className="text-[11px] capitalize text-zinc-400 sm:hidden">{weekdayLabel(day.weekday)}</span>
      </div>
      {hasSchedule && <div className="mt-0.5 truncate text-[11px] text-zinc-500">{day.scheduled}</div>}
      {hasEntries ? (
        <div className="mt-0.5 truncate text-[11px] font-semibold text-emerald-700">✓ {entriesLabel}</div>
      ) : hasSchedule ? (
        <div className={`mt-0.5 text-[11px] font-semibold ${day.editable ? "text-amber-700" : "text-red-600"}`}>
          {day.editable ? "Wpisz godziny" : "Brak wpisu"}
        </div>
      ) : null}
    </>
  );

  if (isEmpty) {
    return <div className={`rounded-xl border p-2 text-left text-xs sm:min-h-[76px] sm:p-1.5 ${boxClass}`}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl border p-2 text-left text-xs transition-shadow sm:min-h-[76px] sm:p-1.5 ${boxClass} ${
        selected ? "ring-2 ring-brand-orange" : ""
      }`}
    >
      {content}
    </button>
  );
}
