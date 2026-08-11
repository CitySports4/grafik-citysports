import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { assertCronSecret, getAiNoteAuthorId } from "@/lib/cron-auth";
import { toDateKey } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { isTaskDueOnDate, type CleaningTask } from "@/lib/cleaning";
import { askWithContext } from "@/lib/ai";

// Uruchamiane raz w tygodniu przez Vercel Cron — sprawdza ostatnie 7 dni pod
// kątem zadań sprzątania (co tydzień i rzadziej) które BYŁY zaplanowane, ale
// nie zostały odhaczone jako zrobione. Sama lista jest w 100% deterministyczna
// (kod) — AI tylko formułuje czytelną notatkę.
const LOOKBACK_DAYS = 7;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const [{ data: settings }, { data: tasks }, { data: zones }] = await Promise.all([
    supabase.from("cleaning_settings").select("cycle_start").eq("id", true).maybeSingle(),
    supabase
      .from("cleaning_task")
      .select(
        "id, zone_id, name, time_minutes, frequency, weekdays, slot, requires_ladder, active, day_constraint, note, carry_pair_task_id, skip_with_task_id, checklist_template_id"
      )
      .eq("active", true)
      .neq("frequency", "daily"),
    supabase.from("cleaning_zone").select("id, name"),
  ]);

  const zoneNameById = new Map((zones ?? []).map((z) => [z.id, z.name]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateKeys: { dateKey: string; weekday: number }[] = [];
  for (let i = LOOKBACK_DAYS; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateKeys.push({ dateKey: toDateKey(d), weekday: d.getDay() });
  }

  const dueEntries: { taskId: string; taskName: string; zoneName: string; dateKey: string; weekday: number }[] = [];
  for (const { dateKey, weekday } of dateKeys) {
    for (const t of (tasks ?? []) as CleaningTask[]) {
      if (isTaskDueOnDate(t, dateKey, weekday, settings?.cycle_start ?? null)) {
        dueEntries.push({ taskId: t.id, taskName: t.name, zoneName: zoneNameById.get(t.zone_id) ?? "?", dateKey, weekday });
      }
    }
  }

  if (dueEntries.length === 0) {
    return NextResponse.json({ ok: true, overdue: 0 });
  }

  const { data: completions } = await supabase
    .from("cleaning_completion")
    .select("task_id, date, completed_at")
    .in(
      "date",
      dateKeys.map((d) => d.dateKey)
    );
  const doneSet = new Set((completions ?? []).filter((c) => c.completed_at).map((c) => `${c.task_id}|${c.date}`));

  const overdue = dueEntries.filter((e) => !doneSet.has(`${e.taskId}|${e.dateKey}`));
  if (overdue.length === 0) {
    return NextResponse.json({ ok: true, overdue: 0 });
  }

  const lines = overdue.map((e) => `${e.taskName} (${e.zoneName}) — miało być zrobione ${e.dateKey} (${weekdayLabel(e.weekday)})`);

  let body: string;
  try {
    body = await askWithContext(
      "Piszesz krótką, rzeczową notatkę dla admina City Sports o zaległych zadaniach sprzątania. Bez lania wody, po polsku, wypunktuj.",
      "Napisz krótką notatkę podsumowującą te zaległości.",
      `Zaległe zadania sprzątania (nieodhaczone w ciągu ostatnich ${LOOKBACK_DAYS} dni):\n${lines.join("\n")}`
    );
  } catch {
    body = lines.join("\n");
  }

  const authorId = await getAiNoteAuthorId(supabase);
  const { error } = await supabase.from("note").insert({
    author_employee_id: authorId,
    title: `🤖 Zaległości sprzątania (${overdue.length})`,
    body,
    is_task: true,
    status: "todo",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, overdue: overdue.length });
}
