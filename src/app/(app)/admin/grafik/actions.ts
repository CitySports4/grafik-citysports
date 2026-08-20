"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { generateMonthStructure, runDraftGenerator } from "@/lib/schedule-generator";
import { runAiDraftGenerator } from "@/lib/schedule-generator-ai";
import { buildAvailabilityMap, applyPlannedAbsences, isHardUnavailable, type HardConstraint } from "@/lib/unavailability";
import { weekdayLabel } from "@/lib/weekdays";
import { askWithContext } from "@/lib/ai";

// Poniższe akcje wywoływane są bezpośrednio z klienta (nie przez
// `<form action={...}>`) i celowo NIE wołają revalidatePath: komponent
// tabeli grafiku trzyma cały stan po swojej stronie i aktualizuje go
// bezpośrednio z tego, co użytkownik kliknął — odświeżanie trasy przez
// Reacta po akcji formularza potrafi na chwilę cofnąć widok do stanu
// sprzed zapisu (reset formularza po udanej akcji), więc świadomie tego
// unikamy dla częstych, drobnoziarnistych zmian.

export async function generateStructure(formData: FormData) {
  await requireAdmin();
  const scheduleMonthId = String(formData.get("schedule_month_id") ?? "");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  await generateMonthStructure(scheduleMonthId, year, month);
  revalidatePath("/admin/grafik");
}

// Usuwa całą strukturę dni/zmian/wydarzeń danego miesiąca i generuje ją
// ponownie od zera na podstawie AKTUALNEJ konfiguracji zmian — przydatne,
// gdy admin zmienił szablon (np. godziny w piątek/sobotę/niedzielę) PO już
// wygenerowanym miesiącu, bo sama zmiana szablonu nie nadpisuje istniejących
// dni. Niszczy wszystkie przypisania i wydarzenia tego miesiąca, więc tylko
// dla miesięcy w statusie "draft".
export async function resetMonthStructure(scheduleMonthId: string, year: number, month: number) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  const { data: monthRow } = await supabase.from("schedule_month").select("status").eq("id", scheduleMonthId).single();
  if (!monthRow || monthRow.status !== "draft") {
    throw new Error("Można zresetować tylko miesiąc w statusie roboczym (draft).");
  }

  const { error: deleteError } = await supabase.from("schedule_day").delete().eq("schedule_month_id", scheduleMonthId);
  if (deleteError) throw new Error(dbErrorMessage(deleteError));

  await generateMonthStructure(scheduleMonthId, year, month);
}

export async function runDraft(scheduleMonthId: string): Promise<{ assignedCount: number; skippedCount: number }> {
  await requireAdmin();
  return runDraftGenerator(scheduleMonthId);
}

// AI ma tu pełne zaufanie do UKŁADU (nie tylko doradza jak reviewScheduleWithAI
// niżej) — patrz komentarz na górze schedule-generator-ai.ts po dlaczego to
// świadomy wyjątek i jak jest zabezpieczony (pełna rewalidacja + odrzucenie
// i poprawka, nie ślepe zaufanie).
export async function runAiDraft(scheduleMonthId: string): Promise<{ assignedCount: number; skippedCount: number; aiRounds: number }> {
  await requireAdmin();
  return runAiDraftGenerator(scheduleMonthId);
}

export async function assignShift(shiftId: string, employeeIdRaw: string) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  if (employeeIdRaw === "__closed__") {
    const { error } = await supabase
      .from("schedule_shift")
      .update({ employee_id: null, is_closed: true })
      .eq("id", shiftId);
    if (error) throw new Error(dbErrorMessage(error));
  } else {
    const employee_id = employeeIdRaw || null;
    const { error } = await supabase
      .from("schedule_shift")
      .update({ employee_id, is_closed: false })
      .eq("id", shiftId);
    if (error) throw new Error(dbErrorMessage(error));
  }
}

export async function addEvent(
  scheduleDayId: string,
  data: {
    type: string;
    start_time: string | null;
    end_time: string | null;
    label: string | null;
    note: string | null;
    participant_employee_ids: string[];
  }
) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  const { data: created, error } = await supabase
    .from("schedule_event")
    .insert({ schedule_day_id: scheduleDayId, ...data })
    .select("id, type, start_time, end_time, label, note, participant_employee_ids")
    .single();
  if (error || !created) throw new Error(dbErrorMessage(error));
  return created;
}

