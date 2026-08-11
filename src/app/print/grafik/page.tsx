import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { findScheduleMonth, currentMonth, monthLabel } from "@/lib/schedule-month";
import { formatHm } from "@/lib/time";
import { weekdayLabel } from "@/lib/weekdays";
import { EVENT_TYPE_LABELS } from "@/lib/event-types";
import { PrintButton } from "./PrintButton";
import { PrintScaler } from "./PrintScaler";

export default async function PrintGrafikPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const fallback = currentMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;

  const scheduleMonth = await findScheduleMonth(year, month);

  if (!scheduleMonth) {
    return (
      <main className="p-8 text-sm text-zinc-500">
        Brak wygenerowanego grafiku dla {monthLabel(month)} {year}.
      </main>
    );
  }

  const supabase = createServerSupabaseClient();
  const [{ data: days }, { data: employees }] = await Promise.all([
    supabase
      .from("schedule_day")
      .select(
        "id, date, weekday, schedule_shift(id, slot_index, start_time, end_time, employee_id, is_closed), schedule_event(id, type, start_time, end_time, label, note, participant_employee_ids)"
      )
      .eq("schedule_month_id", scheduleMonth.id)
      .order("date"),
    supabase.from("employee").select("id, name, color_hex"),
  ]);

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));

  return (
    <main className="p-6 print:p-0">
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-lg font-bold capitalize text-zinc-900">
          Grafik do druku — {monthLabel(month)} {year}
        </h1>
        <PrintButton />
      </div>

      <PrintScaler tableId="print-table" pageHeightMm={277} />

      <table id="print-table" className="w-full border-collapse text-[10px] leading-tight">
        <thead>
          <tr>
            <th className="w-[60px] border border-zinc-400 bg-zinc-100 px-1 py-0.5 text-left">Data</th>
            <th className="w-[70px] border border-zinc-400 bg-zinc-100 px-1 py-0.5 text-left">Dzień</th>
            <th className="border border-zinc-400 bg-zinc-100 px-1 py-0.5 text-left">Zmiany</th>
            <th className="border border-zinc-400 bg-zinc-100 px-1 py-0.5 text-left">Wydarzenia</th>
          </tr>
        </thead>
        <tbody>
          {(days ?? []).map((day) => {
            const shifts = (day.schedule_shift ?? []).slice().sort((a, b) => a.slot_index - b.slot_index);
            const events = day.schedule_event ?? [];
            const dateLabel = new Date(day.date + "T00:00:00").toLocaleDateString("pl-PL", {
              day: "numeric",
              month: "numeric",
            });
            const isWeekend = day.weekday === 0 || day.weekday === 6;
            return (
              <tr key={day.id} className={`break-inside-avoid ${isWeekend ? "bg-zinc-50" : ""}`}>
                <td className="border border-zinc-300 px-1 py-0.5 align-top font-semibold">{dateLabel}</td>
                <td className="border border-zinc-300 px-1 py-0.5 align-top capitalize">{weekdayLabel(day.weekday)}</td>
                <td className="border border-zinc-300 px-1 py-0.5 align-top">
                  {shifts.length === 0 && <span className="text-zinc-400">Zamknięte.</span>}
                  {shifts.map((shift) => {
                    const emp = shift.employee_id ? employeeById.get(shift.employee_id) : null;
                    return (
                      <div key={shift.id} className={shift.is_closed ? "text-zinc-400" : ""}>
                        <span className="font-semibold">
                          {formatHm(shift.start_time)}–{formatHm(shift.end_time)}
                        </span>
                        {": "}
                        {shift.is_closed ? "NIECZYNNE" : emp ? emp.name : "— nieprzypisane —"}
                      </div>
                    );
                  })}
                </td>
                <td className="border border-zinc-300 px-1 py-0.5 align-top">
                  {events.map((ev) => {
                    const participants = (ev.participant_employee_ids ?? [])
                      .map((id: string) => employeeById.get(id)?.name)
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <div key={ev.id}>
                        {ev.start_time ? `${formatHm(ev.start_time)}${ev.end_time ? `–${formatHm(ev.end_time)}` : ""} ` : ""}
                        {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                        {ev.label && ev.label !== EVENT_TYPE_LABELS[ev.type] ? ` — ${ev.label}` : ""}
                        {participants ? ` (${participants})` : ""}
                      </div>
                    );
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
