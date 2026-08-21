import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAnthropicClient } from "@/lib/ai";
import { toDateKey } from "@/lib/schedule-month";
import {
  resolveDaySlots,
  cycleWindowDates,
  qualifiesForTask,
  OCCURRENCES_PER_WINDOW,
  type CleaningTask,
  type WindowDay,
} from "@/lib/cleaning";

// ── Wyjątek od zasady w ai.ts, jak schedule-generator-ai.ts ─────────────
// AI dostaje pełne zaufanie do wyboru, KTÓREGO dnia w oknie (tydzień/2 tyg./
// 4 tyg./kwartał) wykonać zadanie cykliczne — zamiast czysto deterministycznej
// reguły "kto ma najmniej minut w ostatnich 4 tygodniach". Bezpiecznik jest
// SILNIEJSZY niż przy grafiku zmian i dlatego prostszy: resolveCyclicDueDates
// w cleaning.ts NIGDY nie ufa zapisanemu wyborowi bez rewalidacji przeciwko
// aktualnym kompetencjom/grafikowi (patrz tam) — więc błędna lub przestarzała
// propozycja AI po prostu nie zostaje użyta i cicho spada z powrotem do
// zwykłej logiki. Nie ma więc potrzeby pętli odrzuceń jak przy grafiku zmian:
// filtrujemy nieprawidłowe odpowiedzi i zapisujemy tylko to, co realnie się
// kwalifikuje.
//
// Świadomie POZA zakresem: zadania CODZIENNE (w tym pary "niebieski mop"
// rano/wieczór łączone przez carry_pair_task_id) — te nie mają okna do
// wyboru, są należne każdego dnia z definicji, więc ten plik ich w ogóle nie
// dotyka; resolveCarryOverrides działa dokładnie tak jak wcześniej. Poza
// zakresem jest też balansowanie zadań między kilkoma osobami w tym samym
// slocie tego samego dnia (balanceSlotAssignments) i sobotnie sprzątanie
// (osobny mechanizm) — obie zostają przy dotychczasowej logice.

const AI_MODEL = "claude-opus-5";

type Decision = {
  taskId: string;
  taskName: string;
  zoneName: string;
  frequency: string;
  windowStart: string;
  needed: number;
  qualifyingDates: { date: string; weekday: number; employeeId: string; employeeName: string; recentMinutes: number }[];
};

const WEEKDAY_NAMES = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

