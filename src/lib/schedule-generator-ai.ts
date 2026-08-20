import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAnthropicClient } from "@/lib/ai";
import { hoursBetween, timeToMinutes } from "@/lib/time";
import { mondayOfWeek, toDateKey } from "@/lib/schedule-month";
import { buildAvailabilityMap, applyPlannedAbsences, isHardUnavailable, type AvailabilityMap, type HardConstraint } from "@/lib/unavailability";
import { consecutiveDaysBefore, tooCloseForDoubleShift, type Employee } from "@/lib/schedule-generator";

// ── WYJĄTEK OD ZASADY W ai.ts ────────────────────────────────────────────
// `ai.ts` mówi wprost: AI nigdy do deterministycznej logiki układania
// grafiku. Ten plik jest świadomym, jawnym wyjątkiem od tej zasady — na
// wyraźne życzenie: AI ma tu PEŁNE zaufanie do UKŁADU (nie tylko doradza),
// zamiast dostawać do wyboru wyłącznie już zweryfikowanych kandydatów.
// Bezpiecznik jest inny niż zwykle: każdy proponowany przydział jest w
// całości rewalidowany zwykłym, deterministycznym kodem (te same reguły co
// w schedule-generator.ts — stąd import stamtąd, jedno źródło prawdy) i
// ODRZUCANY z powrotem do AI do poprawy, jeśli łamie twardą regułę. Nic
// nieprawidłowego nigdy nie trafia do bazy.
//
// Świadomie POZA zakresem: dni podzielone na pół (split-shift, gdy tylko 2
// osoby są dostępne na 3 zmiany pon-czw) — to precyzyjna matematyka minut,
// nie osąd, więc zostaje przy zwykłym generatorze; AI dostaje tylko zmiany
// o już ustalonych, stałych godzinach. Sobotnie sprzątanie (osobny
// mechanizm, patrz cleaning.ts) też nie wchodzi w zakres tego pliku.

const MAX_AI_ROUNDS = 3;
const AI_MODEL = "claude-opus-5"; // cięższe zadanie niż podsumowania askWithContext — pełna, wielodniowa kombinatoryka

type ShiftToAssign = {
  shiftId: string;
  date: string;
  weekday: number;
  slotIndex: number;
  startTime: string;
  endTime: string;
  originalEmployeeId: string | null;
};

type LockedShift = ShiftToAssign & { employeeId: string };

type ProposedAssignment = { shiftId: string; employeeId: string };

const WEEKDAY_NAMES = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

function fmtHardConstraints(rules: HardConstraint[]): string {
  return rules.map((r) => `${WEEKDAY_NAMES[r.weekday]} ${r.start_time ? `${r.start_time.slice(0, 5)}-${r.end_time!.slice(0, 5)}` : "(cały dzień)"}`).join("; ");
}

function fmtAvailability(byDate: Map<string, { wholeDay: boolean; slots: Set<number> }> | undefined): string {
  if (!byDate || byDate.size === 0) return "";
  const parts: string[] = [];
  for (const [date, entry] of byDate) {
    if (entry.wholeDay) parts.push(`${date} (cały dzień)`);
    else if (entry.slots.size > 0) parts.push(`${date} slot(y) ${[...entry.slots].join(",")}`);
  }
  return parts.join("; ");
}

