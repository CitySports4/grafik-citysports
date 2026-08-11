"use server";

import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { toDateKey } from "@/lib/schedule-month";
import { formatHm } from "@/lib/time";
import { weekdayLabel } from "@/lib/weekdays";
import { EVENT_TYPE_LABELS } from "@/lib/event-types";
import { askWithContext } from "@/lib/ai";

const CONTEXT_DAYS = 14;

const SYSTEM_PROMPT = `Jesteś asystentem systemu grafiku pracy City Sports. Odpowiadasz WYŁĄCZNIE na podstawie
podanych niżej danych grafiku na najbliższe ${CONTEXT_DAYS} dni. Jeśli odpowiedzi nie da się
znaleźć w tych danych, powiedz to wprost — nie zgaduj i nie wymyślaj. Odpowiadaj krótko,
po polsku, bez zbędnych wstępów.`;

export async function askScheduleQuestion(question: string): Promise<string> {
  await requireEmployee();
  if (!question.trim()) throw new Error("Wpisz pytanie.");

  const supabase = createServerSupabaseClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateKeys: string[] = [];
  for (let i = 0; i < CONTEXT_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dateKeys.push(toDateKey(d));
  }

  const { data: days } = await supabase
    .from("schedule_day")
    .select(
      "date, weekday, schedule_shift(start_time, end_time, employee_id, is_closed), schedule_event(type, start_time, end_time, label, participant_employee_ids), schedule_month!inner(status)"
    )
    .in("date", dateKeys)
    .eq("schedule_month.status", "published")
    .order("date");

  const { data: employees } = await supabase.from("employee").select("id, name");
  const employeeById = new Map((employees ?? []).map((e) => [e.id, e.name]));

  const lines: string[] = [];
  for (const day of days ?? []) {
    const shifts = (day.schedule_shift ?? [])
      .map((s) => {
        if (s.is_closed) return `${formatHm(s.start_time)}-${formatHm(s.end_time)} NIECZYNNE`;
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

  const context = lines.length > 0 ? `Dane grafiku:\n${lines.join("\n")}` : "Brak opublikowanego grafiku w tym okresie.";

  return askWithContext(SYSTEM_PROMPT, question, context);
}
