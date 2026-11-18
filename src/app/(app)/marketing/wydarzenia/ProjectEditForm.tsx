"use client";

import { useState } from "react";
import { BTN_GHOST } from "@/components/button-styles";
import {
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_ICONS,
  EVENT_PROJECT_STATUS_LABELS,
  EVENT_PROJECT_STATUS_ORDER,
  type ProjectType,
  type EventProjectStatus,
} from "@/lib/marketing";
import { updateProject } from "./actions";

const INPUT_SM = "rounded-lg border-[1.5px] border-zinc-300 px-2 py-1.5 text-xs";

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
  target_label: string;
  to_confirm: string;
};

const STATUS_BADGE: Record<EventProjectStatus, string> = {
  planowanie: "bg-zinc-100 text-zinc-600",
  w_toku: "bg-amber-100 text-amber-700",
  zamkniety: "bg-emerald-100 text-emerald-700",
};

function formatLongDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

export function ProjectEditForm({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<ProjectType>(project.type);

  if (!editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
          <h1 className="text-lg font-bold text-zinc-900">{project.name}</h1>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">
            {PROJECT_TYPE_ICONS[project.type]} {PROJECT_TYPE_LABELS[project.type]}
          </span>
          {project.type !== "marketing" && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[project.status]}`}>{EVENT_PROJECT_STATUS_LABELS[project.status]}</span>
          )}
          <button type="button" onClick={() => setEditing(true)} className={BTN_GHOST}>
            Edytuj
          </button>
        </div>
        {project.event_date && (
          <p className="text-sm text-zinc-500">
            {formatLongDate(project.event_date)}
            {project.end_date && ` – ${formatLongDate(project.end_date)}`}
          </p>
        )}
        {project.to_confirm.trim() && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">⚠ Do potwierdzenia: {project.to_confirm}</p>
        )}
        {project.target_people !== null && (
          <p className="text-sm text-zinc-500">
            {project.actual_people ?? 0}/{project.target_people} {project.target_label || "cel"}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={updateProject} onSubmit={() => setEditing(false)} className="flex flex-col gap-2.5 rounded-xl bg-zinc-50 p-3">
      <input type="hidden" name="id" value={project.id} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-700">
          Nazwa
          <input name="name" defaultValue={project.name} required className={INPUT_SM} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-700">
          Typ
          <select name="type" value={type} onChange={(e) => setType(e.target.value as ProjectType)} className={INPUT_SM}>
            {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      {type !== "marketing" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-700">
            {type === "event" ? "Data wydarzenia" : "Data startu"}
            <input type="date" name="event_date" defaultValue={project.event_date ?? ""} className={INPUT_SM} />
          </label>
          {type === "kampania" && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-700">
              Data zakończenia
              <input type="date" name="end_date" defaultValue={project.end_date ?? ""} className={INPUT_SM} />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-700">
            Status
            <select name="status" defaultValue={project.status} className={INPUT_SM}>
              {EVENT_PROJECT_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {EVENT_PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {type !== "marketing" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-700">
            Cel liczbowy
            <input type="number" min="0" name="target_people" defaultValue={project.target_people ?? ""} className={INPUT_SM} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-700">
            Stan faktyczny
            <input type="number" min="0" name="actual_people" defaultValue={project.actual_people ?? ""} className={INPUT_SM} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-700">
            Czego dotyczy cel
            <input name="target_label" defaultValue={project.target_label} placeholder="np. zapisy, uczestnicy" className={INPUT_SM} />
          </label>
        </div>
      )}
      <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-700">
        Do potwierdzenia
        <textarea
          name="to_confirm"
          defaultValue={project.to_confirm}
          rows={2}
          placeholder="Co jeszcze trzeba ustalić, zanim ruszy komunikacja…"
          className={INPUT_SM}
        />
      </label>
      <div className="flex items-center gap-2">
        <input type="color" name="color" defaultValue={project.color} className="h-[33px] w-12 rounded-lg border-[1.5px] border-zinc-300 p-0.5" />
        <button type="submit" className="rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-zinc-900">
          Zapisz
        </button>
        <button type="button" onClick={() => setEditing(false)} className={BTN_GHOST}>
          Anuluj
        </button>
      </div>
    </form>
  );
}