// ── Zbieranie danych — celowo zdublowane ze schedule-generator.ts zamiast
// refaktoryzowane na wspólne, żeby zero ryzyka regresji w już dopracowanym,
// deterministycznym generatorze przy zmianach w tym pliku.
async function gatherContext(scheduleMonthId: string) {
  const supabase = createServerSupabaseClient();

  const { data: days } = await supabase
    .from("schedule_day")
    .select(
      "id, date, weekday, schedule_shift(id, slot_index, start_time, end_time, employee_id, is_closed, manually_locked), schedule_event(id, type, start_time, end_time, participant_employee_ids)"
    )
    .eq("schedule_month_id", scheduleMonthId);

  const { data: employees } = await supabase
    .from("employee")
    .select("id, name, is_instructor, min_hours_month, target_hours_month")
    .eq("active", true);

  const { data: constraints } = await supabase
    .from("weekly_recurring_constraint")
    .select("employee_id, weekday, start_time, end_time, type");
  const { data: classSchedules } = await supabase
    .from("employee_class_schedule")
    .select("employee_id, weekday, start_time, end_time");
  const { data: submissions } = await supabase
    .from("availability_submission")
    .select("id, employee_id")
    .eq("schedule_month_id", scheduleMonthId);

  const submissionIds = (submissions ?? []).map((s) => s.id);
  let availabilityEntries: { availability_submission_id: string; date: string; whole_day: boolean; slot_index: number | null }[] = [];
  if (submissionIds.length > 0) {
    const { data } = await supabase
      .from("availability_entry")
      .select("availability_submission_id, date, whole_day, slot_index")
      .in("availability_submission_id", submissionIds);
    availabilityEntries = data ?? [];
  }
  const employeeIdBySubmission = new Map((submissions ?? []).map((s) => [s.id, s.employee_id]));
  const availability: AvailabilityMap = buildAvailabilityMap(availabilityEntries, employeeIdBySubmission);

  const monthDates = (days ?? []).map((d) => d.date).sort();
  if (monthDates.length > 0) {
    const { data: plannedAbsences } = await supabase
      .from("planned_absence")
      .select("employee_id, start_date, end_date")
      .lte("start_date", monthDates[monthDates.length - 1])
      .gte("end_date", monthDates[0]);
    applyPlannedAbsences(availability, plannedAbsences ?? []);
  }

  const hardUnavailableByEmployee = new Map<string, HardConstraint[]>();
  const preferredByEmployee = new Map<string, HardConstraint[]>();
  for (const c of constraints ?? []) {
    const target = c.type === "unavailable" ? hardUnavailableByEmployee : preferredByEmployee;
    if (!target.has(c.employee_id)) target.set(c.employee_id, []);
    target.get(c.employee_id)!.push({ weekday: c.weekday, start_time: c.start_time, end_time: c.end_time });
  }

  const classByEmployee = new Map<string, { weekday: number; start_time: string; end_time: string }[]>();
  for (const c of classSchedules ?? []) {
    if (!classByEmployee.has(c.employee_id)) classByEmployee.set(c.employee_id, []);
    classByEmployee.get(c.employee_id)!.push({ weekday: c.weekday, start_time: c.start_time, end_time: c.end_time });
  }

  // Godziny już "na koncie" z wydarzeń (zajęcia grupowe itd.) — ta sama
  // logika co w deterministycznym generatorze.
  const hoursAssigned = new Map<string, number>((employees ?? []).map((e) => [e.id, 0]));
  for (const day of days ?? []) {
    for (const ev of day.schedule_event ?? []) {
      if (ev.end_time) {
        for (const empId of ev.participant_employee_ids ?? []) {
          hoursAssigned.set(empId, (hoursAssigned.get(empId) ?? 0) + hoursBetween(ev.start_time ?? "00:00", ev.end_time));
        }
      }
    }
  }

  // Ogon sprzed początku miesiąca — seria dni z rzędu, ostatnia zmiana (do
  // odpoczynku), rotacja weekendów. Ta sama logika/zapytania co w
  // schedule-generator.ts, patrz komentarze tam.
  const priorWorkedDates = new Map<string, Set<string>>();
  const priorLastDayShiftsByEmployee = new Map<string, { start_time: string; end_time: string }[]>();
  const weekendCountByEmployee = new Map<string, number>();
  let priorLastDayKey: string | null = null;
  if (monthDates.length > 0) {
    const firstDate = monthDates[0];
    const priorStart = toDateKey(new Date(new Date(firstDate + "T00:00:00").getTime() - 7 * 86400000));
    const priorEnd = toDateKey(new Date(new Date(firstDate + "T00:00:00").getTime() - 86400000));
    priorLastDayKey = priorEnd;
    const { data: priorDays } = await supabase
      .from("schedule_day")
      .select("date, schedule_shift(employee_id, is_closed, start_time, end_time), schedule_month!inner(status)")
      .gte("date", priorStart)
      .lte("date", priorEnd)
      .eq("schedule_month.status", "published");
    for (const d of priorDays ?? []) {
      for (const s of d.schedule_shift ?? []) {
        if (!s.employee_id || s.is_closed) continue;
        if (!priorWorkedDates.has(s.employee_id)) priorWorkedDates.set(s.employee_id, new Set());
        priorWorkedDates.get(s.employee_id)!.add(d.date);
        if (d.date === priorEnd) {
          if (!priorLastDayShiftsByEmployee.has(s.employee_id)) priorLastDayShiftsByEmployee.set(s.employee_id, []);
          priorLastDayShiftsByEmployee.get(s.employee_id)!.push({ start_time: s.start_time, end_time: s.end_time });
        }
      }
    }

    const lookbackStart = toDateKey(new Date(new Date(firstDate + "T00:00:00").getTime() - 56 * 86400000));
    const { data: weekendDays } = await supabase
      .from("schedule_day")
      .select("date, weekday, schedule_shift(employee_id, is_closed), schedule_month!inner(status)")
      .gte("date", lookbackStart)
      .lte("date", priorEnd)
      .in("weekday", [0, 6])
      .eq("schedule_month.status", "published");
    const workedWeekendWeeksByEmployee = new Map<string, Set<string>>();
    for (const d of weekendDays ?? []) {
      const wk = mondayOfWeek(d.date);
      for (const s of d.schedule_shift ?? []) {
        if (!s.employee_id || s.is_closed) continue;
        if (!workedWeekendWeeksByEmployee.has(s.employee_id)) workedWeekendWeeksByEmployee.set(s.employee_id, new Set());
        workedWeekendWeeksByEmployee.get(s.employee_id)!.add(wk);
      }
    }
    for (const [empId, weeks] of workedWeekendWeeksByEmployee) weekendCountByEmployee.set(empId, weeks.size);
  }

  // Zmiany do obsadzenia: otwarte (nie zamknięte), NIEZABLOKOWANE ręcznie —
  // ręczny wybór w edytorze (patrz assignShift w admin/grafik/actions.ts)
  // ustawia manually_locked, i to jest jedyna rzecz, której AI w ogóle nie
  // dostaje do zmiany (patrz komentarz na górze pliku o pełnym zaufaniu do
  // UKŁADU — dotyczy zmian NIEPRZYPISANYCH, nie nadpisywania decyzji admina).
  // Zablokowane zmiany trafiają do osobnej listy `lockedShifts` — nie są
  // przydzielane od nowa, ale MUSZĄ zostać wliczone w kontekst (godziny,
  // seria dni, dzień wolny), inaczej AI planowałoby resztę miesiąca w
  // oderwaniu od tego, co już naprawdę pracuje.
  //
  // Osobno pomijamy dni "podzielone na pół" (pon-czw, dokładnie 2 osoby
  // dostępne na cały dzień na 3 zmiany), bo to zostaje przy deterministycznym
  // generatorze — precyzyjna matematyka minut, nie osąd.
  const shiftsToAssign: ShiftToAssign[] = [];
  const lockedShifts: LockedShift[] = [];
  const shiftMetaById = new Map<string, ShiftToAssign>();
  for (const day of days ?? []) {
    const open = (day.schedule_shift ?? []).filter((s) => !s.is_closed);
    const isSplitCandidate = day.weekday >= 1 && day.weekday <= 4 && open.length === 3 && open.every((s) => !s.employee_id);
    if (isSplitCandidate) continue;
    for (const s of open) {
      const meta: ShiftToAssign = {
        shiftId: s.id,
        date: day.date,
        weekday: day.weekday,
        slotIndex: s.slot_index,
        startTime: s.start_time,
        endTime: s.end_time,
        originalEmployeeId: s.employee_id,
      };
      shiftMetaById.set(s.id, meta);
      if (s.manually_locked && s.employee_id) {
        lockedShifts.push({ ...meta, employeeId: s.employee_id });
        hoursAssigned.set(s.employee_id, (hoursAssigned.get(s.employee_id) ?? 0) + hoursBetween(s.start_time, s.end_time));
      } else {
        shiftsToAssign.push(meta);
      }
    }
  }

  const daysInWeekBucket = new Map<string, Set<string>>();
  for (const date of monthDates) {
    const wk = mondayOfWeek(date);
    if (!daysInWeekBucket.has(wk)) daysInWeekBucket.set(wk, new Set());
    daysInWeekBucket.get(wk)!.add(date);
  }

  return {
    employees: (employees ?? []) as Employee[],
    shiftsToAssign,
    lockedShifts,
    shiftMetaById,
    availability,
    hardUnavailableByEmployee,
    preferredByEmployee,
    classByEmployee,
    hoursAssigned,
    priorWorkedDates,
    priorLastDayShiftsByEmployee,
    priorLastDayKey,
    weekendCountByEmployee,
    daysInWeekBucket,
  };
}

