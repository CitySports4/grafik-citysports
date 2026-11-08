"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { BTN_PRIMARY } from "@/components/button-styles";
import { TASK_PRIORITY_LABELS, RECORDING_FORMAT_LABELS, type MarketingTaskPriority, type RecordingFormat } from "@/lib/marketing";
import { createTask } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

type Assignee = { id: string; name: string; color_hex: string };
type Project = { id: string; name: string; color: string };

// Pola nagraniowe (Sprint D, D1) — widoczne gdy assignee = Oliwia (osoba
// nagrywająca) ALBO ręczny toggle "To zadanie nagraniowe". Oba warunki
// wymagają śledzenia na żywo wartości selecta assignee, stąd ten formularz
// jako osobny komponent kliencki (reszta TasksSection zostaje Server
// Component) — submit i tak idzie przez zwykły `action={createTask}` na
// formularzu, SubmitButton dalej działa przez useFormStatus bez zmian.
export function AddTaskForm({
  currentEmployeeId,
  assignees,
  activeProjects,
  recordingAssigneeId,
}: {
  currentEmployeeId: string;
  assignees: Assignee[];
  activeProjects: Project[];
  // id osoby o imieniu "Oliwia", jeśli taka istnieje wśród assignees —
  // ustalane raz, po stronie serwera (patrz TasksSection), żeby nie wiązać
  // tego komponentu na sztywno z konkretnym UUID.
  recordingAssigneeId?: string;
}) {
  const [assigneeId, setAssigneeId] = useState(currentEmployeeId);
  const [manualToggle, setManualToggle] = useState(false);
  const showRecordingFields = manualToggle || (!!recordingAssigneeId && assigneeId === recordingAssigneeId);

  return (
    <form action={createTask} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="title" required placeholder="Dodaj nowe zadanie…" className={`${INPUT} flex-1`} />
        <SubmitButton className={`${BTN_PRIMARY} shrink-0`}>Dodaj</SubmitButton>
      </div>
      {/* Domyślnie ROZWINIĘTE (patrz audyt UX) — zwinięte chowało właśnie
          termin/osobę/projekt, czyli dokładnie to, co trzeba wypełnić, żeby
          zadanie nie wylądowało bez terminu i bez przypisania w "Do
          zrobienia". */}
      <details open>
        <summary className="cursor-pointer text-xs font-semibold text-zinc-500 marker:content-none">
          Więcej opcji (osoba, priorytet, termin, projekt) ▾
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select name="assignee_employee_id" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={INPUT}>
            <option value="">— nieprzypisane —</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select name="priority" defaultValue="normal" className={INPUT}>
            {(Object.entries(TASK_PRIORITY_LABELS) as [MarketingTaskPriority, string][]).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input type="date" name="due_date" className={INPUT} />
          <select name="project" defaultValue="" className={INPUT}>
            <option value="">— bez projektu —</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <textarea name="description" rows={2} placeholder="Opis (opcjonalnie)" className={`${INPUT} mt-2`} />

        <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-zinc-600">
          <input type="checkbox" checked={manualToggle} onChange={(e) => setManualToggle(e.target.checked)} className="h-3.5 w-3.5" />
          🎥 To zadanie nagraniowe
        </label>

        {showRecordingFields && (
          <div className="mt-2 flex flex-col gap-2 rounded-xl bg-violet-50 p-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700">Format</label>
              <select name="recording_format" defaultValue="" className={`${INPUT} !py-1.5 text-sm`}>
                <option value="">— wybierz —</option>
                {(Object.entries(RECORDING_FORMAT_LABELS) as [RecordingFormat, string][]).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700">Czego szukać</label>
              <textarea
                name="recording_look_for"
                rows={2}
                placeholder="np. spokojne momenty, skupienie, uśmiech po ćwiczeniu"
                className={`${INPUT} !py-1.5 text-sm`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700">Przekaz / nastrój</label>
              <textarea
                name="recording_mood"
                rows={2}
                placeholder="np. tu możesz się zatrzymać i odetchnąć"
                className={`${INPUT} !py-1.5 text-sm`}
              />
            </div>
          </div>
        )}
      </details>
    </form>
  );
}
