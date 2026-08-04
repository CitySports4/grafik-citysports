import { createServerSupabaseClient } from "@/lib/supabase";
import { effectiveShiftHours, hoursBetween, overlapMinutes, timeToMinutes } from "@/lib/time";
import { daysInMonth, toDateKey } from "@/lib/schedule-month";

// Tworzy dni i zmiany miesiąca na podstawie szablonu (shift_template) —
// wywoływane raz, gdy admin zaczyna układać grafik na dany miesiąc.
export async function generateMonthStructure(scheduleMonthId: string, year: number, month: number) {
  const supabase = createServerSupabaseClient();

  const { data: existingDays } = await supabase
    .from("schedule_day")
    .select("id")
    .eq("schedule_month_id", scheduleMonthId)
    .limit(1);
  if (existingDays && existingDays.length > 0) {
    throw new Error("Ten miesiąc ma już wygenerowaną strukturę dni.");
  }

  const { data: template } = await supabase
    .from("shift_template")
    .select("weekday, slot_index, default_start_time, default_end_time")
    .eq("active", true);

  const templateByWeekday = new Map<number, typeof template>();
  for (const t of template ?? []) {
    if (!templateByWeekday.has(t.weekday)) templateByWeekday.set(t.weekday, []);
    templateByWeekday.get(t.weekday)!.push(t);
  }

  const dates = daysInMonth(year, month);
  for (const date of dates) {
    const weekday = date.getDay();
    const dateKey = toDateKey(date);

    const { data: dayRow, error } = await supabase
      .from("schedule_day")
      .insert({ schedule_month_id: scheduleMonthId, date: dateKey, weekday })
      .select("id")
      .single();
    if (error || !dayRow) {
      throw new Error("Nie udało się utworzyć dnia grafiku.");
    }

    const slots = templateByWeekday.get(weekday) ?? [];
    if (slots.length > 0) {
      const rows = slots.map((s) => ({
        schedule_day_id: dayRow.id,
        slot_index: s.slot_index,
        start_time: s.default_start_time,
        end_time: s.default_end_time,
      }));
      await supabase.from("schedule_shift").insert(rows);
    }

    // Sobota — domyślnie sprzątanie od 8:00, godzinny domyślny czas trwania
    // (admin edytuje godziny ręcznie, np. na 7:30 jeśli w piątek jest liga —
    // zależność, której nie da się wyliczyć z góry, bo wydarzenia piątkowe
    // dodaje się osobno). Uczestników (2 osoby) przydziela generator
    // propozycji, uwzględniając kto może sprzątać i czyją dyspozycyjność.
    if (weekday === 6) {
      const startMinutes = timeToMinutes("08:00");
      const endTime = `${String(Math.floor((startMinutes + 60) / 60)).padStart(2, "0")}:${String((startMinutes + 60) % 60).padStart(2, "0")}`;
      await supabase.from("schedule_event").insert({
        schedule_day_id: dayRow.id,
        type: "sprzatanie",
        start_time: "08:00",
        end_time: endTime,
        label: "Sprzątanie",
      });
    }
  }
}

type Employee = {
  id: string;
  name: string;
  is_instructor: boolean;
  can_clean: boolean;
  min_hours_month: number;
  target_hours_month: number;
};

type ClassEntry = { weekday: number; start_time: string; end_time: string };

