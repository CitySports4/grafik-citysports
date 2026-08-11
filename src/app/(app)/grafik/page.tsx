import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { findScheduleMonth, currentMonth, monthLabel, toDateKey } from "@/lib/schedule-month";
import { hoursBetween, formatHm, dailyEffectiveHours } from "@/lib/time";
import { weekdayLabel } from "@/lib/weekdays";
import { Card } from "@/components/Card";
import { ColorDot } from "@/components/ColorDot";
import { ConfirmButton } from "@/components/ConfirmButton";
import { EVENT_TYPE_LABELS } from "@/lib/event-types";
import { SwapButton } from "./SwapButton";
import { respondSwapRequest, cancelSwapRequest } from "../zamiany/actions";
import { countAcceptedSwapsThisMonth, SOFT_SWAP_LIMIT_PER_MONTH } from "@/lib/swap-limits";

const DANGER_BTN = "rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50";
const STATUS_LABELS: Record<string, string> = {
  pending: "Oczekuje",
  accepted: "Zaakceptowana",
  rejected: "Odrzucona",
  cancelled: "Anulowana",
};

function shiftLabel(date: string, start: string, end: string) {
  const d = new Date(date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
  return `${d}, ${formatHm(start)}–${formatHm(end)}`;
}

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
  const today = toDateKey(new Date());

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

  const { data: requests } = await supabase
    .from("shift_swap_request")
    .select("id, status, hour_delta, requested_at, requester_employee_id, target_employee_id, requester_shift_id, target_shift_id")
    .or(`requester_employee_id.eq.${employee.id},target_employee_id.eq.${employee.id}`)
    .order("requested_at", { ascending: false });

  const shiftIds = Array.from(new Set((requests ?? []).flatMap((r) => [r.requester_shift_id, r.target_shift_id])));
  const shiftDetails = new Map<string, { date: string; start_time: string; end_time: string }>();
  if (shiftIds.length > 0) {
    const { data: shiftRows } = await supabase
      .from("schedule_shift")
      .select("id, start_time, end_time, schedule_day(date)")
      .in("id", shiftIds);
    for (const s of (shiftRows ?? []) as unknown as { id: string; start_time: string; end_time: string; schedule_day: { date: string } }[]) {
      shiftDetails.set(s.id, { date: s.schedule_day.date, start_time: s.start_time, end_time: s.end_time });
    }
  }
  const myAcceptedSwapsThisMonth = countAcceptedSwapsThisMonth(requests ?? [], employee.id);

  let myHours = 0;
  for (const day of days ?? []) {
    const myShiftsToday = (day.schedule_shift ?? [])
      .filter((s) => s.employee_id === employee.id)
      .map((s) => ({ start_time: s.start_time, end_time: s.end_time }));
    myHours += dailyEffectiveHours(myShiftsToday, day.weekday, myClasses ?? []);
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
          const dateLabelStr = new Date(day.date + "T00:00:00").toLocaleDateString("pl-PL", {
            day: "numeric",
            month: "short",
          });
          return (
            <Card key={day.id} className={`!p-3 ${isMyDay ? "border-brand-orange bg-brand-orange/5" : ""}`}>
              <div className="mb-1.5 text-sm font-semibold capitalize text-zinc-900">
                {dateLabelStr} — {weekdayLabel(day.weekday)}
              </div>
              <div className="flex flex-wrap gap-2">
                {shifts.map((shift) => {
                  const emp = shift.employee_id ? employeeById.get(shift.employee_id) : null;
                  const isMe = shift.employee_id === employee.id;
                  const canSwap = isMe && !shift.is_closed && day.date >= today;
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
                      {canSwap && <SwapButton shiftId={shift.id} />}
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

      {requests && requests.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold text-zinc-900">Twoje prośby o zamianę</h2>
          {myAcceptedSwapsThisMonth >= SOFT_SWAP_LIMIT_PER_MONTH && (
            <p className="mb-3 text-xs text-amber-600">
              Uwaga: masz już {myAcceptedSwapsThisMonth} zaakceptowane zamiany w tym miesiącu — zalecany miękki limit to{" "}
              {SOFT_SWAP_LIMIT_PER_MONTH}.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {requests.map((r) => {
              const mine = shiftDetails.get(r.requester_shift_id);
              const theirs = shiftDetails.get(r.target_shift_id);
              const iAmTarget = r.target_employee_id === employee.id;
              const iAmRequester = r.requester_employee_id === employee.id;
              const bigDelta = r.hour_delta !== null && Math.abs(Number(r.hour_delta)) > 2;
              return (
                <li key={r.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <ColorDot color={employeeById.get(r.requester_employee_id)?.color_hex ?? "#999"} />
                      <strong>{employeeById.get(r.requester_employee_id)?.name}</strong>
                      ({mine ? shiftLabel(mine.date, mine.start_time, mine.end_time) : "?"}) ↔
                      <ColorDot color={employeeById.get(r.target_employee_id ?? "")?.color_hex ?? "#999"} />
                      <strong>{employeeById.get(r.target_employee_id ?? "")?.name}</strong>
                      ({theirs ? shiftLabel(theirs.date, theirs.start_time, theirs.end_time) : "?"})
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        r.status === "pending"
                          ? "bg-amber-100 text-amber-700"
                          : r.status === "accepted"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-zinc-200 text-zinc-600"
                      }`}
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </div>
                  {bigDelta && (
                    <p className="mt-1 text-xs text-amber-600">
                      Uwaga: różnica godzin {Number(r.hour_delta) > 0 ? "+" : ""}
                      {r.hour_delta}h — większa niż zalecane ±2h.
                    </p>
                  )}
                  {r.status === "pending" && (
                    <div className="mt-2 flex gap-2">
                      {iAmTarget && (
                        <>
                          <form action={respondSwapRequest}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="decision" value="accept" />
                            <button type="submit" className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                              Akceptuj
                            </button>
                          </form>
                          <form action={respondSwapRequest}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="decision" value="reject" />
                            <button type="submit" className={DANGER_BTN}>
                              Odrzuć
                            </button>
                          </form>
                        </>
                      )}
                      {iAmRequester && (
                        <form action={cancelSwapRequest}>
                          <input type="hidden" name="id" value={r.id} />
                          <ConfirmButton confirmText="Anulować tę prośbę?" className={DANGER_BTN}>
                            Anuluj
                          </ConfirmButton>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
