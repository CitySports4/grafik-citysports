import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey, daysInMonth, monthLabel, currentMonth } from "@/lib/schedule-month";
import { WEEK_DISPLAY_ORDER, weekdayLabel } from "@/lib/weekdays";
import { type MarketingTaskStatus } from "@/lib/marketing";
import { isTaskActiveOnDay, tileUrgency, formatDeadlineBadge, filterByAssignee, type TileUrgency } from "@/lib/task-calendar";
import { setTaskStatus } from "./actions";

type Task = { id: string; title: string; due_date: string; status: MarketingTaskStatus; assignee_employee_id: string | null };

// Dokładnie 3 stany, jak w specyfikacji: "normalny = niebieski, deadline
// dzisiaj = pomarańczowy, przeterminowany = czerwony" — bez 4. koloru dla
// przyszłego dnia końcowego (to tylko w widoku Tydzień, patrz TaskWeekView).
const TILE_STYLE: Record<TileUrgency, string> = {
  normal: "bg-blue-50 text-blue-700",
  due_today: "bg-orange-50 text-orange-700",
  overdue: "bg-red-50 text-red-700",
};

function monthLink(year: number, month: number) {
  return `/marketing?tab=zadania&widokZadan=miesiac&data=${year}-${String(month).padStart(2, "0")}-01`;
}

// Widok MIESIĄC — siatka kalendarza, kafelki zadań aktywnych danego dnia
// (patrz isTaskActiveOnDay), ten sam układ siatki co ContentCalendarSection,
// zawężona filtrem po osobie (patrz assigneeFilter — domyślnie tylko moje).
export async function TaskMonthView({ date, assigneeFilter }: { date: string; assigneeFilter: string }) {
  const today = toDateKey(new Date());
  const fallback = currentMonth();
  const [yearStr, monthStr] = date.split("-");
  const year = Number(yearStr) || fallback.year;
  const month = Number(monthStr) || fallback.month;

  const days = daysInMonth(year, month);
  const dateKeys = days.map(toDateKey);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const supabase = createServerSupabaseClient();
  const { data: tasksRaw } = await supabase
    .from("marketing_task")
    .select("id, title, due_date, status, assignee_employee_id")
    .eq("archived", false)
    .neq("status", "done")
    .not("due_date", "is", null);
  const allTasks = filterByAssignee((tasksRaw ?? []) as Task[], assigneeFilter);

  const byDay = new Map<string, Task[]>();
  for (const d of dateKeys) byDay.set(d, allTasks.filter((t) => isTaskActiveOnDay(t.due_date, d, today)));

  const leadingBlanks = days.length > 0 ? (days[0].getDay() + 6) % 7 : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm capitalize text-zinc-500">
          {monthLabel(month)} {year}
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Link href={monthLink(prevYear, prevMonth)} className="rounded-lg px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-100">
            ← poprzedni
          </Link>
          {!(year === fallback.year && month === fallback.month) && (
            <Link href={monthLink(fallback.year, fallback.month)} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-600 hover:bg-zinc-200">
              Dziś
            </Link>
          )}
          <Link href={monthLink(nextYear, nextMonth)} className="rounded-lg px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-100">
            następny →
          </Link>
        </div>
      </div>

      <div className="hidden grid-cols-7 gap-1.5 text-center text-xs font-semibold uppercase text-zinc-500 sm:grid">
        {WEEK_DISPLAY_ORDER.map((weekday) => (
          <div key={weekday}>{weekdayLabel(weekday).slice(0, 3)}</div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7 sm:gap-1.5">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} className="hidden sm:block" />
        ))}
        {days.map((d) => {
          const date = toDateKey(d);
          const weekday = d.getDay();
          const items = byDay.get(date) ?? [];
          const isToday = date === today;
          return (
            <div
              key={date}
              className={`flex flex-col gap-1.5 rounded-xl border p-2 text-xs sm:min-h-[90px] ${isToday ? "border-brand-blue bg-blue-50" : "border-zinc-200 bg-white"}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-zinc-700">{d.getDate()}</span>
                <span className="text-[11px] capitalize text-zinc-400 sm:hidden">{weekdayLabel(weekday)}</span>
              </div>
              <div className="flex flex-col gap-1">
                {items.map((t) => {
                  const urgency = tileUrgency(t.due_date, today);
                  return (
                    <div key={t.id} className={`flex items-start gap-1 rounded px-1.5 py-1 ${TILE_STYLE[urgency]}`}>
                      <form action={setTaskStatus} className="pt-0.5">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="status" value="done" />
                        <button
                          type="submit"
                          aria-label="Oznacz jako zrobione"
                          className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-current opacity-60 hover:opacity-100"
                        />
                      </form>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{t.title}</p>
                        <p className={`text-[10px] ${urgency !== "normal" ? "font-bold" : "opacity-70"}`}>{formatDeadlineBadge(t.due_date)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
