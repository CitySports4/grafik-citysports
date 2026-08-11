import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { toDateKey } from "@/lib/schedule-month";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { createSwapRequest, respondSwapRequest, cancelSwapRequest } from "./actions";
import { formatHm } from "@/lib/time";
import { ColorDot } from "@/components/ColorDot";
import { countAcceptedSwapsThisMonth, SOFT_SWAP_LIMIT_PER_MONTH } from "@/lib/swap-limits";

const DANGER_BTN = "rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50";

function shiftLabel(date: string, start: string, end: string) {
  const d = new Date(date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
  return `${d}, ${formatHm(start)}–${formatHm(end)}`;
}

export default async function SwapsPage() {
  const employee = await requireEmployee();
  const supabase = createServerSupabaseClient();
  const today = toDateKey(new Date());

  const { data: employees } = await supabase.from("employee").select("id, name, color_hex").eq("active", true);
  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));

  const { data: myShiftsRaw } = await supabase
    .from("schedule_shift")
    .select("id, start_time, end_time, employee_id, schedule_day!inner(date, weekday, schedule_month_id, schedule_month!inner(status))")
    .eq("employee_id", employee.id)
    .eq("schedule_day.schedule_month.status", "published")
    .gte("schedule_day.date", today);

  const { data: otherShiftsRaw } = await supabase
    .from("schedule_shift")
    .select("id, start_time, end_time, employee_id, schedule_day!inner(date, weekday, schedule_month_id, schedule_month!inner(status))")
    .not("employee_id", "is", null)
    .neq("employee_id", employee.id)
    .eq("schedule_day.schedule_month.status", "published")
    .gte("schedule_day.date", today);

  type ShiftRow = {
    id: string;
    start_time: string;
    end_time: string;
    employee_id: string | null;
    schedule_day: { date: string };
  };
  const myShifts = ((myShiftsRaw ?? []) as unknown as ShiftRow[]).slice().sort((a, b) => a.schedule_day.date.localeCompare(b.schedule_day.date));
  const otherShifts = ((otherShiftsRaw ?? []) as unknown as ShiftRow[]).slice().sort((a, b) => a.schedule_day.date.localeCompare(b.schedule_day.date));

  const { data: requests } = await supabase
    .from("shift_swap_request")
    .select(
      "id, status, hour_delta, requested_at, requester_employee_id, target_employee_id, requester_shift_id, target_shift_id"
    )
    .or(`requester_employee_id.eq.${employee.id},target_employee_id.eq.${employee.id}`)
    .order("requested_at", { ascending: false });

  const shiftIds = Array.from(
    new Set((requests ?? []).flatMap((r) => [r.requester_shift_id, r.target_shift_id]))
  );
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

  const STATUS_LABELS: Record<string, string> = {
    pending: "Oczekuje",
    accepted: "Zaakceptowana",
    rejected: "Odrzucona",
    cancelled: "Anulowana",
  };

  const myAcceptedSwapsThisMonth = countAcceptedSwapsThisMonth(requests ?? [], employee.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Zamiana zmian</h1>
        <p className="text-sm text-zinc-500">
          Wybierz swoją zmianę i zmianę kolegi/koleżanki, z którą chcesz się zamienić.
        </p>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Zaproponuj zamianę</h2>
        {myAcceptedSwapsThisMonth >= SOFT_SWAP_LIMIT_PER_MONTH && (
          <p className="mb-3 text-xs text-amber-600">
            Uwaga: masz już {myAcceptedSwapsThisMonth} zaakceptowane zamiany w tym miesiącu —
            zalecany miękki limit to {SOFT_SWAP_LIMIT_PER_MONTH}. Nadal możesz zgłosić kolejną, jeśli
            to konieczne.
          </p>
        )}
        {myShifts.length === 0 ? (
          <p className="text-sm text-zinc-400">Nie masz żadnych nadchodzących zmian w opublikowanym grafiku.</p>
        ) : (
          <form action={createSwapRequest} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-zinc-900">Twoja zmiana</label>
              <select name="requester_shift_id" required className="rounded-xl border-[1.5px] border-zinc-300 px-3 py-2 text-sm">
                {myShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {shiftLabel(s.schedule_day.date, s.start_time, s.end_time)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-zinc-900">Zmiana kolegi/koleżanki</label>
              <select name="target_shift_id" required className="rounded-xl border-[1.5px] border-zinc-300 px-3 py-2 text-sm">
                {otherShifts.map((s) => (
                  <option key={s.id} value={s.id} style={{ color: employeeById.get(s.employee_id ?? "")?.color_hex }}>
                    {employeeById.get(s.employee_id ?? "")?.name} — {shiftLabel(s.schedule_day.date, s.start_time, s.end_time)}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
              Wyślij prośbę
            </SubmitButton>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Prośby o zamianę</h2>
        <ul className="flex flex-col gap-2">
          {requests?.map((r) => {
            const mine = shiftDetails.get(r.requester_shift_id);
            const theirs = shiftDetails.get(r.target_shift_id);
            const iAmTarget = r.target_employee_id === employee.id;
            const iAmRequester = r.requester_employee_id === employee.id;
            const bigDelta = r.hour_delta !== null && Math.abs(Number(r.hour_delta)) > 2;
            const overSwapLimit =
              r.status === "pending" &&
              (countAcceptedSwapsThisMonth(requests ?? [], r.requester_employee_id) >= SOFT_SWAP_LIMIT_PER_MONTH ||
                countAcceptedSwapsThisMonth(requests ?? [], r.target_employee_id ?? "") >= SOFT_SWAP_LIMIT_PER_MONTH);
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
                {overSwapLimit && (
                  <p className="mt-1 text-xs text-amber-600">
                    Uwaga: któraś ze stron ma już {SOFT_SWAP_LIMIT_PER_MONTH}+ zaakceptowane zamiany w
                    tym miesiącu.
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
          {requests?.length === 0 && <li className="text-sm text-zinc-400">Brak próśb o zamianę.</li>}
        </ul>
      </Card>
    </div>
  );
}