async function gatherDecisions(dateKeys: string[]): Promise<Decision[]> {
  const supabase = createServerSupabaseClient();
  if (dateKeys.length === 0) return [];

  const { data: settings } = await supabase.from("cleaning_settings").select("cycle_start").eq("id", true).maybeSingle();
  const cycleStart = settings?.cycle_start ?? null;

  const { data: tasks } = await supabase
    .from("cleaning_task")
    .select("id, zone_id, name, time_minutes, frequency, slot, active, day_constraint, note, carry_pair_task_id, skip_with_task_id, checklist_template_id")
    .eq("active", true)
    .neq("frequency", "daily");
  const nonDailyTasks = (tasks ?? []) as CleaningTask[];
  if (nonDailyTasks.length === 0) return [];

  const { data: zones } = await supabase.from("cleaning_zone").select("id, name");
  const zoneNameById = new Map((zones ?? []).map((z) => [z.id, z.name]));

  const { data: employees } = await supabase.from("employee").select("id, name").eq("active", true);
  const employeeNameById = new Map((employees ?? []).map((e) => [e.id, e.name]));

  const { data: employeeZones } = await supabase.from("employee_cleaning_zone").select("employee_id, zone_id");
  const competencyByEmployee = new Map<string, Set<string>>();
  for (const ez of employeeZones ?? []) {
    if (!competencyByEmployee.has(ez.employee_id)) competencyByEmployee.set(ez.employee_id, new Set());
    competencyByEmployee.get(ez.employee_id)!.add(ez.zone_id);
  }

  // Zbierz WSZYSTKIE okna każdego zadania, które choćby częściowo dotykają
  // podanych dat — potem zdeduplikuj po (task_id, window_start), bo to samo
  // okno zwykle dotyczy wielu dni z `dateKeys` naraz.
  const windowsByTaskAndStart = new Map<string, { task: CleaningTask; window: string[] }>();
  for (const task of nonDailyTasks) {
    for (const dateKey of dateKeys) {
      const window = cycleWindowDates(task, dateKey, cycleStart);
      if (!window) continue;
      const key = `${task.id}|${window[0]}`;
      if (!windowsByTaskAndStart.has(key)) windowsByTaskAndStart.set(key, { task, window });
    }
  }
  if (windowsByTaskAndStart.size === 0) return [];

  const allWindowDates = new Set<string>();
  for (const { window } of windowsByTaskAndStart.values()) for (const d of window) allWindowDates.add(d);
  const sorted = [...allWindowDates].sort();
  const rangeStart = sorted[0];
  const rangeEnd = sorted[sorted.length - 1];

  // Draft grafiku — ta sama logika jak /admin/sprzatanie/podglad: to
  // narzędzie planistyczne przed publikacją, nie codzienny widok.
  const { data: scheduleDays } = await supabase
    .from("schedule_day")
    .select("date, schedule_shift(start_time, employee_id)")
    .gte("date", rangeStart)
    .lte("date", rangeEnd);
  const windowDayByDate = new Map<string, WindowDay>();
  for (const dk of allWindowDates) {
    windowDayByDate.set(dk, { dateKey: dk, weekday: new Date(dk + "T00:00:00").getDay(), daySlots: { otwarcie: null, srodek: null, zamkniecie: null, po_zamknieciu: null } });
  }
  for (const d of scheduleDays ?? []) {
    const entry = windowDayByDate.get(d.date);
    if (entry) entry.daySlots = resolveDaySlots((d.schedule_shift ?? []) as { start_time: string; employee_id: string | null }[]);
  }

  // Realne obciążenie ostatnich ~28 dni przed początkiem zakresu — ten sam
  // sygnał uczciwości co deterministyczna wersja w cleaning-day.ts.
  const recentStart = toDateKey(new Date(new Date(rangeStart + "T00:00:00").getTime() - 28 * 86400000));
  const { data: recentCompletions } = await supabase
    .from("cleaning_completion")
    .select("employee_id, task_id, cleaning_task(time_minutes)")
    .gte("date", recentStart)
    .lt("date", rangeStart)
    .not("completed_at", "is", null)
    .not("employee_id", "is", null);
  const recentMinutesByEmployee = new Map<string, number>();
  for (const c of recentCompletions ?? []) {
    if (!c.employee_id) continue;
    const minutes = (c.cleaning_task as unknown as { time_minutes: number } | null)?.time_minutes ?? 0;
    recentMinutesByEmployee.set(c.employee_id, (recentMinutesByEmployee.get(c.employee_id) ?? 0) + minutes);
  }

  const decisions: Decision[] = [];
  for (const { task, window } of windowsByTaskAndStart.values()) {
    const needed = OCCURRENCES_PER_WINDOW[task.frequency] ?? 1;
    const windowDays = window.map((dk) => windowDayByDate.get(dk)).filter((d): d is WindowDay => !!d);
    const qualifying = windowDays.filter((d) => qualifiesForTask(task, d, competencyByEmployee));
    if (qualifying.length <= needed) continue; // brak realnego wyboru — zwykła logika i tak wybierze poprawnie

    decisions.push({
      taskId: task.id,
      taskName: task.name,
      zoneName: zoneNameById.get(task.zone_id) ?? "?",
      frequency: task.frequency,
      windowStart: window[0],
      needed,
      qualifyingDates: qualifying.map((d) => {
        const empId = d.daySlots[task.slot]!;
        return {
          date: d.dateKey,
          weekday: d.weekday,
          employeeId: empId,
          employeeName: employeeNameById.get(empId) ?? "?",
          recentMinutes: recentMinutesByEmployee.get(empId) ?? 0,
        };
      }),
    });
  }
  return decisions;
}

