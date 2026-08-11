"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/Card";
import { createProject } from "./actions";

type Project = { id: string; name: string; description: string; status: "active" | "done" | "archived"; created_at: string };

const STATUS_LABELS: Record<string, string> = { active: "Aktywny", done: "Zakończony", archived: "Zarchiwizowany" };
const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  done: "bg-zinc-200 text-zinc-600",
  archived: "bg-amber-100 text-amber-700",
};

export function ProjectList({
  projects,
  openTaskCountByProject,
}: {
  projects: Project[];
  openTaskCountByProject: Map<string, number>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createProject(name, description);
      setName("");
      setDescription("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nie udało się utworzyć projektu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="mb-2 font-semibold text-zinc-900">Nowy projekt</h2>
        <div className="flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nazwa projektu…"
            className="w-full rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opis (opcjonalnie)…"
            rows={2}
            className="w-full rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={handleCreate}
            className="self-start rounded-xl bg-brand-orange px-4 py-1.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
          >
            Utwórz projekt
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {projects.map((p) => (
          <Link key={p.id} href={`/notatnik/projekty/${p.id}`} className="block">
            <Card className="h-full transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-zinc-900">{p.name}</h3>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[p.status]}`}>{STATUS_LABELS[p.status]}</span>
              </div>
              {p.description && <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{p.description}</p>}
              <p className="mt-2 text-xs text-zinc-400">{openTaskCountByProject.get(p.id) ?? 0} otwartych zadań</p>
            </Card>
          </Link>
        ))}
        {projects.length === 0 && <p className="text-sm text-zinc-400">Brak projektów — utwórz pierwszy powyżej.</p>}
      </div>
    </div>
  );
}
