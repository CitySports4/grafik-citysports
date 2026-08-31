import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getOrCreateScheduleMonth, nextMonth, monthLabel, daysInMonth, toDateKey } from "@/lib/schedule-month";
import { buildAvailabilityMap, applyPlannedAbsences, type AvailabilityMap, type HardConstraint } from "@/lib/unavailability";
import { formatHm } from "@/lib/time";
import { WEEK_DISPLAY_ORDER, weekdayLabel } from "@/lib/weekdays";
import { Card } from "@/components/Card";
import { BackLink } from "@/components/BackLink";
import { ColorDot } from "@/components/ColorDot";

type ShiftSlot = { slot_index: number; default_start_time: string; default_end_time: string };
type DayLevel = "whole" | "partial" | "available" | "none";

// Widok admina: dla KAŻDEGO pracownika, jednym spojrzeniem, kiedy w danym
// miesiącu jest niedostępny — łączy wszystkie trzy źródła (cykliczne twarde
// reguły, comiesięczna zgłoszona dyspozycyjność, zaplanowane urlopy), bo to
// dokładnie to samo, co i tak liczy się przy budowaniu grafiku (patrz
// isHardUnavailable) — tu tylko pokazane z góry, dla całego zespołu naraz,
// zamiast dopiero jako ostrzeżenia przy pojedynczych zmianach. Nie wymaga,
// żeby grafik na dany miesiąc był już wygenerowany — liczy się z domyślnego
// szablonu zmian (shift_template), więc admin może to sprawdzić, zanim
// jeszcze zacznie układać grafik.
//
// Pierwsza wersja pokazywała gęstą siatkę (pracownik × każdy dzień miesiąca,
// kolorowy kwadracik na komórkę) — zbyt dużo naraz, trudne do ogarnięcia.
// Skoro większość dni to i tak "dostępny" (dyspozycyjność zaznacza się
// WYJĄTKI, patrz komentarz w AvailabilityCalendar), sensowniejsze jest
// pokazanie tylko tych wyjątków jako czytelnego tekstu — kolejne dni "cały
// dzień niedostępny" zwinięte w jeden zakres dat, zamiast osobnej komórki na
// każdy z nich.
//
// UWAGA: w odróżnieniu od isHardUnavailable() (który liczy się przy
// przypisywaniu zmian i musi brać pod uwagę WSZYSTKO naraz), tu celowo
// liczymy tylko na podstawie zgłoszonej dyspozycyjności/urlopów
// (availabilityMap) — reguły cykliczne (zajęcia, stałe "nie pracuję w
// weekendy" itd.) pokazujemy OSOBNO, jako jedną linijkę wzoru na cały
// miesiąc (patrz recurringPatternLines), zamiast rozbijać je na dziesiątki
// niemal identycznych wpisów dzień po dniu — to właśnie robiło ten widok
// nieczytelnym.
function dayStatus(
  employeeId: string,
  dateKey: string,
  slots: ShiftSlot[],
  availabilityMap: AvailabilityMap
): { level: DayLevel; unavailableSlots: number[] } {
  const entry = availabilityMap.get(employeeId)?.get(dateKey);
  if (entry?.wholeDay) return { level: "whole", unavailableSlots: slots.map((s) => s.slot_index) };
  if (slots.length === 0) return { level: "none", unavailableSlots: [] };

  const unavailableSlots = slots.filter((s) => entry?.slots.has(s.slot_index)).map((s) => s.slot_index);

  if (unavailableSlots.length === 0) return { level: "available", unavailableSlots: [] };
  if (unavailableSlots.length === slots.length) return { level: "whole", unavailableSlots };
  return { level: "partial", unavailableSlots };
}

