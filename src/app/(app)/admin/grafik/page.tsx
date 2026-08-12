import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getOrCreateScheduleMonth, nextMonth, monthLabel, daysInMonth, toDateKey } from "@/lib/schedule-month";
import { buildAvailabilityMap, applyPlannedAbsences, isHardUnavailable, type HardConstraint } from "@/lib/unavailability";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { BackLink } from "@/components/BackLink";
import { generateStructure } from "./actions";
import { ScheduleTable } from "./ScheduleTable";
import { ResetStructureButton } from "./ResetStructureButton";

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

  const [{ data: rawEmployees }, { data: cleaningZoneRows }] = await Promise.all([
    supabase
      .from("employee")
      .select("id, name, color_hex, min_hours_month, target_hours_month")
      .eq("active", true)
      .order("name"),
    supabase.from("employee_cleaning_zone").select("employee_id"),
  ]);
  // Może sprzątać = ma przypisaną choć jedną strefę sprzątania (zjednocone
  // ze starym przełącznikiem can_clean, patrz migracja 0009).
  const canCleanIds = new Set((cleaningZoneRows ?? []).map((r) => r.employee_id));
  const employees = (rawEmployees ?? []).map((e) => ({ ...e, can_clean: canCleanIds.has(e.id) }));

  const { data: classSchedules } = await supabase
    .from("employee_class_schedule")
    .select("employee_id, weekday, start_time, end_time");
  const classByEmployee: Record<string, { weekday: number; start_time: string; end_time: string }[]> = {};
  for (const c of classSchedules ?? []) {
    if (!classByEmployee[c.employee_id]) classByEmployee[c.employee_id] = [];
    classByEmployee[c.employee_id].push({ weekday: c.weekday, start_time: c.start_time, end_time: c.end_time });
  }

  const { data: days } = await supabase
    .from("schedule_day")
    .select(
      "id, date, weekday, schedule_shift(id, slot_index, start_time, end_time, employee_id, is_closed), schedule_event(id, type, start_time, end_time, label, note, participant_employee_ids)"
    )
    .eq("schedule_month_id", scheduleMonth.id)
    .order("date");

  const hasStructure = (days?.length ?? 0) > 0;

  const prevLink = month === 1 ? `?year=${year - 1}&month=12` : `?year=${year}&month=${month - 1}`;
  const nextLink = month === 12 ? `?year=${year + 1}&month=1` : `?year=${year}&month=${month + 1}`;

  const unavailableByDayAndSlot: Record<string, Record<number, string[]>> = {};
  const unavailableWholeDay: Record<string, string[]> = {};
  const sameDayExceptionByDate: Record<string, string[]> = {};

  if (hasStructure) {
    const { data: allConstraints } = await supabase
      .from("weekly_recurring_constraint")
      .select("employee_id, weekday, start_time, end_time, type");
    const constraints = (allConstraints ?? []).filter((c) => c.type === "unavailable");

    // Reguła "1 osoba = 1 zmiana dziennie" w ScheduleTable obowiązuje tylko
    // pon-czw — piątek/sobota/niedziela są tam zawsze wyjęte spod blokady.
    // Ten wyjątek dotyczy więc tylko pon-czw: jeśli dany pracownik ma już
    // przypisaną więcej niż jedną zmianę tego dnia (wygenerowany podział dnia
    // przy tylko 2 dostępnych osobach — patrz schedule-generator.ts), pozwól
    // mu pozostać wybieralnym na liście również dla innych jego zmian tego
    // dnia, zamiast blokować to jako "już pracuje gdzie indziej".
    for (const day of days ?? []) {
      const shiftCountByEmployee = new Map<string, number>();
      for (const shift of day.schedule_shift ?? []) {
        if (!shift.employee_id) continue;
        shiftCountByEmployee.set(shift.employee_id, (shiftCountByEmployee.get(shift.employee_id) ?? 0) + 1);
      }
      const doubledUpIds = [...shiftCountByEmployee.entries()].filter(([, count]) => count > 1).map(([id]) => id);
      if (doubledUpIds.length > 0) {
        sameDayExceptionByDate[day.date] = [...(sameDayExceptionByDate[day.date] ?? []), ...doubledUpIds];
      }
    }

    const hardConstraintsByEmployee = new Map<string, HardConstraint[]>();
    for (const c of constraints ?? []) {
      if (!hardConstraintsByEmployee.has(c.employee_id)) hardConstraintsByEmployee.set(c.employee_id, []);
      hardConstraintsByEmployee.get(c.employee_id)!.push({ weekday: c.weekday, start_time: c.start_time, end_time: c.end_time });
    }

    const { data: submissions } = await supabase
      .from("availability_submission")
      .select("id, employee_id")
      .eq("schedule_month_id", scheduleMonth.id);
    const submissionIds = (submissions ?? []).map((s) => s.id);
    const employeeIdBySubmission = new Map((submissions ?? []).map((s) => [s.id, s.employee_id]));

    let availabilityEntries: { availability_submission_id: string; date: string; whole_day: boolean; slot_index: number | null }[] = [];
    if (submissionIds.length > 0) {
      const { data } = await supabase
        .from("availability_entry")
        .select("availability_submission_id, date, whole_day, slot_index")
        .in("availability_submission_id", submissionIds);
      availabilityEntries = data ?? [];
    }
    const availabilityMap = buildAvailabilityMap(availabilityEntries, employeeIdBySubmission);

    const monthDates = daysInMonth(year, month).map(toDateKey);
    const { data: plannedAbsences } = await supabase
      .from("planned_absence")
      .select("employee_id, start_date, end_date")
      .lte("start_date", monthDates[monthDates.length - 1])
      .gte("end_date", monthDates[0]);
    applyPlannedAbsences(availabilityMap, plannedAbsences ?? []);

    for (const day of days ?? []) {
      const wholeDayIds: string[] = [];
      const bySlotIds: Record<number, string[]> = {};

      for (const emp of employees ?? []) {
        const byDate = availabilityMap.get(emp.id)?.get(day.date);
        if (byDate?.wholeDay) wholeDayIds.push(emp.id);
      }
      unavailableWholeDay[day.date] = wholeDayIds;

      for (const shift of day.schedule_shift ?? []) {
        const ids: string[] = [];
        for (const emp of employees ?? []) {
          if (
            isHardUnavailable(
              emp.id,
              day.date,
              day.weekday,
              shift.slot_index,
              shift.start_time,
              shift.end_time,
              availabilityMap,
              hardConstraintsByEmployee
            )
          ) {
            ids.push(emp.id);
          }
        }
        bySlotIds[shift.slot_index] = ids;
      }
      unavailableByDayAndSlot[day.date] = bySlotIds;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin" label="Panel admina" />

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
          {hasStructure && (
            <Link
              href={`/print/grafik?year=${year}&month=${month}`}
              target="_blank"
              className="rounded-lg bg-zinc-100 px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-200"
            >
              Drukuj / PDF
            </Link>
          )}
          <Link href={`/admin/grafik${prevLink}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            ← poprzedni
          </Link>
          <Link href={`/admin/grafik${nextLink}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            następny →
          </Link>
        </div>
      </div>

      {hasStructure && scheduleMonth.status === "draft" && (
        <ResetStructureButton scheduleMonthId={scheduleMonth.id} year={year} month={month} />
      )}

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
            <SubmitButton className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
              Generuj strukturę miesiąca
            </SubmitButton>
          </form>
        </Card>
      )}

      {hasStructure && (
        <ScheduleTable
          scheduleMonthId={scheduleMonth.id}
          scheduleMonthStatus={scheduleMonth.status}
          days={(days ?? []).map((d) => ({
            id: d.id,
            date: d.date,
            weekday: d.weekday,
            shifts: (d.schedule_shift ?? []).slice().sort((a, b) => a.slot_index - b.slot_index),
            events: d.schedule_event ?? [],
          }))}
          employees={employees ?? []}
          classByEmployee={classByEmployee}
          unavailableByDayAndSlot={unavailableByDayAndSlot}
          unavailableWholeDay={unavailableWholeDay}
          sameDayExceptionByDate={sameDayExceptionByDate}
        />
      )}
    </div>
  );
}
