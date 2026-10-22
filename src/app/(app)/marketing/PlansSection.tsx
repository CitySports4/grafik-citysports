import { createServerSupabaseClient } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { BTN_PRIMARY, BTN_GHOST, BTN_GHOST_DANGER } from "@/components/button-styles";
import { PLAN_TYPE_LABELS, type PlanType } from "@/lib/marketing";
import { createPlan, updatePlan, setPlanArchived, deletePlan } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";
const INPUT_SM = "rounded-lg border-[1.5px] border-zinc-300 px-2 py-1 text-xs";

type Plan = {
  id: string;
  title: string;
  body: string;
  type: PlanType;
  archived: boolean;
  updated_at: string;
};

const TYPE_PILL: Record<PlanType, string> = {
  strategia: "bg-brand-navy/10 text-brand-navy",
  plan: "bg-zinc-100 text-zinc-600",
};

export async function PlansSection() {
  const supabase = createServerSupabaseClient();
  const { data: plansRaw } = await supabase
    .from("marketing_plan")
    .select("id, title, body, type, archived, updated_at")
    .order("updated_at", { ascending: false });

  const plans = (plansRaw ?? []) as Plan[];
  const active = plans.filter((p) => !p.archived);
  const archived = plans.filter((p) => p.archived);

  function renderPlan(p: Plan) {
    return (
      <div key={p.id} className="rounded-xl border border-zinc-200 bg-white p-3">
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 marker:content-none">
            <span className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TYPE_PILL[p.type]}`}>{PLAN_TYPE_LABELS[p.type]}</span>
              <span className="font-semibold text-zinc-900">{p.title}</span>
            </span>
            <span className="text-xs text-zinc-400">
              {new Date(p.updated_at).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </summary>
          <div className="mt-3 border-t border-zinc-100 pt-3">
            {p.body && <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-700">{p.body}</p>}
            <details>
              <summary className={`${BTN_GHOST} cursor-pointer [&::-webkit-details-marker]:hidden`}>Edytuj</summary>
              <form action={updatePlan} className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input name="title" defaultValue={p.title} required className={INPUT_SM} placeholder="Tytuł" />
                <select name="type" defaultValue={p.type} className={INPUT_SM}>
                  {(Object.entries(PLAN_TYPE_LABELS) as [PlanType, string][]).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <textarea name="body" defaultValue={p.body} rows={6} className={INPUT_SM} placeholder="Treść" />
                <div className="flex flex-wrap items-center gap-2">
                  <SubmitButton className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
                    Zapisz
                  </SubmitButton>
                  <ConfirmButton formAction={deletePlan} confirmText={`Usunąć "${p.title}"? Tego nie da się cofnąć.`} className={BTN_GHOST_DANGER}>
                    Usuń
                  </ConfirmButton>
                </div>
              </form>
            </details>
            <form action={setPlanArchived} className="mt-1.5">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="archived" value={String(!p.archived)} />
              <button type="submit" className={BTN_GHOST}>
                {p.archived ? "Przywróć" : "Archiwizuj"}
              </button>
            </form>
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand-orange marker:content-none">+ Nowy dokument</summary>
          <form action={createPlan} className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>Tytuł</label>
              <input name="title" required className={INPUT} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>Typ</label>
              <select name="type" defaultValue="plan" className={INPUT}>
                {(Object.entries(PLAN_TYPE_LABELS) as [PlanType, string][]).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>Treść</label>
              <textarea name="body" rows={6} className={INPUT} />
            </div>
            <div>
              <SubmitButton className={BTN_PRIMARY}>Dodaj dokument</SubmitButton>
            </div>
          </form>
        </details>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Aktywne</h2>
        {active.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak dokumentów.</p>
        ) : (
          <div className="flex flex-col gap-2">{active.map(renderPlan)}</div>
        )}
      </Card>

      {archived.length > 0 && (
        <details className="rounded-2xl border border-dashed border-zinc-300 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-zinc-500 marker:content-none">
            <span>Pokaż zarchiwizowane ({archived.length})</span>
            <span className="group-open:hidden">▸</span>
          </summary>
          <div className="mt-3 flex flex-col gap-2">{archived.map(renderPlan)}</div>
        </details>
      )}
    </div>
  );
}
