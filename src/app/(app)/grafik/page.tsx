import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { findScheduleMonth, currentMonth, monthLabel } from "@/lib/schedule-month";
import { hoursBetween, formatHm, effectiveShiftHours } from "@/lib/time";
import { weekdayLabel } from "@/lib/weekdays";
import { Card } from "@/components/Card";
import { ColorDot } from "@/components/ColorDot";

const EVENT_TYPE_LABELS: Record<string, string> = {
  liga_open: "Liga open",
  liga_deblowa: "Liga deblowa",
  sprzatanie: "Sprzątanie",
  warsztaty: "Warsztaty",
  custom: "Inne",
};

export default async function MyGrafikPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const employee = await requireEmployee();
  const params = await searchParams;
  const fallback = currentMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;

  const scheduleMonth = await findScheduleMonth(year, month);
  const prevLink = month === 1 ? `?year=${year - 1}&month=12` : `?year=${year}&month=${month - 1}`;
  const nextLink = month === 12 ? `?year=${year + 1}&month=1` : `?year=${year}&month=${month + 1}`;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-lg font-bold capitalize text-zinc-900">
        Grafik — {monthLabel(month)} {year}
      </h1>
      <div className="flex items-center gap-2 text-sm">
        <Link href={`/grafik${prevLink}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
          ← poprzedni
        </Link>
        <Link href={`/grafik${nextLink}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
          następny →
        </Link>
      </div>
    </div>
  );

  if (!scheduleMonth || scheduleMonth.status !== "published") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
          Grafik na ten miesiąc nie został jeszcze opublikowany.
        </div>
      </div>
    );
  }

  const supabase = createServerSupabaseClient();
  const [{ data: days }, { data: myClasses }] = await Promise.all([
    supabase
      .from("schedule_day")
      .select(
        "id, date, weekday, schedule_shift(id, slot_index, start_time, end_time, employee_id, is_closed), schedule_event(id, type, start_time, end_time, label, note, participant_employee_ids)"
      )
      .eq("schedule_month_id", scheduleMonth.id)
      .order("date"),
    supabase.from("employee_class_schedule").select("weekday, start_time, end_time").eq("employee_id", employee.id),
  ]);

  const { data: employees } = await supabase.from("employee").select("id, name, color_hex");
  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));

  let myHours = 0;
  for (const day of days ?? []) {
    for (const shift of day.schedule_shift ?? []) {
      if (shift.employee_id === employee.id) {
        myHours += effectiveShiftHours(shift.start_time, shift.end_time, day.weekday, myClasses ?? []);
      }
    }
    for (const ev of day.schedule_event ?? []) {
      if (ev.end_time && ev.participant_employee_ids?.includes(employee.id)) {
        myHours += hoursBetween(ev.start_time ?? "00:00", ev.end_time);
      }
    }
  }
  myHours = Math.round(myHours * 100) / 100;

  return (
    <div className="flex flex-col gap-6">
      {header}

      <Card className="flex items-center justify-between">
        <span className="text-sm text-zinc-600">Twoje godziny w tym miesiącu</span>
        <span className="text-lg font-bold text-zinc-900">{myHours}h</span>
      </Card>

      <div className="flex flex-col gap-3">
        {days?.map((day) => {
          const shifts = (day.schedule_shift ?? []).slice().sort((a, b) => a.slot_index - b.slot_index);
          const events = day.schedule_event ?? [];
          const isMyDay = shifts.some((s) => s.employee_id === employee.id);
          const dateLabel = new Date(day.date + "T00:00:00").toLocaleDateString("pl-PL", {
            day: "numeric",
            month: "short",
          });
          return (
            <Card key={day.id} className={`!p-3 ${isMyDay ? "border-brand-orange bg-brand-orange/5" : ""}`}>
              <div className="mb-1.5 text-sm font-semibold capitalize text-zinc-900">
                {dateLabel} — {weekdayLabel(day.weekday)}
              </div>
              <div className="flex flex-wrap gap-2">
                {shifts.map((shift) => {
                  const emp = shift.employee_id ? employeeById.get(shift.employee_id) : null;
                  const isMe = shift.employee_id === employee.id;
                  return (
                    <div
                      key={shift.id}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${
                        isMe ? "bg-brand-orange text-white" : "bg-zinc-50 text-zinc-600"
                      } ${shift.is_closed ? "opacity-50" : ""}`}
                    >
                      <span className="font-semibold">
                        {formatHm(shift.start_time)}–{formatHm(shift.end_time)}
                      </span>
                      {!isMe && emp && <ColorDot color={emp.color_hex} />}
                      <span>
                        {shift.is_closed ? "NIECZYNNE" : emp ? emp.name : "— nieprzypisane —"}
                      </span>
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
    </div>
  );
}
