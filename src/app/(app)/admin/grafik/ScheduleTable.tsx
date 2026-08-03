"use client";

import { Fragment, useMemo, useState } from "react";
import {
  assignShift,
  addEvent,
  closeWholeDay,
  addCustomShift,
  deleteShift,
  assignEventParticipantsToShifts,
  updateEventTime,
  deleteEvent,
  runDraft,
  publishMonth,
  unpublishMonth,
} from "./actions";
import { hoursBetween, formatHm } from "@/lib/time";
import { weekdayLabel } from "@/lib/weekdays";

type ShiftRow = {
  id: string;
  slot_index: number;
  start_time: string;
  end_time: string;
  employee_id: string | null;
  is_closed: boolean;
};
type EventRow = {
  id: string;
  type: string;
  start_time: string | null;
  label: string | null;
  note: string | null;
  participant_employee_ids: string[];
};
type DayRow = { id: string; date: string; weekday: number; shifts: ShiftRow[]; events: EventRow[] };
type Employee = { id: string; name: string; color_hex: string; min_hours_month: number; target_hours_month: number };

const EVENT_TYPE_LABELS: Record<string, string> = {
  liga_open: "Liga open",
  liga_deblowa: "Liga deblowa",
  liga_singlowa: "Liga singlowa",
  sprzatanie: "Sprzątanie",
  warsztaty: "Warsztaty",
  custom: "Inne",
};

const SELECT_CLS = "w-full rounded-lg border-[1.5px] border-zinc-300 px-1.5 py-1 text-xs";

