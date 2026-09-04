import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { currentMonth, monthLabel, daysInMonth, toDateKey } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { formatHm, hoursBetween } from "@/lib/time";
import { Card } from "@/components/Card";
import { BackLink } from "@/components/BackLink";
import { TimeEntryList } from "../../godziny/TimeEntryList";
import { addTimeEntryAsAdmin, updateTimeEntryAsAdmin, deleteTimeEntryAsAdmin } from "./actions";

const INPUT =
  "rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

export default async function AdminGodzinyPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; employee?: string }>;
}) {
  const params = await searchParams;
  const fallback = currentMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;

  const supabase = createServerSupabaseClient();
  const { data: employees } = await supabase
    .from("employee")
    .select("id, name, color_hex, hourly_rate")
    .eq("active", true)
    .order("name");

  const employeeId = params.employee || employees?.[0]?.id || "";
  const selectedEmployee = employees?.find((e) => e.id === employeeId) ?? null;
  const dates = daysInMonth(year, month).map(toDateKey);

  const [{ data: entries }, { data: shiftRows }] = employeeId
    ? await Promise.all([
        supabase
          .from("time_entry")
          .select("id, date, actual_start, actual_end, note, is_remote")
          .eq("employee_id", employeeId)
          .in("date", dates),
        supabase
          .from("schedule_shift")
          .select("start_time, end_time, schedule_day!inner(date, schedule_month!inner(status))")
          .eq("employee_id", employeeId)
          .eq("schedule_day.schedule_month.status", "published")
          .in("schedule_day.date", dates),
      ])
    : [{ data: [] }, { data: [] }];

  // Jeden dzień może mieć kilka wpisów (podzielona zmiana z przerwą) — stąd
  // mapa na LISTĘ, nie na pojedynczy wiersz.
  const entriesByDate = new Map<string, { id: string; actual_start: string | null; actual_end: string | null; note: string | null; is_remote: boolean }[]>();
  for (const e of entries ?? []) {
    if (!entriesByDate.has(e.date)) entriesByDate.set(e.date, []);
    entriesByDate.get(e.date)!.push(e);
  }
  type ShiftRow = { start_time: string; end_time: string; schedule_day: { date: string } };
  const scheduledByDate = new Map<string, { start_time: string; end_time: string }[]>();
  for (const s of (shiftRows ?? []) as unknown as ShiftRow[]) {
    const date = s.schedule_day.date;
    if (!scheduledByDate.has(date)) scheduledByDate.set(date, []);
    scheduledByDate.get(date)!.push({ start_time: s.start_time, end_time: s.end_time });
  }

  const relevantDates = dates.filter((d) => scheduledByDate.has(d) || entriesByDate.has(d));

  // Koszt wg REALNIE wpisanych godzin (nie zaplanowanych, jak przy
  // układaniu grafiku) — bez sensu dla kogoś bez stawki (szef na stałej
  // pensji).
  const totalHours =
    Math.round((entries ?? []).reduce((sum, e) => sum + (e.actual_start && e.actual_end ? hoursBetween(e.actual_start, e.actual_end) : 0), 0) * 100) /
    100;
  const totalCost = selectedEmployee && selectedEmployee.hourly_rate > 0 ? Math.round(totalHours * selectedEmployee.hourly_rate * 100) / 100 : null;

  const qs = (overrides: Record<string, string | number>) => {
    const p = new URLSearchParams({ year: String(year), month: String(month), employee: employeeId, ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])) });
    return `?${p.toString()}`;
  };
  const prevLink = month === 1 ? qs({ year: year - 1, month: 12 }) : qs({ month: month - 1 });
  const nextLink = month === 12 ? qs({ year: year + 1, month: 1 }) : qs({ month: month + 1 });

  const boundAdd = employeeId ? addTimeEntryAsAdmin.bind(null, employeeId) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin" label="Panel admina" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Godziny pracy — admin</h1>
          <p className="text-sm text-zinc-500">
            Edycja godzin dowolnego pracownika, dla dowolnego dnia — bez limitu 7 dni obowiązującego
            pracownika. Wpisy starsze niż 3 miesiące trafiają do{" "}
            <Link href="/admin/godziny/archiwum" className="font-semibold text-brand-orange hover:underline">
              archiwum
            </Link>
            .
          </p>
        </div>
        <Link
          href="/admin/godziny/archiwum"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100"
        >
          Archiwum →
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <select name="employee" defaultValue={employeeId} className={INPUT}>
            {employees?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-xl bg-zinc-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-zinc-900">
            Pokaż
          </button>
        </form>
        <div className="flex items-center gap-3">
          <Link href={prevLink} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
            ← Poprzedni
          </Link>
          <span className="text-sm font-bold capitalize text-zinc-900">
            {monthLabel(month)} {year}
          </span>
          <Link href={nextLink} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
            Następny →
          </Link>
        </div>
      </div>

      {selectedEmployee && (
        <Card className="flex items-center justify-between">
          <span className="text-sm text-zinc-600">
            Godziny {selectedEmployee.name} w {monthLabel(month)}
          </span>
          {totalCost !== null ? (
            <span className="text-lg font-bold text-zinc-900">
              {totalHours}h × {selectedEmployee.hourly_rate} PLN/h ={" "}
              <span className="text-brand-orange">{totalCost.toFixed(2)} PLN</span>
            </span>
          ) : (
            <span className="text-lg font-bold text-zinc-900">{totalHours}h</span>
          )}
        </Card>
      )}

      <Card>
        {boundAdd ? (
          <TimeEntryList
            addAction={boundAdd}
            updateAction={updateTimeEntryAsAdmin}
            deleteAction={deleteTimeEntryAsAdmin}
            days={relevantDates.map((dateKey) => {
              const weekday = new Date(dateKey + "T00:00:00").getDay();
              return {
                dateKey,
                label: `${weekdayLabel(weekday)}, ${new Date(dateKey + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}`,
                scheduled: (scheduledByDate.get(dateKey) ?? [])
                  .map((s) => `${formatHm(s.start_time)}–${formatHm(s.end_time)}`)
                  .join(", "),
                editable: true,
                entries: (entriesByDate.get(dateKey) ?? []).map((e) => ({
                  id: e.id,
                  actualStart: e.actual_start ? formatHm(e.actual_start) : "",
                  actualEnd: e.actual_end ? formatHm(e.actual_end) : "",
                  note: e.note ?? "",
                  isRemote: e.is_remote,
                })),
              };
            })}
          />
        ) : (
          <p className="py-6 text-center text-sm text-zinc-400">Brak aktywnych pracowników.</p>
        )}
        {boundAdd && relevantDates.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-400">Brak zmian ani wpisów w tym miesiącu.</p>
        )}
      </Card>
    </div>
  );
}