// Zamyka wszystkie zmiany danego dnia jednym kliknięciem — do świąt i innych
// niestandardowych dni, kiedy klub w ogóle nie działa.
export async function closeWholeDay(scheduleDayId: string) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("schedule_shift")
    .update({ employee_id: null, is_closed: true })
    .eq("schedule_day_id", scheduleDayId);
  if (error) throw new Error(dbErrorMessage(error));
}

// Dodaje niestandardową zmianę do konkretnego dnia (np. inne godziny w
// święto) — niezależnie od szablonu dla danego dnia tygodnia.
export async function addCustomShift(scheduleDayId: string, startTime: string, endTime: string, nextSlotIndex: number) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  const { data: created, error } = await supabase
    .from("schedule_shift")
    .insert({
      schedule_day_id: scheduleDayId,
      slot_index: nextSlotIndex,
      start_time: startTime,
      end_time: endTime,
    })
    .select("id, slot_index, start_time, end_time, employee_id, is_closed")
    .single();
  if (error || !created) throw new Error(dbErrorMessage(error));
  return created;
}

export async function deleteShift(shiftId: string) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("schedule_shift").delete().eq("id", shiftId);
  if (error) throw new Error(dbErrorMessage(error));
}

// Przypisuje uczestników wydarzenia (np. liga) do pustych zmian danego dnia,
// w kolejności zmian — szybki sposób ułożenia dnia z ligą. Zwraca listę
// przypisań, żeby klient mógł zaktualizować swój stan bez przeładowania.
export async function assignEventParticipantsToShifts(
  eventId: string
): Promise<{ shiftId: string; employeeId: string }[]> {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  const { data: event } = await supabase
    .from("schedule_event")
    .select("schedule_day_id, participant_employee_ids")
    .eq("id", eventId)
    .single();
  if (!event) throw new Error("Nie znaleziono wydarzenia.");

  const participantIds: string[] = event.participant_employee_ids ?? [];
  if (participantIds.length === 0) {
    throw new Error("To wydarzenie nie ma przypisanych pracowników.");
  }

  const { data: day } = await supabase
    .from("schedule_day")
    .select("date, weekday, schedule_month_id")
    .eq("id", event.schedule_day_id)
    .single();
  if (!day) throw new Error("Nie znaleziono dnia.");

  const { data: shifts } = await supabase
    .from("schedule_shift")
    .select("id, slot_index, start_time, end_time")
    .eq("schedule_day_id", event.schedule_day_id)
    .order("slot_index");

  // Nie przypisujemy niedostępnego pracownika nawet przez ten skrót —
  // sprawdzamy te same twarde reguły co przy ręcznym przypisaniu.
  const { data: constraints } = await supabase
    .from("weekly_recurring_constraint")
    .select("employee_id, weekday, start_time, end_time")
    .eq("type", "unavailable")
    .in("employee_id", participantIds);
  const hardConstraintsByEmployee = new Map<string, HardConstraint[]>();
  for (const c of constraints ?? []) {
    if (!hardConstraintsByEmployee.has(c.employee_id)) hardConstraintsByEmployee.set(c.employee_id, []);
    hardConstraintsByEmployee.get(c.employee_id)!.push({ weekday: c.weekday, start_time: c.start_time, end_time: c.end_time });
  }

  const { data: submissions } = await supabase
    .from("availability_submission")
    .select("id, employee_id")
    .eq("schedule_month_id", day.schedule_month_id)
    .in("employee_id", participantIds);
  const submissionIds = (submissions ?? []).map((s) => s.id);
  const employeeIdBySubmission = new Map((submissions ?? []).map((s) => [s.id, s.employee_id]));
  let availabilityEntries: { availability_submission_id: string; date: string; whole_day: boolean; slot_index: number | null }[] = [];
  if (submissionIds.length > 0) {
    const { data } = await supabase
      .from("availability_entry")
      .select("availability_submission_id, date, whole_day, slot_index")
      .in("availability_submission_id", submissionIds);
    availabilityEntries = data ?? [];
  }
  const availabilityMap = buildAvailabilityMap(availabilityEntries, employeeIdBySubmission);

  const { data: plannedAbsences } = await supabase
    .from("planned_absence")
    .select("employee_id, start_date, end_date")
    .in("employee_id", participantIds)
    .lte("start_date", day.date)
    .gte("end_date", day.date);
  applyPlannedAbsences(availabilityMap, plannedAbsences ?? []);

  const remaining = [...participantIds];
  const assignments: { shiftId: string; employeeId: string }[] = [];
  for (const shift of shifts ?? []) {
    const pickIndex = remaining.findIndex(
      (empId) =>
        !isHardUnavailable(empId, day.date, day.weekday, shift.slot_index, shift.start_time, shift.end_time, availabilityMap, hardConstraintsByEmployee)
    );
    if (pickIndex === -1) continue;
    const employeeId = remaining.splice(pickIndex, 1)[0];
    await supabase.from("schedule_shift").update({ employee_id: employeeId, is_closed: false }).eq("id", shift.id);
    assignments.push({ shiftId: shift.id, employeeId });
  }

  return assignments;
}

