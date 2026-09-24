"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, requireAdmin, canPreviewPersonalTraining } from "@/lib/session";
import { hasKioskSession } from "@/lib/kiosk-session";
import { dbErrorMessage } from "@/lib/db-error";
import { toDateKey } from "@/lib/schedule-month";
import { timeToMinutes } from "@/lib/time";
import {
  fitsInRoomHours,
  maxConcurrentClients,
  findAvailableStart,
  minutesToTime,
  weeklyOccurrenceDates,
  sessionAmount,
  PT_DURATIONS_MIN,
  type RoomWindow,
} from "@/lib/personal-training";

type Supabase = ReturnType<typeof createServerSupabaseClient>;

// Trener zarządza WYŁĄCZNIE swoimi treningami — admin zarządza wszystkimi
// (może np. poprawić trening w zastępstwie trenera). Zwraca id trenera, na
// którego rzecz akcja ma faktycznie działać. Używane przez edycję/przenoszenie
// /usuwanie ISTNIEJĄCEGO treningu — tego NIE rozszerzamy na recepcję/kiosk
// (patrz resolveCreateActor niżej, osobno, tylko dla zakładania nowych).
async function resolveTrainerActor(formData: FormData) {
  const employee = await requireEmployee();
  const isAdmin = employee.roles.includes("admin");
  const isTrainer = employee.roles.includes("trener_personalny");
  if (!isAdmin && !isTrainer) {
    throw new Error("Ta akcja jest dostępna tylko dla trenera personalnego lub administratora.");
  }
  const requestedTrainerId = String(formData.get("trainer_employee_id") ?? "");
  const trainerId = isAdmin && requestedTrainerId ? requestedTrainerId : employee.id;
  if (!isAdmin && trainerId !== employee.id) {
    throw new Error("Nie możesz zarządzać treningami innego trenera.");
  }
  return { employee, trainerId };
}

// Kto może ZAŁOŻYĆ nowy trening dla DOWOLNEGO trenera (wybór z listy, jak
// admin) — admin, recepcja (osobiście zalogowana) i kiosk recepcyjny (wspólny
// PIN, bez tożsamości pracownika — patrz lib/kiosk-session.ts). Zwykły trener
// nadal może zakładać tylko swoje własne treningi.
async function resolveCreateActor(formData: FormData): Promise<{ trainerId: string }> {
  const requestedTrainerId = String(formData.get("trainer_employee_id") ?? "");

  if (await hasKioskSession()) {
    if (!requestedTrainerId) throw new Error("Wybierz trenera.");
    return { trainerId: requestedTrainerId };
  }

  const employee = await requireEmployee();
  const isAdmin = employee.roles.includes("admin");
  const isTrainer = employee.roles.includes("trener_personalny");
  const canPickAnyTrainer = isAdmin || canPreviewPersonalTraining(employee);
  if (!isTrainer && !canPickAnyTrainer) {
    throw new Error("Ta akcja jest dostępna tylko dla trenera personalnego, recepcji albo administratora.");
  }
  if (canPickAnyTrainer) {
    if (!requestedTrainerId) throw new Error("Wybierz trenera.");
    return { trainerId: requestedTrainerId };
  }
  return { trainerId: employee.id };
}

// Kto może oznaczać rozliczenia i zarządzać blokadą sali — recepcja, admin
// (osobiście zalogowani) albo kiosk recepcyjny. Zwraca id pracownika do
// zapisania jako "kto to zrobił", albo null dla kiosku (brak tożsamości).
async function requireRecepcjaOrKiosk(): Promise<string | null> {
  if (await hasKioskSession()) return null;
  const employee = await requireEmployee();
  if (!canPreviewPersonalTraining(employee)) {
    throw new Error("Brak uprawnień — dotyczy recepcji i administratora.");
  }
  return employee.id;
}

async function getRoomWindows(supabase: Supabase, weekday: number): Promise<RoomWindow[]> {
  const { data } = await supabase
    .from("personal_training_room_hours")
    .select("start_time, end_time")
    .eq("weekday", weekday);
  return data ?? [];
}

