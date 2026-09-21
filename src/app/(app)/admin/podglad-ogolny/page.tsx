import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { BackLink } from "@/components/BackLink";
import { setKioskPin, clearKioskPin } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";

// PIN dostępu do /recepcja — jedno wspólne hasełko dla całej recepcji (NIE
// osobiste konto), do współdzielonego stanowiska (komputer recepcyjny).
// Nigdy nie pokazujemy bieżącego PIN-u w postaci jawnej — tylko czy jest
// ustawiony, i formularz do ustawienia nowego (jak przy haśle pracownika).
export default async function KioskSettingsPage() {
  await requireAdmin();

  const supabase = createServerSupabaseClient();
  const { data: settings } = await supabase.from("kiosk_settings").select("pin_hash").eq("id", 1).single();
  const hasPin = Boolean(settings?.pin_hash);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin" label="Panel admina" />

      <div>
        <h1 className="text-lg font-bold text-zinc-900">Ogólny podgląd — recepcja</h1>
        <p className="text-sm text-zinc-500">
          PIN dostępu do <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">/recepcja</code> — wspólny dla całej
          recepcji, do stanowiska na miejscu. Tam: grafik pracy i zadania sprzątania tylko do odczytu, plus pełne
          zarządzanie treningami personalnymi (dodawanie, blokada sali, rozliczenia).
        </p>
      </div>

      <Card>
        <h2 className="mb-1 font-semibold text-zinc-900">PIN recepcji</h2>
        <p className="mb-3 text-sm text-zinc-500">
          {hasPin ? "PIN jest ustawiony." : "PIN nie jest jeszcze ustawiony — /recepcja jest niedostępne, dopóki go nie ustawisz."}
        </p>
        <form action={setKioskPin} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Nowy PIN</label>
            <input type="text" name="pin" required minLength={4} className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Powtórz PIN</label>
            <input type="text" name="pin_confirm" required minLength={4} className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
              {hasPin ? "Zmień PIN" : "Ustaw PIN"}
            </SubmitButton>
          </div>
        </form>
        {hasPin && (
          <form action={clearKioskPin} className="mt-3">
            <ConfirmButton
              confirmText="Wyłączyć dostęp do /recepcja, dopóki nie ustawisz nowego PIN-u?"
              className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"
            >
              Wyłącz dostęp (usuń PIN)
            </ConfirmButton>
          </form>
        )}
      </Card>
    </div>
  );
}
