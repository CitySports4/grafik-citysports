import { createServerSupabaseClient } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { ConfirmButton } from "@/components/ConfirmButton";
import { respondSwapRequest, cancelSwapRequest } from "../../zamiany/actions";
import { formatHm } from "@/lib/time";

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

export default async function AdminSwapsPage() {
  const supabase = createServerSupabaseClient();

  const { data: employees } = await supabase.from("employee").select("id, name");
  const employeeById = new Map((employees ?? []).map((e) => [e.id, e.name]));

  const { data: requests } = await supabase
    .from("shift_swap_request")
    .select(
      "id, status, hour_delta, requested_at, requester_employee_id, target_employee_id, requester_shift_id, target_shift_id"
    )
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Zamiany zmian</h1>
        <p className="text-sm text-zinc-500">Wszystkie prośby o zamianę — możesz zdecydować za obie strony.</p>
      </div>

      <Card>
        <ul className="flex flex-col gap-2">
          {requests?.map((r) => {
            const mine = shiftDetails.get(r.requester_shift_id);
            const theirs = shiftDetails.get(r.target_shift_id);
            const bigDelta = r.hour_delta !== null && Math.abs(Number(r.hour_delta)) > 2;
            return (
              <li key={r.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>{employeeById.get(r.requester_employee_id)}</strong>{" "}
                    ({mine ? shiftLabel(mine.date, mine.start_time, mine.end_time) : "?"}) ↔{" "}
                    <strong>{employeeById.get(r.target_employee_id ?? "")}</strong>{" "}
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
                    <form action={cancelSwapRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmButton confirmText="Anulować tę prośbę?" className={DANGER_BTN}>
                        Anuluj
                      </ConfirmButton>
                    </form>
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