// Blokady sali tego konkretnego dnia (np. wynajem, własne potrzeby klubu) —
// przedstawione dalej jako "treningi" zajmujące CAŁĄ salę (client_count =
// limit), żeby wpuścić je do tego samego sprawdzenia obłożenia co zwykłe
// treningi bez osobnej ścieżki kodu — patrz checkAvailability.
async function getRoomBlocksAsFullSessions(
  supabase: Supabase,
  date: string,
  roomCapacity: number
): Promise<{ start_time: string; duration_minutes: number; client_count: number }[]> {
  const { data } = await supabase.from("personal_training_room_block").select("start_time, end_time").eq("date", date);
  return (data ?? []).map((b) => ({
    start_time: b.start_time,
    duration_minutes: timeToMinutes(b.end_time) - timeToMinutes(b.start_time),
    client_count: roomCapacity,
  }));
}

async function getSettings(supabase: Supabase) {
  const { data } = await supabase.from("personal_training_settings").select("room_capacity, rate_per_person").eq("id", 1).single();
  return data ?? { room_capacity: 0, rate_per_person: 0 };
}

// Sprawdza, czy dany termin (start+czas trwania) mieści się w godzinach sali
// i nie przekracza limitu osób na KAŻDĄ z podanych dat (przy treningu
// cyklicznym — każde wystąpienie osobno, bo obłożenie sali różni się dzień
// do dnia). Przy konflikcie zwraca podpowiedź najbliższego wolnego terminu
// dla PIERWSZEJ kolidującej daty.
async function checkAvailability(
  supabase: Supabase,
  dates: string[],
  weekday: number,
  startMin: number,
  durationMin: number,
  clientCount: number,
  roomCapacity: number,
  excludeSessionId?: string,
  // Przy przenoszeniu CAŁEJ serii na nową godzinę seria nie może kolidować
  // sama ze sobą — wyklucza wszystkie wystąpienia tej serii z konfliktu,
  // zostawiając w sprawdzeniu wszystko inne (inni trenerzy, inne treningi
  // tego samego trenera spoza tej serii).
  excludeSeriesId?: string
): Promise<{ ok: true } | { ok: false; conflictDate: string; suggestion: string | null }> {
  const windows = await getRoomWindows(supabase, weekday);

  for (const date of dates) {
    let query = supabase
      .from("personal_training_session")
      .select("start_time, duration_minutes, client_count")
      .eq("date", date)
      .eq("status", "scheduled");
    if (excludeSessionId) query = query.neq("id", excludeSessionId);
    if (excludeSeriesId) query = query.or(`series_id.is.null,series_id.neq.${excludeSeriesId}`);
    const { data: existing } = await query;
    const blocks = await getRoomBlocksAsFullSessions(supabase, date, roomCapacity);
    const existingWithBlocks = [...(existing ?? []), ...blocks];

    const fits = fitsInRoomHours(startMin, startMin + durationMin, windows);
    const concurrent = fits ? maxConcurrentClients(startMin, startMin + durationMin, existingWithBlocks) : Infinity;
    if (fits && concurrent + clientCount <= roomCapacity) continue;

    const suggestionMin = findAvailableStart(startMin, durationMin, clientCount, roomCapacity, windows, existingWithBlocks);
    return { ok: false, conflictDate: date, suggestion: suggestionMin === null ? null : minutesToTime(suggestionMin) };
  }
  return { ok: true };
}

// Jeśli trener ma nierozliczony kredyt (z wcześniej odwołanego, opłaconego z
// góry treningu — patrz cancelPersonalTrainingSession), automatycznie
// pokrywa nim najbliższy nadchodzący nierozliczony trening tego trenera.
// Wywoływane po każdym odwołaniu (mógł właśnie powstać nowy kredyt) i po
// każdym dodaniu nowego treningu (mógł właśnie powstać cel dla starego,
// czekającego kredytu).
async function applyPendingCredits(supabase: Supabase, trainerId: string) {
  const { data: credits } = await supabase
    .from("personal_training_credit")
    .select("id, note")
    .eq("trainer_employee_id", trainerId)
    .is("applied_to_session_id", null)
    .order("created_at", { ascending: true });
  if (!credits || credits.length === 0) return;

  const today = toDateKey(new Date());
  for (const credit of credits) {
    const { data: target } = await supabase
      .from("personal_training_session")
      .select("id")
      .eq("trainer_employee_id", trainerId)
      .eq("status", "scheduled")
      .eq("is_settled", false)
      .gte("date", today)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!target) break; // brak (jeszcze) kolejnego treningu do pokrycia — kredyt zostaje

    await supabase.from("personal_training_session").update({ is_settled: true, settled_note: credit.note }).eq("id", target.id);
    await supabase
      .from("personal_training_credit")
      .update({ applied_to_session_id: target.id, applied_at: new Date().toISOString() })
      .eq("id", credit.id);
  }
}

