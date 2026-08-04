import { createServerSupabaseClient } from "@/lib/supabase";
import { dailyEffectiveHours, effectiveShiftHours, hoursBetween, overlapMinutes, timeToMinutes } from "@/lib/time";
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
// zmiany — nie nadpisuje ręcznych przypisań.
//
// Zasada nadrzędna: jedna osoba = jedna zmiana danego dnia (stąd w ogóle są
// 3 zmiany, żeby dzień rozkładał się na 3 różne osoby, a wieczorem 14–21 i
// 17–22 nakładają się właśnie po to, by w godzinach 17–21 były 2 różne
// osoby). Jedyny wyjątek: pracownik z ustawioną cykliczną preferencją
// "cały dzień, niedziela" może pokryć więcej niż jedną zmianę w niedzielę,
// gdy jest tego dnia liga open (typowo szef klubu).
//
// Kolejność wyboru: najpierw dobija każdego do JEGO minimum (im większy
// niedobór, tym wyższy priorytet), potem wyrównuje względem CELU
// (proporcjonalnie, nie w godzinach absolutnych — inaczej ktoś z celem
// 160h i ktoś z celem 80h nie są porównywalni). Instruktorów z >1h
// nakładających się zajęć stawia w ostatniej kolejności (tylko gdy nie ma
// innego wyboru). Na koniec dobiera 2 uczestników do sobotniego
// sprzątania spośród osób, które mogą sprzątać.
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
  const sundayAllDayException = new Set<string>();
  for (const c of constraints ?? []) {
    const target = c.type === "unavailable" ? hardUnavailableByEmployee : preferredByEmployee;
    if (!target.has(c.employee_id)) target.set(c.employee_id, []);
    target.get(c.employee_id)!.push({ weekday: c.weekday, start: c.start_time, end: c.end_time });
    if (c.type === "preferred" && c.weekday === 0 && !c.start_time && !c.end_time) {
      sundayAllDayException.add(c.employee_id);
    }
  }

  const classByEmployee = new Map<string, ClassEntry[]>();
  for (const c of classSchedules ?? []) {
    if (!classByEmployee.has(c.employee_id)) classByEmployee.set(c.employee_id, []);
    classByEmployee.get(c.employee_id)!.push({ weekday: c.weekday, start_time: c.start_time, end_time: c.end_time });
  }

  const hoursAssigned = new Map<string, number>((employees ?? []).map((e) => [e.id, 0]));
  const daysAssigned = new Map<string, Set<string>>((employees ?? []).map((e) => [e.id, new Set<string>()]));
  const usedTodayByDate = new Map<string, Set<string>>();

  function markUsedToday(date: string, employeeId: string) {
    if (!usedTodayByDate.has(date)) usedTodayByDate.set(date, new Set());
    usedTodayByDate.get(date)!.add(employeeId);
  }

  // Zsumuj istniejące (ręczne) przypisania — z połączeniem nakładających
  // się przedziałów, żeby ewentualne wcześniejsze błędne dublowanie tej
  // samej osoby na nakładających się zmianach nie zawyżało jej godzin ani
  // nie psuło dalszego wyrównywania.
  const shiftsByEmployeeDate = new Map<string, Map<string, { start_time: string; end_time: string }[]>>();
  const weekdayByDate = new Map<string, number>();
  const ligaOpenDates = new Set<string>();
  for (const day of days ?? []) {
    weekdayByDate.set(day.date, day.weekday);
    for (const shift of day.schedule_shift ?? []) {
      if (!shift.employee_id) continue;
      markUsedToday(day.date, shift.employee_id);
      if (!shiftsByEmployeeDate.has(shift.employee_id)) shiftsByEmployeeDate.set(shift.employee_id, new Map());
      const byDate = shiftsByEmployeeDate.get(shift.employee_id)!;
      if (!byDate.has(day.date)) byDate.set(day.date, []);
      byDate.get(day.date)!.push({ start_time: shift.start_time, end_time: shift.end_time });
    }
    for (const ev of day.schedule_event ?? []) {
      if (ev.type === "liga_open") ligaOpenDates.add(day.date);
      if (ev.end_time) {
        for (const empId of ev.participant_employee_ids ?? []) {
          const h = hoursBetween(ev.start_time ?? "00:00", ev.end_time);
          hoursAssigned.set(empId, (hoursAssigned.get(empId) ?? 0) + h);
        }
      }
    }
  }
  for (const [empId, byDate] of shiftsByEmployeeDate) {
    for (const [date, shiftsList] of byDate) {
      const weekday = weekdayByDate.get(date) ?? 0;
      const h = dailyEffectiveHours(shiftsList, weekday, classByEmployee.get(empId) ?? []);
      hoursAssigned.set(empId, (hoursAssigned.get(empId) ?? 0) + h);
      daysAssigned.get(empId)?.add(date);
    }
  }

  const updates: { id: string; employee_id: string }[] = [];
  const sortedDays = (days ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));

  for (const day of sortedDays) {
    const weekday = day.weekday;
    const shiftsForDay = (day.schedule_shift ?? []).slice().sort((a, b) => a.slot_index - b.slot_index);
    const isSundayLeagueDay = weekday === 0 && ligaOpenDates.has(day.date);

    for (const shift of shiftsForDay) {
      if (shift.employee_id || shift.is_closed) continue;

      const candidates = (employees ?? []).filter((emp) => {
        const alreadyUsedToday = usedTodayByDate.get(day.date)?.has(emp.id) ?? false;
        if (alreadyUsedToday && !(isSundayLeagueDay && sundayAllDayException.has(emp.id))) return false;

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
        // Priorytet nr 1: kto najbardziej brakuje do WŁASNEGO minimum.
        const deficitToMin = Math.max(0, emp.min_hours_month - hrs);
        score -= deficitToMin * 10;
        // Priorytet nr 2: wyrównanie względem WŁASNEGO celu, proporcjonalnie
        // (inaczej cel 160h i cel 80h nie są porównywalne w godzinach).
        const targetRatio = emp.target_hours_month > 0 ? hrs / emp.target_hours_month : hrs > 0 ? 1 : 0;
        score += targetRatio * 60;
        score += (daysAssigned.get(emp.id)?.size ?? 0) * 1;
        return score;
      };

      candidates.sort((a, b) => penalty(a) - penalty(b));
      const chosen = candidates[0];

      const h = effectiveShiftHours(shift.start_time, shift.end_time, weekday, classByEmployee.get(chosen.id) ?? []);
      hoursAssigned.set(chosen.id, (hoursAssigned.get(chosen.id) ?? 0) + h);
      if (!daysAssigned.has(chosen.id)) daysAssigned.set(chosen.id, new Set());
      daysAssigned.get(chosen.id)!.add(day.date);
      markUsedToday(day.date, chosen.id);

      updates.push({ id: shift.id, employee_id: chosen.id });
    }
  }

  for (const u of updates) {
    await supabase.from("schedule_shift").update({ employee_id: u.employee_id }).eq("id", u.id);
  }

  // Sobotnie sprzątanie — dobierz 2 osoby spośród tych, które mogą sprzątać
  // (can_clean), nie są tego dnia całkowicie niedostępne, wg tych samych
  // priorytetów (niedobór do minimum, potem proporcja do celu).
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
      eligible.sort((a, b) => {
        const aHrs = hoursAssigned.get(a.id) ?? 0;
        const bHrs = hoursAssigned.get(b.id) ?? 0;
        const aDeficit = Math.max(0, a.min_hours_month - aHrs);
        const bDeficit = Math.max(0, b.min_hours_month - bHrs);
        if (aDeficit !== bDeficit) return bDeficit - aDeficit;
        const aRatio = a.target_hours_month > 0 ? aHrs / a.target_hours_month : 0;
        const bRatio = b.target_hours_month > 0 ? bHrs / b.target_hours_month : 0;
        return aRatio - bRatio;
      });

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