function buildPrompt(decisions: Decision[]): string {
  const lines: string[] = [];
  lines.push(
    "Dla każdej poniższej decyzji wybierz, który(-e) dzień(-nie) z listy kwalifikujących się dni ma zostać wykonane to zadanie sprzątania w tym oknie. Kryterium: sprawiedliwość (preferuj dni, których osoba ma mniej minut sprzątania w ostatnich ~4 tygodniach — `recentMinutes`) i unikanie kumulacji wielu zadań tego samego dnia u tej samej osoby w TYM przydziale. Dla zadań wymagających więcej niż 1 wystąpienia w oknie (needed > 1) wybierz dokładnie tyle różnych dni."
  );
  lines.push("");
  for (const d of decisions) {
    lines.push(`DECYZJA taskId=${d.taskId} windowStart=${d.windowStart} needed=${d.needed}`);
    lines.push(`Zadanie: ${d.taskName} (strefa: ${d.zoneName}, częstotliwość: ${d.frequency})`);
    lines.push(
      "Kwalifikujące się dni: " +
        d.qualifyingDates.map((q) => `${q.date} (${WEEKDAY_NAMES[q.weekday]}, ${q.employeeName}, ${q.recentMinutes}min ostatnio)`).join("; ")
    );
    lines.push("");
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `Jesteś planistą sprzątania w klubie sportowym City Sports. Dla listy zadań cyklicznych (co tydzień i rzadziej) wybierasz, który dzień w danym oknie czasowym ma zostać wykonane każde zadanie — spośród dni, gdzie już wiadomo, kto konkretnie by je zrobił (bo tego dnia pracuje na właściwej zmianie i ma kompetencję do strefy). Nie wymyślasz nowych dni ani osób — wybierasz WYŁĄCZNIE spośród podanych kwalifikujących się dni.

Kieruj się: sprawiedliwością (kto ostatnio miał mniej minut sprzątania, patrz recentMinutes), unikaniem sytuacji gdzie jedna osoba dostaje bardzo dużo zadań tego samego dnia w tym przydziale, i zdrowym rozsądkiem (np. rozłóż zadania tej samej strefy na różne dni zamiast kumulować). Dla zadań z needed>1 wybierz dokładnie tyle różnych dni, ile mówi needed.

Odpowiadaj WYŁĄCZNIE przez narzędzie choose_days, jeden wpis na każdą decyzję, którą podejmujesz (możesz pominąć decyzję, jeśli naprawdę wszystkie opcje są równoważne).`;

const CHOOSE_DAYS_TOOL: Anthropic.Tool = {
  name: "choose_days",
  description: "Wybrane dni dla każdej decyzji planowania sprzątania.",
  input_schema: {
    type: "object",
    properties: {
      choices: {
        type: "array",
        items: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            windowStart: { type: "string" },
            chosenDates: { type: "array", items: { type: "string" } },
          },
          required: ["taskId", "windowStart", "chosenDates"],
        },
      },
    },
    required: ["choices"],
  },
};

export async function runAiCleaningPlan(dateKeys: string[]): Promise<{ decidedCount: number; consideredCount: number }> {
  const decisions = await gatherDecisions(dateKeys);
  if (decisions.length === 0) {
    return { decidedCount: 0, consideredCount: 0 };
  }

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    tools: [CHOOSE_DAYS_TOOL],
    messages: [{ role: "user", content: buildPrompt(decisions) }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "choose_days");
  const choices = (toolUse?.input as { choices?: { taskId: string; windowStart: string; chosenDates: string[] }[] } | undefined)?.choices ?? [];

  const decisionByKey = new Map(decisions.map((d) => [`${d.taskId}|${d.windowStart}`, d]));
  const supabase = createServerSupabaseClient();
  let decidedCount = 0;

  for (const choice of choices) {
    const decision = decisionByKey.get(`${choice.taskId}|${choice.windowStart}`);
    if (!decision) continue; // nieznana decyzja — ignorujemy, nie zgadujemy
    const qualifyingDates = new Set(decision.qualifyingDates.map((q) => q.date));
    const validDates = [...new Set(choice.chosenDates)].filter((d) => qualifyingDates.has(d));
    if (validDates.length !== decision.needed) continue; // niepełna/nieprawidłowa odpowiedź — pomijamy, zostaje zwykła logika

    await supabase.from("cleaning_ai_day_choice").delete().eq("task_id", decision.taskId).eq("window_start", decision.windowStart);
    await supabase
      .from("cleaning_ai_day_choice")
      .insert(validDates.map((chosen_date) => ({ task_id: decision.taskId, window_start: decision.windowStart, chosen_date })));
    decidedCount++;
  }

  return { decidedCount, consideredCount: decisions.length };
}
