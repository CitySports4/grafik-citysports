import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getOrCreateScheduleMonth, nextMonth, monthLabel } from "@/lib/schedule-month";
import { hoursBetween, formatHm } from "@/lib/time";
import { weekdayLabel } from "@/lib/weekdays";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { AutoSubmitInput } from "@/components/AutoSubmitInput";
import {
  generateStructure,
  runDraft,
  assignShift,
  addEvent,
  deleteEvent,
  updateEventTime,
  publishMonth,
  unpublishMonth,
} from "./actions";

const EVENT_TYPE_LABELS: Record<string, string> = {
  liga_open: "Liga open",
  liga_deblowa: "Liga deblowa",
  liga_singlowa: "Liga singlowa",
  sprzatanie: "Sprzątanie",
  warsztaty: "Warsztaty",
  custom: "Inne",
};

export default async function ScheduleBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const fallback = nextMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;

  const scheduleMonth = await getOrCreateScheduleMonth(year, month);
  const supabase = createServerSupabaseClient();

  const { data: employees } = await supabase
    .from("employee")
    .select("id, name, color_hex, min_hours_month, target_hours_month")
    .eq("active", true)
    .order("name");

  const { data: days } = await supabase
    .from("schedule_day")
    .select(
      "id, date, weekday, schedule_shift(id, slot_index, start_time, end_time, employee_id, is_closed), schedule_event(id, type, start_time, label, note)"
    )
    .eq("schedule_month_id", scheduleMonth.id)
    .order("date");

  // Podpowiedzi o niedyspozycyjności — dla ułatwienia ręcznego przypisania.
  const { data: submissions } = await supabase
    .from("availability_submission")
    .select("id, employee_id")
    .eq("schedule_month_id", scheduleMonth.id);
  const submissionIds = (submissions ?? []).map((s) => s.id);
  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
  const employeeIdBySubmission = new Map((submissions ?? []).map((s) => [s.id, s.employee_id]));

  const unavailabilityHints = new Map<string, { wholeDay: string[]; bySlot: Map<number, string[]> }>();
  if (submissionIds.length > 0) {
    const { data: entries } = await supabase
      .from("availability_entry")
      .select("availability_submission_id, date, whole_day, slot_index")
      .in("availability_submission_id", submissionIds);
    for (const e of entries ?? []) {
      const empId = employeeIdBySubmission.get(e.availability_submission_id);
      const empName = empId ? employeeById.get(empId)?.name : undefined;
      if (!empName) continue;
      if (!unavailabilityHints.has(e.date)) {
        unavailabilityHints.set(e.date, { wholeDay: [], bySlot: new Map() });
      }
      const hint = unavailabilityHints.get(e.date)!;
      if (e.whole_day) {
        hint.wholeDay.push(empName);
      } else if (e.slot_index !== null) {
        if (!hint.bySlot.has(e.slot_index)) hint.bySlot.set(e.slot_index, []);
        hint.bySlot.get(e.slot_index)!.push(empName);
      }
    }
  }

  const hasStructure = (days?.length ?? 0) > 0;

  const hoursByEmployee = new Map<string, number>();
  for (const day of days ?? []) {
    for (const shift of day.schedule_shift ?? []) {
      if (shift.employee_id) {
        const h = hoursBetween(shift.start_time, shift.end_time);
        hoursByEmployee.set(shift.employee_id, (hoursByEmployee.get(shift.employee_id) ?? 0) + h);
      }
    }
  }

  const prevLink = month === 1 ? `?year=${year - 1}&month=12` : `?year=${year}&month=${month - 1}`;
  const nextLink = month === 12 ? `?year=${year + 1}&month=1` : `?year=${year}&month=${month + 1}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold capitalize text-zinc-900">
            Grafik — {monthLabel(month)} {year}
          </h1>
          <p className="text-sm text-zinc-500">
            Status:{" "}
            <span className={scheduleMonth.status === "published" ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
              {scheduleMonth.status === "published" ? "Opublikowany" : "Roboczy (draft)"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/admin/grafik${prevLink}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            ← poprzedni
          </Link>
          <Link href={`/admin/grafik${nextLink}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            następny →
          </Link>
        </div>
      </div>

      {!hasStructure && (
        <Card>
          <p className="mb-3 text-sm text-zinc-600">
            Ten miesiąc nie ma jeszcze wygenerowanych dni i zmian. Wygeneruj strukturę na
            podstawie konfiguracji zmian (Admin → Konfiguracja zmian).
          </p>
          <form action={generateStructure}>
            <input type="hidden" name="schedule_month_id" value={scheduleMonth.id} />
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <SubmitButton className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              Generuj strukturę miesiąca
            </SubmitButton>
          </form>
        </Card>
      )}

      {hasStructure && scheduleMonth.status === "draft" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-zinc-900">Generator propozycji</h2>
            <p className="text-sm text-zinc-500">
              Wypełnia tylko puste zmiany — nie nadpisuje ręcznych przypisań. Uwzględnia
              dyspozycyjność, zajęcia instruktorów i wyrównuje godziny.
            </p>
          </div>
          <form action={runDraft}>
            <input type="hidden" name="schedule_month_id" value={scheduleMonth.id} />
            <SubmitButton className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
              Wygeneruj propozycję
            </SubmitButton>
          </form>
        </Card>
      )}

      {hasStructure && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-3">
            {days?.map((day) => {
              const hints = unavailabilityHints.get(day.date);
              const shifts = (day.schedule_shift ?? []).slice().sort((a, b) => a.slot_index - b.slot_index);
              const events = day.schedule_event ?? [];
              const dateLabel = new Date(day.date + "T00:00:00").toLocaleDateString("pl-PL", {
                day: "numeric",
                month: "short",
              });
              return (
                <Card key={day.id} className="!p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize text-zinc-900">
                      {dateLabel} — {weekdayLabel(day.weekday)}
                    </span>
                    {hints?.wholeDay && hints.wholeDay.length > 0 && (
                      <span className="text-xs text-red-600">
                        Cały dzień niedostępni: {hints.wholeDay.join(", ")}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {shifts.map((shift) => {
                      const unavailableNames = hints?.bySlot.get(shift.slot_index) ?? [];
                      return (
                        <form key={shift.id} action={assignShift} className="flex flex-col gap-1">
                          <input type="hidden" name="shift_id" value={shift.id} />
                          <span className="text-xs font-semibold text-zinc-500">
                            {formatHm(shift.start_time)}–{formatHm(shift.end_time)}
                          </span>
                          <AutoSubmitSelect
                            name="employee_id"
                            defaultValue={shift.is_closed ? "__closed__" : shift.employee_id ?? ""}
                            className="min-w-[140px] rounded-lg border-[1.5px] border-zinc-300 px-2 py-1 text-sm"
                          >
                            <option value="">— nieprzypisane —</option>
                            {employees?.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.name}
                              </option>
                            ))}
                            <option value="__closed__">NIECZYNNE</option>
                          </AutoSubmitSelect>
                          {unavailableNames.length > 0 && (
                            <span className="text-[10px] text-red-500">
                              niedostępni: {unavailableNames.join(", ")}
                            </span>
                          )}
                        </form>
                      );
                    })}
                    {shifts.length === 0 && <span className="text-sm text-zinc-400">Brak zmian tego dnia.</span>}
                  </div>

                  <div className="mt-2 flex flex-col gap-1.5">
                    {events.map((ev) => (
                      <div key={ev.id} className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs">
                        <span className="font-semibold text-zinc-700">{EVENT_TYPE_LABELS[ev.type] ?? ev.type}</span>
                        {ev.label && ev.label !== EVENT_TYPE_LABELS[ev.type] && <span>{ev.label}</span>}
                        <form action={updateEventTime} className="flex items-center gap-1">
                          <input type="hidden" name="event_id" value={ev.id} />
                          <AutoSubmitInput
                            type="time"
                            name="start_time"
                            defaultValue={ev.start_time ?? ""}
                            className="rounded border border-zinc-300 px-1 py-0.5 text-xs"
                          />
                        </form>
                        {ev.note && <span className="text-zinc-500">({ev.note})</span>}
                        <form action={deleteEvent} className="ml-auto">
                          <input type="hidden" name="event_id" value={ev.id} />
                          <ConfirmButton confirmText="Usunąć to wydarzenie?" className="text-red-500 hover:underline">
                            Usuń
                          </ConfirmButton>
                        </form>
                      </div>
                    ))}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-zinc-500 hover:text-zinc-700">+ dodaj wydarzenie</summary>
                      <form action={addEvent} className="mt-1.5 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="schedule_day_id" value={day.id} />
                        <select name="type" className="rounded-lg border border-zinc-300 px-2 py-1 text-xs" defaultValue="liga_open">
                          {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <input type="time" name="start_time" className="rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
                        <input name="label" placeholder="Etykieta" className="w-24 rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
                        <input name="note" placeholder="Notatka" className="w-28 rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
                        <button type="submit" className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-zinc-900">
                          Dodaj
                        </button>
                      </form>
                    </details>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <h2 className="mb-2 font-semibold text-zinc-900">Suma godzin</h2>
              <ul className="flex flex-col gap-2">
                {employees?.map((e) => {
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
                        <span className={belowMin ? "font-semibold text-red-600" : belowTarget ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"}>
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
            </Card>

            <Card>
              {scheduleMonth.status === "draft" ? (
                <form action={publishMonth}>
                  <input type="hidden" name="schedule_month_id" value={scheduleMonth.id} />
                  <SubmitButton
                    savedText="Opublikowano"
                    className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Opublikuj miesiąc
                  </SubmitButton>
                </form>
              ) : (
                <form action={unpublishMonth}>
                  <input type="hidden" name="schedule_month_id" value={scheduleMonth.id} />
                  <ConfirmButton
                    confirmText="Cofnąć publikację? Pracownicy przestaną widzieć ten grafik."
                    className="w-full rounded-xl bg-zinc-200 px-4 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-300"
                  >
                    Cofnij publikację
                  </ConfirmButton>
                </form>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
