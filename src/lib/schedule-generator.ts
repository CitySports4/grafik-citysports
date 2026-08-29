import { createServerSupabaseClient } from "@/lib/supabase";
import { timeToMinutes } from "@/lib/time";
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

export type Employee = {
  id: string;
  name: string;
  is_instructor: boolean;
  min_hours_month: number;
  target_hours_month: number;
};

// Ile dni z rzędu PRZED danym dniem (bez przerwy) dana osoba już
// przepracowała — `workedDates` to zwykle wynik `workedDatesForStreak`
// niżej, czyli decyzje z tego uruchomienia PLUS ogon opublikowanego grafiku
// sprzed początku miesiąca, żeby seria licząca się od końca sierpnia nie
// zerowała się sztucznie 1 września. Używane, żeby nikt nie pracował więcej
// niż 7 dni pod rząd.
export function consecutiveDaysBefore(dateKey: string, workedDates: Set<string>): number {
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
export const MIN_BREAK_MINUTES = 360; // 6h

// Odpoczynek MIĘDZY dniami — kto zamykał wczoraj, nie powinien dziś otwierać
// bez realnej przerwy. 11h to punkt odniesienia z Kodeksu pracy; jesteśmy na
// umowach zlecenie więc to nie twardy prawny wymóg. Eksportowane, żeby był
// jeden punkt prawdy dla tej liczby — obecnie NIE jest jeszcze egzekwowane
// przez generator AI (schedule-generator-ai.ts), tylko przez ten sam moduł
// dokumentowane jako reguła do doszlifowania.
export const MIN_DAILY_REST_MINUTES = 660; // 11h

export function tooCloseForDoubleShift(
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