// Reguły cykliczne pogrupowane po identycznym oknie czasowym (i dniu
// tygodnia) w jedną czytelną linijkę, np. "sob, niedz: cały dzień" albo
// "pon–pt: 08:00–14:00", zamiast osobnego wpisu na każdą datę w miesiącu,
// w której ta sama reguła akurat wypada.
function recurringPatternLines(rules: HardConstraint[]): string[] {
  const groups = new Map<string, number[]>();
  for (const r of rules) {
    const key = r.start_time && r.end_time ? `${r.start_time}|${r.end_time}` : "all";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r.weekday);
  }
  return Array.from(groups.entries()).map(([key, weekdays]) => {
    const sorted = [...new Set(weekdays)].sort(
      (a, b) => WEEK_DISPLAY_ORDER.indexOf(a as (typeof WEEK_DISPLAY_ORDER)[number]) - WEEK_DISPLAY_ORDER.indexOf(b as (typeof WEEK_DISPLAY_ORDER)[number])
    );
    const dayLabels = sorted.map((w) => weekdayLabel(w).slice(0, 3)).join(", ");
    if (key === "all") return `${dayLabels}: cały dzień`;
    const [start, end] = key.split("|");
    return `${dayLabels}: ${formatHm(start)}–${formatHm(end)}`;
  });
}

