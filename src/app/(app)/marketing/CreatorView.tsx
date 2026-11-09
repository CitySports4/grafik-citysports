import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey, daysInMonth, monthLabel, currentMonth } from "@/lib/schedule-month";
import { WEEK_DISPLAY_ORDER, weekdayLabel } from "@/lib/weekdays";
import { Card } from "@/components/Card";
import { RECORDING_FORMAT_LABELS, RECORDING_FORMAT_ICONS, type RecordingFormat, type MarketingTaskStatus } from "@/lib/marketing";
import { setTaskStatus } from "./actions";

type Task = {
  id: string;
  title: string;
  status: MarketingTaskStatus;
  due_date: string | null;
  recording_format: RecordingFormat | null;
  recording_look_for: string;
  recording_mood: string;
};

const TABS = [
  { key: "zadania", label: "Moje zadania" },
  { key: "kalendarz", label: "Kalendarz" },
] as const;

// Sprint A — widok dla osoby z rolą content_creator: TYLKO jej zadania
// (żadnych cudzych, żadnych kampanii/projektów/ustawień), z polami
// nagraniowymi widoczne wprost, bez priorytetu/projektu/assignee (to i tak
// zawsze ona). Jedyne dostępne akcje: oznaczyć materiał jako gotowy (czeka na
// publikację) i, osobno, jako opublikowany (patrz migracja 0067) — żadnej
// edycji, dodawania ani usuwania (patrz setTaskStatus w actions.ts, które
// dla tej roli pilnuje też, że to NA PEWNO jej własne zadanie).
export async function CreatorView({
  employeeId,
  tab,
  yearParam,
  monthParam,
}: {
  employeeId: string;
  tab?: string;
  yearParam?: string;
  monthParam?: string;
}) {
  const activeTab = tab === "kalendarz" ? "kalendarz" : "zadania";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">📣 Marketing</h1>
        <p className="text-sm text-zinc-500">Twoje zadania treściowe.</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "zadania" ? "/marketing" : `/marketing?tab=${t.key}`}
            className={`px-3 py-2 text-sm font-semibold ${
              activeTab === t.key ? "border-b-2 border-brand-orange text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {activeTab === "zadania" ? <CreatorTasks employeeId={employeeId} /> : <CreatorCalendar employeeId={employeeId} yearParam={yearParam} monthParam={monthParam} />}
    </div>
  );
}

async function CreatorTasks({ employeeId }: { employeeId: string }) {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("marketing_task")
    .select("id, title, status, due_date, recording_format, recording_look_for, recording_mood")
    .eq("assignee_employee_id", employeeId)
    .eq("archived", false)
    .order("due_date", { ascending: true, nullsFirst: false });

  const tasks = (data ?? []) as Task[];
  const active = tasks.filter((t) => t.status !== "opublikowane");
  const published = tasks.filter((t) => t.status === "opublikowane");

  // Dwa kontekstowe przyciski zamiast jednego checkboksa "zrobione" — dokładnie
  // to, o co poprosiła Sasza (migracja 0067): materiał najpierw "gotowy, czeka
  // na publikację", osobno i później faktycznie "opublikowane".
  function renderTask(t: Task) {
    const isGotowe = t.status === "gotowe";
    const isPublished = t.status === "opublikowane";
    return (
      <div key={t.id} className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-semibold ${isPublished ? "text-zinc-400 line-through" : "text-zinc-900"}`}>{t.title}</p>
            {isGotowe && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">⏳ Czeka na publikację</span>}
          </div>
          {t.due_date && (
            <p className="mt-0.5 text-xs text-zinc-500">termin: {new Date(t.due_date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}</p>
          )}
          {(t.recording_format || t.recording_look_for || t.recording_mood) && (
            <div className="mt-2 flex flex-col gap-1 rounded-lg bg-violet-50 p-2.5 text-sm">
              {t.recording_format && (
                <p className="font-semibold text-violet-800">
                  {RECORDING_FORMAT_ICONS[t.recording_format]} {RECORDING_FORMAT_LABELS[t.recording_format]}
                </p>
              )}
              {t.recording_look_for && (
                <p className="text-zinc-700">
                  <span className="font-semibold">Czego szukać: </span>
                  {t.recording_look_for}
                </p>
              )}
              {t.recording_mood && (
                <p className="text-zinc-700">
                  <span className="font-semibold">Przekaz / nastrój: </span>
                  {t.recording_mood}
                </p>
              )}
            </div>
          )}
          {!isPublished && (
            <form action={setTaskStatus} className="mt-2">
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="status" value={isGotowe ? "opublikowane" : "gotowe"} />
              <button
                type="submit"
                className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors ${
                  isGotowe ? "bg-brand-blue hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {isGotowe ? "📤 Opublikowane" : "✅ Gotowe — czeka na publikację"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {tasks.length === 0 && <Card className="text-center text-sm text-zinc-400">Brak zadań.</Card>}
      {active.map(renderTask)}
      {published.length > 0 && (
        <details className="rounded-2xl border border-dashed border-zinc-300 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-500 marker:content-none">Opublikowane ({published.length}) ▾</summary>
          <div className="mt-3 flex flex-col gap-3">{published.map(renderTask)}</div>
        </details>
      )}
    </div>
  );
}

async function CreatorCalendar({ employeeId, yearParam, monthParam }: { employeeId: string; yearParam?: string; monthParam?: string }) {
  const fallback = currentMonth();
  const year = Number(yearParam) || fallback.year;
  const month = Number(monthParam) || fallback.month;
  const today = toDateKey(new Date());

  const days = daysInMonth(year, month);
  const dateKeys = days.map(toDateKey);
  const prevLink = month === 1 ? `?tab=kalendarz&year=${year - 1}&month=12` : `?tab=kalendarz&year=${year}&month=${month - 1}`;
  const nextLink = month === 12 ? `?tab=kalendarz&year=${year + 1}&month=1` : `?tab=kalendarz&year=${year}&month=${month + 1}`;

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("marketing_task")
    .select("id, title, status, due_date, recording_format, recording_look_for, recording_mood")
    .eq("assignee_employee_id", employeeId)
    .eq("archived", false)
    .gte("due_date", dateKeys[0])
    .lte("due_date", dateKeys[dateKeys.length - 1]);

  const tasks = (data ?? []) as Task[];
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    if (!byDate.has(t.due_date)) byDate.set(t.due_date, []);
    byDate.get(t.due_date)!.push(t);
  }

  // Tydzień zaczyna się w poniedziałek — ten sam wzorzec co ContentCalendarSection.
  const leadingBlanks = days.length > 0 ? (days[0].getDay() + 6) % 7 : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm capitalize text-zinc-500">
          {monthLabel(month)} {year}
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Link href={prevLink} className="rounded-lg px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-100">
            ← poprzedni
          </Link>
          <Link href={nextLink} className="rounded-lg px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-100">
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
          const items = byDate.get(date) ?? [];
          const isToday = date === today;

          return (
            <div
              key={date}
              className={`flex flex-col gap-1.5 rounded-xl border p-2 text-xs sm:min-h-[90px] ${
                isToday ? "border-brand-blue bg-blue-50" : "border-zinc-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-zinc-700">{d.getDate()}</span>
                <span className="text-[11px] capitalize text-zinc-400 sm:hidden">{weekdayLabel(weekday)}</span>
              </div>
              <div className="flex flex-col gap-1">
                {items.map((t) => (
                  <span
                    key={t.id}
                    className={`truncate rounded px-1.5 py-1 text-[11px] font-medium ${t.status === "opublikowane" ? "bg-emerald-50 text-emerald-700 line-through" : "bg-violet-50 text-violet-700"}`}
                  >
                    {t.recording_format ? RECORDING_FORMAT_ICONS[t.recording_format] : "📋"} {t.title}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
