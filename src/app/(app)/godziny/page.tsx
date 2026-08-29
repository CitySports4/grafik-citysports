import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { currentMonth, monthLabel, daysInMonth, toDateKey } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { formatHm } from "@/lib/time";
import { isWithinEditWindow } from "@/lib/time-entry-window";
import { Card } from "@/components/Card";
import { TimeEntryList } from "./TimeEntryList";

export default async function GodzinyPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const employee = await requireEmployee();
  const params = await searchParams;
  const fallback = currentMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;

  const supabase = createServerSupabaseClient();
  const dates = daysInMonth(year, month).map(toDateKey);

  const [{ data: entries }, { data: shiftRows }] = await Promise.all([
    supabase
      .from("time_entry")
      .select("id, date, actual_start, actual_end, note")
      .eq("employee_id", employee.id)
      .in("date", dates),
    supabase
      .from("schedule_shift")
      .select("start_time, end_time, schedule_day!inner(date, schedule_month!inner(status))")
      .eq("employee_id", employee.id)
      .eq("schedule_day.schedule_month.status", "published")
      .in("schedule_day.date", dates),
  ]);

  // Jeden dzień może mieć kilka wpisów (podzielona zmiana z przerwą) — stąd
  // mapa na LISTĘ, nie na pojedynczy wiersz.
  const entriesByDate = new Map<string, { id: string; actual_start: string | null; actual_end: string | null; note: string | null }[]>();
  for (const e of entries ?? []) {
    if (!entriesByDate.has(e.date)) entriesByDate.set(e.date, []);
    entriesByDate.get(e.date)!.push(e);
  }
  type ShiftRow = { start_time: string; end_time: string; schedule_day: { date: string } };
  const scheduledByDate = new Map<string, { start_time: string; end_time: string }[]>();
  for (const s of (shiftRows ?? []) as unknown as ShiftRow[]) {
    const date = s.schedule_day.date;
    if (!scheduledByDate.has(date)) scheduledByDate.set(date, []);
    scheduledByDate.get(date)!.push({ start_time: s.start_time, end_time: s.end_time });
  }

  // Tylko dni, które mają zaplanowaną zmianę lub już wpisane godziny —
  // puste dni w kalendarzu (bez pracy) nie zaśmiecają widoku historii.
  const relevantDates = dates.filter((d) => scheduledByDate.has(d) || entriesByDate.has(d));

  const prevLink = month === 1 ? `?year=${year - 1}&month=12` : `?year=${year}&month=${month - 1}`;
  const nextLink = month === 12 ? `?year=${year + 1}&month=1` : `?year=${year}&month=${month + 1}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Godziny pracy</h1>
        <p className="text-sm text-zinc-500">
          Wpisz rzeczywistą godzinę rozpoczęcia i zakończenia pracy. Można edytować w dowolnym
          momencie, ale tylko do 7 dni po danym dniu — starsze wpisy widzisz tu w całości, ale już
          tylko do odczytu (poprawki po tym czasie robi admin).
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Link href={prevLink} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
          ← Poprzedni
        </Link>
        <span className="text-sm font-bold capitalize text-zinc-900">
          {monthLabel(month)} {year}
        </span>
        <Link href={nextLink} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
          Następny →
        </Link>
      </div>

      <Card>
        <TimeEntryList
          days={relevantDates.map((dateKey) => {
            const weekday = new Date(dateKey + "T00:00:00").getDay();
            return {
              dateKey,
              label: `${weekdayLabel(weekday)}, ${new Date(dateKey + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}`,
              scheduled: (scheduledByDate.get(dateKey) ?? [])
                .map((s) => `${formatHm(s.start_time)}–${formatHm(s.end_time)}`)
                .join(", "),
              scheduledRaw: scheduledByDate.get(dateKey) ?? [],
              editable: isWithinEditWindow(dateKey),
              entries: (entriesByDate.get(dateKey) ?? []).map((e) => ({
                id: e.id,
                actualStart: e.actual_start ?? "",
                actualEnd: e.actual_end ?? "",
                note: e.note ?? "",
              })),
            };
          })}
        />
        {relevantDates.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-400">Brak zmian ani wpisów w tym miesiącu.</p>
        )}
      </Card>
    </div>
  );
}