function fmtDate(dateKey: string): string {
  return new Date(dateKey + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

// "1–8 wrz" dla zakresu kilku dni z rzędu, albo samo "17 wrz" dla jednego dnia.
function formatRange(startKey: string, endKey: string): string {
  if (startKey === endKey) return fmtDate(startKey);
  const startDay = new Date(startKey + "T00:00:00").getDate();
  return `${startDay}–${fmtDate(endKey)}`;
}

export default async function AdminAvailabilityOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const fallback = nextMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;

  const scheduleMonth = await getOrCreateScheduleMonth(year, month);
  const supabase = createServerSupabaseClient();

  const [{ data: employees }, { data: shiftTemplate }, { data: constraints }, { data: submissions }] = await Promise.all([
    supabase.from("employee").select("id, name, color_hex").eq("active", true).order("name"),
    supabase.from("shift_template").select("weekday, slot_index, default_start_time, default_end_time").eq("active", true),
    supabase.from("weekly_recurring_constraint").select("employee_id, weekday, start_time, end_time, type"),
    supabase.from("availability_submission").select("id, employee_id, status, submitted_at").eq("schedule_month_id", scheduleMonth.id),
  ]);

  const shiftsByWeekday = new Map<number, ShiftSlot[]>();
  for (const s of shiftTemplate ?? []) {
    if (!shiftsByWeekday.has(s.weekday)) shiftsByWeekday.set(s.weekday, []);
    shiftsByWeekday.get(s.weekday)!.push(s);
  }

  const hardConstraintsByEmployee = new Map<string, HardConstraint[]>();
  for (const c of constraints ?? []) {
    if (c.type !== "unavailable") continue;
    if (!hardConstraintsByEmployee.has(c.employee_id)) hardConstraintsByEmployee.set(c.employee_id, []);
    hardConstraintsByEmployee.get(c.employee_id)!.push({ weekday: c.weekday, start_time: c.start_time, end_time: c.end_time });
  }

  const submissionByEmployee = new Map((submissions ?? []).map((s) => [s.employee_id, s]));
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

  const dates = daysInMonth(year, month);
  const dateKeys = dates.map(toDateKey);
  const { data: plannedAbsences } = await supabase
    .from("planned_absence")
    .select("employee_id, start_date, end_date")
    .lte("start_date", dateKeys[dateKeys.length - 1])
    .gte("end_date", dateKeys[0]);
  applyPlannedAbsences(availabilityMap, plannedAbsences ?? []);

  // Dla każdego pracownika: reguły cykliczne jako jedna linijka wzoru,
  // dni "cały dzień niedostępny" (zgłoszone/urlop) zwinięte w zakresy
  // kolejnych dat, dni "częściowo niedostępny" osobno (z konkretną zmianą,
  // której dotyczą) — reszta miesiąca to milcząco "dostępny", więc nie ma po
  // co jej wymieniać.
  const rows = (employees ?? []).map((emp) => {
    const submission = submissionByEmployee.get(emp.id);
    const submitted = submission?.status === "submitted" || submission?.status === "locked";
    const patternLines = recurringPatternLines(hardConstraintsByEmployee.get(emp.id) ?? []);
    const wholeRanges: { start: string; end: string }[] = [];
    const partialDays: { date: string; slots: ShiftSlot[] }[] = [];
    let runStart: string | null = null;
    let runEnd: string | null = null;

    for (const d of dates) {
      const dateKey = toDateKey(d);
      const weekday = d.getDay();
      const slots = shiftsByWeekday.get(weekday) ?? [];
      const { level, unavailableSlots } = dayStatus(emp.id, dateKey, slots, availabilityMap);

      if (level === "whole") {
        if (runStart === null) runStart = dateKey;
        runEnd = dateKey;
        continue;
      }
      if (runStart !== null) {
        wholeRanges.push({ start: runStart, end: runEnd! });
        runStart = null;
        runEnd = null;
      }
      if (level === "partial") {
        partialDays.push({ date: dateKey, slots: slots.filter((s) => unavailableSlots.includes(s.slot_index)) });
      }
    }
    if (runStart !== null) wholeRanges.push({ start: runStart, end: runEnd! });

    return { emp, submitted, patternLines, wholeRanges, partialDays };
  });

  const prevLink = month === 1 ? `?year=${year - 1}&month=12` : `?year=${year}&month=${month - 1}`;
  const nextLink = month === 12 ? `?year=${year + 1}&month=1` : `?year=${year}&month=${month + 1}`;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/admin/grafik?year=${year}&month=${month}`} label="Grafik" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold capitalize text-zinc-900">
            Dyspozycyjność zespołu — {monthLabel(month)} {year}
          </h1>
          <p className="text-sm text-zinc-500">
            Kto i kiedy jest niedostępny — łączy zajęcia/reguły cykliczne, zgłoszoną dyspozycyjność i zaplanowane urlopy. Przydatne do
            sprawdzenia obsady zanim zaczniesz układać{" "}
            <Link href={`/admin/grafik?year=${year}&month=${month}`} className="font-semibold text-brand-orange hover:underline">
              Grafik
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/admin/grafik/dyspozycyjnosc${prevLink}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            ← poprzedni
          </Link>
          <Link href={`/admin/grafik/dyspozycyjnosc${nextLink}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            następny →
          </Link>
        </div>
      </div>

      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak aktywnych pracowników.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map(({ emp, submitted, patternLines, wholeRanges, partialDays }) => (
              <div key={emp.id} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ColorDot color={emp.color_hex} />
                  <span className="font-semibold text-zinc-900">{emp.name}</span>
                  {submitted ? (
                    <span className="text-xs text-emerald-600">✓ zgłoszono</span>
                  ) : (
                    <span
                      className="cursor-help rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
                      title="Nie zgłosił(a) jeszcze dyspozycyjności na ten miesiąc"
                    >
                      brak zgłoszenia
                    </span>
                  )}
                </div>
                {patternLines.length === 0 && wholeRanges.length === 0 && partialDays.length === 0 ? (
                  <p className="mt-1.5 text-xs text-emerald-600">Bez zgłoszonych niedostępności w tym miesiącu.</p>
                ) : (
                  // Osobne, podpisane rzędy "chipów" zamiast jednej długiej,
                  // rozdzielanej przecinkami linijki tekstu — każdy zakres/dzień
                  // jest własną, wizualnie odseparowaną plakietką, więc łatwiej
                  // wyłapać wzrokiem pojedynczą datę zamiast czytać zdanie.
                  <div className="mt-2 flex flex-col gap-2">
                    {patternLines.length > 0 && (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                          Cyklicznie (zajęcia/reguła)
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {patternLines.map((line) => (
                            <span key={line} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                              {line}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {wholeRanges.length > 0 && (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-red-500">Cały dzień niedostępny/a</div>
                        <div className="flex flex-wrap gap-1.5">
                          {wholeRanges.map((r) => (
                            <span
                              key={`${r.start}-${r.end}`}
                              className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700"
                            >
                              {formatRange(r.start, r.end)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {partialDays.length > 0 && (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-500">Częściowo niedostępny/a</div>
                        <div className="flex flex-wrap gap-1.5">
                          {partialDays.map((p) => (
                            <span key={p.date} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              {fmtDate(p.date)} · {p.slots.map((s) => `${formatHm(s.default_start_time)}–${formatHm(s.default_end_time)}`).join(", ")}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
