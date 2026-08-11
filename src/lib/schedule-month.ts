import { createServerSupabaseClient } from "@/lib/supabase";

export type ScheduleMonth = {
  id: string;
  year: number;
  month: number;
  status: "draft" | "published";
};

// Zwraca istniejący wiersz schedule_month dla danego roku/miesiąca albo
// tworzy nowy (status 'draft') — dyspozycyjność musi mieć gdzie się zapisać,
// zanim admin w ogóle zacznie układać konkretny grafik na ten miesiąc.
export async function getOrCreateScheduleMonth(year: number, month: number): Promise<ScheduleMonth> {
  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("schedule_month")
    .select("id, year, month, status")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (existing) return existing as ScheduleMonth;

  const { data: created, error } = await supabase
    .from("schedule_month")
    .insert({ year, month })
    .select("id, year, month, status")
    .single();

  if (error || !created) {
    throw new Error("Nie udało się utworzyć miesiąca grafiku.");
  }
  return created as ScheduleMonth;
}

// Wersja tylko do odczytu — nie tworzy wiersza, jeśli nie istnieje (używana
// w widokach pracownika, żeby przeglądanie dowolnego miesiąca w przód nie
// tworzyło przypadkiem pustych draftów).
export async function findScheduleMonth(year: number, month: number): Promise<ScheduleMonth | null> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("schedule_month")
    .select("id, year, month, status")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  return (data as ScheduleMonth | null) ?? null;
}

export function currentMonth(from = new Date()): { year: number; month: number } {
  return { year: from.getFullYear(), month: from.getMonth() + 1 };
}

export function nextMonth(from = new Date()): { year: number; month: number } {
  const year = from.getMonth() === 11 ? from.getFullYear() + 1 : from.getFullYear();
  const month = ((from.getMonth() + 1) % 12) + 1;
  return { year, month };
}

export const MONTH_LABELS = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
] as const;

export function monthLabel(month: number): string {
  return MONTH_LABELS[month - 1] ?? "?";
}

export function daysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Klucz tygodnia (data poniedziałku) dla danego dnia — tydzień liczony od
// poniedziałku, zgodnie z konwencją całej aplikacji.
export function mondayOfWeek(dateKey: string): string {
  const date = new Date(dateKey + "T00:00:00");
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toDateKey(date);
}
