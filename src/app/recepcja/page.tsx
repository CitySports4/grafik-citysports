import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { hasKioskSession } from "@/lib/kiosk-session";
import { findScheduleMonth, currentMonth, monthLabel, toDateKey, daysInMonth, mondayOfWeek } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { formatHm, timeToMinutes } from "@/lib/time";
import { sessionAmount, maxConcurrentClients, minutesToTime } from "@/lib/personal-training";
import { getCleaningDayItems } from "@/lib/cleaning-day";
import { EVENT_TYPE_LABELS } from "@/lib/event-types";
import { Card } from "@/components/Card";
import { ColorDot } from "@/components/ColorDot";
import { NewPersonalTrainingForm } from "@/app/(app)/treningi-personalne/PersonalTrainingForm";
import { RoomBlockForm } from "@/app/(app)/treningi-personalne/RoomBlockForm";
import { SettleToggle } from "@/app/(app)/treningi-personalne/SettleToggle";
import {
  createPersonalTrainingSession,
  addRoomBlock,
  deleteRoomBlock,
  togglePersonalTrainingSettled,
} from "@/app/(app)/treningi-personalne/actions";
import { verifyKioskPin, kioskLogout } from "./actions";
import { KioskPinForm } from "./KioskPinForm";

type SessionRow = {
  id: string;
  trainer_employee_id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  client_count: number;
  is_settled: boolean;
  rate_per_person_snapshot: number;
  trainer: { name: string; color_hex: string } | null;
};
type BlockRow = { id: string; date: string; start_time: string; end_time: string; reason: string | null };

