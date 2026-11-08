"use client";

import { useState } from "react";
import { BTN_GHOST } from "@/components/button-styles";
import { EVENT_PROJECT_STATUS_LABELS, EVENT_PROJECT_STATUS_ORDER, type EventProjectStatus } from "@/lib/marketing";
import { updateEventProject } from "./actions";

const INPUT_SM = "rounded-lg border-[1.5px] border-zinc-300 px-2 py-1.5 text-xs";

type Project = { id: string; name: string; color: string; event_date: string | null; status: EventProjectStatus };

const STATUS_BADGE: Record<EventProjectStatus, string> = {
  planowanie: "bg-zinc-100 text-zinc-600",
  w_toku: "bg-amber-100 text-amber-700",
  zamkniety: "bg-emerald-100 text-emerald-700",
};

export function EventProjectHeader({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form action={updateEventProject} onSubmit={() => setEditing(false)} className="flex flex-wrap items-end gap-2 rounded-xl bg-zinc-50 p-3">
        <input type="hidden" name="id" value={project.id} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-zinc-700">Nazwa</label>
          <input name="name" defaultValue={project.name} required className={INPUT_SM} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-zinc-700">Data</label>
          <input type="date" name="event_date" defaultValue={project.event_date ?? ""} className={INPUT_SM} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-zinc-700">Status</label>
          <select name="status" defaultValue={project.status} className={INPUT_SM}>
            {EVENT_PROJECT_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {EVENT_PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <input type="color" name="color" defaultValue={project.color} className="h-[33px] w-12 rounded-lg border-[1.5px] border-zinc-300 p-0.5" />
        <button type="submit" className="rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-zinc-900">
          Zapisz
        </button>
        <button type="button" onClick={() => setEditing(false)} className={BTN_GHOST}>
          Anuluj
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
      <h1 className="text-lg font-bold text-zinc-900">{project.name}</h1>
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[project.status]}`}>{EVENT_PROJECT_STATUS_LABELS[project.status]}</span>
      {project.event_date && (
        <span className="text-sm text-zinc-500">{new Date(project.event_date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}</span>
      )}
      <button type="button" onClick={() => setEditing(true)} className={BTN_GHOST}>
        Edytuj
      </button>
    </div>
  );
}
