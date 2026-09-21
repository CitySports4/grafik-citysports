import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { findScheduleMonth, currentMonth, monthLabel, toDateKey, daysInMonth } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { formatHm } from "@/lib/time";
import { EVENT_TYPE_LABELS } from "@/lib/event-types";
import { Card } from "@/components/Card";
import { ColorDot } from "@/components/ColorDot";

export default async function RecepcjaGrafikPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const supabase = createServerSupabaseClient();
  const today = toDateKey(new Date());

  const fallback = currentMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;
  const scheduleMonth = await findScheduleMonth(year, month);
  const scheduleDates = daysInMonth(year, month).map(toDateKey);
  const prevLink = month === 1 ? `?year=${year - 1}&month=12` : `?year=${year}&month=${month - 1}`;
  const nextLink = month === 12 ? `?year=${year + 1}&month=1` : `?year=${year}&month=${month + 1}`;

  const [{ data: employees }, scheduleDaysResult] = await Promise.all([
    supabase.from("employee").select("id, name, color_hex"),
    scheduleMonth
      ? supabase
          .from("schedule_day")
          .select(
            "id, date, weekday, schedule_shift(id, slot_index, start_time, end_time, employee_id, is_closed), schedule_event(id, type, start_time, end_time, label, note, participant_employee_ids)"
          )
          .eq("schedule_month_id", scheduleMonth.id)
          .order("date")
      : Promise.resolve({ data: null }),
  ]);

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
  const scheduleDays = scheduleDaysResult.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">
          Grafik pracy — {monthLabel(month)} {year} <span className="text-sm font-normal text-zinc-400">(tylko podgląd)</span>
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <Link href={prevLink} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            ← poprzedni
          </Link>
          <Link href={nextLink} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            następny →
          </Link>
        </div>
      </div>
      {!scheduleMonth || scheduleMonth.status !== "published" ? (
        <Card className="text-center text-sm text-zinc-500">Grafik na ten miesiąc nie został jeszcze opublikowany.</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {scheduleDates.map((date) => {
            const day = scheduleDays.find((d) => d.date === date);
            if (!day) return null;
            const shifts = (day.schedule_shift ?? []).slice().sort((a, b) => a.slot_index - b.slot_index);
            const events = day.schedule_event ?? [];
            const isToday = date === today;
            if (shifts.length === 0 && events.length === 0) return null;
            return (
              <Card key={day.id} className={`!p-3 ${isToday ? "ring-2 ring-brand-blue" : ""}`}>
                <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold capitalize text-zinc-900">
                  {new Date(date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} — {weekdayLabel(day.weekday)}
                  {isToday && (
                    <span className="rounded-full bg-brand-blue px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Dziś
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {shifts.map((shift) => {
                    const emp = shift.employee_id ? employeeById.get(shift.employee_id) : null;
                    return (
                      <div
                        key={shift.id}
                        style={emp ? { backgroundColor: `${emp.color_hex}2e`, borderLeft: `3px solid ${emp.color_hex}` } : undefined}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 ${shift.is_closed ? "opacity-50" : ""}`}
                      >
                        <span className="font-semibold">
                          {formatHm(shift.start_time)}–{formatHm(shift.end_time)}
                        </span>
                        {emp && <ColorDot color={emp.color_hex} />}
                        <span>{shift.is_closed ? "NIECZYNNE" : emp ? emp.name : "— nieprzypisane —"}</span>
                      </div>
                    );
                  })}
                  {shifts.length === 0 && <span className="text-xs text-zinc-400">Zamknięte.</span>}
                </div>
                {events.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {events.map((ev) => (
                      <span key={ev.id} className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">
                        {ev.start_time ? `${formatHm(ev.start_time)}${ev.end_time ? `–${formatHm(ev.end_time)}` : ""} ` : ""}
                        {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                        {ev.label && ev.label !== EVENT_TYPE_LABELS[ev.type] ? ` — ${ev.label}` : ""}
                        {(ev.participant_employee_ids ?? []).map((id: string) => {
                          const p = employeeById.get(id);
                          return p ? <ColorDot key={id} color={p.color_hex} /> : null;
                        })}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
