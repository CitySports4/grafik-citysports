import { createServerSupabaseClient } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { WEEKDAY_LABELS } from "@/lib/weekdays";
import { formatHm } from "@/lib/time";
import { addShiftSlot, deleteShiftSlot, toggleShiftSlotActive, seedDefaultShiftTemplate } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]";
const DANGER_BTN = "rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50";

export default async function ShiftTemplatePage() {
  const supabase = createServerSupabaseClient();
  const { data: slots } = await supabase
    .from("shift_template")
    .select("id, weekday, slot_index, default_start_time, default_end_time, label, active")
    .order("weekday")
    .order("slot_index");

  const isEmpty = !slots || slots.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Konfiguracja zmian</h1>
          <p className="text-sm text-zinc-500">
            Domyślne zmiany dla każdego dnia tygodnia — długość i godziny można zmienić dla
            konkretnego dnia podczas układania grafiku.
          </p>
        </div>
        {isEmpty && (
          <form action={seedDefaultShiftTemplate}>
            <SubmitButton className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
              Wstaw domyślny szablon (3 zmiany pon-pt, 1 sobota, 2 niedziela)
            </SubmitButton>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {WEEKDAY_LABELS.map((label, weekday) => {
          const daySlots = slots?.filter((s) => s.weekday === weekday) ?? [];
          return (
            <Card key={weekday}>
              <h2 className="mb-3 font-semibold capitalize text-zinc-900">{label}</h2>
              <ul className="mb-3 flex flex-col gap-1.5">
                {daySlots.map((s) => (
                  <li
                    key={s.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      s.active ? "bg-zinc-50" : "bg-zinc-100 text-zinc-400 line-through"
                    }`}
                  >
                    <span>
                      {s.label || `${formatHm(s.default_start_time)}–${formatHm(s.default_end_time)}`}
                    </span>
                    <span className="flex items-center gap-1">
                      <form action={toggleShiftSlotActive}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="active" value={String(s.active)} />
                        <button type="submit" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-200">
                          {s.active ? "Wyłącz" : "Włącz"}
                        </button>
                      </form>
                      <form action={deleteShiftSlot}>
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmButton confirmText="Usunąć tę zmianę z szablonu?" className={DANGER_BTN}>
                          Usuń
                        </ConfirmButton>
                      </form>
                    </span>
                  </li>
                ))}
                {daySlots.length === 0 && <li className="text-sm text-zinc-400">Brak zmian — dzień domyślnie zamknięty.</li>}
              </ul>
              <form action={addShiftSlot} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="weekday" value={weekday} />
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-600">Od</label>
                  <input type="time" name="default_start_time" required className={INPUT} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-600">Do</label>
                  <input type="time" name="default_end_time" required className={INPUT} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-600">Etykieta (opcjonalnie)</label>
                  <input name="label" className={INPUT} />
                </div>
                <SubmitButton className="rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  Dodaj
                </SubmitButton>
              </form>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
