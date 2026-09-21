import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canPreviewPersonalTraining, isPersonalTrainerOnly } from "@/lib/session";
import { toDateKey, mondayOfWeek } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { formatHm, timeToMinutes } from "@/lib/time";
import { sessionAmount, maxConcurrentClients, minutesToTime } from "@/lib/personal-training";
import { Card } from "@/components/Card";
import { ColorDot } from "@/components/ColorDot";
import { BackLink } from "@/components/BackLink";
import { NewPersonalTrainingForm } from "./PersonalTrainingForm";
import { EditableSessionRow } from "./EditableSessionRow";
import { SettleToggle } from "./SettleToggle";
import { RoomBlockForm } from "./RoomBlockForm";
import {
  createPersonalTrainingSession,
  updatePersonalTrainingSession,
  movePersonalTrainingSeries,
  cancelPersonalTrainingSession,
  cancelPersonalTrainingSeries,
  togglePersonalTrainingSettled,
  addRoomBlock,
  deleteRoomBlock,
} from "./actions";

type SessionRow = {
  id: string;
  trainer_employee_id: string;
  series_id: string | null;
  date: string;
  start_time: string;
  duration_minutes: number;
  client_count: number;
  client_name: string | null;
  is_settled: boolean;
  settled_note: string | null;
  rate_per_person_snapshot: number;
  trainer: { name: string; color_hex: string } | null;
};

type BlockRow = { id: string; date: string; start_time: string; end_time: string; reason: string | null };

