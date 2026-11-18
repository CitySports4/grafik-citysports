import { createServerSupabaseClient } from "@/lib/supabase";
import { Card } from "@/components/Card";
import type { ProjectType, EventProjectStatus, MarketingTaskStatus } from "@/lib/marketing";
import { AddProjectForm } from "./AddProjectForm";
import { ProjectListRow } from "./ProjectListRow";

type Project = {
  id: string;
  name: string;
  type: ProjectType;
  color: string;
  event_date: string | null;
  end_date: string | null;
  status: EventProjectStatus;
  target_people: number | null;
  actual_people: number | null;
  to_confirm: string;
  is_active: boolean;
};

// Przebudowa /projekty + /marketing/projekty -> jedna zakładka "Wydarzenia i
// kampanie" (migracja 0075) — wszystkie typy projektu naraz, zadania/treści
// liczone po project_id (klucz obcy), nie po dopasowaniu tekstu jak dotąd.
export async function ProjectsSection() {
  const supabase = createServerSupabaseClient();
  const { data: projectsRaw } = await supabase
    .from("marketing_project")
    .select("id, name, type, color, event_date, end_date, status, target_people, actual_people, to_confirm, is_active")
    .order("name");
  const projects = (projectsRaw ?? []) as Project[];
  const ids = projects.map((p) => p.id);

  const [{ data: tasksRaw }, { data: contentRaw }] = await Promise.all([
    ids.length > 0
      ? supabase.from("marketing_task").select("project_id, status").in("project_id", ids)
      : Promise.resolve({ data: [] as { project_id: string | null; status: MarketingTaskStatus }[] }),
    ids.length > 0
      ? supabase.from("marketing_content").select("project_id").in("project_id", ids)
      : Promise.resolve({ data: [] as { project_id: string | null }[] }),
  ]);

  const countsByProject = new Map<string, { tasks: number; tasksDone: number; content: number }>();
  for (const t of (tasksRaw ?? []) as { project_id: string | null; status: MarketingTaskStatus }[]) {
    if (!t.project_id) continue;
    const c = countsByProject.get(t.project_id) ?? { tasks: 0, tasksDone: 0, content: 0 };
    c.tasks += 1;
    if (t.status === "opublikowane") c.tasksDone += 1;
    countsByProject.set(t.project_id, c);
  }
  for (const item of (contentRaw ?? []) as { project_id: string | null }[]) {
    if (!item.project_id) continue;
    const c = countsByProject.get(item.project_id) ?? { tasks: 0, tasksDone: 0, content: 0 };
    c.content += 1;
    countsByProject.set(item.project_id, c);
  }

  // Najbliższe wydarzenia/kampanie najpierw (po event_date), "Ogólne" zawsze
  // na końcu (worek bez terminu, nie konkuruje z czymś, co ma faktyczny
  // deadline) — ten sam duch co projectSortKey w lib/marketing.ts, tylko po
  // dacie, nie po nazwie.
  function sortKey(p: Project): [number, string] {
    if (p.type === "marketing") return [2, p.name];
    return [p.event_date ? 0 : 1, p.event_date ?? p.name];
  }
  const visible = projects.filter((p) => p.is_active && p.status !== "zamkniety");
  const hidden = projects.filter((p) => !p.is_active || p.status === "zamkniety");
  const sortFn = (a: Project, b: Project) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    return ka[0] !== kb[0] ? ka[0] - kb[0] : ka[1].localeCompare(kb[1]);
  };
  visible.sort(sortFn);
  hidden.sort(sortFn);

  const emptyCounts = { tasks: 0, tasksDone: 0, content: 0 };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Dodaj projekt</h2>
        <AddProjectForm />
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Projekty ({visible.length})</h2>
        {visible.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak projektów.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map((p) => (
              <ProjectListRow key={p.id} project={p} counts={countsByProject.get(p.id) ?? emptyCounts} />
            ))}
          </div>
        )}
      </Card>

      {hidden.length > 0 && (
        <details className="rounded-2xl border border-dashed border-zinc-300 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-zinc-500 marker:content-none">
            <span>Zamknięte / zarchiwizowane ({hidden.length})</span>
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            {hidden.map((p) => (
              <ProjectListRow key={p.id} project={p} counts={countsByProject.get(p.id) ?? emptyCounts} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
