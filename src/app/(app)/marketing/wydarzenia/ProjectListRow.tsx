import Link from "next/link";
import { PROJECT_TYPE_LABELS, PROJECT_TYPE_ICONS, EVENT_PROJECT_STATUS_LABELS, type ProjectType, type EventProjectStatus } from "@/lib/marketing";

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

const STATUS_BADGE: Record<EventProjectStatus, string> = {
  planowanie: "bg-zinc-100 text-zinc-600",
  w_toku: "bg-amber-100 text-amber-700",
  zamkniety: "bg-emerald-100 text-emerald-700",
};

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
}

export function ProjectListRow({
  project,
  counts,
}: {
  project: Project;
  counts: { tasks: number; tasksDone: number; content: number };
}) {
  const progress =
    project.target_people && project.target_people > 0 ? Math.min(100, Math.round(((project.actual_people ?? 0) / project.target_people) * 100)) : null;

  return (
    <Link
      href={`/marketing/wydarzenia/${project.id}`}
      className={`flex flex-col gap-1.5 rounded-xl border px-3.5 py-3 text-sm hover:bg-zinc-50 ${!project.is_active ? "border-dashed border-zinc-300 opacity-60" : "border-zinc-200 bg-white"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
        <span className="font-semibold text-zinc-900">{project.name}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">
          {PROJECT_TYPE_ICONS[project.type]} {PROJECT_TYPE_LABELS[project.type]}
        </span>
        {project.type !== "marketing" && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[project.status]}`}>{EVENT_PROJECT_STATUS_LABELS[project.status]}</span>}
        {!project.is_active && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-bold text-zinc-600">Zarchiwizowany</span>}
        {project.to_confirm.trim() && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700" title={project.to_confirm}>
            ⚠ Do potwierdzenia
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        {project.event_date && (
          <span>
            {formatDate(project.event_date)}
            {project.end_date && ` – ${formatDate(project.end_date)}`}
          </span>
        )}
        <span>
          {counts.tasksDone}/{counts.tasks} zadań
        </span>
        <span>{counts.content} treści</span>
      </div>
      {progress !== null && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-brand-orange" style={{ width: `${progress}%` }} />
          </div>
          <span className="shrink-0 text-xs font-semibold text-zinc-500">
            {project.actual_people ?? 0}/{project.target_people}
          </span>
        </div>
      )}
    </Link>
  );
}
