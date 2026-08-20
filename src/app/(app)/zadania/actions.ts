"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

async function assertCanEdit(supabase: ReturnType<typeof createServerSupabaseClient>, taskId: string) {
  const employee = await requireEmployee();
  const { data: task } = await supabase.from("note").select("author_employee_id").eq("id", taskId).single();
  if (!task || (task.author_employee_id !== employee.id && !employee.roles.includes("admin"))) {
    throw new Error("Nie możesz edytować tego zadania.");
  }
  return employee;
}

export async function createTask(opts: { title: string; body: string; priority?: number | null }) {
  const employee = await requireEmployee();
  if (!opts.title.trim()) throw new Error("Podaj tytuł.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("note").insert({
    author_employee_id: employee.id,
    title: opts.title.trim(),
    body: opts.body,
    status: "todo",
    priority: opts.priority ?? null,
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zadania");
}

export async function updateTask(taskId: string, opts: { title: string; body: string; priority?: number | null }) {
  const supabase = createServerSupabaseClient();
  await assertCanEdit(supabase, taskId);
  if (!opts.title.trim()) throw new Error("Podaj tytuł.");

  const { error } = await supabase
    .from("note")
    .update({
      title: opts.title.trim(),
      body: opts.body,
      priority: opts.priority ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zadania");
}

export async function deleteTask(taskId: string) {
  const supabase = createServerSupabaseClient();
  await assertCanEdit(supabase, taskId);

  const { error } = await supabase.from("note").delete().eq("id", taskId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zadania");
}

export async function updateTaskStatus(taskId: string, status: "todo" | "in_progress" | "done") {
  await requireEmployee(); // każdy może zmienić status zadania (współpraca zespołowa)
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("note").update({ status }).eq("id", taskId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zadania");
}

export async function updatePriority(taskId: string, priority: number | null) {
  await requireEmployee();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("note").update({ priority }).eq("id", taskId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zadania");
}

export async function updateTaskAssignee(taskId: string, assigneeId: string | null) {
  await requireEmployee();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("note").update({ assignee_employee_id: assigneeId }).eq("id", taskId);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zadania");
}

export async function linkTasks(taskIdA: string, taskIdB: string) {
  await requireEmployee();
  if (taskIdA === taskIdB) return;
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("note_link")
    .upsert([
      { note_id_a: taskIdA, note_id_b: taskIdB },
      { note_id_a: taskIdB, note_id_b: taskIdA },
    ]);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zadania");
}

export async function unlinkTasks(taskIdA: string, taskIdB: string) {
  await requireEmployee();
  const supabase = createServerSupabaseClient();
  await supabase.from("note_link").delete().eq("note_id_a", taskIdA).eq("note_id_b", taskIdB);
  await supabase.from("note_link").delete().eq("note_id_a", taskIdB).eq("note_id_b", taskIdA);
  revalidatePath("/zadania");
}

// ── Komunikator: wątek komentarzy pod zadaniem ──────────────────────────

export async function addComment(taskId: string, body: string) {
  const employee = await requireEmployee();
  if (!body.trim()) throw new Error("Podaj treść komentarza.");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("note_comment").insert({
    note_id: taskId,
    author_employee_id: employee.id,
    body: body.trim(),
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/zadania");
}

export async function deleteComment(commentId: string) {
  const employee = await requireEmployee();
  const supabase = createServerSupabaseClient();
  const { data: comment } = await supabase.from("note_comment").select("author_employee_id").eq("id", commentId).single();
  if (!comment || (comment.author_employee_id !== employee.id && !employee.roles.includes("admin"))) {
    throw new Error("Nie możesz usunąć tego komentarza.");
  }
  await supabase.from("note_comment").delete().eq("id", commentId);
  revalidatePath("/zadania");
}
