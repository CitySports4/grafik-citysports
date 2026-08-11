"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

async function assertCanEdit(supabase: ReturnType<typeof createServerSupabaseClient>, noteId: string) {
  const employee = await requireEmployee();
  const { data: note } = await supabase.from("note").select("author_employee_id").eq("id", noteId).single();
  if (!note || (note.author_employee_id !== employee.id && employee.role !== "admin")) {
    throw new Error("Nie możesz edytować tej notatki.");
  }
  return employee;
}

export async function createNote(title: string, body: string) {
  const employee = await requireEmployee();
  if (!title.trim()) throw new Error("Podaj tytuł.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("note").insert({
    author_employee_id: employee.id,
    title: title.trim(),
    body,
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/notatnik");
}

export async function updateNote(noteId: string, title: string, body: string) {
  const supabase = createServerSupabaseClient();
  await assertCanEdit(supabase, noteId);
  if (!title.trim()) throw new Error("Podaj tytuł.");

  const { error } = await supabase
    .from("note")
    .update({ title: title.trim(), body, updated_at: new Date().toISOString() })
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
  const employee = await requireEmployee(); // każdy może zmienić status zadania (współpraca zespołowa)
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("note").update({ status }).eq("id", noteId);
  if (error) throw new Error(dbErrorMessage(error));
  void employee;
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
