"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

type ChecklistDoneEntry = { item_id: string; employee_id: string; done_at: string };

export async function toggleChecklistItem(taskId: string, date: string, itemId: string, allItemIds: string[]) {
  const employee = await requireEmployee();
  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("cleaning_completion")
    .select("checklist_done")
    .eq("task_id", taskId)
    .eq("date", date)
    .maybeSingle();

  const current = (existing?.checklist_done as ChecklistDoneEntry[] | null) ?? [];
  const has = current.some((e) => e.item_id === itemId);
  const next = has
    ? current.filter((e) => e.item_id !== itemId)
    : [...current, { item_id: itemId, employee_id: employee.id, done_at: new Date().toISOString() }];
  const doneIds = new Set(next.map((e) => e.item_id));
  const allDone = allItemIds.length > 0 && allItemIds.every((id) => doneIds.has(id));

  const { error } = await supabase.from("cleaning_completion").upsert(
    {
      task_id: taskId,
      date,
      checklist_done: next,
      employee_id: employee.id,
      completed_at: allDone ? new Date().toISOString() : null,
    },
    { onConflict: "task_id,date" }
  );
  if (error) throw new Error(dbErrorMessage(error));
  // /zadania renderuje tę samą listę dnia sprzątania co /sprzatanie.
  revalidatePath("/sprzatanie");
  revalidatePath("/zadania");
}

export async function toggleTaskDone(taskId: string, date: string) {
  const employee = await requireEmployee();
  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("cleaning_completion")
    .select("completed_at")
    .eq("task_id", taskId)
    .eq("date", date)
    .maybeSingle();

  const nowDone = !existing?.completed_at;
  const { error } = await supabase.from("cleaning_completion").upsert(
    {
      task_id: taskId,
      date,
      employee_id: employee.id,
      completed_at: nowDone ? new Date().toISOString() : null,
      checklist_done: [],
    },
    { onConflict: "task_id,date" }
  );
  if (error) throw new Error(dbErrorMessage(error));
  // /zadania renderuje tę samą listę dnia sprzątania co /sprzatanie.
  revalidatePath("/sprzatanie");
  revalidatePath("/zadania");
}

// Odhaczenie zadania spoza dzisiejszego przydziału (Pula zadań) — liczy się
// do historii/wykrywania zaległości, nawet jeśli zadanie nie jest dziś "due".
export async function completeFromPool(taskId: string, date: string) {
  const employee = await requireEmployee();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("cleaning_completion").upsert(
    {
      task_id: taskId,
      date,
      employee_id: employee.id,
      completed_at: new Date().toISOString(),
      checklist_done: [],
    },
    { onConflict: "task_id,date" }
  );
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/sprzatanie/pula");
}
