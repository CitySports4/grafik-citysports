import { createServerSupabaseClient } from "@/lib/supabase";
import { effectiveShiftHours, hoursBetween, minutesToTime, overlapMinutes, timeToMinutes } from "@/lib/time";
import { daysInMonth, mondayOfWeek, toDateKey } from "@/lib/schedule-month";
import { applyPlannedAbsences } from "@/lib/unavailability";

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
  min_hours_month: number;
  target_hours_month: number;
};

type ClassEntry = { weekday: number; start_time: string; end_time: string };

// Ile dni z rzędu PRZED danym dniem (bez przerwy, wyłącznie w obrębie tego
// samego miesiąca — nie widzimy poprzedniego) dana osoba już przepracowała.
// Używane, żeby nikt nie pracował więcej niż 7 dni pod rząd.
function consecutiveDaysBefore(dateKey: string, workedDates: Set<string>): number {
  let count = 0;
  const cursor = new Date(dateKey + "T00:00:00");
  while (true) {
    cursor.setDate(cursor.getDate() - 1);
    const key = toDateKey(cursor);
    if (!workedDates.has(key)) break;
    count++;
  }
  return count;
}

// Gdy ta sama osoba dostaje 2. zmianę tego samego dnia (pt/sob/nd — patrz
// blockDoubleShift), między zmianami musi być realna przerwa — inaczej dwie
// stykające się (lub blisko siebie) zmiany łączą się w wielogodzinny
// maraton bez odpoczynku. Legalny przypadek "rano + wieczór" (np.
// Krzysztof 2x w niedzielę) ma tę przerwę z natury; blokujemy sytuacje bez
// niej lub z przerwą krótszą niż realny odpoczynek.
const MIN_BREAK_MINUTES = 360; // 6h

// Patrz komentarz przy `penalty()` — im bardziej ujemne, tym mocniej
// generator woli zostawić kogoś na jego obecnej zmianie zamiast przełożyć
// dla drobnej poprawy wyrównania. -40 mniej więcej odpowiada "1 punktowi
// preferencji" (-50) — czyli realna preferencja/niedostępność wciąż
// wygrywa, ale sama chęć wyrównania godzin musi być wyraźna, nie kosmetyczna.
const STICKY_BONUS = -40;
function tooCloseForDoubleShift(
  a: { start_time: string; end_time: string },
  b: { start_time: string; end_time: string }
): boolean {
  const aS = timeToMinutes(a.start_time);
  const aE = timeToMinutes(a.end_time);
  const bS = timeToMinutes(b.start_time);
  const bE = timeToMinutes(b.end_time);
  if (aS < bE && bS < aE) return true; // nakładają się
  const gap = aS >= bE ? aS - bE : bS - aE;
  return gap < MIN_BREAK_MINUTES;
}