// Ogólny podgląd — komputer recepcyjny. Dostęp za wspólnym PIN-em (nie
// osobiste konto, patrz lib/kiosk-session.ts), więc żadna z sekcji nie może
// zakładać tożsamości konkretnego pracownika: grafik pracy i zadania
// sprzątania są tu WYŁĄCZNIE do odczytu (wpisywanie godzin/zaznaczanie
// zostaje na osobistych kontach), a treningi personalne mają pełne
// zarządzanie (dodawanie, blokada sali, rozliczenia) — patrz
// requireRecepcjaOrKiosk/resolveCreateActor w treningi-personalne/actions.ts.
export default async function RecepcjaPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; monday?: string }>;
}) {
  const authorized = await hasKioskSession();

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <KioskPinForm action={verifyKioskPin} />
      </main>
    );
  }

  const params = await searchParams;
  const supabase = createServerSupabaseClient();
  const today = toDateKey(new Date());

  // --- Grafik pracy (tylko podgląd) -----------------------------------
  const fallback = currentMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;
  const scheduleMonth = await findScheduleMonth(year, month);
  const scheduleDates = daysInMonth(year, month).map(toDateKey);
  const gPrevLink = month === 1 ? `?year=${year - 1}&month=12` : `?year=${year}&month=${month - 1}`;
  const gNextLink = month === 12 ? `?year=${year + 1}&month=1` : `?year=${year}&month=${month + 1}`;

  // --- Treningi personalne (pełne zarządzanie) ------------------------
  const monday = params.monday && /^\d{4}-\d{2}-\d{2}$/.test(params.monday) ? params.monday : mondayOfWeek(today);
  const mondayDate = new Date(monday + "T00:00:00");
  const weekDates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    return toDateKey(d);
  });
  const prevMonday = toDateKey(new Date(mondayDate.getTime() - 7 * 86400000));
  const nextMonday = toDateKey(new Date(mondayDate.getTime() + 7 * 86400000));

  const [
    { items: cleaningItems },
    scheduleDaysResult,
    { data: employees },
    { data: sessions },
    { data: roomHoursRows },
    { data: settings },
    { data: trainerRows },
    { data: blockRows },
  ] = await Promise.all([
    getCleaningDayItems(today),
    scheduleMonth
      ? supabase
          .from("schedule_day")
          .select(
            "id, date, weekday, schedule_shift(id, slot_index, start_time, end_time, employee_id, is_closed), schedule_event(id, type, start_time, end_time, label, note, participant_employee_ids)"
          )
          .eq("schedule_month_id", scheduleMonth.id)
          .order("date")
      : Promise.resolve({ data: null }),
    supabase.from("employee").select("id, name, color_hex"),
    supabase
      .from("personal_training_session")
      .select(
        "id, trainer_employee_id, date, start_time, duration_minutes, client_count, is_settled, rate_per_person_snapshot, trainer:trainer_employee_id(name, color_hex)"
      )
      .in("date", weekDates)
      .eq("status", "scheduled")
      .order("start_time"),
    supabase.from("personal_training_room_hours").select("weekday, start_time, end_time"),
    supabase.from("personal_training_settings").select("room_capacity, rate_per_person").eq("id", 1).single(),
    supabase.from("employee").select("id, name, employee_role!inner(role)").eq("active", true).eq("employee_role.role", "trener_personalny").order("name"),
    supabase.from("personal_training_room_block").select("id, date, start_time, end_time, reason").in("date", weekDates).order("start_time"),
  ]);

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
  const scheduleDays = scheduleDaysResult.data ?? [];

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
  const trainerOptions = (trainerRows ?? []).map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-brand-navy">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="font-semibold text-white">City Sports — Recepcja</span>
          <form action={kioskLogout}>
            <button type="submit" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-brand-orange">
              Wyloguj to stanowisko
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-zinc-900">
              Grafik pracy — {monthLabel(month)} {year} <span className="text-sm font-normal text-zinc-400">(tylko podgląd)</span>
            </h2>
            <div className="flex items-center gap-2 text-sm">
              <Link href={gPrevLink} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
                ← poprzedni
              </Link>
              <Link href={gNextLink} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
                następny →
              </Link>
            </div>
          </div>
          {!scheduleMonth || scheduleMonth.status !== "published" ? (
            <Card className="text-center text-sm text-zinc-500">Grafik na ten miesiąc nie został jeszcze opublikowany.</Card>
          ) : (
            <div className="flex flex-col gap-2">
              {scheduleDates.map((date) => {
                const day = scheduleDays.find((d) => d.date === date);
                if (!day) return null;
                const shifts = (day.schedule_shift ?? []).slice().sort((a, b) => a.slot_index - b.slot_index);
                const events = day.schedule_event ?? [];
                const isToday = date === today;
                if (shifts.length === 0 && events.length === 0) return null;
                return (
                  <Card key={day.id} className={`!p-3 ${isToday ? "ring-2 ring-brand-blue" : ""}`}>
                    <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold capitalize text-zinc-900">
                      {new Date(date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} — {weekdayLabel(day.weekday)}
                      {isToday && (
                        <span className="rounded-full bg-brand-blue px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          Dziś
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {shifts.map((shift) => {
                        const emp = shift.employee_id ? employeeById.get(shift.employee_id) : null;
                        return (
                          <div
                            key={shift.id}
                            style={emp ? { backgroundColor: `${emp.color_hex}2e`, borderLeft: `3px solid ${emp.color_hex}` } : undefined}
                            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 ${shift.is_closed ? "opacity-50" : ""}`}
                          >
                            <span className="font-semibold">
                              {formatHm(shift.start_time)}–{formatHm(shift.end_time)}
                            </span>
                            {emp && <ColorDot color={emp.color_hex} />}
                            <span>{shift.is_closed ? "NIECZYNNE" : emp ? emp.name : "— nieprzypisane —"}</span>
                          </div>
                        );
                      })}
                      {shifts.length === 0 && <span className="text-xs text-zinc-400">Zamknięte.</span>}
                    </div>
                    {events.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {events.map((ev) => (
                          <span key={ev.id} className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">
                            {ev.start_time ? `${formatHm(ev.start_time)}${ev.end_time ? `–${formatHm(ev.end_time)}` : ""} ` : ""}
                            {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                            {ev.label && ev.label !== EVENT_TYPE_LABELS[ev.type] ? ` — ${ev.label}` : ""}
                            {(ev.participant_employee_ids ?? []).map((id: string) => {
                              const p = employeeById.get(id);
                              return p ? <ColorDot key={id} color={p.color_hex} /> : null;
                            })}
                          </span>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-zinc-900">
            Zadania sprzątania — {new Date(today + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}{" "}
            <span className="text-sm font-normal text-zinc-400">(tylko podgląd)</span>
          </h2>
          <Card>
            {cleaningItems.length === 0 ? (
              <p className="text-sm text-zinc-400">Brak zadań sprzątania na dziś.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {cleaningItems.map((it) => (
                  <div
                    key={it.taskId}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 text-sm ${
                      it.done ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`font-semibold ${it.done ? "text-emerald-700 line-through" : "text-zinc-900"}`}>{it.name}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">{it.zoneName}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {it.assignee ? (
                        <span className="flex items-center gap-1 text-xs text-zinc-600">
                          <ColorDot color={it.assignee.color_hex} />
                          {it.assignee.name}
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-red-500">brak przypisania</span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          it.done ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {it.done ? "✓ zrobione" : "do zrobienia"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-zinc-900">
              Treningi personalne <span className="text-sm font-normal text-zinc-400">— limit sali: {roomCapacity} osób naraz</span>
            </h2>
            <div className="flex items-center gap-2 text-sm">
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
                        <form action={deleteRoomBlock}>
                          <input type="hidden" name="id" value={b.id} />
                          <button type="submit" className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                            Usuń
                          </button>
                        </form>
                      </div>
                    ))}
                    {daySessions.map((s) => {
                      const endTime = minutesToTime(timeToMinutes(s.start_time) + s.duration_minutes);
                      const amount = sessionAmount(s.rate_per_person_snapshot, s.client_count);
                      return (
                        <div
                          key={s.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-2.5 text-sm"
                        >
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-zinc-900">
                              {formatHm(s.start_time)}–{endTime}
                            </span>
                            {s.trainer && <ColorDot color={s.trainer.color_hex} />}
                            <span className="text-zinc-600">
                              Trener {s.trainer?.name ?? "?"} — {s.client_count}/{roomCapacity} zajęte
                            </span>
                            <span className="text-zinc-400">· {amount.toFixed(2)} PLN</span>
                          </span>
                          <SettleToggle sessionId={s.id} initialSettled={s.is_settled} toggleAction={togglePersonalTrainingSettled} />
                        </div>
                      );
                    })}
                    {daySessions.length === 0 && dayBlocks.length === 0 && <p className="text-xs text-zinc-400">Brak treningów tego dnia.</p>}
                  </div>

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
                        trainerOptions={trainerOptions}
                      />
                    </div>
                  </details>

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
                </Card>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