export async function updateEventTimes(eventId: string, startTime: string | null, endTime: string | null) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("schedule_event")
    .update({ start_time: startTime, end_time: endTime })
    .eq("id", eventId);
  if (error) throw new Error(dbErrorMessage(error));
}

export async function updateEventParticipants(eventId: string, participantIds: string[]) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("schedule_event")
    .update({ participant_employee_ids: participantIds })
    .eq("id", eventId);
  if (error) throw new Error(dbErrorMessage(error));
}

export async function deleteEvent(eventId: string) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("schedule_event").delete().eq("id", eventId);
  if (error) throw new Error(dbErrorMessage(error));
}

export async function publishMonth(scheduleMonthId: string) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("schedule_month")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", scheduleMonthId);
  if (error) throw new Error(dbErrorMessage(error));
}

// "Drugie oko" — czysto doradcza podpowiedź AI przeglądająca draft PRZED
// publikacją. Sam układ grafiku (twarde reguły: min. 1 dzień wolny, max 7
// dni z rzędu, dostępność) pozostaje w 100% deterministycznym kodem —
// AI tutaj niczego nie zmienia, tylko czyta gotowy, już wygenerowany draft
// i zwraca zwykły tekst z sugestiami dla admina. Wywoływana na żądanie
// (przycisk), nie automatycznie, i nic nie zapisuje.
export async function reviewScheduleWithAI(scheduleMonthId: string): Promise<string> {
  await requireAdmin();
  const supabase = createServerSupabaseClient();

  const [{ data: days }, { data: employees }] = await Promise.all([
    supabase
      .from("schedule_day")
      .select("date, weekday, schedule_shift(start_time, end_time, employee_id, is_closed)")
      .eq("schedule_month_id", scheduleMonthId)
      .order("date"),
    supabase.from("employee").select("id, name").eq("active", true),
  ]);

  const nameById = new Map((employees ?? []).map((e) => [e.id, e.name]));

  const lines: string[] = [];
  for (const day of days ?? []) {
    const shifts = (day.schedule_shift ?? [])
      .filter((s) => !s.is_closed && s.employee_id)
      .slice()
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    if (shifts.length === 0) continue;
    const parts = shifts.map((s) => `${nameById.get(s.employee_id!) ?? "?"} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`);
    lines.push(`${day.date} (${weekdayLabel(day.weekday)}): ${parts.join(", ")}`);
  }

  if (lines.length === 0) {
    return "Brak przypisanych zmian do sprawdzenia — najpierw wygeneruj lub uzupełnij grafik.";
  }

  return askWithContext(
    "Jesteś doradcą admina City Sports przeglądającym draft grafiku PRZED publikacją. Twarde reguły (min. 1 dzień wolny w tygodniu, max 7 dni z rzędu, dostępność) są już wymuszone w kodzie — NIE zgłaszaj ich naruszeń, bo i tak by nie przeszły. Szukaj za to wzorców, których żadna reguła nie łapie: ta sama osoba ma kilka dni z rzędu zamknięcie/otwarcie, mimo że w reszcie miesiąca ma zwykle inaczej; bardzo nierówny rozkład godzin dzień po dniu u jednej osoby; późne zamknięcie i wczesne otwarcie następnego dnia u tej samej osoby (mało czasu na odpoczynek); dzień z wyraźnie za małą lub za dużą obsadą względem reszty miesiąca. Odpowiadaj PO POLSKU, maksymalnie 5 zwięzłych punktów, bez lania wody. Jeśli nic nietypowego nie widzisz, napisz jedno zdanie, że grafik wygląda standardowo. To są TYLKO sugestie dla człowieka — Ty niczego nie zmieniasz.",
    "Przejrzyj ten draft grafiku i wypisz, na co warto zwrócić uwagę przed publikacją.",
    `Grafik zmian (data, dzień tygodnia: kto pracuje i w jakich godzinach):\n${lines.join("\n")}`
  );
}

export async function unpublishMonth(scheduleMonthId: string) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("schedule_month")
    .update({ status: "draft", published_at: null })
    .eq("id", scheduleMonthId);
  if (error) throw new Error(dbErrorMessage(error));
}