type Context = Awaited<ReturnType<typeof gatherContext>>;

function buildPrompt(ctx: Context): string {
  const lines: string[] = [];

  lines.push("PRACOWNICY (id | imię | min godz./mies. | cel godz./mies. | instruktor | już zapisane godziny w tym miesiącu z zajęć):");
  for (const e of ctx.employees) {
    lines.push(`${e.id} | ${e.name} | ${e.min_hours_month} | ${e.target_hours_month} | ${e.is_instructor ? "tak" : "nie"} | ${(ctx.hoursAssigned.get(e.id) ?? 0).toFixed(1)}h`);
  }

  lines.push("");
  lines.push("ZMIANY DO OBSADZENIA (shiftId | data (dzień tygodnia) | godziny):");
  for (const s of ctx.shiftsToAssign) {
    lines.push(`${s.shiftId} | ${s.date} (${WEEKDAY_NAMES[s.weekday]}) | ${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}${s.originalEmployeeId ? ` [obecnie: ${s.originalEmployeeId}]` : ""}`);
  }

  if (ctx.lockedShifts.length > 0) {
    lines.push("");
    lines.push(
      "ZABLOKOWANE (admin przypisał ręcznie — NIE dostajesz ich do zmiany, nie pojawiają się na liście wyżej, ale MUSISZ je uwzględnić przy planowaniu reszty: godziny tej osoby, seria dni z rzędu, dzień wolny w tygodniu):"
    );
    for (const s of ctx.lockedShifts) {
      lines.push(`${s.employeeId} zajęty ${s.date} (${WEEKDAY_NAMES[s.weekday]}) ${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}`);
    }
  }

  const hardLines: string[] = [];
  for (const [empId, rules] of ctx.hardUnavailableByEmployee) {
    if (rules.length > 0) hardLines.push(`${empId}: ${fmtHardConstraints(rules)}`);
  }
  for (const [empId] of ctx.availability) {
    const text = fmtAvailability(ctx.availability.get(empId));
    if (text) hardLines.push(`${empId}: ${text}`);
  }
  if (hardLines.length > 0) {
    lines.push("");
    lines.push("TWARDA NIEDOSTĘPNOŚĆ (cykliczna wg dnia tygodnia i/lub konkretne daty — nie przydzielaj tych osób w tych terminach):");
    lines.push(...hardLines);
  }

  const preferredLines: string[] = [];
  for (const [empId, rules] of ctx.preferredByEmployee) {
    if (rules.length > 0) preferredLines.push(`${empId}: ${fmtHardConstraints(rules)}`);
  }
  if (preferredLines.length > 0) {
    lines.push("");
    lines.push("PREFERENCJE (miękkie, nieobowiązkowe — uwzględnij jeśli to możliwe):");
    lines.push(...preferredLines);
  }

  const classLines: string[] = [];
  for (const [empId, classes] of ctx.classByEmployee) {
    if (classes.length > 0) classLines.push(`${empId}: ${classes.map((c) => `${WEEKDAY_NAMES[c.weekday]} ${c.start_time.slice(0, 5)}-${c.end_time.slice(0, 5)}`).join("; ")}`);
  }
  if (classLines.length > 0) {
    lines.push("");
    lines.push("ZAJĘCIA INSTRUKTORÓW (miękko unikaj przydzielania na zmiany mocno się z tym nakładające):");
    lines.push(...classLines);
  }

  lines.push("");
  lines.push("KONTEKST SPRZED POCZĄTKU MIESIĄCA (do zasady o max 7 dniach z rzędu i miękkiej zasady odpoczynku 11h):");
  for (const [empId, dates] of ctx.priorWorkedDates) {
    lines.push(`${empId} pracował: ${[...dates].sort().join(", ")}`);
  }
  if (ctx.priorLastDayKey) {
    for (const [empId, shifts] of ctx.priorLastDayShiftsByEmployee) {
      lines.push(`${empId} ostatnia zmiana przed miesiącem (${ctx.priorLastDayKey}): ${shifts.map((s) => `${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)}`).join(", ")}`);
    }
  }
  lines.push("");
  lines.push("ILE WEEKENDÓW (sob/nd) Z OSTATNICH ~8 TYGODNI DANA OSOBA JUŻ MIAŁA (do sprawiedliwej rotacji):");
  for (const [empId, count] of ctx.weekendCountByEmployee) {
    lines.push(`${empId}: ${count}`);
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `Jesteś generatorem grafiku pracy dla klubu sportowego City Sports. Dostajesz listę zmian do obsadzenia w jednym miesiącu oraz pełne dane o pracownikach. Przydziel KAŻDĄ zmianę z listy ZMIANY DO OBSADZENIA do jednej, konkretnej osoby.

Sekcja ZABLOKOWANE (jeśli jest) to zmiany, które admin już przypisał ręcznie — NIE są na liście do obsadzenia i NIE możesz ich zwrócić w assign_shifts (nie ma dla nich shiftId w Twoich danych). Uwzględnij je tylko jako fakt przy planowaniu reszty (godziny tej osoby, seria dni, dzień wolny).

Rozpatrz KAŻDĄ zmianę z listy DO OBSADZENIA osobno i indywidualnie — nawet jeśli kilka dni z rzędu wygląda podobnie trudno (mało dostępnych osób), nie porzucaj całego bloku dni na raz. Pomiń konkretną zmianę TYLKO gdy dla NIEJ naprawdę nikt się nie nadaje (sprawdź to per zmiana, nie "na oko" dla całego tygodnia) — pusta zmiana to ostateczność, nie wygodne domyślne rozwiązanie.

TWARDE ZASADY — przydział łamiący którąkolwiek zostanie odrzucony i wrócą do Ciebie do poprawy:
1. Poniedziałek-czwartek: jedna osoba = najwyżej jedna zmiana danego dnia (różne zmiany tego dnia muszą trafić do różnych osób).
2. Piątek/sobota/niedziela: ta sama osoba MOŻE dostać więcej niż jedną zmianę tego dnia, ale tylko z realną przerwą min. 6h między końcem jednej a początkiem drugiej (albo zmiany, które się nie nakładają i mają taką przerwę).
3. Nikt nie pracuje więcej niż 7 dni z rzędu bez przerwy — licząc też dni sprzed początku miesiąca (podane w kontekście).
4. Każdy ma mieć przynajmniej 1 dzień wolny w każdym tygodniu (poniedziałek-niedziela).
5. Nigdy nie przydzielaj osoby w terminie z sekcji TWARDA NIEDOSTĘPNOŚĆ.
6. employeeId musi być realnym id z listy PRACOWNICY, shiftId musi być z listy ZMIANY DO OBSADZENIA.

MIĘKKIE ZASADY — rób co możesz, ale to NIE jest powód odrzucenia:
- Kto zamykał dzień wcześniej, nie powinien dziś otwierać bez ~11h przerwy — unikaj, ale gdy naprawdę nie ma innej opcji, przydziel mimo to zamiast zostawić zmianę pustą.
- Priorytet 1: dobij każdego do JEGO min. godzin. Priorytet 2: potem wyrównuj do celu PROPORCJONALNIE (osoba z celem 160h i osoba z celem 80h nie są porównywalne w godzinach absolutnych) — nikt nie powinien mocno przekraczać celu, jeśli ktoś inny jest wyraźnie poniżej.
- Unikaj przydzielania instruktorów na zmiany mocno nakładające się z ich zajęciami, chyba że nie ma wyboru.
- Rozkładaj weekendy sprawiedliwie: kto miał ich ostatnio więcej, temu daj rzadziej kolejny.
- Uwzględnij preferencje, jeśli to możliwe bez psucia reszty.

Odpowiadaj WYŁĄCZNIE przez narzędzie assign_shifts. Jeśli dostaniesz informację o błędach z poprzedniej próby, popraw WSZYSTKIE wymienione problemy i zwróć PEŁNY, poprawiony przydział dla każdej zmiany, którą obsadzasz — nie samą listę poprawek.`;

const ASSIGN_SHIFTS_TOOL: Anthropic.Tool = {
  name: "assign_shifts",
  description: "Finalny przydział pracowników do zmian tego miesiąca.",
  input_schema: {
    type: "object",
    properties: {
      assignments: {
        type: "array",
        description: "Jeden wpis na każdą obsadzaną zmianę.",
        items: {
          type: "object",
          properties: {
            shiftId: { type: "string" },
            employeeId: { type: "string" },
          },
          required: ["shiftId", "employeeId"],
        },
      },
    },
    required: ["assignments"],
  },
};

async function callAi(userPrompt: string): Promise<ProposedAssignment[]> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: AI_MODEL,
    // Pełny miesiąc to potencjalnie 100-300 wpisów JSON + budżet na
    // adaptacyjne myślenie — 4096 (jak w askWithContext) urywałoby
    // odpowiedź w połowie, patrz historia commitów tego pliku.
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    tools: [ASSIGN_SHIFTS_TOOL],
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "assign_shifts");
  if (!toolUse) {
    throw new Error("AI nie zwróciło przydziału zmian (brak wywołania narzędzia).");
  }
  const input = toolUse.input as { assignments?: ProposedAssignment[] };
  return input.assignments ?? [];
}

