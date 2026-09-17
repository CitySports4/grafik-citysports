import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { WEEK_DISPLAY_ORDER, weekdayLabel } from "@/lib/weekdays";
import { formatHm } from "@/lib/time";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { BackLink } from "@/components/BackLink";
import { BTN_GHOST_DANGER } from "@/components/button-styles";
import { updatePersonalTrainingSettings, addRoomHoursWindow, deleteRoomHoursWindow } from "../../treningi-personalne/actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";

export default async function PersonalTrainingSettingsPage() {
  await requireAdmin();

  const supabase = createServerSupabaseClient();
  const [{ data: settings }, { data: roomHours }] = await Promise.all([
    supabase.from("personal_training_settings").select("room_capacity, rate_per_person").eq("id", 1).single(),
    supabase.from("personal_training_room_hours").select("id, weekday, start_time, end_time").order("weekday").order("start_time"),
  ]);

  const roomHoursByWeekday = new Map<number, { id: string; start_time: string; end_time: string }[]>();
  for (const w of roomHours ?? []) {
    if (!roomHoursByWeekday.has(w.weekday)) roomHoursByWeekday.set(w.weekday, []);
    roomHoursByWeekday.get(w.weekday)!.push(w);
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin" label="Panel admina" />

      <div>
        <h1 className="text-lg font-bold text-zinc-900">Treningi personalne — ustawienia</h1>
        <p className="text-sm text-zinc-500">Limit sali, stawka za osobę i godziny dostępności sali.</p>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Limit i stawka</h2>
        <form action={updatePersonalTrainingSettings} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Limit osób w sali naraz</label>
            <input type="number" min={1} name="room_capacity" defaultValue={settings?.room_capacity ?? 8} className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Stawka za osobę (PLN)</label>
            <input type="number" step="0.01" min={0} name="rate_per_person" defaultValue={settings?.rate_per_person ?? 0} className={INPUT} />
            <p className="text-xs text-zinc-500">Płaci trener klubowi za każdą osobę na treningu.</p>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
              Zapisz
            </SubmitButton>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-zinc-900">Godziny dostępności sali</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Osobno per dzień tygodnia — można dodać kilka okien tego samego dnia (przerwa między nimi). Dzień bez
          żadnego okna = sala niedostępna cały dzień.
        </p>
        <div className="flex flex-col gap-4">
          {WEEK_DISPLAY_ORDER.map((weekday) => {
            const windows = roomHoursByWeekday.get(weekday) ?? [];
            return (
              <div key={weekday} className="rounded-xl border border-zinc-200 p-3">
                <h3 className="mb-2 text-sm font-semibold capitalize text-zinc-900">{weekdayLabel(weekday)}</h3>
                <ul className="mb-2 flex flex-col gap-1.5">
                  {windows.map((w) => (
                    <li key={w.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-sm">
                      <span>
                        {formatHm(w.start_time)}–{formatHm(w.end_time)}
                      </span>
                      <form action={deleteRoomHoursWindow}>
                        <input type="hidden" name="id" value={w.id} />
                        <ConfirmButton confirmText="Usunąć to okno dostępności?" className={BTN_GHOST_DANGER}>
                          Usuń
                        </ConfirmButton>
                      </form>
                    </li>
                  ))}
                  {windows.length === 0 && <li className="text-xs text-zinc-400">Sala niedostępna tego dnia.</li>}
                </ul>
                <form action={addRoomHoursWindow} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="weekday" value={weekday} />
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-zinc-600">Od</label>
                    <input type="time" name="start_time" required className={`${INPUT} w-[110px] !py-1.5`} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-zinc-600">Do</label>
                    <input type="time" name="end_time" required className={`${INPUT} w-[110px] !py-1.5`} />
                  </div>
                  <SubmitButton className="rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
                    Dodaj okno
                  </SubmitButton>
                </form>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
