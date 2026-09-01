import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { currentMonth, monthLabel, daysInMonth, toDateKey } from "@/lib/schedule-month";
import { formatHm, hoursBetween } from "@/lib/time";
import { Card } from "@/components/Card";
import { BackLink } from "@/components/BackLink";
import { ColorDot } from "@/components/ColorDot";

const INPUT =
  "rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

// Archiwum ewidencji godzin — wpisy starsze niż 3 miesiące trafiają tu
// automatycznie (patrz api/cron/data-retention), zamiast siedzieć w
// "gorącej" tabeli przeglądanej przy KAŻDYM wejściu w /grafik i /godziny.
// Tylko do odczytu — to zamrożony, historyczny zapis (ewidencja godzin dla
// umów zlecenia musi przeżyć 5 lat, ale nikt jej już nie edytuje), z prostym
// wyszukiwaniem po miesiącu i opcjonalnie po osobie.
export default async function TimeEntryArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; employee?: string }>;
}) {
  const params = await searchParams;
  const fallback = currentMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;
  const employeeId = params.employee || "";

  const supabase = createServerSupabaseClient();
  const dates = daysInMonth(year, month).map(toDateKey);
  const firstDay = dates[0];
  const lastDay = dates[dates.length - 1];

  const [{ data: employees }, { data: entries }] = await Promise.all([
    supabase.from("employee").select("id, name, color_hex").order("name"),
    (() => {
      let q = supabase
        .from("time_entry_archive")
        .select("id, employee_id, date, actual_start, actual_end, note, is_remote")
        .gte("date", firstDay)
        .lte("date", lastDay)
        .order("date");
      if (employeeId) q = q.eq("employee_id", employeeId);
      return q;
    })(),
  ]);

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));

  const entriesByEmployee = new Map<string, { id: string; date: string; actual_start: string | null; actual_end: string | null; note: string | null; is_remote: boolean }[]>();
  for (const e of entries ?? []) {
    if (!entriesByEmployee.has(e.employee_id)) entriesByEmployee.set(e.employee_id, []);
    entriesByEmployee.get(e.employee_id)!.push(e);
  }

  const qs = (overrides: Record<string, string | number>) => {
    const p = new URLSearchParams({
      year: String(year),
      month: String(month),
      ...(employeeId ? { employee: employeeId } : {}),
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    });
    return `?${p.toString()}`;
  };
  const prevLink = month === 1 ? qs({ year: year - 1, month: 12 }) : qs({ month: month - 1 });
  const nextLink = month === 12 ? qs({ year: year + 1, month: 1 }) : qs({ month: month + 1 });

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin/godziny" label="Godziny pracy — admin" />

      <div>
        <h1 className="text-lg font-bold text-zinc-900">Archiwum ewidencji godzin</h1>
        <p className="text-sm text-zinc-500">
          Wpisy starsze niż 3 miesiące — tylko do odczytu, przechowywane 5 lat od daty. Szukaj po miesiącu, opcjonalnie
          po osobie.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <select name="employee" defaultValue={employeeId} className={INPUT}>
            <option value="">— wszyscy —</option>
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

      <Card>
        {entriesByEmployee.size === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">Brak zarchiwizowanych wpisów w tym miesiącu.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {[...entriesByEmployee.entries()].map(([empId, empEntries]) => {
              const emp = employeeById.get(empId);
              const totalHours = Math.round(
                empEntries.reduce((sum, e) => sum + (e.actual_start && e.actual_end ? hoursBetween(e.actual_start, e.actual_end) : 0), 0) * 100
              ) / 100;
              return (
                <div key={empId} className="rounded-xl border border-zinc-200 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-semibold text-zinc-900">
                      <ColorDot color={emp?.color_hex ?? "#999"} />
                      {emp?.name ?? "— usunięty pracownik —"}
                    </span>
                    <span className="text-sm text-zinc-600">
                      Suma: <strong className="text-zinc-900">{totalHours}h</strong>
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1 text-sm">
                    {empEntries.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-1.5 text-zinc-700">
                        <span className="font-semibold">{new Date(e.date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</span>
                        <span>
                          {e.actual_start && e.actual_end ? `${formatHm(e.actual_start)}–${formatHm(e.actual_end)}` : "—"}
                        </span>
                        {e.is_remote && <span className="text-sky-600">🏠 zdalnie</span>}
                        {e.note && <span className="text-zinc-400">· {e.note}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
