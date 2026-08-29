import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { assertCronSecret, getAiNoteAuthorId } from "@/lib/cron-auth";
import { toDateKey } from "@/lib/schedule-month";
import { timeToMinutes, formatHm } from "@/lib/time";
import { askWithContext } from "@/lib/ai";

// Uruchamiane co noc przez Vercel Cron — sprawdza WCZORAJSZY dzień:
// rzeczywiste godziny (z /godziny) vs grafik, tolerancja ±30 min (ta sama
// zasada co w kalkulatorze wynagrodzeń recepcji). Decyzja "czy to anomalia"
// jest w 100% deterministyczna (kod) — AI tylko formułuje czytelną notatkę,
// nie podejmuje decyzji.
const TOLERANCE_MIN = 30;

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateKey = toDateKey(yesterday);

  const [{ data: employees }, { data: entries }, { data: shiftRows }] = await Promise.all([
    supabase
      .from("employee")
      .select("id, name, hourly_rate, employee_role!inner(role)")
      .eq("active", true)
      .eq("employee_role.role", "recepcja"),
    supabase.from("time_entry").select("employee_id, actual_start, actual_end").eq("date", dateKey),
    supabase
      .from("schedule_shift")
      .select("employee_id, start_time, end_time, schedule_day!inner(date, schedule_month!inner(status))")
      .not("employee_id", "is", null)
      .eq("schedule_day.schedule_month.status", "published")
      .eq("schedule_day.date", dateKey),
  ]);

  // Jeden dzień może mieć kilka wpisów (podzielona zmiana z przerwą) — stąd
  // lista wpisów per osoba, nie jeden wiersz.
  const entriesByEmp = new Map<string, { actual_start: string | null; actual_end: string | null }[]>();
  for (const e of entries ?? []) {
    if (!entriesByEmp.has(e.employee_id)) entriesByEmp.set(e.employee_id, []);
    entriesByEmp.get(e.employee_id)!.push(e);
  }
  type ShiftRow = { employee_id: string; start_time: string; end_time: string };
  const scheduledByEmp = new Map<string, { start_time: string; end_time: string }>();
  for (const s of (shiftRows ?? []) as unknown as ShiftRow[]) {
    scheduledByEmp.set(s.employee_id, { start_time: s.start_time, end_time: s.end_time });
  }

  const anomalies: string[] = [];
  for (const emp of employees ?? []) {
    const scheduled = scheduledByEmp.get(emp.id);
    const dayEntries = (entriesByEmp.get(emp.id) ?? []).filter(
      (e): e is { actual_start: string; actual_end: string } => Boolean(e.actual_start && e.actual_end)
    );
    const entriesLabel = dayEntries.map((e) => `${e.actual_start.slice(0, 5)}–${e.actual_end.slice(0, 5)}`).join(", ");
    const minStart = dayEntries.length > 0 ? dayEntries.reduce((a, b) => (timeToMinutes(b.actual_start) < timeToMinutes(a) ? b.actual_start : a), dayEntries[0].actual_start) : null;
    const maxEnd = dayEntries.length > 0 ? dayEntries.reduce((a, b) => (timeToMinutes(b.actual_end) > timeToMinutes(a) ? b.actual_end : a), dayEntries[0].actual_end) : null;

    if (scheduled && dayEntries.length === 0) {
      anomalies.push(`${emp.name}: zaplanowana zmiana ${formatHm(scheduled.start_time)}–${formatHm(scheduled.end_time)}, brak wpisu godzin.`);
    } else if (!scheduled && dayEntries.length > 0) {
      anomalies.push(`${emp.name}: wpisane godziny ${entriesLabel}, brak w grafiku tego dnia.`);
    } else if (scheduled && minStart && maxEnd) {
      const startDiff = Math.abs(timeToMinutes(minStart) - timeToMinutes(scheduled.start_time));
      const endDiff = Math.abs(timeToMinutes(maxEnd) - timeToMinutes(scheduled.end_time));
      if (startDiff > TOLERANCE_MIN || endDiff > TOLERANCE_MIN) {
        anomalies.push(
          `${emp.name}: grafik ${formatHm(scheduled.start_time)}–${formatHm(scheduled.end_time)}, rzeczywiste ${entriesLabel} (różnica >±${TOLERANCE_MIN} min).`
        );
      }
    }
  }

  if (anomalies.length === 0) {
    return NextResponse.json({ ok: true, anomalies: 0 });
  }

  let body: string;
  try {
    body = await askWithContext(
      "Piszesz krótką, rzeczową notatkę dla admina City Sports o rozbieżnościach godzin pracy. Bez lania wody, po polsku, wypunktuj każdą osobę osobno.",
      "Napisz krótką notatkę podsumowującą te rozbieżności.",
      `Rozbieżności godzin za ${dateKey}:\n${anomalies.join("\n")}`
    );
  } catch {
    body = anomalies.join("\n"); // fallback bez AI, jeśli klucz nie jest skonfigurowany
  }

  const authorId = await getAiNoteAuthorId(supabase);

  const { error } = await supabase.from("note").insert({
    author_employee_id: authorId,
    title: `🤖 Rozbieżności godzin — ${dateKey}`,
    body,
    status: "todo",
    source: "ai",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, anomalies: anomalies.length });
}
