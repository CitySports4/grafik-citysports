"use client";

import { useState } from "react";
import Link from "next/link";
import { ConfirmButton } from "@/components/ConfirmButton";
import { BTN_GHOST, BTN_GHOST_DANGER } from "@/components/button-styles";
import { updateProject, setProjectActive } from "./actions";

const INPUT_SM = "rounded-lg border-[1.5px] border-zinc-300 px-2 py-1 text-xs";

type Project = { id: string; name: string; color: string };

// Wiersz aktywnego projektu — "Archiwizuj" był dotąd jedyną akcją (czerwony
// link), czyli destrukcyjny CTA dominował listę (patrz audyt UX, F6).
// Teraz: "Zobacz zadania" i "Edytuj" jako główne, zwykłe akcje, Archiwizuj
// zostaje, ale przyciszony i z potwierdzeniem (ConfirmButton).
export function ProjectRow({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form
        action={updateProject}
        onSubmit={() => setEditing(false)}
        className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2"
      >
        <input type="hidden" name="id" value={project.id} />
        <input name="name" defaultValue={project.name} required className={`${INPUT_SM} flex-1`} />
        <input type="color" name="color" defaultValue={project.color} className="h-[29px] w-12 rounded-lg border-[1.5px] border-zinc-300 p-0.5" />
        <button type="submit" className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-zinc-900">
          Zapisz
        </button>
        <button type="button" onClick={() => setEditing(false)} className={BTN_GHOST}>
          Anuluj
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
        <span className="font-semibold text-zinc-900">{project.name}</span>
      </span>
      <span className="flex items-center gap-1">
        <Link href={`/marketing/projekty/${project.id}`} className={BTN_GHOST}>
          Zobacz zadania
        </Link>
        <button type="button" onClick={() => setEditing(true)} className={BTN_GHOST}>
          Edytuj
        </button>
        <form action={setProjectActive}>
          <input type="hidden" name="id" value={project.id} />
          <input type="hidden" name="is_active" value="false" />
          <ConfirmButton
            confirmText={`Zarchiwizować projekt „${project.name}”? Zniknie z list do wyboru — istniejące zadania i treści zostają bez zmian.`}
            className={BTN_GHOST_DANGER}
          >
            Archiwizuj
          </ConfirmButton>
        </form>
      </span>
    </div>
  );
}