// Heurystyczny generator wersji roboczej: wypełnia tylko puste, otwarte
// zmiany — nie nadpisuje ręcznych przypisań. Rotuje pracowników wg
// aktualnie zsumowanych (efektywnych, czyli pomniejszonych o zajęcia
// instruktorów) godzin dążąc do celu/minimum, unika twardych blokad, a
// instruktorów z >1h nakładających się zajęć stawia w ostatniej kolejności
// (tylko gdy nie ma innego wyboru). Na koniec dobiera 2 uczestników do
// sobotniego sprzątania spośród osób, które mogą sprzątać.
export async function runDraftGenerator(scheduleMonthId: string): Promise<{ assignedCount: number; skippedCount: number }> {
  const supabase = createServerSupabaseClient();

  const { data: days } = await supabase
    .from("schedule_day")
    .select(
      "id, date, weekday, schedule_shift(id, slot_index, start_time, end_time, employee_id, is_closed), schedule_event(id, type, start_time, end_time, participant_employee_ids)"
    )
    .eq("schedule_month_id", scheduleMonthId);

  const { data: employees } = await supabase
    .from("employee")
    .select("id, name, is_instructor, can_clean, min_hours_month, target_hours_month")
    .eq("active", true);

  const { data: constraints } = await supabase
    .from("weekly_recurring_constraint")
    .select("employee_id, weekday, start_time, end_time, type");

  const { data: classSchedules } = await supabase
    .from("employee_class_schedule")
    .select("employee_id, weekday, start_time, end_time");

  const { data: submissions } = await supabase
    .from("availability_submission")
    .select("id, employee_id")
    .eq("schedule_month_id", scheduleMonthId);

  const submissionIds = (submissions ?? []).map((s) => s.id);
  let availabilityEntries: { availability_submission_id: string; date: string; whole_day: boolean; slot_index: number | null }[] = [];
  if (submissionIds.length > 0) {
    const { data } = await supabase
      .from("availability_entry")
      .select("availability_submission_id, date, whole_day, slot_index")
      .in("availability_submission_id", submissionIds);
    availabilityEntries = data ?? [];
  }
  const employeeIdBySubmission = new Map((submissions ?? []).map((s) => [s.id, s.employee_id]));

  const unavailability = new Map<string, Map<string, { wholeDay: boolean; slots: Set<number> }>>();
  for (const e of availabilityEntries) {
    const empId = employeeIdBySubmission.get(e.availability_submission_id);
    if (!empId) continue;
    if (!unavailability.has(empId)) unavailability.set(empId, new Map());
    const byDate = unavailability.get(empId)!;
    if (!byDate.has(e.date)) byDate.set(e.date, { wholeDay: false, slots: new Set() });
    const entry = byDate.get(e.date)!;
    if (e.whole_day) entry.wholeDay = true;
    else if (e.slot_index !== null) entry.slots.add(e.slot_index);
  }

  const hardUnavailableByEmployee = new Map<string, { weekday: number; start: string | null; end: string | null }[]>();
  const preferredByEmployee = new Map<string, { weekday: number; start: string | null; end: string | null }[]>();
  for (const c of constraints ?? []) {
    const target = c.type === "unavailable" ? hardUnavailableByEmployee : preferredByEmployee;
    if (!target.has(c.employee_id)) target.set(c.employee_id, []);
    target.get(c.employee_id)!.push({ weekday: c.weekday, start: c.start_time, end: c.end_time });
  }

  const classByEmployee = new Map<string, ClassEntry[]>();
  for (const c of classSchedules ?? []) {
    if (!classByEmployee.has(c.employee_id)) classByEmployee.set(c.employee_id, []);
    classByEmployee.get(c.employee_id)!.push({ weekday: c.weekday, start_time: c.start_time, end_time: c.end_time });
  }

  const hoursAssigned = new Map<string, number>((employees ?? []).map((e) => [e.id, 0]));
  const daysAssigned = new Map<string, Set<string>>((employees ?? []).map((e) => [e.id, new Set<string>()]));

  for (const day of days ?? []) {
    for (const shift of day.schedule_shift ?? []) {
      if (shift.employee_id) {
        const h = effectiveShiftHours(shift.start_time, shift.end_time, day.weekday, classByEmployee.get(shift.employee_id) ?? []);
        hoursAssigned.set(shift.employee_id, (hoursAssigned.get(shift.employee_id) ?? 0) + h);
        daysAssigned.get(shift.employee_id)?.add(day.date);
      }
    }
    for (const ev of day.schedule_event ?? []) {
      if (ev.end_time) {
        for (const empId of ev.participant_employee_ids ?? []) {
          const h = hoursBetween(ev.start_time ?? "00:00", ev.end_time);
          hoursAssigned.set(empId, (hoursAssigned.get(empId) ?? 0) + h);
        }
      }
    }
  }

  const updates: { id: string; employee_id: string }[] = [];
  const sortedDays = (days ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));

  for (const day of sortedDays) {
    const weekday = day.weekday;
    const shiftsForDay = (day.schedule_shift ?? []).slice().sort((a, b) => a.slot_index - b.slot_index);

    for (const shift of shiftsForDay) {
      if (shift.employee_id || shift.is_closed) continue;

      const candidates = (employees ?? []).filter((emp) => {
        const hardRules = hardUnavailableByEmployee.get(emp.id) ?? [];
        for (const r of hardRules) {
          if (r.weekday !== weekday) continue;
          if (!r.start || !r.end) return false;
          if (overlapMinutes(shift.start_time, shift.end_time, r.start, r.end) > 0) return false;
        }
        const byDate = unavailability.get(emp.id)?.get(day.date);
        if (byDate?.wholeDay) return false;
        if (byDate?.slots.has(shift.slot_index)) return false;
        return true;
      });

      if (candidates.length === 0) continue;

      const penalty = (emp: Employee): number => {
        let score = 0;
        const classes = classByEmployee.get(emp.id) ?? [];
        for (const c of classes) {
          if (c.weekday !== weekday) continue;
          if (overlapMinutes(shift.start_time, shift.end_time, c.start_time, c.end_time) > 60) {
            score += 1000;
          }
        }
        const preferred = preferredByEmployee.get(emp.id) ?? [];
        for (const p of preferred) {
          if (p.weekday !== weekday) continue;
          if (!p.start || !p.end || overlapMinutes(shift.start_time, shift.end_time, p.start, p.end) > 0) {
            score -= 50;
          }
        }
        const hrs = hoursAssigned.get(emp.id) ?? 0;
        score += hrs * 2;
        score += (daysAssigned.get(emp.id)?.size ?? 0) * 1;
        if (hrs < emp.min_hours_month) score -= 30;
        return score;
      };

      candidates.sort((a, b) => penalty(a) - penalty(b));
      const chosen = candidates[0];

      const h = effectiveShiftHours(shift.start_time, shift.end_time, weekday, classByEmployee.get(chosen.id) ?? []);
      hoursAssigned.set(chosen.id, (hoursAssigned.get(chosen.id) ?? 0) + h);
      if (!daysAssigned.has(chosen.id)) daysAssigned.set(chosen.id, new Set());
      daysAssigned.get(chosen.id)!.add(day.date);

      updates.push({ id: shift.id, employee_id: chosen.id });
    }
  }

  for (const u of updates) {
    await supabase.from("schedule_shift").update({ employee_id: u.employee_id }).eq("id", u.id);
  }

  // Sobotnie sprzątanie — dobierz 2 osoby spośród tych, które mogą sprzątać
  // (can_clean), nie są tego dnia całkowicie niedostępne, wg najniższych
  // dotychczasowych godzin (to samo rozłożenie co przy zmianach).
  const cleaningUpdates: { eventId: string; participantIds: string[] }[] = [];
  for (const day of sortedDays) {
    if (day.weekday !== 6) continue;
    for (const ev of day.schedule_event ?? []) {
      if (ev.type !== "sprzatanie") continue;
      const existingParticipants: string[] = ev.participant_employee_ids ?? [];
      if (existingParticipants.length >= 2) continue;

      const eligible = (employees ?? []).filter((emp) => {
        if (!emp.can_clean) return false;
        if (existingParticipants.includes(emp.id)) return false;
        const byDate = unavailability.get(emp.id)?.get(day.date);
        if (byDate?.wholeDay) return false;
        const hardRules = hardUnavailableByEmployee.get(emp.id) ?? [];
        for (const r of hardRules) {
          if (r.weekday === 6 && !r.start && !r.end) return false;
        }
        return true;
      });
      eligible.sort((a, b) => (hoursAssigned.get(a.id) ?? 0) - (hoursAssigned.get(b.id) ?? 0));

      const picked = [...existingParticipants];
      for (const emp of eligible) {
        if (picked.length >= 2) break;
        picked.push(emp.id);
        if (ev.end_time) {
          const h = hoursBetween(ev.start_time ?? "00:00", ev.end_time);
          hoursAssigned.set(emp.id, (hoursAssigned.get(emp.id) ?? 0) + h);
        }
      }

      if (picked.length > existingParticipants.length) {
        cleaningUpdates.push({ eventId: ev.id, participantIds: picked });
      }
    }
  }

  for (const u of cleaningUpdates) {
    await supabase.from("schedule_event").update({ participant_employee_ids: u.participantIds }).eq("id", u.eventId);
  }

  const totalOpenShifts = (days ?? []).reduce(
    (sum, d) => sum + (d.schedule_shift ?? []).filter((s) => !s.employee_id && !s.is_closed).length,
    0
  );

  return { assignedCount: updates.length + cleaningUpdates.length, skippedCount: totalOpenShifts - updates.length };
}