// Pełna, deterministyczna rewalidacja propozycji AI wg DOKŁADNIE tych
// samych twardych reguł co zwykły generator (patrz importy z
// schedule-generator.ts) — zwraca listę czytelnych naruszeń po polsku,
// gotową do wklejenia z powrotem do AI jako feedback.
function validateAssignment(assignments: ProposedAssignment[], ctx: Context): string[] {
  const violations: string[] = [];
  const employeeById = new Map(ctx.employees.map((e) => [e.id, e]));
  const seenShiftIds = new Set<string>();

  const byShiftId = new Map<string, string>();
  for (const a of assignments) {
    if (!ctx.shiftMetaById.has(a.shiftId)) {
      violations.push(`shiftId ${a.shiftId} nie istnieje na liście zmian do obsadzenia.`);
      continue;
    }
    if (!employeeById.has(a.employeeId)) {
      violations.push(`employeeId ${a.employeeId} (zmiana ${a.shiftId}) nie jest realnym, aktywnym pracownikiem.`);
      continue;
    }
    if (seenShiftIds.has(a.shiftId)) {
      violations.push(`Zmiana ${a.shiftId} ma więcej niż jeden przydział.`);
      continue;
    }
    seenShiftIds.add(a.shiftId);
    byShiftId.set(a.shiftId, a.employeeId);
  }
  if (violations.length > 0) return violations; // dalsze sprawdzenia zakładają czyste dane

  // Grupuj przydziały po (employeeId, date) w porządku chronologicznym —
  // wszystkie kolejne sprawdzenia (seria dni, dzień wolny/tydzień,
  // odpoczynek) liczą się w kolejności dat, tak jak w zwykłym generatorze.
  // Zablokowane (ręczne) zmiany wchodzą do TEJ SAMEJ mapy, żeby liczyły się
  // do serii dni/tygodnia — ale są oznaczone `locked`, żeby naruszenie
  // wynikające WYŁĄCZNIE z nich (bez udziału żadnej nowej, proponowanej
  // przez AI zmiany) nie trafiało do listy błędów: AI i tak nie ma jak tego
  // naprawić, bo tych zmian nie dostało do zmiany.
  type Entry = ShiftToAssign & { locked: boolean };
  const shiftsByEmployeeDate = new Map<string, Map<string, Entry[]>>();
  function addEntry(employeeId: string, meta: ShiftToAssign, locked: boolean) {
    if (!shiftsByEmployeeDate.has(employeeId)) shiftsByEmployeeDate.set(employeeId, new Map());
    const byDate = shiftsByEmployeeDate.get(employeeId)!;
    if (!byDate.has(meta.date)) byDate.set(meta.date, []);
    byDate.get(meta.date)!.push({ ...meta, locked });
  }
  for (const locked of ctx.lockedShifts) addEntry(locked.employeeId, locked, true);
  for (const [shiftId, employeeId] of byShiftId) addEntry(employeeId, ctx.shiftMetaById.get(shiftId)!, false);

  for (const [employeeId, byDate] of shiftsByEmployeeDate) {
    const empName = employeeById.get(employeeId)?.name ?? employeeId;
    const sortedDates = [...byDate.keys()].sort();
    const workedDates = new Set([...(ctx.priorWorkedDates.get(employeeId) ?? []), ...sortedDates]);

    for (const date of sortedDates) {
      const shiftsToday = byDate.get(date)!.slice().sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      const hasNew = shiftsToday.some((s) => !s.locked);
      const weekday = shiftsToday[0].weekday;
      const blockDouble = weekday >= 1 && weekday <= 4;

      if (hasNew && blockDouble && shiftsToday.length > 1) {
        violations.push(`${empName} ma ${shiftsToday.length} zmiany tego samego dnia (${date}), a pon-czw to zabronione — każda zmiana tego dnia musi trafić do innej osoby.`);
      } else if (hasNew && !blockDouble && shiftsToday.length > 1) {
        for (let i = 1; i < shiftsToday.length; i++) {
          const prevShift = { start_time: shiftsToday[i - 1].startTime, end_time: shiftsToday[i - 1].endTime };
          const nextShift = { start_time: shiftsToday[i].startTime, end_time: shiftsToday[i].endTime };
          if (tooCloseForDoubleShift(prevShift, nextShift)) {
            violations.push(
              `${empName} ma ${date} dwie zmiany zbyt blisko siebie (${shiftsToday[i - 1].startTime.slice(0, 5)}-${shiftsToday[i - 1].endTime.slice(0, 5)} i ${shiftsToday[i].startTime.slice(0, 5)}-${shiftsToday[i].endTime.slice(0, 5)}) — potrzeba min. 6h przerwy.`
            );
          }
        }
      }

      for (const s of shiftsToday) {
        if (s.locked) continue; // ręczny wybór admina — nie naszej oceny
        if (isHardUnavailable(employeeId, date, weekday, s.slotIndex, s.startTime, s.endTime, ctx.availability, ctx.hardUnavailableByEmployee)) {
          violations.push(`${empName} przydzielony ${date} ${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)} mimo twardej niedostępności w tym terminie.`);
        }
      }

      if (hasNew) {
        const streak = consecutiveDaysBefore(date, workedDates);
        if (streak >= 7) {
          violations.push(`${empName} miałby ${date} ${streak + 1}. dzień z rzędu bez przerwy — max to 7.`);
        }
      }
    }

    // Dzień wolny w tygodniu — te same zasady co daysInWeekBucket w
    // schedule-generator.ts (tylko dni faktycznie obecne w tym miesiącu).
    const byWeek = new Map<string, { count: number; hasNew: boolean }>();
    for (const date of sortedDates) {
      const wk = mondayOfWeek(date);
      const entry = byWeek.get(wk) ?? { count: 0, hasNew: false };
      entry.count++;
      if (byDate.get(date)!.some((s) => !s.locked)) entry.hasNew = true;
      byWeek.set(wk, entry);
    }
    for (const [wk, { count, hasNew }] of byWeek) {
      const capacity = Math.max(1, (ctx.daysInWeekBucket.get(wk)?.size ?? 1) - 1);
      if (hasNew && count > capacity) {
        violations.push(`${empName} pracuje ${count} dni w tygodniu zaczynającym się ${wk} — brakuje przynajmniej 1 dnia wolnego.`);
      }
    }
  }

  return violations;
}

