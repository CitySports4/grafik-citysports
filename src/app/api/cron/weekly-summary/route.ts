import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { assertCronSecret, getAiNoteAuthorId } from "@/lib/cron-auth";
import { toDateKey } from "@/lib/schedule-month";
import { dailyEffectiveHours } from "@/lib/time";
import { askWithContext } from "@/lib/ai";

// Uruchamiane raz w tygodniu (np. w niedzielę wieczorem) przez Vercel Cron —
// zbiera surowe dane minionego tygodnia (kodem, deterministycznie) i prosi
// AI o krótkie podsumowanie w naturalnym języku dla zespołu. To jedyna część
// tej funkcji, gdzie AI robi coś więcej niż formatowanie — synteza kilku
// źródeł w czytelny tekst.
export async function GET(request: Request) {
  try {
    assertCronSecret(request);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekDates: string[] = [];
  for (let i = 7; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    weekDates.push(toDateKey(d));
  }
  const weekStart = weekDates[0];
  const weekEnd = weekDates[weekDates.length - 1];

  const [{ data: employees }, { data: days }, { data: swaps }, { data: cleaningCompletions }] = await Promise.all([
    supabase.from("employee").select("id, name").eq("active", true),
    supabase
      .from("schedule_day")
      .select(
        "date, weekday, schedule_shift(start_time, end_time, employee_id, is_closed), schedule_month!inner(status)"
      )
      .in("date", weekDates)
      .eq("schedule_month.status", "published"),
    supabase.from("shift_swap_request").select("status").gte("requested_at", weekStart).lte("requested_at", `${weekEnd}T23:59:59`),
    supabase.from("cleaning_completion").select("completed_at").in("date", weekDates),
  ]);

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e.name]));
  const classByEmployee = new Map<string, never[]>(); // godziny zajęć pomijamy w skrócie tygodniowym

  const hoursByEmployee = new Map<string, number>();
  let openShifts = 0;
  for (const day of days ?? []) {
    const byEmp = new Map<string, { start_time: string; end_time: string }[]>();
    for (const s of day.schedule_shift ?? []) {
      if (!s.employee_id) {
        if (!s.is_closed) openShifts++;
        continue;
      }
      if (!byEmp.has(s.employee_id)) byEmp.set(s.employee_id, []);
      byEmp.get(s.employee_id)!.push({ start_time: s.start_time, end_time: s.end_time });
    }
    for (const [empId, shifts] of byEmp) {
      const h = dailyEffectiveHours(shifts, day.weekday, classByEmployee.get(empId) ?? []);
      hoursByEmployee.set(empId, (hoursByEmployee.get(empId) ?? 0) + h);
    }
  }

  const hoursLines = [...hoursByEmployee.entries()]
    .map(([id, h]) => `${employeeById.get(id) ?? "?"}: ${Math.round(h * 10) / 10}h`)
    .join(", ");
  const swapStats = (swaps ?? []).reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const cleaningDone = (cleaningCompletions ?? []).filter((c) => c.completed_at).length;
  const cleaningTotal = (cleaningCompletions ?? []).length;

  const context = `Tydzień ${weekStart} – ${weekEnd}.
Godziny wg osoby: ${hoursLines || "brak danych (grafik nieopublikowany)"}.
Nieobsadzone zmiany w tym tygodniu: ${openShifts}.
Prośby o zamianę: ${Object.entries(swapStats).map(([k, v]) => `${k}: ${v}`).join(", ") || "brak"}.
Sprzątanie: ${cleaningDone}/${cleaningTotal} odhaczonych zadań.`;

  let body: string;
  try {
    body = await askWithContext(
      "Piszesz krótkie (max 6-8 zdań), rzeczowe podsumowanie tygodnia pracy dla zespołu City Sports. Po polsku, konkretnie, bez lania wody. Zwróć uwagę na coś, co wymaga działania, jeśli takie coś widzisz w danych (np. dużo nieobsadzonych zmian, niska realizacja sprzątania).",
      "Napisz podsumowanie tygodnia.",
      context
    );
  } catch {
    body = context;
  }

  const authorId = await getAiNoteAuthorId(supabase);
  const { error } = await supabase.from("note").insert({
    author_employee_id: authorId,
    title: `🤖 Podsumowanie tygodnia ${weekStart} – ${weekEnd}`,
    body,
    is_task: false,
    source: "ai",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
