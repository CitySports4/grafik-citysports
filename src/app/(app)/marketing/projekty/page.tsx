import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canAccessMarketing } from "@/lib/session";
import { Card } from "@/components/Card";
import { BackLink } from "@/components/BackLink";
import { SubmitButton } from "@/components/SubmitButton";
import { createProject, setProjectActive } from "./actions";
import { ProjectRow } from "./ProjectRow";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

type Project = { id: string; name: string; color: string; is_active: boolean };

export default async function MarketingProjectsPage() {
  const employee = await requireEmployee();
  if (!canAccessMarketing(employee)) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">Nie masz dostępu do narzędzia marketingu.</p>
      </div>
    );
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from("marketing_project").select("id, name, color, is_active").order("name");
  const allProjects = (data ?? []) as Project[];
  const activeProjects = allProjects.filter((p) => p.is_active);
  const archivedProjects = allProjects.filter((p) => !p.is_active);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/marketing" label="Marketing" />

      <div>
        <h1 className="text-lg font-bold text-zinc-900">Projekty</h1>
        <p className="text-sm text-zinc-500">
          Projekty do wyboru w formularzach zadań i treści kalendarza — zarządzane tutaj, nie na sztywno w kodzie.
        </p>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Dodaj projekt</h2>
        <form action={createProject} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-sm font-semibold text-zinc-900">Nazwa</label>
            <input name="name" required placeholder="np. Wakacje 2027" className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-zinc-900">Kolor</label>
            <input type="color" name="color" defaultValue="#7c3aed" className="h-[41px] w-16 rounded-xl border-[1.5px] border-zinc-300 p-1" />
          </div>
          <SubmitButton className="shrink-0 rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
            Dodaj
          </SubmitButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Aktywne ({activeProjects.length})</h2>
        {activeProjects.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak aktywnych projektów.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {activeProjects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </div>
        )}
      </Card>

      {archivedProjects.length > 0 && (
        <details className="rounded-2xl border border-dashed border-zinc-300 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-zinc-500 marker:content-none">
            <span>Pokaż zarchiwizowane ({archivedProjects.length})</span>
          </summary>
          <div className="mt-3 flex flex-col gap-1.5">
            {archivedProjects.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full opacity-50" style={{ backgroundColor: p.color }} />
                  <span className="text-zinc-500 line-through">{p.name}</span>
                </span>
                <form action={setProjectActive}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="is_active" value="true" />
                  <button type="submit" className="text-xs font-semibold text-brand-orange hover:underline">
                    Przywróć
                  </button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