export async function runAiDraftGenerator(scheduleMonthId: string): Promise<{ assignedCount: number; skippedCount: number; aiRounds: number }> {
  const ctx = await gatherContext(scheduleMonthId);
  if (ctx.shiftsToAssign.length === 0) {
    return { assignedCount: 0, skippedCount: 0, aiRounds: 0 };
  }

  const basePrompt = buildPrompt(ctx);
  let round = 0;
  let assignments: ProposedAssignment[] = [];
  let violations: string[] = [];

  while (round < MAX_AI_ROUNDS) {
    round++;
    const prompt =
      violations.length > 0
        ? `${basePrompt}\n\nPOPRZEDNIA PRÓBA MIAŁA BŁĘDY — POPRAW WSZYSTKIE I ZWRÓĆ PEŁNY, POPRAWIONY PRZYDZIAŁ (dla każdej zmiany, którą obsadzasz, nie tylko poprawki):\n${violations.map((v) => `- ${v}`).join("\n")}`
        : basePrompt;
    assignments = await callAi(prompt);
    violations = validateAssignment(assignments, ctx);
    if (violations.length === 0) break;
  }

  if (violations.length > 0) {
    throw new Error(`AI nie ułożyło poprawnego grafiku po ${MAX_AI_ROUNDS} próbach. Pozostałe problemy:\n${violations.join("\n")}`);
  }

  // Jeśli AI zostawiło sporo zmian bez przydziału, daj mu jeszcze JEDNĄ
  // szansę, żeby sprawdziło je indywidualnie zamiast porzucać cały blok dni
  // naraz — ale tylko raz: jeśli poprawka wprowadzi nowe naruszenia albo
  // nic nie zmieni, zostajemy przy poprzednim, już poprawnym wyniku.
  let proposedByShiftId = new Map(assignments.map((a) => [a.shiftId, a.employeeId]));
  const unassigned = ctx.shiftsToAssign.filter((s) => !proposedByShiftId.has(s.shiftId));
  if (unassigned.length >= 3) {
    const nudge = `${basePrompt}\n\nZOSTAWIŁEŚ BEZ PRZYDZIAŁU ${unassigned.length} ZMIAN — sprawdź KAŻDĄ z nich jeszcze raz, osobno, zanim uznasz że nikt się nie nadaje:\n${unassigned
      .map((s) => `${s.shiftId} | ${s.date} (${WEEKDAY_NAMES[s.weekday]}) | ${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}`)
      .join("\n")}\n\nZwróć PEŁNY przydział — wszystko, co już poprawnie ułożyłeś, plus poprawki dla zmian wyżej, jeśli jednak kogoś znajdziesz.`;
    const retryAssignments = await callAi(nudge);
    if (validateAssignment(retryAssignments, ctx).length === 0) {
      assignments = retryAssignments;
      proposedByShiftId = new Map(assignments.map((a) => [a.shiftId, a.employeeId]));
    }
  }

  const supabase = createServerSupabaseClient();
  const changedUpdates: { id: string; employee_id: string }[] = [];
  for (const meta of ctx.shiftMetaById.values()) {
    const employeeId = proposedByShiftId.get(meta.shiftId);
    if (!employeeId || employeeId === meta.originalEmployeeId) continue;
    changedUpdates.push({ id: meta.shiftId, employee_id: employeeId });
  }
  for (const u of changedUpdates) {
    await supabase.from("schedule_shift").update({ employee_id: u.employee_id }).eq("id", u.id);
  }

  const skippedCount = [...ctx.shiftMetaById.values()].filter((m) => !m.originalEmployeeId && !proposedByShiftId.get(m.shiftId)).length;

  return { assignedCount: changedUpdates.length, skippedCount, aiRounds: round };
}
