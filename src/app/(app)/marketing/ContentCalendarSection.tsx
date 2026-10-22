import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ColorDot } from "@/components/ColorDot";
import { BTN_PRIMARY_SM, BTN_GHOST, BTN_GHOST_DANGER } from "@/components/button-styles";
import { toDateKey, mondayOfWeek } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { weekDatesFrom, PLATFORM_LABELS, CONTENT_STATUS_LABELS, type ContentPlatform, type ContentStatus } from "@/lib/marketing";
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
  w_przygotowaniu: "bg-amber-50 text-amber-700",
  gotowe: "bg-sky-50 text-sky-700",
  opublikowane: "bg-emerald-50 text-emerald-700",
};

export async function ContentCalendarSection({ mondayParam }: { mondayParam?: string }) {
  const today = toDateKey(new Date());
  const monday = mondayParam && /^\d{4}-\d{2}-\d{2}$/.test(mondayParam) ? mondayParam : mondayOfWeek(today);
  const weekDates = weekDatesFrom(monday);
  const prevMonday = toDateKey(new Date(new Date(monday + "T00:00:00").getTime() - 7 * 86400000));
  const nextMonday = toDateKey(new Date(new Date(monday + "T00:00:00").getTime() + 7 * 86400000));

  const supabase = createServerSupabaseClient();
  const [{ data: contentRaw }, { data: assigneesRaw }] = await Promise.all([
    supabase
      .from("marketing_content")
      .select("id, title, platform, scheduled_date, status, notes, assignee_employee_id")
      .in("scheduled_date", weekDates)
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          {new Date(weekDates[0] + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} –{" "}
          {new Date(weekDates[6] + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/marketing?tab=kalendarz&monday=${prevMonday}`} className="rounded-lg px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-100">
            ← poprzedni tydzień
          </Link>
          <Link href={`/marketing?tab=kalendarz&monday=${nextMonday}`} className="rounded-lg px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-100">
            następny tydzień →
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {weekDates.map((date) => {
          const items = (byDate.get(date) ?? []).slice();
          const isToday = date === today;
          const weekday = new Date(date + "T00:00:00").getDay();
          const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });

          return (
            <Card key={date} className={`!p-3 ${isToday ? "ring-2 ring-brand-blue" : ""}`}>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold capitalize text-zinc-900">
                {weekdayLabel(weekday)}, {dateLabel}
                {isToday && (
                  <span className="rounded-full bg-brand-blue px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Dziś</span>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {items.map((item) => {
                  const assignee = item.assignee_employee_id ? assigneeById.get(item.assignee_employee_id) : null;
                  return (
                    <div key={item.id} className="rounded-xl bg-zinc-50 p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                            {PLATFORM_LABELS[item.platform]}
                          </span>
                          <span className="font-medium text-zinc-900">{item.title}</span>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_PILL[item.status]}`}>
                          {CONTENT_STATUS_LABELS[item.status]}
                        </span>
                      </div>
                      {(item.notes || assignee) && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          {assignee && (
                            <span className="flex items-center gap-1">
                              <ColorDot color={assignee.color_hex} />
                              {assignee.name}
                            </span>
                          )}
                          {item.notes && <span>{item.notes}</span>}
                        </div>
                      )}
                      <details className="mt-1.5">
                        <summary className={`${BTN_GHOST} cursor-pointer text-[11px] [&::-webkit-details-marker]:hidden`}>Edytuj</summary>
                        <form action={updateContent} className="mt-2 flex flex-col gap-2">
                          <input type="hidden" name="id" value={item.id} />
                          <input name="title" defaultValue={item.title} required className={INPUT_SM} placeholder="Tytuł" />
                          <div className="flex flex-wrap gap-2">
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
                          </div>
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
                      </details>
                    </div>
                  );
                })}
                {items.length === 0 && <p className="text-xs text-zinc-400">Nic nie zaplanowano.</p>}
              </div>

              <details className="group mt-2 border-t border-zinc-200 pt-2">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-brand-orange marker:content-none">
                  <span>+ Dodaj treść</span>
                  <span className="font-normal text-zinc-400 group-open:hidden">▸</span>
                  <span className="hidden font-normal text-zinc-400 group-open:inline">— zwiń ▾</span>
                </summary>
                <form action={createContent} className="mt-2 flex flex-col gap-2">
                  <input type="hidden" name="scheduled_date" value={date} />
                  <input name="title" required className={INPUT_SM} placeholder="Tytuł" />
                  <div className="flex flex-wrap gap-2">
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
                  </div>
                  <select name="assignee_employee_id" defaultValue="" className={INPUT_SM}>
                    <option value="">— nieprzypisane —</option>
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <textarea name="notes" rows={2} className={INPUT_SM} placeholder="Notatki (opcjonalnie)" />
                  <div>
                    <SubmitButton className={BTN_PRIMARY_SM}>Dodaj</SubmitButton>
                  </div>
                </form>
              </details>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