// Heurystyczny generator wersji roboczej: PEŁNA reoptymalizacja miesiąca —
// każde uruchomienie może przełożyć dowolną zmianę (również już przypisaną
// ręcznie albo przez poprzednie uruchomienie), jeśli znajdzie dla niej
// lepszy układ. Żeby to nie oznaczało "przepisz wszystko od zera" przy
// każdym kliknięciu: (1) obecny przydział ma bonus "lepkości" w funkcji kary
// (patrz `STICKY_BONUS` niżej), więc zostaje, dopóki ktoś inny nie jest
// WYRAŹNIE lepszy (większy niedobór godzin, brak konfliktu) albo dopóki sam
// nie łamie twardej reguły (np. przerwy między zmianami); (2) na końcu do
// bazy zapisywane są TYLKO zmiany, które faktycznie się różnią od stanu
// sprzed uruchomienia — reszta zostaje nietknięta, więc admin widzi realny,
// mały diff, a nie przetasowanie całego miesiąca.
//
// Zasada nadrzędna: jedna osoba = jedna zmiana danego dnia, ALE tylko
// pon-czw (stąd w ogóle są tam 3 zmiany, żeby dzień rozkładał się na 3 różne
// osoby, a wieczorem 14–21 i 17–22 nakładają się właśnie po to, by w
// godzinach 17–21 były 2 różne osoby). W piątek/sobotę/niedzielę ta sama
// osoba MOŻE pokryć więcej niż jedną zmianę (np. Krzysztof 2x w niedzielę) —
// jedyne ograniczenie to realna dostępność. Osobny wyjątek dla pon-czw: gdy
// na cały dzień dostępne są tylko 2 osoby, dzień dzielony jest na pół (patrz
// blok "split-shift" niżej) i jedna z tych 2 osób legalnie dostaje 2 zmiany.
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
    .select("id, name, is_instructor, min_hours_month, target_hours_month")
    .eq("active", true);

  // Kto może sprzątać — zjednocone ze strefami sprzątania: kompetentny do
  // sobotniego sprzątania, jeśli ma przypisaną choć jedną strefę (stary
  // can_clean nie jest już źródłem prawdy, patrz migracja 0009).
  const { data: cleaningZoneRows } = await supabase.from("employee_cleaning_zone").select("employee_id");
  const canCleanByEmployee = new Set((cleaningZoneRows ?? []).map((r) => r.employee_id));

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

  // Zaplanowane nieobecności/urlopy (osobny mechanizm od comiesięcznej
  // dyspozycyjności) — nanieś jako "cały dzień niedostępny" na tę samą mapę.
  const monthDates = (days ?? []).map((d) => d.date).sort();
  if (monthDates.length > 0) {
    const { data: plannedAbsences } = await supabase
      .from("planned_absence")
      .select("employee_id, start_date, end_date")
      .lte("start_date", monthDates[monthDates.length - 1])
      .gte("end_date", monthDates[0]);
    applyPlannedAbsences(unavailability, plannedAbsences ?? []);
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
  const usedTodayByDate = new Map<string, Set<string>>();

  function markUsedToday(date: string, employeeId: string) {
    if (!usedTodayByDate.has(date)) usedTodayByDate.set(date, new Set());
    usedTodayByDate.get(date)!.add(employeeId);
  }

  // UWAGA: przy pełnej reoptymalizacji NIE zasilamy hoursAssigned/
  // daysAssigned/usedTodayByDate z obecnych przypisań (jak dawniej) — te
  // liczniki budują się WYŁĄCZNIE z decyzji podjętych w tej turze, w miarę
  // przetwarzania dni chronologicznie niżej. Dzięki temu są spójne z
  // faktycznie liczonym (nowym) grafikiem, a nie z tym, co było przed
  // uruchomieniem. `originalAssignmentByShiftId` zapamiętuje stan SPRZED
  // uruchomienia wyłącznie po to, żeby na końcu odfiltrować zapis do bazy
  // do realnych zmian (patrz `changedUpdates` niżej).
  const shiftsByEmployeeDate = new Map<string, Map<string, { start_time: string; end_time: string }[]>>();
  const weekdayByDate = new Map<string, number>();
  const originalAssignmentByShiftId = new Map<string, { employee_id: string | null; start_time: string; end_time: string }>();
  for (const day of days ?? []) {
    weekdayByDate.set(day.date, day.weekday);
    for (const shift of day.schedule_shift ?? []) {
      originalAssignmentByShiftId.set(shift.id, {
        employee_id: shift.employee_id,
        start_time: shift.start_time,
        end_time: shift.end_time,
      });
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

  const updates: { id: string; employee_id: string; start_time?: string; end_time?: string }[] = [];
  const sortedDays = (days ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));

  // Grupowanie dni miesiąca w tygodnie (poniedziałek-niedziela) — do
  // pilnowania, żeby każdy miał choć 1 dzień wolny w tygodniu. Dla
  // niepełnego tygodnia na początku/końcu miesiąca (np. wrzesień 2026
  // zaczyna się we wtorek) liczymy tylko dni faktycznie obecne w tym
  // miesiącu — i tak wymuszamy wśród nich min. 1 dzień wolny.
  const daysInWeekBucket = new Map<string, Set<string>>();
  for (const day of sortedDays) {
    const wk = mondayOfWeek(day.date);
    if (!daysInWeekBucket.has(wk)) daysInWeekBucket.set(wk, new Set());
    daysInWeekBucket.get(wk)!.add(day.date);
  }

  for (const day of sortedDays) {
    const weekday = day.weekday;
    // "Jedna osoba = jedna zmiana dziennie" obowiązuje tylko pon-czw (gdzie
    // 3 zmiany mają rozkładać dzień na 3 różne osoby). W piątek/sobotę/
    // niedzielę dopuszczamy, żeby ta sama osoba wzięła więcej niż jedną
    // zmianę (np. Krzysztof 2x w niedzielę) — jedyne ograniczenie to
    // faktyczna dostępność.
    const blockDoubleShift = weekday >= 1 && weekday <= 4;
    const weekKey = mondayOfWeek(day.date);
    const weekCapacity = Math.max(1, (daysInWeekBucket.get(weekKey)?.size ?? 1) - 1);

    const eligibleFor = (shift: { start_time: string; end_time: string; slot_index: number }) =>
      (employees ?? []).filter((emp) => {
        const alreadyUsedToday = usedTodayByDate.get(day.date)?.has(emp.id) ?? false;
        if (alreadyUsedToday && blockDoubleShift) return false;
        if (alreadyUsedToday && !blockDoubleShift) {
          // Pt/sob/nd: druga zmiana tego dnia dozwolona, ale tylko z realną
          // przerwą — inaczej dwie stykające się zmiany złożą się w jeden
          // wielogodzinny maraton bez przerwy.
          const todaysShifts = shiftsByEmployeeDate.get(emp.id)?.get(day.date) ?? [];
          if (todaysShifts.some((s) => tooCloseForDoubleShift(s, shift))) return false;
        }

        // Każdy ma mieć choć 1 dzień wolny w tygodniu — jeśli już pracował
        // tyle dni w tym tygodniu, ile wolno (tydzień - 1), dziś nie może
        // dostać kolejnej zmiany.
        const workedThisWeek = [...(daysAssigned.get(emp.id) ?? [])].filter((d) => mondayOfWeek(d) === weekKey).length;
        if (workedThisWeek >= weekCapacity) return false;

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

    const hasClassConflict = (emp: Employee, shift: { start_time: string; end_time: string }) => {
      const classes = classByEmployee.get(emp.id) ?? [];
      return classes.some((c) => c.weekday === weekday && overlapMinutes(shift.start_time, shift.end_time, c.start_time, c.end_time) > 60);
    };

    // Zmiany dnia przetwarzamy zaczynając od NAJBARDZIEJ "trudnej" (tej, na
    // którą najwięcej dostępnych osób ma konflikt z zajęciami) — inaczej
    // "łatwe" zmiany zabierają wszystkich elastycznych ludzi jako pierwsze
    // (bo mają dla nich najniższą karę), a instruktor z konfliktem zostaje
    // "ostatnim wyborem" wpychanym właśnie na tę trudną zmianę, mimo że jest
    // najlepiej dopasowany do INNEJ zmiany tego samego dnia.
    // Pełna reoptymalizacja: bierzemy WSZYSTKIE otwarte (nie zamknięte)
    // zmiany dnia, niezależnie od tego, czy mają już kogoś przypisanego —
    // stąd brak `!s.employee_id` w filtrze. Kto faktycznie zostaje na
    // miejscu, a kto się zmienia, decyduje bonus "lepkości" w `penalty()`
    // niżej i finalne odfiltrowanie zapisu do realnego diffu.
    const openShiftsForDay = (day.schedule_shift ?? []).filter((s) => !s.is_closed);

    // Pon-czw, dzień z 3 pustymi zmianami, gdzie na CAŁY dzień dostępne są
    // tylko 2 osoby: normalnie zabrakłoby trzeciej osoby, więc dzielimy
    // dzień na pół — jedna osoba robi zmianę z przerwą (otwarcie + domknięcie
    // na koniec), druga jedną ciągłą w środku — tak, żeby w oknie, gdzie
    // standardowo nakładają się zmiana 2 i 3 (np. 17-21), obie były na
    // miejscu, a łączne godziny wyszły równe (patrz obliczenie `handoff`
    // poniżej: rozwiązanie równania łączna(A) = łączna(B)).
    if (weekday >= 1 && weekday <= 4 && openShiftsForDay.length === 3) {
      const sortedShifts = openShiftsForDay
        .slice()
        .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
      const [first, second, third] = sortedShifts;
      const open = timeToMinutes(first.start_time);
      const close = Math.max(
        timeToMinutes(first.end_time),
        timeToMinutes(second.end_time),
        timeToMinutes(third.end_time)
      );
      const overlapStart = Math.max(timeToMinutes(second.start_time), timeToMinutes(third.start_time));
      const overlapEnd = Math.min(timeToMinutes(second.end_time), timeToMinutes(third.end_time));

      const fullyEligible =
        overlapEnd > overlapStart
          ? (employees ?? []).filter((emp) => sortedShifts.every((s) => eligibleFor(s).some((e) => e.id === emp.id)))
          : [];

      if (fullyEligible.length === 2) {
        let handoff = Math.round((open + overlapEnd + overlapStart - close) / 2 / 15) * 15;
        handoff = Math.max(open + 15, Math.min(overlapStart - 15, handoff));

        if (handoff > open && handoff < overlapStart) {
          const conflictMinutes = (emp: Employee, segStart: number, segEnd: number) => {
            const classes = classByEmployee.get(emp.id) ?? [];
            return classes
              .filter((c) => c.weekday === weekday)
              .reduce((sum, c) => sum + overlapMinutes(minutesToTime(segStart), minutesToTime(segEnd), c.start_time, c.end_time), 0);
          };

          const [empX, empY] = fullyEligible;
          // Sprawdź obie możliwe role (kto robi "z przerwą", kto "ciągłą") i
          // wybierz tę z mniejszym konfliktem z zajęciami instruktora.
          const costXsplit =
            conflictMinutes(empX, open, handoff) + conflictMinutes(empX, overlapStart, close) + conflictMinutes(empY, handoff, overlapEnd);
          const costYsplit =
            conflictMinutes(empY, open, handoff) + conflictMinutes(empY, overlapStart, close) + conflictMinutes(empX, handoff, overlapEnd);
          const [splitEmp, midEmp] = costXsplit <= costYsplit ? [empX, empY] : [empY, empX];

          const segments = [
            { shift: first, start: open, end: handoff, employee: splitEmp },
            { shift: second, start: handoff, end: overlapEnd, employee: midEmp },
            { shift: third, start: overlapStart, end: close, employee: splitEmp },
          ];

          for (const seg of segments) {
            const startTime = minutesToTime(seg.start);
            const endTime = minutesToTime(seg.end);
            const h = effectiveShiftHours(startTime, endTime, weekday, classByEmployee.get(seg.employee.id) ?? []);
            hoursAssigned.set(seg.employee.id, (hoursAssigned.get(seg.employee.id) ?? 0) + h);
            updates.push({ id: seg.shift.id, employee_id: seg.employee.id, start_time: startTime, end_time: endTime });
          }
          for (const emp of [splitEmp, midEmp]) {
            if (!daysAssigned.has(emp.id)) daysAssigned.set(emp.id, new Set());
            daysAssigned.get(emp.id)!.add(day.date);
            markUsedToday(day.date, emp.id);
          }
          continue;
        }
      }
    }

    const penalty = (emp: Employee, shift: { id: string; start_time: string; end_time: string }): number => {
      let score = 0;
      if (hasClassConflict(emp, shift)) score += 1000;
      // "Lepkość": kto już miał tę zmianę PRZED tym uruchomieniem zostaje na
      // niej, dopóki różnica z kimś innym (niedobór godzin, konflikt zajęć)
      // nie jest wyraźnie większa niż ten bonus — bez tego pełna
      // reoptymalizacja przetasowywałaby też zmiany, które były już dobrze
      // ułożone, tylko dla marginalnych zysków w wyrównaniu.
      if (originalAssignmentByShiftId.get(shift.id)?.employee_id === emp.id) score += STICKY_BONUS;
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
      // Im dłuższa passa dni z rzędu bez przerwy, tym mniej chętnie
      // dokładamy kolejny dzień — nawet zanim trafi w twardy limit 7 dni
      // (patrz pętla niżej), niech ktoś świeższy ma pierwszeństwo.
      score += consecutiveDaysBefore(day.date, daysAssigned.get(emp.id) ?? new Set()) * 5;
      return score;
    };

    // Zamiast przetwarzać zmiany w ustalonej kolejności (co pozwalało, żeby
    // dwie osoby z konfliktem na zmiany 2/3 (np. Krzysztof i Justyna) obie
    // "przegrały" walkę o poranną zmianę, bo trafiały tam dopiero na końcu,
    // z resztek), przy każdym kroku wybieramy zmianę o NAJWIĘKSZYM "żalu" —
    // czyli tę, gdzie różnica między najlepszym a drugim kandydatem jest
    // największa. Dzięki temu silna, jednoznaczna preferencja (jak "Krzysztof
    // = poranki") zostaje przypieczętowana najpierw, zanim zniknie w
    // przetasowaniu przy przydzielaniu trudniejszych zmian.
    const remainingShifts = openShiftsForDay.slice();
    while (remainingShifts.length > 0) {
      let bestIndex = -1;
      let bestRegret = -Infinity;
      let bestCandidates: Employee[] = [];

      for (let i = 0; i < remainingShifts.length; i++) {
        const shift = remainingShifts[i];
        const eligible = eligibleFor(shift);
        // Nikt nie powinien pracować więcej niż 7 dni z rzędu bez przerwy —
        // ale to ma się zdarzać jak najrzadziej, nie blokować grafiku
        // całkowicie: jeśli po odrzuceniu takich osób nie zostaje NIKT
        // (naprawdę nie ma wyboru), cofamy się do pełnej listy.
        const rested = eligible.filter((emp) => consecutiveDaysBefore(day.date, daysAssigned.get(emp.id) ?? new Set()) < 7);
        const candidates = (rested.length > 0 ? rested : eligible).slice().sort((a, b) => penalty(a, shift) - penalty(b, shift));
        if (candidates.length === 0) continue;
        const regret = candidates.length >= 2 ? penalty(candidates[1], shift) - penalty(candidates[0], shift) : Infinity;
        if (regret > bestRegret) {
          bestRegret = regret;
          bestIndex = i;
          bestCandidates = candidates;
        }
      }

      if (bestIndex === -1) break;

      const shift = remainingShifts[bestIndex];
      const chosen = bestCandidates[0];

      const h = effectiveShiftHours(shift.start_time, shift.end_time, weekday, classByEmployee.get(chosen.id) ?? []);
      hoursAssigned.set(chosen.id, (hoursAssigned.get(chosen.id) ?? 0) + h);
      if (!daysAssigned.has(chosen.id)) daysAssigned.set(chosen.id, new Set());
      daysAssigned.get(chosen.id)!.add(day.date);
      markUsedToday(day.date, chosen.id);
      if (!shiftsByEmployeeDate.has(chosen.id)) shiftsByEmployeeDate.set(chosen.id, new Map());
      const chosenByDate = shiftsByEmployeeDate.get(chosen.id)!;
      if (!chosenByDate.has(day.date)) chosenByDate.set(day.date, []);
      chosenByDate.get(day.date)!.push({ start_time: shift.start_time, end_time: shift.end_time });

      updates.push({ id: shift.id, employee_id: chosen.id });
      remainingShifts.splice(bestIndex, 1);
    }
  }

  // Zapisujemy do bazy TYLKO to, co się faktycznie zmieniło względem stanu
  // sprzed uruchomienia — `updates` zawiera teraz wpis dla KAŻDEJ otwartej
  // zmiany miesiąca (bo pełna reoptymalizacja rozważa je wszystkie), ale
  // większość z nich to po prostu potwierdzenie "zostaje jak było" dzięki
  // bonusowi lepkości. Bez tego filtra każde kliknięcie robiłoby zapis do
  // każdej zmiany w miesiącu, nawet gdy nic się nie zmieniło.
  const changedUpdates = updates.filter((u) => {
    const original = originalAssignmentByShiftId.get(u.id);
    if (!original) return true;
    if (original.employee_id !== u.employee_id) return true;
    if (u.start_time && u.start_time !== original.start_time) return true;
    if (u.end_time && u.end_time !== original.end_time) return true;
    return false;
  });

  for (const u of changedUpdates) {
    const patch: { employee_id: string; start_time?: string; end_time?: string } = { employee_id: u.employee_id };
    if (u.start_time) patch.start_time = u.start_time;
    if (u.end_time) patch.end_time = u.end_time;
    await supabase.from("schedule_shift").update(patch).eq("id", u.id);
  }

  // Sobotnie sprzątanie — dobierz 2 osoby spośród tych, które mają
  // przypisaną choć jedną strefę sprzątania, nie są tego dnia całkowicie
  // niedostępne, wg tych samych priorytetów (niedobór do minimum, potem
  // proporcja do celu).
  const cleaningUpdates: { eventId: string; participantIds: string[] }[] = [];
  for (const day of sortedDays) {
    if (day.weekday !== 6) continue;
    for (const ev of day.schedule_event ?? []) {
      if (ev.type !== "sprzatanie") continue;
      const existingParticipants: string[] = ev.participant_employee_ids ?? [];
      if (existingParticipants.length >= 2) continue;

      const eligible = (employees ?? []).filter((emp) => {
        if (!canCleanByEmployee.has(emp.id)) return false;
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

  // `assignedCount`/`skippedCount` opisują to, co admin faktycznie zobaczy w
  // grafiku po zapisie: ile zmian (w tym sprzątania) się zmieniło i ile
  // PIERWOTNIE pustych zmian mimo wszystko zostało bez obsady (bo nikt nie
  // był dostępny/kompetentny) — a NIE ile zmian generator "rozważył", bo przy
  // pełnej reoptymalizacji to byłoby praktycznie wszystkie zmiany miesiąca.
  const originallyEmptyIds = new Set(
    (days ?? []).flatMap((d) => (d.schedule_shift ?? []).filter((s) => !s.employee_id && !s.is_closed).map((s) => s.id))
  );
  const filledFromEmpty = changedUpdates.filter((u) => originallyEmptyIds.has(u.id)).length;

  return {
    assignedCount: changedUpdates.length + cleaningUpdates.length,
    skippedCount: originallyEmptyIds.size - filledFromEmpty,
  };
}
