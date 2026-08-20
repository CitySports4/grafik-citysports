import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { assertCronSecret, getAiNoteAuthorId } from "@/lib/cron-auth";
import { toDateKey } from "@/lib/schedule-month";
import { computeOverdueTasks, type CleaningTask } from "@/lib/cleaning";
import { askWithContext } from "@/lib/ai";

// Uruchamiane raz w tygodniu przez Vercel Cron — sprawdza, które zadania
// sprzątania (co tydzień i rzadziej) są realnie zaległe wg swojej
// częstotliwości (dni od ostatniego wykonania > oczekiwany interwał), a nie
// tylko "nie wypadło dziś na swój dzień" — bo dni już nie są ustalone z góry,
// tylko wybierane dynamicznie zależnie od grafiku (patrz `src/lib/cleaning.ts`).
// Sama lista jest w 100% deterministyczna (kod) — AI tylko formułuje czytelną
// notatkę.
export async function GET(request: Request) {
  try {
    assertCronSecret(request);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const [{ data: tasks }, { data: zones }] = await Promise.all([
    supabase
      .from("cleaning_task")
      .select(
        "id, zone_id, name, time_minutes, frequency, slot, requires_ladder, active, day_constraint, note, carry_pair_task_id, skip_with_task_id, checklist_template_id"
      )
      .eq("active", true)
      .neq("frequency", "daily"),
    supabase.from("cleaning_zone").select("id, name"),
  ]);

  const zoneNameById = new Map((zones ?? []).map((z) => [z.id, z.name]));
  const nonDailyTasks = (tasks ?? []) as CleaningTask[];
  const taskIds = nonDailyTasks.map((t) => t.id);

  const { data: completions } =
    taskIds.length > 0
      ? await supabase
          .from("cleaning_completion")
          .select("task_id, date, completed_at")
          .in("task_id", taskIds)
          .not("completed_at", "is", null)
          .order("date", { ascending: false })
      : { data: [] };
  const lastDoneByTask = new Map<string, string>();
  for (const c of completions ?? []) {
    if (!lastDoneByTask.has(c.task_id)) lastDoneByTask.set(c.task_id, c.date);
  }

  const today = toDateKey(new Date());
  const overdue = computeOverdueTasks(nonDailyTasks, lastDoneByTask, today).filter((o) => o.alert);

  if (overdue.length === 0) {
    return NextResponse.json({ ok: true, overdue: 0 });
  }

  const lines = overdue.map(
    (o) => `${o.task.name} (${zoneNameById.get(o.task.zone_id) ?? "?"}) — zalega ${o.daysLate} dni ponad oczekiwany interwał`
  );

  let body: string;
  try {
    body = await askWithContext(
      "Piszesz krótką, rzeczową notatkę dla admina City Sports o zaległych zadaniach sprzątania. Bez lania wody, po polsku, wypunktuj.",
      "Napisz krótką notatkę podsumowującą te zaległości.",
      `Zaległe zadania sprzątania (nie wykonane w oczekiwanym terminie wg swojej częstotliwości):\n${lines.join("\n")}`
    );
  } catch {
    body = lines.join("\n");
  }

  const authorId = await getAiNoteAuthorId(supabase);
  const { error } = await supabase.from("note").insert({
    author_employee_id: authorId,
    title: `🤖 Zaległości sprzątania (${overdue.length})`,
    body,
    status: "todo",
    source: "ai",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, overdue: overdue.length });
}
