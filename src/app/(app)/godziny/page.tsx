import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { toDateKey } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { formatHm } from "@/lib/time";
import { Card } from "@/components/Card";
import { TimeEntryList } from "./TimeEntryList";

const WINDOW_DAYS = 7;

export default async function GodzinyPage() {
  const employee = await requireEmployee();
  const supabase = createServerSupabaseClient();

  // Ostatnie 7 dni (dziś + 6 wstecz) — dokładnie okno, w którym wolno
  // wpisywać/edytować godziny.
  const days: { dateKey: string; weekday: number }[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() - i);
    days.push({ dateKey: toDateKey(d), weekday: d.getDay() });
  }
  days.reverse();

  const dateKeys = days.map((d) => d.dateKey);

  const [{ data: entries }, { data: shiftRows }] = await Promise.all([
    supabase
      .from("time_entry")
      .select("date, actual_start, actual_end, note")
      .eq("employee_id", employee.id)
      .in("date", dateKeys),
    supabase
      .from("schedule_shift")
      .select("start_time, end_time, schedule_day!inner(date, schedule_month!inner(status))")
      .eq("employee_id", employee.id)
      .eq("schedule_day.schedule_month.status", "published")
      .in("schedule_day.date", dateKeys),
  ]);

  const entryByDate = new Map((entries ?? []).map((e) => [e.date, e]));
  type ShiftRow = { start_time: string; end_time: string; schedule_day: { date: string } };
  const scheduledByDate = new Map<string, { start_time: string; end_time: string }[]>();
  for (const s of (shiftRows ?? []) as unknown as ShiftRow[]) {
    const date = s.schedule_day.date;
    if (!scheduledByDate.has(date)) scheduledByDate.set(date, []);
    scheduledByDate.get(date)!.push({ start_time: s.start_time, end_time: s.end_time });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Godziny pracy</h1>
        <p className="text-sm text-zinc-500">
          Wpisz rzeczywistą godzinę rozpoczęcia i zakończenia pracy. Można edytować w dowolnym
          momencie, ale tylko do 7 dni po danym dniu.
        </p>
      </div>

      <Card>
        <TimeEntryList
          days={days.map((d) => ({
            dateKey: d.dateKey,
            label: `${weekdayLabel(d.weekday)}, ${new Date(d.dateKey + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}`,
            scheduled: (scheduledByDate.get(d.dateKey) ?? [])
              .map((s) => `${formatHm(s.start_time)}–${formatHm(s.end_time)}`)
              .join(", "),
            entry: entryByDate.get(d.dateKey)
              ? {
                  actualStart: entryByDate.get(d.dateKey)!.actual_start ?? "",
                  actualEnd: entryByDate.get(d.dateKey)!.actual_end ?? "",
                  note: entryByDate.get(d.dateKey)!.note ?? "",
                }
              : { actualStart: "", actualEnd: "", note: "" },
          }))}
        />
      </Card>
    </div>
  );
}
