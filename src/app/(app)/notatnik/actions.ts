"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

async function assertCanEdit(supabase: ReturnType<typeof createServerSupabaseClient>, noteId: string) {
  const employee = await requireEmployee();
  const { data: note } = await supabase.from("note").select("author_employee_id").eq("id", noteId).single();
  if (!note || (note.author_employee_id !== employee.id && !employee.roles.includes("admin"))) {
    throw new Error("Nie możesz edytować tej notatki.");
  }
  return employee;
}

export type NoteCategory = "general" | "idea" | "plan";

export async function createNote(opts: {
  title: string;
  body: string;
  category?: NoteCategory;
  projectId?: string | null;
  priority?: number | null;
  dueDate?: string | null;
  isLongTerm?: boolean;
}) {
  const employee = await requireEmployee();
  if (!opts.title.trim()) throw new Error("Podaj tytuł.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("note").insert({
    author_employee_id: employee.id,
    title: opts.title.trim(),
    body: opts.body,
    category: opts.category ?? "general",
    project_id: opts.projectId || null,
    priority: opts.priority ?? null,
    due_date: opts.dueDate || null,
    is_long_term: opts.isLongTerm ?? false,
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function updateNote(
  noteId: string,
  opts: { title: string; body: string; priority?: number | null; dueDate?: string | null; isLongTerm?: boolean; projectId?: string | null }
) {
  const supabase = createServerSupabaseClient();
  await assertCanEdit(supabase, noteId);
  if (!opts.title.trim()) throw new Error("Podaj tytuł.");

  const { error } = await supabase
    .from("note")
    .update({
      title: opts.title.trim(),
      body: opts.body,
      priority: opts.priority ?? null,
      due_date: opts.dueDate || null,
      is_long_term: opts.isLongTerm ?? false,
      project_id: opts.projectId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function deleteNote(noteId: string) {
  const supabase = createServerSupabaseClient();
  await assertCanEdit(supabase, noteId);

  const { error } = await supabase.from("note").delete().eq("id", noteId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function convertToTask(noteId: string) {
  const supabase = createServerSupabaseClient();
  await assertCanEdit(supabase, noteId);

  const { error } = await supabase.from("note").update({ is_task: true, status: "todo" }).eq("id", noteId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function convertToNote(noteId: string) {
  const supabase = createServerSupabaseClient();
  await assertCanEdit(supabase, noteId);

  const { error } = await supabase
    .from("note")
    .update({ is_task: false, status: null, assignee_employee_id: null })
    .eq("id", noteId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function updateTaskStatus(noteId: string, status: "todo" | "in_progress" | "done") {
  await requireEmployee(); // każdy może zmienić status zadania (współpraca zespołowa)
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("note").update({ status }).eq("id", noteId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function updatePriority(noteId: string, priority: number | null) {
  await requireEmployee();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("note").update({ priority }).eq("id", noteId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function updateTaskAssignee(noteId: string, assigneeId: string | null) {
  await requireEmployee();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("note").update({ assignee_employee_id: assigneeId }).eq("id", noteId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function linkNotes(noteIdA: string, noteIdB: string) {
  await requireEmployee();
  if (noteIdA === noteIdB) return;
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("note_link")
    .upsert([
      { note_id_a: noteIdA, note_id_b: noteIdB },
      { note_id_a: noteIdB, note_id_b: noteIdA },
    ]);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function unlinkNotes(noteIdA: string, noteIdB: string) {
  await requireEmployee();
  const supabase = createServerSupabaseClient();
  await supabase.from("note_link").delete().eq("note_id_a", noteIdA).eq("note_id_b", noteIdB);
  await supabase.from("note_link").delete().eq("note_id_a", noteIdB).eq("note_id_b", noteIdA);
  revalidatePath("/notatnik");
}

// ── Komunikator: wątek komentarzy pod notatką/zadaniem ──────────────────

export async function addComment(noteId: string, body: string) {
  const employee = await requireEmployee();
  if (!body.trim()) throw new Error("Podaj treść komentarza.");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("note_comment").insert({
    note_id: noteId,
    author_employee_id: employee.id,
    body: body.trim(),
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function deleteComment(commentId: string) {
  const employee = await requireEmployee();
  const supabase = createServerSupabaseClient();
  const { data: comment } = await supabase.from("note_comment").select("author_employee_id").eq("id", commentId).single();
  if (!comment || (comment.author_employee_id !== employee.id && !employee.roles.includes("admin"))) {
    throw new Error("Nie możesz usunąć tego komentarza.");
  }
  await supabase.from("note_comment").delete().eq("id", commentId);
  revalidatePath("/notatnik");
}

// ── Projekty ──────────────────────────────────────────────────────────

export async function createProject(name: string, description: string) {
  await requireEmployee();
  if (!name.trim()) throw new Error("Podaj nazwę projektu.");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("project").insert({ name: name.trim(), description });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function updateProject(projectId: string, name: string, description: string, status: "active" | "done" | "archived") {
  await requireEmployee();
  if (!name.trim()) throw new Error("Podaj nazwę projektu.");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("project").update({ name: name.trim(), description, status }).eq("id", projectId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
  revalidatePath(`/notatnik/projekty/${projectId}`);
}

export async function deleteProject(projectId: string) {
  await requireEmployee();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("project").delete().eq("id", projectId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function linkProjects(projectIdA: string, projectIdB: string) {
  await requireEmployee();
  if (projectIdA === projectIdB) return;
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("project_link")
    .upsert([
      { project_id_a: projectIdA, project_id_b: projectIdB },
      { project_id_a: projectIdB, project_id_b: projectIdA },
    ]);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath(`/notatnik/projekty/${projectIdA}`);
}

export async function unlinkProjects(projectIdA: string, projectIdB: string) {
  await requireEmployee();
  const supabase = createServerSupabaseClient();
  await supabase.from("project_link").delete().eq("project_id_a", projectIdA).eq("project_id_b", projectIdB);
  await supabase.from("project_link").delete().eq("project_id_a", projectIdB).eq("project_id_b", projectIdA);
  revalidatePath(`/notatnik/projekty/${projectIdA}`);
}