export async function createPersonalTrainingSession(formData: FormData) {
  const { trainerId } = await resolveCreateActor(formData);

  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const durationMinutes = Number(formData.get("duration_minutes"));
  const clientCount = Number(formData.get("client_count"));
  const clientName = String(formData.get("client_name") ?? "").trim() || null;
  const repeat = formData.get("repeat") === "on";
  const repeatUntil = String(formData.get("repeat_until") ?? "") || null;
  const repeatCountRaw = String(formData.get("repeat_count") ?? "") || null;
  const repeatCount = repeatCountRaw ? Number(repeatCountRaw) : null;

  if (!date || !startTime) throw new Error("Podaj dzień i godzinę treningu.");
  if (!PT_DURATIONS_MIN.includes(durationMinutes as (typeof PT_DURATIONS_MIN)[number])) {
    throw new Error("Nieprawidłowy czas trwania treningu.");
  }
  if (!Number.isFinite(clientCount) || clientCount < 1) throw new Error("Podaj liczbę osób na treningu (min. 1).");
  if (repeat && !repeatUntil && !repeatCount) {
    throw new Error("Przy powtarzaniu co tydzień podaj datę końcową albo liczbę powtórzeń.");
  }

  const dates = repeat ? weeklyOccurrenceDates(date, repeatUntil, repeatCount) : [date];
  if (dates.length === 0) throw new Error("Nieprawidłowy zakres powtarzania.");

  const weekday = new Date(date + "T00:00:00").getDay();
  const startMin = timeToMinutes(startTime);

  const supabase = createServerSupabaseClient();
  const settings = await getSettings(supabase);

  // Osobny, jednoznaczny komunikat, gdy sama liczba osób przekracza limit
  // sali — bez tego trafiałoby to do checkAvailability i wychodziłoby jako
  // mylące "brak wolnego terminu", mimo że żaden termin nigdy by nie pasował
  // (limit sali nie da się w ogóle zmieścić, niezależnie od godziny).
  if (clientCount > settings.room_capacity) {
    throw new Error(`Za dużo osób — limit sali to ${settings.room_capacity} naraz, a podano ${clientCount}.`);
  }

  const availability = await checkAvailability(supabase, dates, weekday, startMin, durationMinutes, clientCount, settings.room_capacity);
  if (!availability.ok) {
    const suggestionText = availability.suggestion
      ? ` Najbliższy wolny termin tego dnia: ${availability.suggestion}.`
      : " Brak wolnego terminu tego dnia w godzinach otwarcia sali.";
    const dateLabel = new Date(availability.conflictDate + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
    throw new Error(`Sala pełna o tej porze (${dateLabel}) — przekroczony limit osób lub poza godzinami otwarcia.${suggestionText}`);
  }

  const seriesId = dates.length > 1 ? crypto.randomUUID() : null;
  const rows = dates.map((d) => ({
    trainer_employee_id: trainerId,
    series_id: seriesId,
    date: d,
    start_time: startTime,
    duration_minutes: durationMinutes,
    client_count: clientCount,
    client_name: clientName,
    rate_per_person_snapshot: settings.rate_per_person,
  }));

  const { error } = await supabase.from("personal_training_session").insert(rows);
  if (error) throw new Error(dbErrorMessage(error));

  await applyPendingCredits(supabase, trainerId);

  revalidatePath("/treningi-personalne");
  revalidatePath("/treningi-personalne/rozliczenia");
}

export async function updatePersonalTrainingSession(formData: FormData) {
  const { trainerId } = await resolveTrainerActor(formData);

  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const durationMinutes = Number(formData.get("duration_minutes"));
  const clientCount = Number(formData.get("client_count"));
  const clientName = String(formData.get("client_name") ?? "").trim() || null;

  if (!id || !date || !startTime) throw new Error("Podaj dzień i godzinę treningu.");
  if (!PT_DURATIONS_MIN.includes(durationMinutes as (typeof PT_DURATIONS_MIN)[number])) {
    throw new Error("Nieprawidłowy czas trwania treningu.");
  }
  if (!Number.isFinite(clientCount) || clientCount < 1) throw new Error("Podaj liczbę osób na treningu (min. 1).");

  const supabase = createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("personal_training_session")
    .select("trainer_employee_id")
    .eq("id", id)
    .single();
  if (!existing || existing.trainer_employee_id !== trainerId) throw new Error("Nie znaleziono treningu.");

  const weekday = new Date(date + "T00:00:00").getDay();
  const startMin = timeToMinutes(startTime);
  const settings = await getSettings(supabase);

  if (clientCount > settings.room_capacity) {
    throw new Error(`Za dużo osób — limit sali to ${settings.room_capacity} naraz, a podano ${clientCount}.`);
  }

  const availability = await checkAvailability(supabase, [date], weekday, startMin, durationMinutes, clientCount, settings.room_capacity, id);
  if (!availability.ok) {
    const suggestionText = availability.suggestion ? ` Najbliższy wolny termin: ${availability.suggestion}.` : " Brak wolnego terminu tego dnia.";
    throw new Error(`Sala pełna o tej porze.${suggestionText}`);
  }

  const { error } = await supabase
    .from("personal_training_session")
    .update({
      date,
      start_time: startTime,
      duration_minutes: durationMinutes,
      client_count: clientCount,
      client_name: clientName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/treningi-personalne");
  revalidatePath("/treningi-personalne/rozliczenia");
}

// Przenosi CAŁĄ serię na nową godzinę (data każdego wystąpienia zostaje bez
// zmian — to seria co tydzień, nie da się jej "przesunąć" na jedną wspólną
// datę) — tylko przyszłe, wciąż zaplanowane wystąpienia. Sprawdza dostępność
// dla KAŻDEGO wystąpienia osobno pod nową godziną (obłożenie sali różni się
// dzień do dnia) — przy pierwszym konflikcie nic się nie zapisuje (wszystko
// albo nic), z podpowiedzią najbliższej wolnej godziny dla tego dnia.
export async function movePersonalTrainingSeries(formData: FormData) {
  const { trainerId } = await resolveTrainerActor(formData);

  const seriesId = String(formData.get("series_id") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  if (!seriesId || !startTime) throw new Error("Podaj nową godzinę.");

  const supabase = createServerSupabaseClient();
  const today = toDateKey(new Date());
  const { data: sessions } = await supabase
    .from("personal_training_session")
    .select("id, date, duration_minutes, client_count")
    .eq("series_id", seriesId)
    .eq("trainer_employee_id", trainerId)
    .eq("status", "scheduled")
    .gte("date", today)
    .order("date", { ascending: true });
  if (!sessions || sessions.length === 0) return;

  const startMin = timeToMinutes(startTime);
  const settings = await getSettings(supabase);

  for (const s of sessions) {
    const weekday = new Date(s.date + "T00:00:00").getDay();
    const availability = await checkAvailability(
      supabase,
      [s.date],
      weekday,
      startMin,
      s.duration_minutes,
      s.client_count,
      settings.room_capacity,
      undefined,
      seriesId
    );
    if (!availability.ok) {
      const suggestionText = availability.suggestion ? ` Najbliższy wolny termin: ${availability.suggestion}.` : " Brak wolnego terminu tego dnia.";
      const dateLabel = new Date(s.date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
      throw new Error(`Nowa godzina koliduje z inną rezerwacją (${dateLabel}).${suggestionText}`);
    }
  }

  const { error } = await supabase
    .from("personal_training_session")
    .update({ start_time: startTime, updated_at: new Date().toISOString() })
    .in(
      "id",
      sessions.map((s) => s.id)
    );
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/treningi-personalne");
}

// Dokłada kolejne cotygodniowe wystąpienia NA KOŃCU istniejącej serii —
// ta sama godzina/czas trwania/liczba osób/imię klienta co ostatni już
// zaplanowany trening tej serii, zaczynając tydzień po nim. Trener widzi
// podpowiedź o przedłużeniu dokładnie wtedy, gdy patrzy na ostatni
// zaplanowany trening serii (patrz lastDateBySeriesId w page.tsx) — to
// samo sprawdzenie dostępności co przy zakładaniu nowej serii, żeby
// przedłużenie nie wepchnęło treningu w już zajęty termin.
export async function extendPersonalTrainingSeries(formData: FormData) {
  const { trainerId } = await resolveTrainerActor(formData);

  const seriesId = String(formData.get("series_id") ?? "");
  const extendUntil = String(formData.get("extend_until") ?? "") || null;
  const extendCountRaw = String(formData.get("extend_count") ?? "") || null;
  const extendCount = extendCountRaw ? Number(extendCountRaw) : null;
  if (!seriesId) throw new Error("Brak serii do przedłużenia.");
  if (!extendUntil && !extendCount) {
    throw new Error("Podaj nową datę końcową albo liczbę dodatkowych powtórzeń.");
  }

  const supabase = createServerSupabaseClient();
  const { data: lastRows } = await supabase
    .from("personal_training_session")
    .select("date, start_time, duration_minutes, client_count, client_name")
    .eq("series_id", seriesId)
    .eq("trainer_employee_id", trainerId)
    .eq("status", "scheduled")
    .order("date", { ascending: false })
    .limit(1);
  const last = lastRows?.[0];
  if (!last) throw new Error("Nie znaleziono serii.");

  const nextDate = toDateKey(new Date(new Date(last.date + "T00:00:00").getTime() + 7 * 86400000));
  const dates = weeklyOccurrenceDates(nextDate, extendUntil, extendCount);
  if (dates.length === 0) throw new Error("Nieprawidłowy zakres przedłużenia.");

  const weekday = new Date(nextDate + "T00:00:00").getDay();
  const startMin = timeToMinutes(last.start_time);
  const settings = await getSettings(supabase);

  const availability = await checkAvailability(
    supabase,
    dates,
    weekday,
    startMin,
    last.duration_minutes,
    last.client_count,
    settings.room_capacity,
    undefined,
    seriesId
  );
  if (!availability.ok) {
    const suggestionText = availability.suggestion
      ? ` Najbliższy wolny termin tego dnia: ${availability.suggestion}.`
      : " Brak wolnego terminu tego dnia w godzinach otwarcia sali.";
    const dateLabel = new Date(availability.conflictDate + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
    throw new Error(`Sala pełna o tej porze (${dateLabel}) — przekroczony limit osób lub poza godzinami otwarcia.${suggestionText}`);
  }

  const rows = dates.map((d) => ({
    trainer_employee_id: trainerId,
    series_id: seriesId,
    date: d,
    start_time: last.start_time,
    duration_minutes: last.duration_minutes,
    client_count: last.client_count,
    client_name: last.client_name,
    rate_per_person_snapshot: settings.rate_per_person,
  }));

  const { error } = await supabase.from("personal_training_session").insert(rows);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/treningi-personalne");
  revalidatePath("/treningi-personalne/rozliczenia");
}

// Odwołuje JEDNO wystąpienie — jeśli było opłacone z góry, kwota od razu
// automatycznie próbuje przejść na najbliższy kolejny nierozliczony trening
// tego trenera (patrz applyPendingCredits).
export async function cancelPersonalTrainingSession(formData: FormData) {
  const { trainerId } = await resolveTrainerActor(formData);

  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { data: session } = await supabase
    .from("personal_training_session")
    .select("id, trainer_employee_id, date, is_settled, rate_per_person_snapshot, client_count")
    .eq("id", id)
    .single();
  if (!session || session.trainer_employee_id !== trainerId) throw new Error("Nie znaleziono treningu.");

  const { error } = await supabase.from("personal_training_session").update({ status: "cancelled" }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));

  if (session.is_settled) {
    const dateLabel = new Date(session.date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
    const amount = sessionAmount(session.rate_per_person_snapshot, session.client_count);
    await supabase.from("personal_training_credit").insert({
      trainer_employee_id: trainerId,
      source_session_id: id,
      amount,
      note: `Opłacone z przeniesienia (odwołany trening z ${dateLabel})`,
    });
    await applyPendingCredits(supabase, trainerId);
  }

  revalidatePath("/treningi-personalne");
  revalidatePath("/treningi-personalne/rozliczenia");
}

// Odwołuje CAŁĄ serię — tylko przyszłe, wciąż zaplanowane wystąpienia
// (przeszłość zostaje nietknięta, to już historia). Każde odwołane, opłacone
// z góry wystąpienie osobno generuje kredyt (jak przy pojedynczym odwołaniu).
export async function cancelPersonalTrainingSeries(formData: FormData) {
  const { trainerId } = await resolveTrainerActor(formData);

  const seriesId = String(formData.get("series_id") ?? "");
  if (!seriesId) throw new Error("Brak serii do odwołania.");

  const supabase = createServerSupabaseClient();
  const today = toDateKey(new Date());
  const { data: sessions } = await supabase
    .from("personal_training_session")
    .select("id, date, is_settled, rate_per_person_snapshot, client_count")
    .eq("series_id", seriesId)
    .eq("trainer_employee_id", trainerId)
    .eq("status", "scheduled")
    .gte("date", today);

  if (!sessions || sessions.length === 0) return;

  const { error } = await supabase
    .from("personal_training_session")
    .update({ status: "cancelled" })
    .in(
      "id",
      sessions.map((s) => s.id)
    );
  if (error) throw new Error(dbErrorMessage(error));

  const settledOnes = sessions.filter((s) => s.is_settled);
  if (settledOnes.length > 0) {
    await supabase.from("personal_training_credit").insert(
      settledOnes.map((s) => ({
        trainer_employee_id: trainerId,
        source_session_id: s.id,
        amount: sessionAmount(s.rate_per_person_snapshot, s.client_count),
        note: `Opłacone z przeniesienia (odwołany trening z ${new Date(s.date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })})`,
      }))
    );
    await applyPendingCredits(supabase, trainerId);
  }

  revalidatePath("/treningi-personalne");
  revalidatePath("/treningi-personalne/rozliczenia");
}

// Recepcja/admin oznaczają trening jako rozliczony/nierozliczony — prosty
// przełącznik, bez wpisywania kwoty (liczona zawsze jako stawka × liczba
// osób, patrz sessionAmount). Ręczne przełączenie kasuje automatyczną
// notatkę "z przeniesienia", jeśli taka tu była — recepcja właśnie
// nadpisuje stan swoją bieżącą oceną.
export async function togglePersonalTrainingSettled(formData: FormData) {
  await requireRecepcjaOrKiosk();

  const id = String(formData.get("id") ?? "");
  const isSettled = formData.get("is_settled") === "on";

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("personal_training_session")
    .update({ is_settled: isSettled, settled_note: null })
    .eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/treningi-personalne");
  revalidatePath("/treningi-personalne/rozliczenia");
}

// Oznacza WYBRANE treningi (konkretne id, zaznaczone checkboxami w
// Rozliczeniach) jako rozliczone naraz — "część miesiąca", zamiast klikać
// każdy z osobna. Ta sama zasada uprawnień i skutków co pojedynczy
// przełącznik wyżej.
export async function settlePersonalTrainingSessions(formData: FormData) {
  await requireRecepcjaOrKiosk();

  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("personal_training_session")
    .update({ is_settled: true, settled_note: null })
    .in("id", ids);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/treningi-personalne");
  revalidatePath("/treningi-personalne/rozliczenia");
  revalidatePath("/treningi-personalne/historia");
}

// Oznacza WSZYSTKIE jeszcze nierozliczone treningi danego trenera w podanym
// zakresie dat jako rozliczone jednym kliknięciem — "cały miesiąc" w
// Rozliczeniach, bez ręcznego zaznaczania każdego osobno.
export async function settleAllPersonalTrainingForRange(formData: FormData) {
  await requireRecepcjaOrKiosk();

  const trainerId = String(formData.get("trainer_employee_id") ?? "");
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  if (!trainerId || !startDate || !endDate) throw new Error("Brak zakresu dat.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("personal_training_session")
    .update({ is_settled: true, settled_note: null })
    .eq("trainer_employee_id", trainerId)
    .eq("status", "scheduled")
    .eq("is_settled", false)
    .gte("date", startDate)
    .lte("date", endDate);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/treningi-personalne");
  revalidatePath("/treningi-personalne/rozliczenia");
  revalidatePath("/treningi-personalne/historia");
}

export async function updatePersonalTrainingSettings(formData: FormData) {
  await requireAdmin();

  const roomCapacity = Number(formData.get("room_capacity"));
  const ratePerPerson = Number(String(formData.get("rate_per_person") ?? "").replace(",", "."));
  if (!Number.isFinite(roomCapacity) || roomCapacity < 1) throw new Error("Podaj poprawny limit osób.");
  if (!Number.isFinite(ratePerPerson) || ratePerPerson < 0) throw new Error("Podaj poprawną stawkę.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("personal_training_settings")
    .update({ room_capacity: roomCapacity, rate_per_person: ratePerPerson })
    .eq("id", 1);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/treningi-personalne");
  revalidatePath("/treningi-personalne");
}

export async function addRoomHoursWindow(formData: FormData) {
  await requireAdmin();

  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  if (!startTime || !endTime) throw new Error("Podaj godziny otwarcia sali.");
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) throw new Error("Godzina końca musi być późniejsza niż start.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("personal_training_room_hours").insert({ weekday, start_time: startTime, end_time: endTime });
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/treningi-personalne");
}

export async function deleteRoomHoursWindow(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("personal_training_room_hours").delete().eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/treningi-personalne");
}

// Blokuje salkę na wybrany fragment dnia (np. wynajem komuś innemu, własne
// potrzeby klubu) — od tej pory żaden trening (bez względu na liczbę osób)
// nie zmieści się w tym oknie, patrz getRoomBlocksAsFullSessions wyżej. Jeśli
// w tym czasie jest już zaplanowany trening, blokada się NIE zakłada — trzeba
// go najpierw przenieść albo usunąć, żeby nie zostawić potwierdzonego
// treningu w niespójnym stanie (zaplanowany, a sala "zajęta na coś innego").
// Dostępne dla recepcji, admina i kiosku recepcyjnego (patrz
// requireRecepcjaOrKiosk) — nie tylko admina, bo to typowa, bieżąca czynność
// przy okienku, nie ustawienie klubowe.
export async function addRoomBlock(formData: FormData) {
  const actorEmployeeId = await requireRecepcjaOrKiosk();

  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!date || !startTime || !endTime) throw new Error("Podaj dzień i godziny blokady.");
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) throw new Error("Godzina końca musi być późniejsza niż start.");

  const supabase = createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("personal_training_session")
    .select("start_time, duration_minutes")
    .eq("date", date)
    .eq("status", "scheduled");

  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const hasConflict = (existing ?? []).some((s) => {
    const sStart = timeToMinutes(s.start_time);
    const sEnd = sStart + s.duration_minutes;
    return sStart < endMin && startMin < sEnd;
  });
  if (hasConflict) {
    throw new Error("W tym czasie jest już zaplanowany trening — najpierw go przenieś albo usuń, zanim zablokujesz salę.");
  }

  const { error } = await supabase.from("personal_training_room_block").insert({
    date,
    start_time: startTime,
    end_time: endTime,
    reason,
    created_by_employee_id: actorEmployeeId,
  });
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/treningi-personalne");
}

export async function deleteRoomBlock(formData: FormData) {
  await requireRecepcjaOrKiosk();

  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("personal_training_room_block").delete().eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/treningi-personalne");
}
