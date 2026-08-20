"use client";

import { useMemo, useState, useTransition } from "react";
import { ColorDot } from "@/components/ColorDot";
import {
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  updateTaskAssignee,
  updatePriority,
  linkTasks,
  unlinkTasks,
  addComment,
  deleteComment,
} from "./actions";

type Employee = { id: string; name: string; color_hex: string };
type Comment = { id: string; author_employee_id: string; body: string; created_at: string };
type Task = {
  id: string;
  author_employee_id: string;
  title: string;
  body: string;
  status: "todo" | "in_progress" | "done" | null;
  assignee_employee_id: string | null;
  created_at: string;
  updated_at: string;
  linkedIds: string[];
  priority: number | null;
  source: "human" | "ai";
  comments: Comment[];
};

const STATUS_LABELS: Record<string, string> = {
  todo: "Do zrobienia",
  in_progress: "W trakcie",
  done: "Zrobione",
};
const PRIORITY_LABELS: Record<string, string> = { "1": "Niski", "2": "Średni", "3": "Wysoki" };

const INPUT = "w-full rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm";

function dateShort(iso: string) {
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

// Lewy pasek koloru zamiast tekstowych odznak — priorytet ważniejszy niż
// pochodzenie (AI vs człowiek), reszta neutralna.
function borderClass(task: Task): string {
  if (task.priority === 3) return "border-l-4 border-l-red-400";
  if (task.priority) return "border-l-4 border-l-amber-400";
  if (task.source === "ai") return "border-l-4 border-l-brand-blue";
  return "border-l-4 border-l-transparent";
}

export function TasksBoard({
  currentEmployeeId,
  isAdmin,
  employees,
  tasks,
}: {
  currentEmployeeId: string;
  isAdmin: boolean;
  employees: Employee[];
  tasks: Task[];
}) {
  const [sortByPriority, setSortByPriority] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newPriority, setNewPriority] = useState("");
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const filtered = sortByPriority ? [...tasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)) : tasks;

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      await createTask({ title: newTitle, body: newBody, priority: newPriority ? Number(newPriority) : null });
      setNewTitle("");
      setNewBody("");
      setNewPriority("");
      setShowMoreOptions(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nie udało się zapisać.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditBody(task.body);
  }

  async function handleSaveEdit(task: Task) {
    setBusy(true);
    try {
      await updateTask(task.id, { title: editTitle, body: editBody, priority: task.priority });
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nie udało się zapisać.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddComment(taskId: string) {
    if (!commentDraft.trim()) return;
    const body = commentDraft;
    setCommentDraft("");
    startTransition(() => addComment(taskId, body));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex flex-col gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Nowe zadanie…"
            className={INPUT}
          />
          {showMoreOptions && (
            <>
              <textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="Treść (opcjonalnie)…" rows={2} className={INPUT} />
              <div className="flex flex-wrap items-end gap-2">
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
        <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
          <input type="checkbox" checked={sortByPriority} onChange={(e) => setSortByPriority(e.target.checked)} className="h-3.5 w-3.5" />
          Sortuj wg priorytetu
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((task) => {
          const author = employeeById.get(task.author_employee_id);
          const assignee = task.assignee_employee_id ? employeeById.get(task.assignee_employee_id) : null;
          const canEdit = task.author_employee_id === currentEmployeeId || isAdmin;
          const isEditing = editingId === task.id;
          const isOpen = openId === task.id;
          const linkableTasks = tasks.filter((t) => t.id !== task.id && !task.linkedIds.includes(t.id));

          const subtitleParts: string[] = [STATUS_LABELS[task.status ?? "todo"]];

          return (
            <div key={task.id} className={`rounded-lg bg-white ${borderClass(task)} ${task.status === "done" ? "opacity-60" : ""}`}>
              {isEditing ? (
                <div className="flex flex-col gap-2 p-3">
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={INPUT} />
                  <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} className={INPUT} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSaveEdit(task)}
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
                    onClick={() => setOpenId(isOpen ? null : task.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-zinc-50"
                  >
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-medium text-zinc-900 ${task.status === "done" ? "line-through" : ""}`}>{task.title}</p>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {author?.name ?? "?"} · {dateShort(task.created_at)} · {subtitleParts.join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-zinc-400">{isOpen ? "▲" : "⋯"}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-zinc-100 px-3 py-3">
                      {task.body && <p className="mb-2 whitespace-pre-wrap text-sm text-zinc-700">{task.body}</p>}

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          defaultValue={task.status ?? "todo"}
                          onChange={(e) => startTransition(() => updateTaskStatus(task.id, e.target.value as "todo" | "in_progress" | "done"))}
                          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                        >
                          {Object.entries(STATUS_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <select
                          defaultValue={task.assignee_employee_id ?? ""}
                          onChange={(e) => startTransition(() => updateTaskAssignee(task.id, e.target.value || null))}
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
                        <select
                          defaultValue={task.priority ?? ""}
                          onChange={(e) => startTransition(() => updatePriority(task.id, e.target.value ? Number(e.target.value) : null))}
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

                      {task.linkedIds.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {task.linkedIds.map((id) => {
                            const linked = taskById.get(id);
                            if (!linked) return null;
                            return (
                              <span key={id} className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                                {linked.title}
                                <button type="button" onClick={() => startTransition(() => unlinkTasks(task.id, id))} className="text-zinc-400 hover:text-red-500">
                                  ✕
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-2 text-xs">
                        {canEdit && (
                          <button type="button" onClick={() => startEdit(task)} className="font-semibold text-zinc-500 hover:text-zinc-800">
                            Edytuj
                          </button>
                        )}
                        <button type="button" onClick={() => setLinkingId(linkingId === task.id ? null : task.id)} className="font-semibold text-zinc-500 hover:text-zinc-800">
                          Powiąż
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("Usunąć to zadanie?")) startTransition(() => deleteTask(task.id));
                            }}
                            className="font-semibold text-red-500 hover:text-red-700"
                          >
                            Usuń
                          </button>
                        )}
                      </div>

                      {linkingId === task.id && (
                        <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg bg-zinc-50 p-2">
                          {linkableTasks.length === 0 && <span className="text-xs text-zinc-400">Brak innych zadań do powiązania.</span>}
                          {linkableTasks.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                startTransition(() => linkTasks(task.id, t.id));
                                setLinkingId(null);
                              }}
                              className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[11px] hover:bg-zinc-100"
                            >
                              + {t.title}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 border-t border-zinc-100 pt-2">
                        <p className="mb-1.5 text-xs font-semibold text-zinc-500">Komentarze {task.comments.length > 0 && `(${task.comments.length})`}</p>
                        <div className="mb-2 flex flex-col gap-1.5">
                          {task.comments.map((c) => {
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
                          {task.comments.length === 0 && <p className="text-xs text-zinc-400">Brak komentarzy.</p>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            value={openId === task.id ? commentDraft : ""}
                            onChange={(e) => setCommentDraft(e.target.value)}
                            placeholder="Napisz komentarz…"
                            className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddComment(task.id);
                            }}
                          />
                          <button type="button" onClick={() => handleAddComment(task.id)} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold hover:bg-zinc-100">
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
        {filtered.length === 0 && <p className="text-sm text-zinc-400">Brak zadań.</p>}
      </div>
    </div>
  );
}
