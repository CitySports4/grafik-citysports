"use client";

import { useMemo, useState, useTransition } from "react";
import { ColorDot } from "@/components/ColorDot";
import {
  createNote,
  updateNote,
  deleteNote,
  convertToTask,
  convertToNote,
  updateTaskStatus,
  updateTaskAssignee,
  linkNotes,
  unlinkNotes,
} from "./actions";

type Employee = { id: string; name: string; color_hex: string };
type Note = {
  id: string;
  author_employee_id: string;
  title: string;
  body: string;
  is_task: boolean;
  status: "todo" | "in_progress" | "done" | null;
  assignee_employee_id: string | null;
  created_at: string;
  updated_at: string;
  linkedIds: string[];
};

const STATUS_LABELS: Record<string, string> = {
  todo: "Do zrobienia",
  in_progress: "W trakcie",
  done: "Zrobione",
};

const INPUT = "w-full rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm";

export function NotesBoard({
  currentEmployeeId,
  isAdmin,
  employees,
  notes,
}: {
  currentEmployeeId: string;
  isAdmin: boolean;
  employees: Employee[];
  notes: Note[];
}) {
  const [filter, setFilter] = useState<"all" | "notes" | "tasks">("all");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  const filtered = notes.filter((n) => (filter === "all" ? true : filter === "tasks" ? n.is_task : !n.is_task));

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      await createNote(newTitle, newBody);
      setNewTitle("");
      setNewBody("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nie udało się zapisać.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditBody(note.body);
  }

  async function handleSaveEdit(noteId: string) {
    setBusy(true);
    try {
      await updateNote(noteId, editTitle, editBody);
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nie udało się zapisać.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex flex-col gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Tytuł notatki lub pomysłu…"
            className={INPUT}
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Treść (opcjonalnie)…"
            rows={2}
            className={INPUT}
          />
          <button
            type="button"
            disabled={busy || !newTitle.trim()}
            onClick={handleCreate}
            className="self-start rounded-xl bg-brand-orange px-4 py-1.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
          >
            Dodaj notatkę
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-zinc-200">
        {(["all", "notes", "tasks"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-2 text-sm font-semibold ${filter === f ? "border-b-2 border-brand-orange text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}
          >
            {f === "all" ? "Wszystko" : f === "notes" ? "Notatki" : "Zadania"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((note) => {
          const author = employeeById.get(note.author_employee_id);
          const assignee = note.assignee_employee_id ? employeeById.get(note.assignee_employee_id) : null;
          const canEdit = note.author_employee_id === currentEmployeeId || isAdmin;
          const isEditing = editingId === note.id;
          const linkableNotes = notes.filter((n) => n.id !== note.id && !note.linkedIds.includes(n.id));

          return (
            <div key={note.id} className={`rounded-xl border p-3 ${note.is_task && note.status === "done" ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"}`}>
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={INPUT} />
                  <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} className={INPUT} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSaveEdit(note.id)}
                      className="rounded-lg bg-brand-orange px-3 py-1 text-xs font-bold text-white hover:bg-brand-orange-dark"
                    >
                      Zapisz
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-zinc-50">
                      Anuluj
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        {note.is_task && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              note.status === "done" ? "bg-emerald-100 text-emerald-700" : note.status === "in_progress" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600"
                            }`}
                          >
                            {STATUS_LABELS[note.status ?? "todo"]}
                          </span>
                        )}
                        <span className="font-semibold text-zinc-900">{note.title}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400">
                        {author && <ColorDot color={author.color_hex} />}
                        {author?.name ?? "?"} · {new Date(note.created_at).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
                      </div>
                    </div>
                  </div>
                  {note.body && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{note.body}</p>}

                  {note.is_task && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        defaultValue={note.status ?? "todo"}
                        onChange={(e) => startTransition(() => updateTaskStatus(note.id, e.target.value as "todo" | "in_progress" | "done"))}
                        className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                      >
                        {Object.entries(STATUS_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <select
                        defaultValue={note.assignee_employee_id ?? ""}
                        onChange={(e) => startTransition(() => updateTaskAssignee(note.id, e.target.value || null))}
                        className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                      >
                        <option value="">— nieprzypisane —</option>
                        {employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                      {assignee && <ColorDot color={assignee.color_hex} />}
                    </div>
                  )}

                  {note.linkedIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {note.linkedIds.map((id) => {
                        const linked = noteById.get(id);
                        if (!linked) return null;
                        return (
                          <span key={id} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                            {linked.title}
                            <button type="button" onClick={() => startTransition(() => unlinkNotes(note.id, id))} className="text-zinc-400 hover:text-red-500">
                              ✕
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2 text-xs">
                    {canEdit && (
                      <button type="button" onClick={() => startEdit(note)} className="font-semibold text-zinc-500 hover:text-zinc-800">
                        Edytuj
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startTransition(() => (note.is_task ? convertToNote(note.id) : convertToTask(note.id)))}
                      className="font-semibold text-zinc-500 hover:text-zinc-800"
                    >
                      {note.is_task ? "Przekształć w notatkę" : "Przekształć w zadanie"}
                    </button>
                    <button type="button" onClick={() => setLinkingId(linkingId === note.id ? null : note.id)} className="font-semibold text-zinc-500 hover:text-zinc-800">
                      Powiąż
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Usunąć tę notatkę?")) startTransition(() => deleteNote(note.id));
                        }}
                        className="font-semibold text-red-500 hover:text-red-700"
                      >
                        Usuń
                      </button>
                    )}
                  </div>

                  {linkingId === note.id && (
                    <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg bg-zinc-50 p-2">
                      {linkableNotes.length === 0 && <span className="text-xs text-zinc-400">Brak innych notatek do powiązania.</span>}
                      {linkableNotes.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            startTransition(() => linkNotes(note.id, n.id));
                            setLinkingId(null);
                          }}
                          className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[11px] hover:bg-zinc-100"
                        >
                          + {n.title}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-sm text-zinc-400">Brak wpisów.</p>}
      </div>
    </div>
  );
}
