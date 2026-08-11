import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { addPlannedAbsence, deletePlannedAbsence } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";

function formatRange(start: string, end: string) {
  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

export async function PlannedAbsencesSection({ employeeId }: { employeeId: string }) {
  const supabase = createServerSupabaseClient();
  const today = toDateKey(new Date());

  const { data: absences } = await supabase
    .from("planned_absence")
    .select("id, start_date, end_date, note")
    .eq("employee_id", employeeId)
    .gte("end_date", today)
    .order("start_date");

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-zinc-500">
        Zgłoś urlop lub inną planowaną nieobecność z wyprzedzeniem (do 6 miesięcy) — niezależnie od
        comiesięcznego zgłaszania dyspozycyjności. System potraktuje te dni jak &quot;cały dzień
        niedostępny&quot; przy układaniu grafiku.
      </p>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Zgłoś nieobecność</h2>
        <form action={addPlannedAbsence} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Od</label>
            <input type="date" name="start_date" required min={today} className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Do</label>
            <input type="date" name="end_date" required min={today} className={INPUT} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5" style={{ minWidth: 180 }}>
            <label className={LABEL}>Notatka (opcjonalnie)</label>
            <input name="note" placeholder="np. urlop, wyjazd" className={INPUT} />
          </div>
          <SubmitButton className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
            Dodaj
          </SubmitButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Twoje zgłoszone nieobecności</h2>
        <ul className="flex flex-col gap-2">
          {absences?.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{formatRange(a.start_date, a.end_date)}</span>{" "}
                {a.note && <span className="text-zinc-500">({a.note})</span>}
              </span>
              <form action={deletePlannedAbsence}>
                <input type="hidden" name="id" value={a.id} />
                <ConfirmButton confirmText="Usunąć tę nieobecność?" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                  Usuń
                </ConfirmButton>
              </form>
            </li>
          ))}
          {absences?.length === 0 && <li className="text-sm text-zinc-400">Brak zgłoszonych nieobecności.</li>}
        </ul>
      </Card>
    </div>
  );
}