export function ScheduleTable({
  scheduleMonthId,
  scheduleMonthStatus,
  days: initialDays,
  employees,
  unavailableByDayAndSlot,
  unavailableWholeDay,
}: {
  scheduleMonthId: string;
  scheduleMonthStatus: "draft" | "published";
  days: DayRow[];
  employees: Employee[];
  unavailableByDayAndSlot: Record<string, Record<number, string[]>>;
  unavailableWholeDay: Record<string, string[]>;
}) {
  const [days, setDays] = useState(initialDays);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const maxShifts = Math.max(1, ...days.map((d) => d.shifts.length));

  const hoursByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of days) {
      for (const shift of day.shifts) {
        if (shift.employee_id) {
          map.set(shift.employee_id, (map.get(shift.employee_id) ?? 0) + hoursBetween(shift.start_time, shift.end_time));
        }
      }
    }
    return map;
  }, [days]);

  function toggleExpanded(dayId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  }

  async function guard(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    }
  }

  function updateShiftLocal(dayId: string, shiftId: string, patch: Partial<ShiftRow>) {
    setDays((prev) =>
      prev.map((d) => (d.id !== dayId ? d : { ...d, shifts: d.shifts.map((s) => (s.id === shiftId ? { ...s, ...patch } : s)) }))
    );
  }

  function handleAssign(day: DayRow, shiftId: string, value: string) {
    if (value === "__closed__") {
      updateShiftLocal(day.id, shiftId, { employee_id: null, is_closed: true });
    } else {
      updateShiftLocal(day.id, shiftId, { employee_id: value || null, is_closed: false });
    }
    void guard(() => assignShift(shiftId, value));
  }

  function handleCloseWholeDay(day: DayRow) {
    if (!window.confirm("Zamknąć cały dzień (np. święto)? Wszystkie zmiany zostaną oznaczone jako NIECZYNNE.")) return;
    setDays((prev) =>
      prev.map((d) => (d.id !== day.id ? d : { ...d, shifts: d.shifts.map((s) => ({ ...s, employee_id: null, is_closed: true })) }))
    );
    void guard(() => closeWholeDay(day.id));
  }

  async function handleAddCustomShift(day: DayRow, startTime: string, endTime: string) {
    const nextSlotIndex = day.shifts.length > 0 ? Math.max(...day.shifts.map((s) => s.slot_index)) + 1 : 0;
    setBusy(true);
    setError(null);
    try {
      const created = await addCustomShift(day.id, startTime, endTime, nextSlotIndex);
      setDays((prev) =>
        prev.map((d) => (d.id !== day.id ? d : { ...d, shifts: [...d.shifts, created].sort((a, b) => a.slot_index - b.slot_index) }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    } finally {
      setBusy(false);
    }
  }

  function handleDeleteShift(day: DayRow, shiftId: string) {
    if (!window.confirm("Usunąć tę zmianę z tego dnia?")) return;
    setDays((prev) => prev.map((d) => (d.id !== day.id ? d : { ...d, shifts: d.shifts.filter((s) => s.id !== shiftId) })));
    void guard(() => deleteShift(shiftId));
  }

  async function handleAddEvent(
    day: DayRow,
    data: { type: string; start_time: string | null; label: string | null; note: string | null; participant_employee_ids: string[] }
  ) {
    setBusy(true);
    setError(null);
    try {
      const created = await addEvent(day.id, data);
      setDays((prev) => prev.map((d) => (d.id !== day.id ? d : { ...d, events: [...d.events, created] })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    } finally {
      setBusy(false);
    }
  }

  function handleDeleteEvent(day: DayRow, eventId: string) {
    if (!window.confirm("Usunąć to wydarzenie?")) return;
    setDays((prev) => prev.map((d) => (d.id !== day.id ? d : { ...d, events: d.events.filter((e) => e.id !== eventId) })));
    void guard(() => deleteEvent(eventId));
  }

  function handleEventTime(day: DayRow, eventId: string, time: string) {
    setDays((prev) =>
      prev.map((d) =>
        d.id !== day.id ? d : { ...d, events: d.events.map((e) => (e.id === eventId ? { ...e, start_time: time || null } : e)) }
      )
    );
    void guard(() => updateEventTime(eventId, time || null));
  }

  async function handleAssignParticipants(day: DayRow, eventId: string) {
    setBusy(true);
    setError(null);
    try {
      const assignments = await assignEventParticipantsToShifts(eventId);
      setDays((prev) =>
        prev.map((d) => {
          if (d.id !== day.id) return d;
          let shifts = d.shifts;
          for (const a of assignments) {
            shifts = shifts.map((s) => (s.id === a.shiftId ? { ...s, employee_id: a.employeeId, is_closed: false } : s));
          }
          return { ...d, shifts };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRunDraft() {
    setBusy(true);
    setError(null);
    try {
      await runDraft(scheduleMonthId);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
      setBusy(false);
    }
  }

  async function handlePublish() {
    setBusy(true);
    setError(null);
    try {
      await publishMonth(scheduleMonthId);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
      setBusy(false);
    }
  }

  async function handleUnpublish() {
    if (!window.confirm("Cofnąć publikację? Pracownicy przestaną widzieć ten grafik.")) return;
    setBusy(true);
    setError(null);
    try {
      await unpublishMonth(scheduleMonthId);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
      <div className="flex flex-col gap-3">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>
        )}

        {scheduleMonthStatus === "draft" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="font-semibold text-zinc-900">Generator propozycji</h2>
              <p className="text-sm text-zinc-500">
                Wypełnia tylko puste zmiany — nie nadpisuje ręcznych przypisań. Uwzględnia
                dyspozycyjność, zajęcia instruktorów i wyrównuje godziny.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleRunDraft}
              className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-50"
            >
              {busy ? "Generowanie…" : "Wygeneruj propozycję"}
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-2">Data</th>
                {Array.from({ length: maxShifts }).map((_, i) => (
                  <th key={i} className="px-2 py-2">
                    Zmiana {i + 1}
                  </th>
                ))}
                <th className="px-2 py-2">Wydarzenia</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                const dateLabel = new Date(day.date + "T00:00:00").toLocaleDateString("pl-PL", {
                  day: "numeric",
                  month: "short",
                });
                const wholeDayUnavailable = (unavailableWholeDay[day.date] ?? []).map((id) => employeeById.get(id)?.name).filter(Boolean);
                const isExpanded = expanded.has(day.id);

                return (
                  <Fragment key={day.id}>
                    <tr className="border-t border-zinc-100 align-top hover:bg-zinc-50/60">
                      <td className="whitespace-nowrap px-2 py-2">
                        <div className="font-semibold capitalize text-zinc-900">{dateLabel}</div>
                        <div className="text-xs capitalize text-zinc-500">{weekdayLabel(day.weekday)}</div>
                        {wholeDayUnavailable.length > 0 && (
                          <div className="mt-1 max-w-[110px] text-[11px] font-bold leading-tight text-red-600">
                            ⚠ {wholeDayUnavailable.join(", ")} niedostępni
                          </div>
                        )}
                      </td>
                      {Array.from({ length: maxShifts }).map((_, slotIndex) => {
                        const shift = day.shifts.find((s) => s.slot_index === slotIndex);
                        if (!shift) {
                          return (
                            <td key={slotIndex} className="px-2 py-2 text-zinc-300">
                              —
                            </td>
                          );
                        }
                        const unavailableIds = unavailableByDayAndSlot[day.date]?.[slotIndex] ?? [];
                        const unavailableNames = unavailableIds.map((id) => employeeById.get(id)?.name).filter(Boolean);
                        const options = employees.filter((e) => !unavailableIds.includes(e.id) || e.id === shift.employee_id);
                        const selectValue = shift.is_closed ? "__closed__" : shift.employee_id ?? "";
                        return (
                          <td key={shift.id} className="px-2 py-2">
                            <div className="text-[11px] font-semibold text-zinc-500">
                              {formatHm(shift.start_time)}–{formatHm(shift.end_time)}
                            </div>
                            <select
                              value={selectValue}
                              onChange={(e) => handleAssign(day, shift.id, e.target.value)}
                              className={SELECT_CLS}
                            >
                              <option value="">— nieprzypisane —</option>
                              {options.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name}
                                </option>
                              ))}
                              <option value="__closed__">NIECZYNNE</option>
                            </select>
                            {unavailableNames.length > 0 && (
                              <div className="mt-1 text-[11px] font-bold text-red-600">⚠ {unavailableNames.join(", ")}</div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {day.events.map((ev) => (
                            <span
                              key={ev.id}
                              className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600"
                              title={ev.label ?? undefined}
                            >
                              {ev.start_time ? `${formatHm(ev.start_time)} ` : ""}
                              {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                            </span>
                          ))}
                          {day.events.length === 0 && <span className="text-xs text-zinc-300">—</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(day.id)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-100"
                        >
                          {isExpanded ? "Zwiń" : "Więcej ⋯"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-t border-zinc-100 bg-zinc-50/60">
                        <td colSpan={maxShifts + 3} className="px-3 py-3">
                          <div className="flex flex-col gap-3 text-xs">
                            <div>
                              <button
                                type="button"
                                onClick={() => handleCloseWholeDay(day)}
                                className="rounded-lg px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-200 hover:text-red-600"
                              >
                                Zamknij cały dzień
                              </button>
                            </div>

                            {day.events.length > 0 && (
                              <div className="flex flex-col gap-1.5">
                                {day.events.map((ev) => {
                                  const participantNames = ev.participant_employee_ids
                                    .map((id) => employeeById.get(id)?.name)
                                    .filter(Boolean);
                                  return (
                                    <div key={ev.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5">
                                      <span className="font-semibold text-zinc-700">{EVENT_TYPE_LABELS[ev.type] ?? ev.type}</span>
                                      {ev.label && <span>{ev.label}</span>}
                                      <input
                                        type="time"
                                        value={ev.start_time ?? ""}
                                        onChange={(e) => handleEventTime(day, ev.id, e.target.value)}
                                        className="rounded border border-zinc-300 px-1 py-0.5 text-xs"
                                      />
                                      {ev.note && <span className="text-zinc-500">({ev.note})</span>}
                                      {participantNames.length > 0 && (
                                        <>
                                          <span className="text-zinc-500">Pracownicy: {participantNames.join(", ")}</span>
                                          <button
                                            type="button"
                                            onClick={() => handleAssignParticipants(day, ev.id)}
                                            className="font-semibold text-brand-blue hover:underline"
                                          >
                                            Przypisz do zmian
                                          </button>
                                        </>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteEvent(day, ev.id)}
                                        className="ml-auto font-semibold text-red-500 hover:underline"
                                      >
                                        Usuń
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div className="flex flex-col gap-1.5">
                              {day.shifts.map((shift) => (
                                <div key={shift.id} className="flex items-center gap-2">
                                  <span className="text-zinc-500">
                                    {formatHm(shift.start_time)}–{formatHm(shift.end_time)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteShift(day, shift.id)}
                                    className="font-semibold text-red-500 hover:underline"
                                  >
                                    Usuń zmianę
                                  </button>
                                </div>
                              ))}
                            </div>

                            <AddShiftForm onAdd={(start, end) => handleAddCustomShift(day, start, end)} busy={busy} />
                            <AddEventForm employees={employees} onAdd={(data) => handleAddEvent(day, data)} busy={busy} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-zinc-900">Suma godzin</h2>
          <ul className="flex flex-col gap-2">
            {employees.map((e) => {
              const hrs = hoursByEmployee.get(e.id) ?? 0;
              const belowMin = hrs < e.min_hours_month;
              const belowTarget = hrs < e.target_hours_month;
              return (
                <li key={e.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-medium text-zinc-800">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color_hex }} />
                      {e.name}
                    </span>
                    <span
                      className={
                        belowMin ? "font-semibold text-red-600" : belowTarget ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"
                      }
                    >
                      {hrs}h
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    min {e.min_hours_month}h · cel {e.target_hours_month}h
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          {scheduleMonthStatus === "draft" ? (
            <button
              type="button"
              disabled={busy}
              onClick={handlePublish}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Publikowanie…" : "Opublikuj miesiąc"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={handleUnpublish}
              className="w-full rounded-xl bg-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-300 disabled:opacity-50"
            >
              Cofnij publikację
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddShiftForm({ onAdd, busy }: { onAdd: (start: string, end: string) => void; busy: boolean }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-zinc-500">Nowa zmiana od</label>
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-semibold text-zinc-500">Do</label>
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
        />
      </div>
      <button
        type="button"
        disabled={busy || !start || !end}
        onClick={() => {
          onAdd(start, end);
          setStart("");
          setEnd("");
        }}
        className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-zinc-900 disabled:opacity-50"
      >
        Dodaj zmianę
      </button>
    </div>
  );
}

function AddEventForm({
  employees,
  onAdd,
  busy,
}: {
  employees: Employee[];
  onAdd: (data: { type: string; start_time: string | null; label: string | null; note: string | null; participant_employee_ids: string[] }) => void;
  busy: boolean;
}) {
  const [type, setType] = useState("liga_open");
  const [startTime, setStartTime] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [participants, setParticipants] = useState<Set<string>>(new Set());

  function toggleParticipant(id: string) {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-white p-2">
      <div className="flex flex-wrap items-end gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs">
          {Object.entries(EVENT_TYPE_LABELS).map(([value, l]) => (
            <option key={value} value={value}>
              {l}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Etykieta"
          className="w-24 rounded-lg border border-zinc-300 px-2 py-1 text-xs"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notatka"
          className="w-28 rounded-lg border border-zinc-300 px-2 py-1 text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {employees.map((e) => (
          <label key={e.id} className="flex items-center gap-1 text-zinc-600">
            <input
              type="checkbox"
              checked={participants.has(e.id)}
              onChange={() => toggleParticipant(e.id)}
              className="h-3.5 w-3.5"
            />
            {e.name}
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          onAdd({
            type,
            start_time: startTime || null,
            label: label.trim() || null,
            note: note.trim() || null,
            participant_employee_ids: Array.from(participants),
          });
          setStartTime("");
          setLabel("");
          setNote("");
          setParticipants(new Set());
        }}
        className="self-start rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-zinc-900 disabled:opacity-50"
      >
        Dodaj wydarzenie
      </button>
    </div>
  );
}
