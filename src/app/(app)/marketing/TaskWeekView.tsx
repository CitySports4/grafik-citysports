import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey, mondayOfWeek } from "@/lib/schedule-month";
import { WEEK_DISPLAY_ORDER, weekdayLabel } from "@/lib/weekdays";
import { type MarketingTaskStatus } from "@/lib/marketing";
import { isTaskActiveOnDay, tileUrgency, formatDeadlineBadge, type TileUrgency } from "@/lib/task-calendar";
import { setTaskStatus } from "./actions";

type Task = { id: string; title: string; due_date: string; status: MarketingTaskStatus };

const TILE_STYLE: Record<TileUrgency, string> = {
  normal: "bg-blue-50 text-blue-700",
  due_today: "bg-orange-50 text-orange-700",
  overdue: "bg-red-50 text-red-700",
};
// Dzień końcowy (termin) w przyszłości dostaje OSOBNY kolor niż zwykłe dni
// prowadzące do niego (patrz specyfikacja: "Deadline podświetlony innym
// kolorem w dniu końcowym") — "normal" + dzień == due_date, ale jeszcze nie
// dziś/po terminie (te mają już swój wyraźny kolor: pomarańczowy/czerwony).
const END_DAY_STYLE = "bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-300";

function weekLink(date: string) {
  return `/marketing?tab=zadania&widokZadan=tydzien&data=${date}`;
}

// Widok TYDZIEŃ — 7 kolumn pon–ndz, zadanie pojawia się we wszystkich
// kolumnach od dziś do terminu włącznie (patrz isTaskActiveOnDay).
export async function TaskWeekView({ date }: { date: string }) {
  const today = toDateKey(new Date());
  const monday = mondayOfWeek(date);
  const weekDays = Array.from({ length: 7 }, (_, i) => toDateKey(new Date(new Date(monday + "T00:00:00").getTime() + i * 86400000)));
  const prevWeek = toDateKey(new Date(new Date(monday + "T00:00:00").getTime() - 7 * 86400000));
  const nextWeek = toDateKey(new Date(new Date(monday + "T00:00:00").getTime() + 7 * 86400000));

  const supabase = createServerSupabaseClient();
  const { data: tasksRaw } = await supabase
    .from("marketing_task")
    .select("id, title, due_date, status")
    .eq("archived", false)
    .neq("status", "done")
    .not("due_date", "is", null);
  const allTasks = (tasksRaw ?? []) as Task[];

  const byDay = new Map<string, Task[]>(weekDays.map((d) => [d, allTasks.filter((t) => isTaskActiveOnDay(t.due_date, d, today))]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={weekLink(prevWeek)} className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">
            ←
          </Link>
          <span className="text-sm font-semibold text-zinc-700">
            {new Date(monday + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} –{" "}
            {new Date(weekDays[6] + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <Link href={weekLink(nextWeek)} className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">
            →
          </Link>
        </div>
        {monday !== mondayOfWeek(today) && (
          <Link href={weekLink(today)} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-600 hover:bg-zinc-200">
            Dziś
          </Link>
        )}
      </div>

      <div className="hidden grid-cols-7 gap-1.5 text-center text-xs font-semibold uppercase text-zinc-500 sm:grid">
        {WEEK_DISPLAY_ORDER.map((weekday) => (
          <div key={weekday}>{weekdayLabel(weekday).slice(0, 3)}</div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7 sm:gap-1.5">
        {weekDays.map((d) => {
          const isToday = d === today;
          const weekday = new Date(d + "T00:00:00").getDay();
          const items = byDay.get(d) ?? [];
          return (
            <div
              key={d}
              className={`flex flex-col gap-1.5 rounded-xl border p-2 text-xs sm:min-h-[140px] ${isToday ? "border-brand-blue bg-blue-50" : "border-zinc-200 bg-white"}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-zinc-700">{new Date(d + "T00:00:00").getDate()}</span>
                <span className="text-[11px] capitalize text-zinc-400 sm:hidden">{weekdayLabel(weekday)}</span>
              </div>
              <div className="flex flex-col gap-1">
                {items.map((t) => {
                  const urgency = tileUrgency(t.due_date, today);
                  const isEndDay = d === t.due_date;
                  const style = isEndDay && urgency === "normal" ? END_DAY_STYLE : TILE_STYLE[urgency];
                  return (
                    <div key={t.id} className={`flex items-start gap-1 rounded px-1.5 py-1 ${style}`}>
                      <form action={setTaskStatus} className="pt-0.5">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="status" value="done" />
                        <button
                          type="submit"
                          aria-label="Oznacz jako zrobione"
                          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-current opacity-60 hover:opacity-100"
                        />
                      </form>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{t.title}</p>
                        <p className="text-[10px] opacity-80">{formatDeadlineBadge(t.due_date)}</p>
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
