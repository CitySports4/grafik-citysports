import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { BackLink } from "@/components/BackLink";
import { updateKasaSettings, addCategory, setCategoryActive } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";

export default async function KasaSettingsPage() {
  await requireAdmin();

  const supabase = createServerSupabaseClient();
  const [{ data: settings }, { data: categoriesRaw }] = await Promise.all([
    supabase.from("kasa_settings").select("next_rd_number, cash_limit").eq("id", 1).single(),
    supabase.from("kasa_category").select("id, name, active").order("sort_order"),
  ]);
  const categories = categoriesRaw ?? [];

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin" label="Panel admina" />

      <div>
        <h1 className="text-lg font-bold text-zinc-900">Kasa — ustawienia</h1>
        <p className="text-sm text-zinc-500">Numeracja raportów dobowych, limit gotówki, kategorie wydatków (KW).</p>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Numeracja i limit</h2>
        <form action={updateKasaSettings} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Kolejny numer RD</label>
            <input type="number" min={1} name="next_rd_number" defaultValue={settings?.next_rd_number ?? 1} required className={INPUT} />
            <p className="text-xs text-zinc-500">
              To jest test — RD zaczyna od 1. Przed startem na żywo w grudniu ustaw tu numer kontynuujący papierową numerację.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Limit gotówki w kasie (PLN)</label>
            <input type="number" step="0.01" min={0} name="cash_limit" defaultValue={settings?.cash_limit ?? ""} placeholder="np. 3000" className={INPUT} />
            <p className="text-xs text-zinc-500">Powyżej tej kwoty Pulpit gotówki pokaże alert — sygnał, żeby odprowadzić gotówkę do banku.</p>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
              Zapisz
            </SubmitButton>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-zinc-900">Kategorie wydatków (KW)</h2>
        <p className="mb-3 text-sm text-zinc-500">Lista do wyboru przy dodawaniu rozchodu z kasy. Nieaktywne znikają z formularza, ale zostają przy już zapisanych KW.</p>
        <div className="mb-3 flex flex-col gap-1.5">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-sm">
              <span className={c.active ? "text-zinc-900" : "text-zinc-400 line-through"}>{c.name}</span>
              <form action={setCategoryActive}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="active" value={String(!c.active)} />
                <button type="submit" className="text-xs font-semibold text-brand-orange hover:underline">
                  {c.active ? "Dezaktywuj" : "Przywróć"}
                </button>
              </form>
            </div>
          ))}
          {categories.length === 0 && <p className="text-sm text-zinc-400">Brak kategorii.</p>}
        </div>
        <form action={addCategory} className="flex flex-wrap items-center gap-2">
          <input name="name" required placeholder="Nowa kategoria…" className={`${INPUT} flex-1`} />
          <SubmitButton className="shrink-0 rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
            Dodaj
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
