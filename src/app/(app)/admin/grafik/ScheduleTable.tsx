"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  assignShift,
  addEvent,
  closeWholeDay,
  addCustomShift,
  deleteShift,
  assignEventParticipantsToShifts,
  updateEventTimes,
  updateEventParticipants,
  deleteEvent,
  runAiDraft,
  publishMonth,
  unpublishMonth,
} from "./actions";
import { hoursBetween, formatHm, dailyEffectiveHours } from "@/lib/time";
import { weekdayLabel } from "@/lib/weekdays";
import { ColorDot } from "@/components/ColorDot";
import { EVENT_TYPE_LABELS } from "@/lib/event-types";
import { Banner } from "@/components/Banner";

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
  end_time: string | null;
  label: string | null;
  note: string | null;
  participant_employee_ids: string[];
};
type DayRow = { id: string; date: string; weekday: number; shifts: ShiftRow[]; events: EventRow[] };
type Employee = {
  id: string;
  name: string;
  color_hex: string;
  can_clean: boolean;
  min_hours_month: number;
  target_hours_month: number;
};
type ClassEntry = { weekday: number; start_time: string; end_time: string };

const SELECT_CLS = "w-full rounded-lg border-[1.5px] border-zinc-300 px-1.5 py-1 text-xs";

export function ScheduleTable({
  scheduleMonthId,
  scheduleMonthStatus,
  days: initialDays,
  employees,
  classByEmployee,
  unavailableByDayAndSlot,
  unavailableWholeDay,
}: {
  scheduleMonthId: string;
  scheduleMonthStatus: "draft" | "published";
  days: DayRow[];
  employees: Employee[];
  classByEmployee: Record<string, ClassEntry[]>;
  unavailableByDayAndSlot: Record<string, Record<number, string[]>>;
  unavailableWholeDay: Record<string, string[]>;
}) {
  const [days, setDays] = useState(initialDays);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);

  // Wynik generatora przeżywa `window.location.reload()` (patrz
  // handleRunAiDraft) tylko dzięki sessionStorage — sam stan komponentu
  // znika przy przeładowaniu strony.
  useEffect(() => {
    const stored = window.sessionStorage.getItem("grafik_generate_message");
    if (stored) {
      setGenerateMessage(stored);
      window.sessionStorage.removeItem("grafik_generate_message");
    }
  }, []);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const maxShifts = Math.max(1, ...days.map((d) => d.shifts.length));

  const hoursByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    // Grupujemy zmiany danego pracownika w danym dniu i liczymy je jako
    // POŁĄCZONE przedziały czasu — gdyby ta sama osoba miała 2 nakładające
    // się zmiany tego dnia (nie powinno się zdarzać, ale liczymy bezpiecznie
    // na wszelki wypadek), godziny nakładania nie policzą się dwa razy.
    const shiftsByEmployeeDay = new Map<string, { start_time: string; end_time: string }[]>();
    for (const day of days) {
      for (const shift of day.shifts) {
        if (!shift.employee_id) continue;
        const key = `${shift.employee_id}|${day.date}`;
        if (!shiftsByEmployeeDay.has(key)) shiftsByEmployeeDay.set(key, []);
        shiftsByEmployeeDay.get(key)!.push({ start_time: shift.start_time, end_time: shift.end_time });
      }
    }
    const weekdayByDate = new Map(days.map((d) => [d.date, d.weekday]));
    for (const [key, shiftsList] of shiftsByEmployeeDay) {
      const [empId, date] = key.split("|");
      const weekday = weekdayByDate.get(date) ?? 0;
      const h = dailyEffectiveHours(shiftsList, weekday, classByEmployee[empId] ?? []);
      map.set(empId, (map.get(empId) ?? 0) + h);
    }
    for (const day of days) {
      for (const ev of day.events) {
        if (!ev.end_time) continue;
        const h = hoursBetween(ev.start_time ?? "00:00", ev.end_time);
        for (const empId of ev.participant_employee_ids) {
          map.set(empId, (map.get(empId) ?? 0) + h);
        }
      }
    }
    return map;
  }, [days, classByEmployee]);

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

  function updateEventLocal(dayId: string, eventId: string, patch: Partial<EventRow>) {
    setDays((prev) =>
      prev.map((d) => (d.id !== dayId ? d : { ...d, events: d.events.map((e) => (e.id === eventId ? { ...e, ...patch } : e)) }))
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
    data: {
      type: string;
      start_time: string | null;
      end_time: string | null;
      label: string | null;
      note: string | null;
      participant_employee_ids: string[];
    }
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

  function handleEventStart(day: DayRow, ev: EventRow, time: string) {
    updateEventLocal(day.id, ev.id, { start_time: time || null });
    void guard(() => updateEventTimes(ev.id, time || null, ev.end_time));
  }

  function handleEventEnd(day: DayRow, ev: EventRow, time: string) {
    updateEventLocal(day.id, ev.id, { end_time: time || null });
    void guard(() => updateEventTimes(ev.id, ev.start_time, time || null));
  }

  function handleToggleParticipant(day: DayRow, ev: EventRow, employeeId: string) {
    const has = ev.participant_employee_ids.includes(employeeId);
    const nextIds = has ? ev.participant_employee_ids.filter((id) => id !== employeeId) : [...ev.participant_employee_ids, employeeId];
    updateEventLocal(day.id, ev.id, { participant_employee_ids: nextIds });
    void guard(() => updateEventParticipants(ev.id, nextIds));
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

  async function handleRunAiDraft() {
    setBusy(true);
    setError(null);
    try {
      const result = await runAiDraft(scheduleMonthId);
      const message =
        result.assignedCount === 0
          ? `AI niczego nie zmieniło (${result.aiRounds} ${result.aiRounds === 1 ? "próba" : "próby"}).`
          : `AI zaktualizowało ${result.assignedCount} ${result.assignedCount === 1 ? "zmianę" : "zmian"} (${result.aiRounds} ${result.aiRounds === 1 ? "próba" : "próby"} do poprawnego wyniku)` +
            (result.skippedCount > 0
              ? `. Bez obsady zostało ${result.skippedCount} ${result.skippedCount === 1 ? "zmiana" : "zmian"} — brak dostępnej osoby.`
              : ".");
      window.sessionStorage.setItem("grafik_generate_message", message);
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
          <Banner variant="error" className="font-semibold">
            {error}
          </Banner>
        )}
        {generateMessage && (
          <Banner variant="info" className="font-semibold" onDismiss={() => setGenerateMessage(null)}>
            {generateMessage}
          </Banner>
        )}

        {scheduleMonthStatus === "draft" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <span
              className="flex cursor-help items-center gap-1.5 text-sm font-semibold text-zinc-900"
              title="AI samo układa cały przydział (uwzględnia dyspozycyjność, zajęcia instruktorów, cele godzinowe) i MOŻE przełożyć już przypisane zmiany, jeśli znajdzie lepszy układ. Każda propozycja jest w pełni sprawdzona pod kątem twardych reguł (dostępność, 7 dni, dzień wolny, przerwy) i odrzucona z powrotem do AI do poprawy, jeśli je łamie — zapisuje się tylko to, co realnie się zmieniło."
            >
              Generator propozycji (AI)
              <span className="text-xs font-normal text-zinc-400">ⓘ</span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={handleRunAiDraft}
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
                        <div className="flex items-center gap-1">
                          <span className="font-semibold capitalize text-zinc-900">{dateLabel}</span>
                          {wholeDayUnavailable.length > 0 && (
                            <span
                              className="cursor-help text-xs text-red-500"
                              title={`Cały dzień niedostępni: ${wholeDayUnavailable.join(", ")}`}
                            >
                              ⚠
                            </span>
                          )}
                        </div>
                        <div className="text-xs capitalize text-zinc-500">{weekdayLabel(day.weekday)}</div>
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
                        // Ostrzeżenie ma sens tylko dla PRZYPISANEJ osoby — reszta
                        // niedostępnych już i tak znika z listy wyboru niżej (patrz
                        // `options`), więc pokazywanie ich tu drugi raz nie niesie żadnej
                        // nowej informacji, a przy małym zespole "ktoś ZAWSZE jest akurat
                        // niedostępny" świeciło się to na prawie każdej zmianie — admin
                        // uczył się to ignorować, więc realny konflikt (przypisano kogoś,
                        // kto sam zgłosił niedostępność) ginął w tle.
                        const assignedIsUnavailable = shift.employee_id ? unavailableIds.includes(shift.employee_id) : false;
                        // Jedna osoba = jedna zmiana dziennie pon-czw jest zasadą DOMYŚLNĄ
                        // (generatory jej pilnują) — ale w ręcznej edycji admin czasem
                        // świadomie chce wyjątek (np. ktoś dorabia drugą zmianę tego
                        // samego dnia). Dlatego tu tylko OSTRZEGAMY (dopisek przy nazwisku
                        // w liście), nie blokujemy wyboru — inaczej nie dałoby się tego
                        // w ogóle ustawić ręcznie za pierwszym razem.
                        const workingElsewhereTodayIds = new Set(
                          day.shifts
                            .filter((s) => s.id !== shift.id && s.employee_id)
                            .map((s) => s.employee_id as string)
                        );
                        const options = employees.filter((e) => !unavailableIds.includes(e.id) || e.id === shift.employee_id);
                        const selectValue = shift.is_closed ? "__closed__" : shift.employee_id ?? "";
                        const currentEmployee = shift.employee_id ? employeeById.get(shift.employee_id) : null;
                        return (
                          <td key={shift.id} className="px-2 py-2">
                            <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
                              {formatHm(shift.start_time)}–{formatHm(shift.end_time)}
                              {assignedIsUnavailable && currentEmployee && (
                                <span
                                  className="cursor-help text-red-500"
                                  title={`${currentEmployee.name} zgłosił(a) niedostępność na tę zmianę`}
                                >
                                  ⚠
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              {currentEmployee && <ColorDot color={currentEmployee.color_hex} />}
                              <select
                                value={selectValue}
                                onChange={(e) => handleAssign(day, shift.id, e.target.value)}
                                className={SELECT_CLS}
                              >
                                <option value="">— nieprzypisane —</option>
                                {options.map((e) => (
                                  <option key={e.id} value={e.id} style={{ color: e.color_hex }}>
                                    {e.name}
                                    {workingElsewhereTodayIds.has(e.id) && e.id !== shift.employee_id ? " (już dziś pracuje)" : ""}
                                  </option>
                                ))}
                                <option value="__closed__">NIECZYNNE</option>
                              </select>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-1">
                          {day.events.map((ev) => (
                            <div
                              key={ev.id}
                              className="flex flex-wrap items-center gap-1 rounded-lg bg-zinc-100 px-1.5 py-1 text-[11px]"
                              title={ev.label ?? undefined}
                            >
                              <input
                                type="time"
                                value={ev.start_time ?? ""}
                                onChange={(e) => handleEventStart(day, ev, e.target.value)}
                                className="w-[58px] rounded border border-zinc-300 bg-white px-1 py-0.5 text-[10px]"
                              />
                              <span className="text-zinc-400">–</span>
                              <input
                                type="time"
                                value={ev.end_time ?? ""}
                                onChange={(e) => handleEventEnd(day, ev, e.target.value)}
                                className="w-[58px] rounded border border-zinc-300 bg-white px-1 py-0.5 text-[10px]"
                              />
                              <span className="font-semibold text-zinc-600">{EVENT_TYPE_LABELS[ev.type] ?? ev.type}</span>
                              {ev.participant_employee_ids.length > 0 && (
                                <span className="flex items-center gap-0.5">
                                  {ev.participant_employee_ids.map((id) => {
                                    const emp = employeeById.get(id);
                                    return emp ? <ColorDot key={id} color={emp.color_hex} /> : null;
                                  })}
                                </span>
                              )}
                            </div>
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

                            <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-2.5">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Zmiany</p>
                              <div className="flex flex-col gap-1.5">
                                {day.shifts.length === 0 && <span className="text-zinc-300">Brak zmian tego dnia.</span>}
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
                            </div>

                            <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-2.5">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Wydarzenia</p>
                              <div className="flex flex-col gap-2">
                                {day.events.length === 0 && <span className="text-zinc-300">Brak wydarzeń tego dnia.</span>}
                                {day.events.map((ev) => {
                                  const candidateEmployees =
                                    ev.type === "sprzatanie" ? employees.filter((e) => e.can_clean) : employees;
                                  return (
                                    <div key={ev.id} className="flex flex-col gap-1.5 rounded-lg bg-white px-2.5 py-1.5">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold text-zinc-700">{EVENT_TYPE_LABELS[ev.type] ?? ev.type}</span>
                                        {ev.label && <span>{ev.label}</span>}
                                        {ev.note && <span className="text-zinc-500">({ev.note})</span>}
                                        {ev.type !== "sprzatanie" && ev.participant_employee_ids.length > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => handleAssignParticipants(day, ev.id)}
                                            className="font-semibold text-brand-blue hover:underline"
                                          >
                                            Przypisz do zmian
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteEvent(day, ev.id)}
                                          className="ml-auto font-semibold text-red-500 hover:underline"
                                        >
                                          Usuń
                                        </button>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-zinc-500">
                                          {ev.type === "sprzatanie" ? "Sprząta:" : "Pracownicy:"}
                                        </span>
                                        {candidateEmployees.length === 0 ? (
                                          <span className="text-amber-700">
                                            Nikt nie ma przypisanej strefy sprzątania —{" "}
                                            <Link href="/admin/sprzatanie" className="font-semibold underline">
                                              uzupełnij w Konfiguracji
                                            </Link>
                                            .
                                          </span>
                                        ) : (
                                          candidateEmployees.map((e) => (
                                            <label key={e.id} className="flex items-center gap-1 text-zinc-600">
                                              <input
                                                type="checkbox"
                                                checked={ev.participant_employee_ids.includes(e.id)}
                                                onChange={() => handleToggleParticipant(day, ev, e.id)}
                                                className="h-3.5 w-3.5"
                                              />
                                              <ColorDot color={e.color_hex} />
                                              {e.name}
                                            </label>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <AddEventForm employees={employees} onAdd={(data) => handleAddEvent(day, data)} busy={busy} />
                            </div>
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
              const hrs = Math.round((hoursByEmployee.get(e.id) ?? 0) * 100) / 100;
              const belowMin = hrs < e.min_hours_month;
              const belowTarget = hrs < e.target_hours_month;
              return (
                <li key={e.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-medium text-zinc-800">
                      <ColorDot color={e.color_hex} />
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
  onAdd: (data: {
    type: string;
    start_time: string | null;
    end_time: string | null;
    label: string | null;
    note: string | null;
    participant_employee_ids: string[];
  }) => void;
  busy: boolean;
}) {
  const [type, setType] = useState("liga_open");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
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

  const candidateEmployees = type === "sprzatanie" ? employees.filter((e) => e.can_clean) : employees;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-white p-2">
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setParticipants(new Set());
          }}
          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
        >
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
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
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
        {type === "sprzatanie" && candidateEmployees.length === 0 ? (
          <span className="text-xs text-amber-700">
            Nikt nie ma przypisanej strefy sprzątania —{" "}
            <Link href="/admin/sprzatanie" className="font-semibold underline">
              uzupełnij w Konfiguracji
            </Link>
            .
          </span>
        ) : (
          candidateEmployees.map((e) => (
            <label key={e.id} className="flex items-center gap-1 text-zinc-600">
              <input
                type="checkbox"
                checked={participants.has(e.id)}
                onChange={() => toggleParticipant(e.id)}
                className="h-3.5 w-3.5"
              />
              <ColorDot color={e.color_hex} />
              {e.name}
            </label>
          ))
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          onAdd({
            type,
            start_time: startTime || null,
            end_time: endTime || null,
            label: label.trim() || null,
            note: note.trim() || null,
            participant_employee_ids: Array.from(participants),
          });
          setStartTime("");
          setEndTime("");
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
