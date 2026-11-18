"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { BTN_PRIMARY } from "@/components/button-styles";
import { PROJECT_TYPE_LABELS, type ProjectType } from "@/lib/marketing";
import { createProject } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

// Daty i cel liczbowy mają sens tylko dla "event"/"kampania" — "Ogólne"
// (type="marketing") to zwykły worek na zadania/treści bez terminu, stąd
// śledzenie wybranego typu na żywo (komponent kliencki), żeby nie pokazywać
// pól, które i tak nic by nie znaczyły.
export function AddProjectForm() {
  const [type, setType] = useState<ProjectType>("event");

  return (
    <form action={createProject} className="flex flex-col gap-2.5">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <input name="name" required placeholder="np. Wigilia, Styczeń 2027" className={INPUT} />
        <select name="type" value={type} onChange={(e) => setType(e.target.value as ProjectType)} className={INPUT}>
          {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {type !== "marketing" && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600">
            {type === "event" ? "Data wydarzenia" : "Data startu"}
            <input type="date" name="event_date" className={INPUT} />
          </label>
          {type === "kampania" && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600">
              Data zakończenia
              <input type="date" name="end_date" className={INPUT} />
            </label>
          )}
        </div>
      )}
      <div className="flex items-center gap-2.5">
        <input type="color" name="color" defaultValue="#7c3aed" className="h-[41px] w-16 shrink-0 rounded-xl border-[1.5px] border-zinc-300 p-1" />
        <SubmitButton className={BTN_PRIMARY}>Dodaj</SubmitButton>
      </div>
    </form>
  );
}
