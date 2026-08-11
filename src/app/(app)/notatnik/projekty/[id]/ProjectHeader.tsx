"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/Card";
import { updateProject, deleteProject, linkProjects, unlinkProjects } from "../../actions";

type Project = { id: string; name: string; description: string; status: "active" | "done" | "archived"; created_at: string };
type ProjectRef = { id: string; name: string };

const STATUS_LABELS: Record<string, string> = { active: "Aktywny", done: "Zakończony", archived: "Zarchiwizowany" };

export function ProjectHeader({
  project,
  allProjects,
  linkedProjectIds,
}: {
  project: Project;
  allProjects: ProjectRef[];
  linkedProjectIds: Set<string>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState(project.status);
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function handleSave() {
    setBusy(true);
    try {
      await updateProject(project.id, name, description, status);
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nie udało się zapisać.");
    } finally {
      setBusy(false);
    }
  }

  const linkedProjects = allProjects.filter((p) => linkedProjectIds.has(p.id));
  const linkableProjects = allProjects.filter((p) => !linkedProjectIds.has(p.id));

  return (
    <Card>
      {editing ? (
        <div className="flex flex-col gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm font-semibold" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm" />
          <select value={status} onChange={(e) => setStatus(e.target.value as Project["status"])} className="w-fit rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm">
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={handleSave} className="rounded-lg bg-brand-orange px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-orange-dark">
              Zapisz
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50">
              Anuluj
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 className="text-lg font-bold text-zinc-900">{project.name}</h1>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">{STATUS_LABELS[project.status]}</span>
          </div>
          {project.description && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{project.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3 text-xs">
            <button type="button" onClick={() => setEditing(true)} className="font-semibold text-zinc-500 hover:text-zinc-800">
              Edytuj
            </button>
            <button type="button" onClick={() => setLinking((v) => !v)} className="font-semibold text-zinc-500 hover:text-zinc-800">
              Powiąż z projektem
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Usunąć projekt "${project.name}"? Zadania i notatki zostaną odpięte, nie usunięte.`)) {
                  startTransition(() => deleteProject(project.id));
                }
              }}
              className="font-semibold text-red-500 hover:text-red-700"
            >
              Usuń projekt
            </button>
          </div>
        </>
      )}

      {linkedProjects.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {linkedProjects.map((p) => (
            <span key={p.id} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
              <Link href={`/notatnik/projekty/${p.id}`} className="hover:underline">
                {p.name}
              </Link>
              <button type="button" onClick={() => startTransition(() => unlinkProjects(project.id, p.id))} className="text-zinc-400 hover:text-red-500">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      {linking && (
        <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg bg-zinc-50 p-2">
          {linkableProjects.length === 0 && <span className="text-xs text-zinc-400">Brak innych projektów do powiązania.</span>}
          {linkableProjects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                startTransition(() => linkProjects(project.id, p.id));
                setLinking(false);
              }}
              className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[11px] hover:bg-zinc-100"
            >
              + {p.name}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
