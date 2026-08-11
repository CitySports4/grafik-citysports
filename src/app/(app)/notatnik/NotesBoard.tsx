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
  updatePriority,
  linkNotes,
  unlinkNotes,
  addComment,
  deleteComment,
} from "./actions";

type Employee = { id: string; name: string; color_hex: string };
type Comment = { id: string; author_employee_id: string; body: string; created_at: string };
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
  project_id: string | null;
  category: "general" | "idea" | "plan";
  priority: number | null;
  due_date: string | null;
  is_long_term: boolean;
  source: "human" | "ai";
  comments: Comment[];
};
type ProjectRef = { id: string; name: string };

const STATUS_LABELS: Record<string, string> = {
  todo: "Do zrobienia",
  in_progress: "W trakcie",
  done: "Zrobione",
};
const PRIORITY_LABELS: Record<string, string> = { "1": "Niski", "2": "Średni", "3": "Wysoki" };
const CATEGORY_LABELS: Record<string, string> = { general: "Notatka", idea: "Pomysł", plan: "Plan" };

const INPUT = "w-full rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm";

function dateShort(iso: string) {
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

// Lewy pasek koloru zamiast tekstowych odznak — priorytet ważniejszy niż typ,
// AI ważniejsze niż zwykła notatka, reszta neutralna.
function borderClass(note: Note): string {
  if (note.priority === 3) return "border-l-4 border-l-red-400";
  if (note.priority) return "border-l-4 border-l-amber-400";
  if (note.source === "ai") return "border-l-4 border-l-brand-blue";
  if (note.category === "idea") return "border-l-4 border-l-violet-400";
  if (note.category === "plan") return "border-l-4 border-l-teal-400";
  return "border-l-4 border-l-transparent";
}

export type NotesBoardMode = "wszystko" | "zadania" | "pomysly" | "plany" | "projekt";

export function NotesBoard({
  mode,
  currentEmployeeId,
  isAdmin,
  employees,
  notes,
  projects,
  scopedProjectId,
}: {
  mode: NotesBoardMode;
  currentEmployeeId: string;
  isAdmin: boolean;
  employees: Employee[];
  notes: Note[];
  projects: ProjectRef[];
  scopedProjectId?: string;
}) {
  const [sortByPriority, setSortByPriority] = useState(false);
  const [longTermOnly, setLongTermOnly] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [newPriority, setNewPriority] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newLongTerm, setNewLongTerm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const createCategory: Note["category"] = mode === "pomysly" ? "idea" : mode === "plany" ? "plan" : "general";

  let base: Note[];
  if (mode === "projekt") base = notes.filter((n) => n.project_id === scopedProjectId);
  else if (mode === "zadania") base = notes.filter((n) => n.is_task);
  else if (mode === "pomysly") base = notes.filter((n) => n.category === "idea");
  else if (mode === "plany") base = notes.filter((n) => n.category === "plan" && n.is_long_term === longTermOnly);
  else base = notes;

  const filtered = sortByPriority && (mode === "wszystko" || mode === "zadania") ? [...base].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)) : base;

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      await createNote({
        title: newTitle,
        body: newBody,
        category: createCategory,
        projectId: scopedProjectId || newProjectId || null,
        priority: newPriority ? Number(newPriority) : null,
        dueDate: mode === "plany" ? newDueDate || null : null,
        isLongTerm: mode === "plany" ? newLongTerm : false,
      });
      setNewTitle("");
      setNewBody("");
      setNewProjectId("");
      setNewPriority("");
      setNewDueDate("");
      setNewLongTerm(false);
      setShowMoreOptions(false);
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

  async function handleSaveEdit(note: Note) {
    setBusy(true);
    try {
      await updateNote(note.id, {
        title: editTitle,
        body: editBody,
        priority: note.priority,
        dueDate: note.due_date,
        isLongTerm: note.is_long_term,
        projectId: note.project_id,
      });
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nie udało się zapisać.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddComment(noteId: string) {
    if (!commentDraft.trim()) return;
    const body = commentDraft;
    setCommentDraft("");
    startTransition(() => addComment(noteId, body));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex flex-col gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={mode === "pomysly" ? "Nowy pomysł…" : mode === "plany" ? "Nowy plan…" : "Nowa notatka lub zadanie…"}
            className={INPUT}
          />
          {showMoreOptions && (
            <>
              <textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="Treść (opcjonalnie)…" rows={2} className={INPUT} />
              <div className="flex flex-wrap items-end gap-2">
                {!scopedProjectId && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-zinc-500">Projekt</label>
                    <select value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs">
                      <option value="">—</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-zinc-500">Priorytet</label>
                  <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs">
                    <option value="">—</option>
                    {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                {mode === "plany" && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-zinc-500">Data</label>
                      <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
                    </div>
                    <label className="flex items-center gap-1.5 pb-1 text-xs text-zinc-600">
                      <input type="checkbox" checked={newLongTerm} onChange={(e) => setNewLongTerm(e.target.checked)} className="h-3.5 w-3.5" />
                      Długoterminowy
                    </label>
                  </>
                )}
              </div>
            </>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy || !newTitle.trim()}
              onClick={handleCreate}
              className="rounded-xl bg-brand-orange px-4 py-1.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
            >
              Dodaj
            </button>
            <button type="button" onClick={() => setShowMoreOptions((v) => !v)} className="text-xs font-semibold text-zinc-500 hover:text-zinc-800">
              {showMoreOptions ? "Mniej opcji" : "Więcej opcji"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {(mode === "wszystko" || mode === "zadania") && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
            <input type="checkbox" checked={sortByPriority} onChange={(e) => setSortByPriority(e.target.checked)} className="h-3.5 w-3.5" />
            Sortuj wg priorytetu
          </label>
        )}
        {mode === "plany" && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
            <input type="checkbox" checked={longTermOnly} onChange={(e) => setLongTermOnly(e.target.checked)} className="h-3.5 w-3.5" />
            Tylko długoterminowe
          </label>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((note) => {
          const author = employeeById.get(note.author_employee_id);
          const assignee = note.assignee_employee_id ? employeeById.get(note.assignee_employee_id) : null;
          const project = note.project_id ? projectById.get(note.project_id) : null;
          const canEdit = note.author_employee_id === currentEmployeeId || isAdmin;
          const isEditing = editingId === note.id;
          const isOpen = openId === note.id;
          const linkableNotes = notes.filter((n) => n.id !== note.id && !note.linkedIds.includes(n.id));

          const subtitleParts: string[] = [];
          if (note.is_task) subtitleParts.push(STATUS_LABELS[note.status ?? "todo"]);
          if (note.category !== "general") subtitleParts.push(CATEGORY_LABELS[note.category]);
          if (note.due_date) subtitleParts.push(new Date(note.due_date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" }));
          if (project && !scopedProjectId) subtitleParts.push(project.name);

          return (
            <div key={note.id} className={`rounded-lg bg-white ${borderClass(note)} ${note.is_task && note.status === "done" ? "opacity-60" : ""}`}>
              {isEditing ? (
                <div className="flex flex-col gap-2 p-3">
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={INPUT} />
                  <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} className={INPUT} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSaveEdit(note)}
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
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : note.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-zinc-50"
                  >
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-medium text-zinc-900 ${note.is_task && note.status === "done" ? "line-through" : ""}`}>{note.title}</p>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {author?.name ?? "?"} · {dateShort(note.created_at)}
                        {subtitleParts.length > 0 && ` · ${subtitleParts.join(" · ")}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-zinc-400">{isOpen ? "▲" : "⋯"}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-zinc-100 px-3 py-3">
                      {note.body && <p className="mb-2 whitespace-pre-wrap text-sm text-zinc-700">{note.body}</p>}

                      <div className="flex flex-wrap items-center gap-2">
                        {note.is_task && (
                          <>
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
                          </>
                        )}
                        <select
                          defaultValue={note.priority ?? ""}
                          onChange={(e) => startTransition(() => updatePriority(note.id, e.target.value ? Number(e.target.value) : null))}
                          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                        >
                          <option value="">Priorytet: —</option>
                          {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>
                              Priorytet: {l}
                            </option>
                          ))}
                        </select>
                      </div>

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

                      <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-2 text-xs">
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

                      <div className="mt-3 border-t border-zinc-100 pt-2">
                        <p className="mb-1.5 text-xs font-semibold text-zinc-500">Komentarze {note.comments.length > 0 && `(${note.comments.length})`}</p>
                        <div className="mb-2 flex flex-col gap-1.5">
                          {note.comments.map((c) => {
                            const commentAuthor = employeeById.get(c.author_employee_id);
                            const canDeleteComment = c.author_employee_id === currentEmployeeId || isAdmin;
                            return (
                              <div key={c.id} className="flex items-start justify-between gap-2 text-xs">
                                <div>
                                  <span className="font-semibold text-zinc-700">{commentAuthor?.name ?? "?"}:</span> <span className="text-zinc-600">{c.body}</span>
                                </div>
                                {canDeleteComment && (
                                  <button type="button" onClick={() => startTransition(() => deleteComment(c.id))} className="shrink-0 text-zinc-400 hover:text-red-500">
                                    ✕
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {note.comments.length === 0 && <p className="text-xs text-zinc-400">Brak komentarzy.</p>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            value={openId === note.id ? commentDraft : ""}
                            onChange={(e) => setCommentDraft(e.target.value)}
                            placeholder="Napisz komentarz…"
                            className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddComment(note.id);
                            }}
                          />
                          <button type="button" onClick={() => handleAddComment(note.id)} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold hover:bg-zinc-100">
                            Wyślij
                          </button>
                        </div>
                      </div>
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