export default async function PersonalTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ monday?: string }>;
}) {
  const employee = await requireEmployee();
  const isAdmin = employee.roles.includes("admin");
  const isTrainer = employee.roles.includes("trener_personalny");
  const canPreview = canPreviewPersonalTraining(employee);

  if (!isAdmin && !isTrainer && !canPreview) {
    return (
      <div className="flex flex-col gap-6">
        {!isPersonalTrainerOnly(employee) && <BackLink href="/grafik" label="Mój grafik" />}
        <p className="text-sm text-zinc-500">Nie masz dostępu do grafiku treningów personalnych.</p>
      </div>
    );
  }

  const canManage = isAdmin || isTrainer;

  const params = await searchParams;
  const today = toDateKey(new Date());
  const monday = params.monday && /^\d{4}-\d{2}-\d{2}$/.test(params.monday) ? params.monday : mondayOfWeek(today);
  const mondayDate = new Date(monday + "T00:00:00");
  const weekDates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    return toDateKey(d);
  });
  const prevMonday = toDateKey(new Date(mondayDate.getTime() - 7 * 86400000));
  const nextMonday = toDateKey(new Date(mondayDate.getTime() + 7 * 86400000));

  const supabase = createServerSupabaseClient();
  const [{ data: sessions }, { data: roomHoursRows }, { data: settings }, trainerOptionsResult, { data: blockRows }] = await Promise.all([
    supabase
      .from("personal_training_session")
      .select(
        "id, trainer_employee_id, series_id, date, start_time, duration_minutes, client_count, client_name, is_settled, settled_note, rate_per_person_snapshot, trainer:trainer_employee_id(name, color_hex)"
      )
      .in("date", weekDates)
      .eq("status", "scheduled")
      .order("start_time"),
    supabase.from("personal_training_room_hours").select("weekday, start_time, end_time"),
    supabase.from("personal_training_settings").select("room_capacity, rate_per_person").eq("id", 1).single(),
    isAdmin
      ? supabase.from("employee").select("id, name, employee_role!inner(role)").eq("active", true).eq("employee_role.role", "trener_personalny").order("name")
      : Promise.resolve({ data: null }),
    supabase.from("personal_training_room_block").select("id, date, start_time, end_time, reason").in("date", weekDates).order("start_time"),
  ]);

  const roomCapacity = settings?.room_capacity ?? 0;
  const sessionsByDate = new Map<string, SessionRow[]>();
  for (const s of (sessions ?? []) as unknown as SessionRow[]) {
    if (!sessionsByDate.has(s.date)) sessionsByDate.set(s.date, []);
    sessionsByDate.get(s.date)!.push(s);
  }
  const blocksByDate = new Map<string, BlockRow[]>();
  for (const b of (blockRows ?? []) as BlockRow[]) {
    if (!blocksByDate.has(b.date)) blocksByDate.set(b.date, []);
    blocksByDate.get(b.date)!.push(b);
  }
  const roomHoursByWeekday = new Map<number, { start_time: string; end_time: string }[]>();
  for (const w of roomHoursRows ?? []) {
    if (!roomHoursByWeekday.has(w.weekday)) roomHoursByWeekday.set(w.weekday, []);
    roomHoursByWeekday.get(w.weekday)!.push({ start_time: w.start_time, end_time: w.end_time });
  }
  const trainerOptions = (trainerOptionsResult.data ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }));

  return (
    <div className="flex flex-col gap-6">
      {!isPersonalTrainerOnly(employee) && <BackLink href="/grafik" label="Mój grafik" />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Treningi personalne</h1>
          <p className="text-sm text-zinc-500">
            Limit sali: {roomCapacity} {roomCapacity === 1 ? "osoba" : "osób"} naraz.
            {isAdmin && (
              <>
                {" "}
                <Link href="/admin/treningi-personalne" className="font-semibold text-brand-orange hover:underline">
                  Ustawienia →
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/treningi-personalne/historia" className="rounded-lg px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-100">
            Historia
          </Link>
          <Link href={`/treningi-personalne/rozliczenia`} className="rounded-lg px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-100">
            Rozliczenia
          </Link>
          <Link href={`?monday=${prevMonday}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            ← poprzedni tydzień
          </Link>
          <Link href={`?monday=${nextMonday}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            następny →
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {weekDates.map((date) => {
          const weekday = new Date(date + "T00:00:00").getDay();
          const windows = roomHoursByWeekday.get(weekday) ?? [];
          const daySessions = (sessionsByDate.get(date) ?? []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
          const dayBlocks = (blocksByDate.get(date) ?? []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
          const peak = maxConcurrentClients(
            0,
            24 * 60,
            daySessions.map((s) => ({ start_time: s.start_time, duration_minutes: s.duration_minutes, client_count: s.client_count }))
          );
          const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
          const isToday = date === today;

          return (
            <Card key={date} className={`!p-3 ${isToday ? "ring-2 ring-brand-blue" : ""}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold capitalize text-zinc-900">
                  {weekdayLabel(weekday)}, {dateLabel}
                  {isToday && (
                    <span className="rounded-full bg-brand-blue px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Dziś
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-500">
                  {windows.length === 0
                    ? "Sala niedostępna"
                    : `Sala: ${windows.map((w) => `${formatHm(w.start_time)}–${formatHm(w.end_time)}`).join(", ")} · najwięcej osób naraz: ${peak}/${roomCapacity}`}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {dayBlocks.map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-300 bg-zinc-100 p-2.5 text-sm text-zinc-600"
                  >
                    <span>
                      🔒{" "}
                      <span className="font-semibold text-zinc-800">
                        {formatHm(b.start_time)}–{formatHm(b.end_time)}
                      </span>{" "}
                      Sala zablokowana{b.reason ? ` — ${b.reason}` : ""}
                    </span>
                    {isAdmin && (
                      <form action={deleteRoomBlock}>
                        <input type="hidden" name="id" value={b.id} />
                        <button type="submit" className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                          Usuń
                        </button>
                      </form>
                    )}
                  </div>
                ))}
                {daySessions.map((s) => {
                  // Edycję/przenoszenie/usuwanie widzi WYŁĄCZNIE trener-właściciel
                  // treningu — admin/recepcja mają tylko podgląd (kto zajmuje slot
                  // + dane do rozliczenia), bez imienia klienta. Admin dodaje komuś
                  // trening przez "+ Nowy trening" z wyborem trenera niżej, nie
                  // edytując cudzych wpisów tutaj.
                  const canEditThis = s.trainer_employee_id === employee.id;
                  const amount = sessionAmount(s.rate_per_person_snapshot, s.client_count);
                  if (canEditThis) {
                    return (
                      <EditableSessionRow
                        key={s.id}
                        session={{
                          id: s.id,
                          seriesId: s.series_id,
                          date: s.date,
                          startTime: s.start_time,
                          durationMinutes: s.duration_minutes,
                          clientCount: s.client_count,
                          clientName: s.client_name ?? "",
                          isSettled: s.is_settled,
                          settledNote: s.settled_note,
                          amount,
                        }}
                        trainerEmployeeId={s.trainer_employee_id}
                        updateAction={updatePersonalTrainingSession}
                        moveSeriesAction={movePersonalTrainingSeries}
                        cancelAction={cancelPersonalTrainingSession}
                        cancelSeriesAction={cancelPersonalTrainingSeries}
                        toggleAction={canPreview ? togglePersonalTrainingSettled : undefined}
                      />
                    );
                  }
                  const endTime = minutesToTime(timeToMinutes(s.start_time) + s.duration_minutes);
                  return (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-2.5 text-sm">
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold text-zinc-900">
                          {formatHm(s.start_time)}–{endTime}
                        </span>
                        {s.trainer && <ColorDot color={s.trainer.color_hex} />}
                        <span className="text-zinc-600">
                          Trener {s.trainer?.name ?? "?"} — {s.client_count}/{roomCapacity} zajęte
                        </span>
                      </span>
                      {canPreview && <SettleToggle sessionId={s.id} initialSettled={s.is_settled} toggleAction={togglePersonalTrainingSettled} />}
                    </div>
                  );
                })}
                {daySessions.length === 0 && dayBlocks.length === 0 && <p className="text-xs text-zinc-400">Brak treningów tego dnia.</p>}
              </div>

              {canManage && (
                <details className="group mt-2 border-t border-zinc-200 pt-2">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-brand-orange marker:content-none">
                    <span>+ Nowy trening</span>
                    <span className="font-normal text-zinc-400 group-open:hidden">▸</span>
                    <span className="hidden font-normal text-zinc-400 group-open:inline">— zwiń ▾</span>
                  </summary>
                  <div className="mt-2">
                    <NewPersonalTrainingForm
                      action={createPersonalTrainingSession}
                      defaultDate={date}
                      roomCapacity={roomCapacity}
                      trainerOptions={isAdmin ? trainerOptions : undefined}
                    />
                  </div>
                </details>
              )}

              {isAdmin && (
                <details className="group mt-2 border-t border-zinc-200 pt-2">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-zinc-600 marker:content-none">
                    <span>🔒 Zablokuj salę</span>
                    <span className="font-normal text-zinc-400 group-open:hidden">▸</span>
                    <span className="hidden font-normal text-zinc-400 group-open:inline">— zwiń ▾</span>
                  </summary>
                  <div className="mt-2">
                    <RoomBlockForm action={addRoomBlock} defaultDate={date} />
                  </div>
                </details>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
