"use server";

import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { toDateKey } from "@/lib/schedule-month";
import { formatHm } from "@/lib/time";
import { weekdayLabel } from "@/lib/weekdays";
import { EVENT_TYPE_LABELS } from "@/lib/event-types";
import { computeOverdueTasks, type CleaningTask } from "@/lib/cleaning";
import { askWithContext } from "@/lib/ai";

const CONTEXT_DAYS = 14;

const SYSTEM_PROMPT = `Jesteś asystentem systemu zarządzania City Sports — grafik pracy, godziny,
sprzątanie i notatnik zespołu. Odpowiadasz WYŁĄCZNIE na podstawie podanych niżej danych. Jeśli
odpowiedzi nie da się znaleźć w tych danych, powiedz to wprost — nie zgaduj i nie wymyślaj.
Zwracaj uwagę na nieobsadzone zmiany, zaległości w sprzątaniu i pilne zadania, jeśli pytanie
tego dotyczy. Odpowiadaj krótko, po polsku, bez zbędnych wstępów.`;

export async function askScheduleQuestion(question: string): Promise<string> {
  await requireEmployee();
  if (!question.trim()) throw new Error("Wpisz pytanie.");

  const supabase = createServerSupabaseClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(today);
  const dateKeys: string[] = [];
  for (let i = 0; i < CONTEXT_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dateKeys.push(toDateKey(d));
  }
  const since14 = toDateKey(new Date(today.getTime() - 14 * 86400000));

  const [
    { data: days },
    { data: employees },
    { data: recentAiNotes },
    { data: openTasks },
    { data: cleaningTasks },
    { data: cleaningCompletions },
  ] = await Promise.all([
    supabase
      .from("schedule_day")
      .select(
        "date, weekday, schedule_shift(start_time, end_time, employee_id, is_closed), schedule_event(type, start_time, end_time, label, participant_employee_ids), schedule_month!inner(status)"
      )
      .in("date", dateKeys)
      .eq("schedule_month.status", "published")
      .order("date"),
    supabase.from("employee").select("id, name"),
    supabase.from("note").select("title, body, created_at").eq("source", "ai").gte("created_at", since14).order("created_at", { ascending: false }),
    supabase.from("note").select("title, priority, assignee_employee_id").eq("is_task", true).neq("status", "done"),
    supabase
      .from("cleaning_task")
      .select(
        "id, zone_id, name, time_minutes, frequency, weekdays, slot, requires_ladder, active, day_constraint, note, carry_pair_task_id, skip_with_task_id, checklist_template_id"
      )
      .eq("active", true)
      .neq("frequency", "daily"),
    supabase.from("cleaning_completion").select("task_id, date").not("completed_at", "is", null).order("date", { ascending: false }),
  ]);

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e.name]));

  const lines: string[] = [];
  let openShifts = 0;
  for (const day of days ?? []) {
    const shifts = (day.schedule_shift ?? [])
      .map((s) => {
        if (s.is_closed) return `${formatHm(s.start_time)}-${formatHm(s.end_time)} NIECZYNNE`;
        if (!s.employee_id) openShifts++;
        const name = s.employee_id ? employeeById.get(s.employee_id) ?? "?" : "nieprzypisane";
        return `${formatHm(s.start_time)}-${formatHm(s.end_time)} ${name}`;
      })
      .join(", ");
    const events = (day.schedule_event ?? [])
      .map((e) => {
        const participants = (e.participant_employee_ids ?? []).map((id: string) => employeeById.get(id)).filter(Boolean).join(", ");
        const label = EVENT_TYPE_LABELS[e.type] ?? e.type;
        return `${label}${e.start_time ? ` ${formatHm(e.start_time)}${e.end_time ? `-${formatHm(e.end_time)}` : ""}` : ""}${participants ? ` (${participants})` : ""}`;
      })
      .join(", ");
    lines.push(`${day.date} (${weekdayLabel(day.weekday)}): zmiany: ${shifts || "brak"}${events ? `; wydarzenia: ${events}` : ""}`);
  }
  const scheduleContext = lines.length > 0 ? lines.join("\n") : "Brak opublikowanego grafiku w tym okresie.";

  const lastDoneByTask = new Map<string, string>();
  for (const c of cleaningCompletions ?? []) {
    if (!lastDoneByTask.has(c.task_id)) lastDoneByTask.set(c.task_id, c.date);
  }
  const overdue = computeOverdueTasks((cleaningTasks ?? []) as CleaningTask[], lastDoneByTask, todayKey);

  const notesContext =
    (recentAiNotes ?? []).length > 0
      ? (recentAiNotes ?? []).map((n) => `- ${n.title}: ${n.body.slice(0, 200)}`).join("\n")
      : "Brak automatycznych wykryć AI w ostatnich 14 dniach.";

  const tasksContext =
    (openTasks ?? []).length > 0
      ? (openTasks ?? [])
          .map((t) => `- ${t.title}${t.priority ? ` (priorytet ${t.priority})` : ""}${t.assignee_employee_id ? ` — ${employeeById.get(t.assignee_employee_id) ?? "?"}` : ""}`)
          .join("\n")
      : "Brak otwartych zadań w Notatniku.";

  const cleaningContext =
    overdue.length > 0
      ? overdue.map((o) => `- ${o.task.name}: zaległe ${o.daysLate} dni`).join("\n")
      : "Brak zaległości w sprzątaniu (zadania niedzienne).";

  const context = `Grafik (najbliższe ${CONTEXT_DAYS} dni, nieobsadzonych zmian: ${openShifts}):
${scheduleContext}

Ostatnie automatyczne wykrycia AI (14 dni):
${notesContext}

Otwarte zadania w Notatniku:
${tasksContext}

Zaległości sprzątania:
${cleaningContext}`;

  return askWithContext(SYSTEM_PROMPT, question, context);
}
