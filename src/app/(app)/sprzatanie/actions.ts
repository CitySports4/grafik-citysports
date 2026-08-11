"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

export async function toggleChecklistItem(taskId: string, date: string, itemId: string, allItemIds: string[]) {
  const employee = await requireEmployee();
  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("cleaning_completion")
    .select("checklist_done")
    .eq("task_id", taskId)
    .eq("date", date)
    .maybeSingle();

  const current: string[] = (existing?.checklist_done as string[] | null) ?? [];
  const has = current.includes(itemId);
  const next = has ? current.filter((id) => id !== itemId) : [...current, itemId];
  const allDone = allItemIds.length > 0 && allItemIds.every((id) => next.includes(id));

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
  revalidatePath("/sprzatanie");
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
  revalidatePath("/sprzatanie");
}
