import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ColorDot } from "@/components/ColorDot";
import { BTN_PRIMARY_SM, BTN_GHOST_DANGER } from "@/components/button-styles";
import { toDateKey, daysInMonth, monthLabel, currentMonth } from "@/lib/schedule-month";
import { WEEK_DISPLAY_ORDER, weekdayLabel } from "@/lib/weekdays";
import { PLATFORM_LABELS, CONTENT_STATUS_LABELS, type ContentPlatform, type ContentStatus } from "@/lib/marketing";
import { createContent, updateContent, deleteContent } from "./actions";

const INPUT_SM = "rounded-lg border-[1.5px] border-zinc-300 px-2 py-1 text-xs";

type ContentItem = {
  id: string;
  title: string;
  platform: ContentPlatform;
  scheduled_date: string;
  status: ContentStatus;
  notes: string;
  assignee_employee_id: string | null;
};

type Assignee = { id: string; name: string; color_hex: string };

const STATUS_PILL: Record<ContentStatus, string> = {
  pomysl: "bg-zinc-100 text-zinc-600",
  w_przygotowaniu: "bg-amber-100 text-amber-700",
  gotowe: "bg-sky-100 text-sky-700",
  opublikowane: "bg-emerald-100 text-emerald-700",
};

const PLATFORM_SHORT: Record<ContentPlatform, string> = {
  instagram: "IG",
  facebook: "FB",
  tiktok: "TT",
  strona_www: "WWW",
  email: "Mail",
  inne: "Inne",
};

export async function ContentCalendarSection({ yearParam, monthParam }: { yearParam?: string; monthParam?: string }) {
  const today = toDateKey(new Date());
  const fallback = currentMonth();
  const year = Number(yearParam) || fallback.year;
  const month = Number(monthParam) || fallback.month;

  const days = daysInMonth(year, month);
  const dateKeys = days.map(toDateKey);
  const prevLink = month === 1 ? `?tab=kalendarz&year=${year - 1}&month=12` : `?tab=kalendarz&year=${year}&month=${month - 1}`;
  const nextLink = month === 12 ? `?tab=kalendarz&year=${year + 1}&month=1` : `?tab=kalendarz&year=${year}&month=${month + 1}`;

  const supabase = createServerSupabaseClient();
  const [{ data: contentRaw }, { data: assigneesRaw }] = await Promise.all([
    supabase
      .from("marketing_content")
      .select("id, title, platform, scheduled_date, status, notes, assignee_employee_id")
      .gte("scheduled_date", dateKeys[0])
      .lte("scheduled_date", dateKeys[dateKeys.length - 1])
      .order("scheduled_date"),
    supabase
      .from("employee")
      .select("id, name, color_hex, employee_role!inner(role)")
      .eq("active", true)
      .eq("employee_role.role", "marketing")
      .order("name"),
  ]);

  const content = (contentRaw ?? []) as ContentItem[];
  const assignees = (assigneesRaw ?? []) as Assignee[];
  const assigneeById = new Map(assignees.map((a) => [a.id, a]));
  const byDate = new Map<string, ContentItem[]>();
  for (const c of content) {
    if (!byDate.has(c.scheduled_date)) byDate.set(c.scheduled_date, []);
    byDate.get(c.scheduled_date)!.push(c);
  }

  // Tydzień zaczyna się w poniedziałek — kolumna 0 to poniedziałek (weekday
  // 1), kolumna 6 to niedziela (weekday 0), ten sam wzorzec co
  // AvailabilityCalendar.
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

      {/* Nagłówek dni tygodnia — tylko od tabletu wzwyż, bo na telefonie
          kalendarz jest listą jednokolumnową (nazwa dnia jest wtedy w
          każdej karcie), nie siatką — ten sam wzorzec co
          AvailabilityCalendar. */}
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
              className={`flex flex-col gap-1.5 rounded-xl border p-2 text-xs sm:min-h-[120px] ${
                isToday ? "border-brand-blue bg-blue-50" : "border-zinc-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-zinc-700">{d.getDate()}</span>
                <span className="text-[11px] capitalize text-zinc-400 sm:hidden">{weekdayLabel(weekday)}</span>
              </div>

              <div className="flex flex-col gap-1">
                {items.map((item) => {
                  const assignee = item.assignee_employee_id ? assigneeById.get(item.assignee_employee_id) : null;
                  return (
                    <details key={item.id}>
                      <summary
                        className={`cursor-pointer truncate rounded px-1.5 py-1 text-[11px] font-medium [&::-webkit-details-marker]:hidden ${STATUS_PILL[item.status]}`}
                      >
                        {PLATFORM_SHORT[item.platform]}: {item.title}
                      </summary>
                      <div className="mt-1 flex flex-col gap-1.5 rounded-lg bg-zinc-50 p-2">
                        <p className={`rounded-full self-start px-2 py-0.5 text-[10px] font-bold ${STATUS_PILL[item.status]}`}>
                          {CONTENT_STATUS_LABELS[item.status]}
                        </p>
                        {assignee && (
                          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                            <ColorDot color={assignee.color_hex} />
                            {assignee.name}
                          </span>
                        )}
                        {item.notes && <p className="text-[11px] text-zinc-500">{item.notes}</p>}
                        <form action={updateContent} className="flex flex-col gap-1.5">
                          <input type="hidden" name="id" value={item.id} />
                          <input name="title" defaultValue={item.title} required className={INPUT_SM} placeholder="Tytuł" />
                          <select name="platform" defaultValue={item.platform} className={INPUT_SM}>
                            {(Object.entries(PLATFORM_LABELS) as [ContentPlatform, string][]).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <select name="status" defaultValue={item.status} className={INPUT_SM}>
                            {(Object.entries(CONTENT_STATUS_LABELS) as [ContentStatus, string][]).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <input type="date" name="scheduled_date" defaultValue={item.scheduled_date} required className={INPUT_SM} />
                          <select name="assignee_employee_id" defaultValue={item.assignee_employee_id ?? ""} className={INPUT_SM}>
                            <option value="">— nieprzypisane —</option>
                            {assignees.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                          <textarea name="notes" defaultValue={item.notes} rows={2} className={INPUT_SM} placeholder="Notatki" />
                          <div className="flex items-center gap-2">
                            <SubmitButton className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
                              Zapisz
                            </SubmitButton>
                            <ConfirmButton formAction={deleteContent} confirmText={`Usunąć "${item.title}"?`} className={BTN_GHOST_DANGER}>
                              Usuń
                            </ConfirmButton>
                          </div>
                        </form>
                      </div>
                    </details>
                  );
                })}
              </div>

              <details className="mt-auto">
                <summary className="cursor-pointer text-[11px] font-semibold text-brand-orange [&::-webkit-details-marker]:hidden">
                  + Dodaj
                </summary>
                <form action={createContent} className="mt-1.5 flex flex-col gap-1.5">
                  <input type="hidden" name="scheduled_date" value={date} />
                  <input name="title" required className={INPUT_SM} placeholder="Tytuł" />
                  <select name="platform" defaultValue="instagram" className={INPUT_SM}>
                    {(Object.entries(PLATFORM_LABELS) as [ContentPlatform, string][]).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <select name="status" defaultValue="pomysl" className={INPUT_SM}>
                    {(Object.entries(CONTENT_STATUS_LABELS) as [ContentStatus, string][]).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <select name="assignee_employee_id" defaultValue="" className={INPUT_SM}>
                    <option value="">— nieprzypisane —</option>
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <div>
                    <SubmitButton className={BTN_PRIMARY_SM}>Dodaj</SubmitButton>
                  </div>
                </form>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
