import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canAccessMarketing } from "@/lib/session";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { EVENT_PROJECT_STATUS_LABELS, EVENT_PROJECT_STATUS_ORDER, type EventProjectStatus } from "@/lib/marketing";
import { createEventProject } from "./actions";
import { EventProjectRow } from "./EventProjectRow";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

type Project = { id: string; name: string; color: string; event_date: string | null; status: EventProjectStatus };

// Sekcja /projekty (eventowe) — osobna od /marketing/projekty (patrz Sprint
// D, D2). Dzieli tabelę marketing_project (type="event", migracja 0065),
// ale nie dropdowny/filtry marketingu — te są już odfiltrowane po stronie
// modułu marketing (patrz ContentCalendarSection/TasksSection/actions.ts).
export default async function EventProjectsPage() {
  const employee = await requireEmployee();
  if (!canAccessMarketing(employee)) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">Nie masz dostępu do tej sekcji.</p>
      </div>
    );
  }

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("marketing_project")
    .select("id, name, color, event_date, status")
    .eq("type", "event")
    .order("event_date", { ascending: true, nullsFirst: false });
  const projects = (data ?? []) as Project[];
  const projectNames = projects.map((p) => p.name);

  const { data: tasksRaw } =
    projectNames.length > 0 ? await supabase.from("marketing_task").select("project, status").in("project", projectNames) : { data: [] };
  const tasks = (tasksRaw ?? []) as { project: string; status: "todo" | "in_progress" | "gotowe" | "opublikowane" }[];
  const taskCountsByProject = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    const c = taskCountsByProject.get(t.project) ?? { total: 0, done: 0 };
    c.total += 1;
    if (t.status === "opublikowane") c.done += 1;
    taskCountsByProject.set(t.project, c);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">🎉 Wydarzenia</h1>
        <p className="text-sm text-zinc-500">
          Projekty eventowe (Wigilia, Półkolonie, Liga Deblowa, ...) — osobna sekcja od marketingu, z własnym statusem, terminem i notatkami.
        </p>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Dodaj wydarzenie</h2>
        <form action={createEventProject} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-sm font-semibold text-zinc-900">Nazwa</label>
            <input name="name" required placeholder="np. Maraton" className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-zinc-900">Data</label>
            <input type="date" name="event_date" className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-zinc-900">Status</label>
            <select name="status" defaultValue="planowanie" className={INPUT}>
              {EVENT_PROJECT_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {EVENT_PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-zinc-900">Kolor</label>
            <input type="color" name="color" defaultValue="#dc2626" className="h-[41px] w-16 rounded-xl border-[1.5px] border-zinc-300 p-1" />
          </div>
          <SubmitButton className="shrink-0 rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
            Dodaj
          </SubmitButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Wydarzenia ({projects.length})</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak wydarzeń.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {projects.map((p) => (
              <EventProjectRow key={p.id} project={p} taskCount={taskCountsByProject.get(p.name) ?? { total: 0, done: 0 }} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
