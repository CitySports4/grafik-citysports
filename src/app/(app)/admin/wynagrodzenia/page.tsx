import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { currentMonth, monthLabel, daysInMonth, toDateKey } from "@/lib/schedule-month";
import { hoursBetween, timeToMinutes, formatHm } from "@/lib/time";
import { weekdayLabel } from "@/lib/weekdays";
import { Card } from "@/components/Card";
import { ColorDot } from "@/components/ColorDot";
import { BackLink } from "@/components/BackLink";
import { InstructorCalculator } from "./InstructorCalculator";

const DISCREPANCY_TOLERANCE_MIN = 30;

export default async function WynagrodzeniaPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const fallback = currentMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;

  const supabase = createServerSupabaseClient();
  const { data: employees } = await supabase
    .from("employee")
    .select("id, name, color_hex, hourly_rate, employee_role!inner(role)")
    .eq("active", true)
    .eq("employee_role.role", "recepcja")
    .order("name");

  const dates = daysInMonth(year, month).map(toDateKey);

  const [{ data: entries }, { data: shiftRows }] = await Promise.all([
    supabase
      .from("time_entry")
      .select("employee_id, date, actual_start, actual_end")
      .in("date", dates),
    supabase
      .from("schedule_shift")
      .select(
        "employee_id, start_time, end_time, schedule_day!inner(date, weekday, schedule_month!inner(status))"
      )
      .not("employee_id", "is", null)
      .eq("schedule_day.schedule_month.status", "published")
      .in("schedule_day.date", dates),
  ]);

  type ShiftRow = {
    employee_id: string;
    start_time: string;
    end_time: string;
    schedule_day: { date: string; weekday: number };
  };
  const scheduledByEmpDate = new Map<string, { start_time: string; end_time: string; weekday: number }>();
  for (const s of (shiftRows ?? []) as unknown as ShiftRow[]) {
    const key = `${s.employee_id}|${s.schedule_day.date}`;
    const existing = scheduledByEmpDate.get(key);
    if (!existing) {
      scheduledByEmpDate.set(key, { start_time: s.start_time, end_time: s.end_time, weekday: s.schedule_day.weekday });
    } else {
      // Kilka zmian tego dnia (nietypowe dla recepcji) — bierz najwcześniejszy
      // start i najpóźniejszy koniec jako całe okno do porównania.
      existing.start_time = timeToMinutes(s.start_time) < timeToMinutes(existing.start_time) ? s.start_time : existing.start_time;
      existing.end_time = timeToMinutes(s.end_time) > timeToMinutes(existing.end_time) ? s.end_time : existing.end_time;
    }
  }
  const entryByEmpDate = new Map((entries ?? []).map((e) => [`${e.employee_id}|${e.date}`, e]));

  const prevLink = month === 1 ? `?year=${year - 1}&month=12` : `?year=${year}&month=${month - 1}`;
  const nextLink = month === 12 ? `?year=${year + 1}&month=1` : `?year=${year}&month=${month + 1}`;

  const rows = (employees ?? []).map((emp) => {
    const days = dates.map((date) => {
      const scheduled = scheduledByEmpDate.get(`${emp.id}|${date}`) ?? null;
      const entry = entryByEmpDate.get(`${emp.id}|${date}`) ?? null;
      const actualStart = entry?.actual_start ?? null;
      const actualEnd = entry?.actual_end ?? null;
      const workedHours = actualStart && actualEnd ? hoursBetween(actualStart, actualEnd) : 0;

      let flag: string | null = null;
      if (scheduled && (!actualStart || !actualEnd)) {
        flag = "brak wpisu godzin";
      } else if (!scheduled && actualStart && actualEnd) {
        flag = "brak w grafiku";
      } else if (scheduled && actualStart && actualEnd) {
        const startDiff = Math.abs(timeToMinutes(actualStart) - timeToMinutes(scheduled.start_time));
        const endDiff = Math.abs(timeToMinutes(actualEnd) - timeToMinutes(scheduled.end_time));
        if (startDiff > DISCREPANCY_TOLERANCE_MIN || endDiff > DISCREPANCY_TOLERANCE_MIN) {
          flag = `różnica >±${DISCREPANCY_TOLERANCE_MIN} min`;
        }
      }

      return { date, scheduled, actualStart, actualEnd, workedHours, flag };
    });

    const totalHours = Math.round(days.reduce((sum, d) => sum + d.workedHours, 0) * 100) / 100;
    const wage = Math.round(totalHours * emp.hourly_rate * 100) / 100;
    const flaggedDays = days.filter((d) => d.flag);

    return { emp, days, totalHours, wage, flaggedDays };
  });

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin" label="Panel admina" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Wynagrodzenia</h1>
          <p className="text-sm text-zinc-500">
            Recepcja: {monthLabel(month)} {year} — godziny × stawka, zgodność z grafikiem (tolerancja ±
            {DISCREPANCY_TOLERANCE_MIN} min).
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/admin/wynagrodzenia${prevLink}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            ← poprzedni
          </Link>
          <Link href={`/admin/wynagrodzenia${nextLink}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            następny →
          </Link>
        </div>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Recepcja</h2>
        {rows.length === 0 && (
          <p className="text-sm text-zinc-400">Brak aktywnych osób z rolą &quot;Recepcja&quot;.</p>
        )}
        <div className="flex flex-col gap-4">
          {rows.map(({ emp, days, totalHours, wage, flaggedDays }) => (
            <div key={emp.id} className="rounded-xl border border-zinc-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold text-zinc-900">
                  <ColorDot color={emp.color_hex} />
                  {emp.name}
                </span>
                <span className="text-sm text-zinc-600">
                  {totalHours}h × {emp.hourly_rate} PLN/h ={" "}
                  <strong className="text-zinc-900">{wage.toFixed(2)} PLN</strong>
                </span>
              </div>
              {emp.hourly_rate === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  Uwaga: stawka godzinowa nie jest ustawiona (0 PLN/h) — uzupełnij w Pracownicy.
                </p>
              )}
              {flaggedDays.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {flaggedDays.map((d) => (
                    <li key={d.date} className="text-xs">
                      <span className="font-semibold text-zinc-700">
                        {new Date(d.date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
                        {" "}
                        ({weekdayLabel(d.scheduled?.weekday ?? new Date(d.date + "T00:00:00").getDay()).slice(0, 3)})
                      </span>{" "}
                      — grafik:{" "}
                      {d.scheduled ? `${formatHm(d.scheduled.start_time)}–${formatHm(d.scheduled.end_time)}` : "—"}, rzeczywiste:{" "}
                      {d.actualStart && d.actualEnd ? `${d.actualStart.slice(0, 5)}–${d.actualEnd.slice(0, 5)}` : "—"}{" "}
                      <span className="font-bold text-red-600">⚠ {d.flag}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-emerald-600">Zgodne z grafikiem, bez braków.</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-zinc-900">Instruktorzy</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Wgraj raport frekwencji (.xlsx) — stawka za zajęcia zależy od liczby uczestników.
        </p>
        <InstructorCalculator />
      </Card>
    </div>
  );
}
