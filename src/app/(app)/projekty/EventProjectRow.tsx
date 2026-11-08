import Link from "next/link";
import { EVENT_PROJECT_STATUS_LABELS, type EventProjectStatus } from "@/lib/marketing";

type Project = { id: string; name: string; color: string; event_date: string | null; status: EventProjectStatus };

const STATUS_BADGE: Record<EventProjectStatus, string> = {
  planowanie: "bg-zinc-100 text-zinc-600",
  w_toku: "bg-amber-100 text-amber-700",
  zamkniety: "bg-emerald-100 text-emerald-700",
};

// Wiersz listy — tylko podgląd i link do tablicy wydarzenia; edycja
// (nazwa/kolor/data/status/notatki) żyje w /projekty/[id], żeby ta lista nie
// musiała dźwigać tej samej logiki co ProjectRow w marketingu.
export function EventProjectRow({ project, taskCount }: { project: Project; taskCount: { total: number; done: number } }) {
  return (
    <Link
      href={`/projekty/${project.id}`}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2.5 text-sm hover:bg-zinc-100"
    >
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
        <span className="font-semibold text-zinc-900">{project.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[project.status]}`}>{EVENT_PROJECT_STATUS_LABELS[project.status]}</span>
      </span>
      <span className="flex items-center gap-3 text-xs text-zinc-500">
        {project.event_date && (
          <span>{new Date(project.event_date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}</span>
        )}
        <span>
          {taskCount.done}/{taskCount.total} zadań
        </span>
      </span>
    </Link>
  );
}
