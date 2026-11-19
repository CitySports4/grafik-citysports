import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey, daysInMonth, monthLabel, currentMonth } from "@/lib/schedule-month";
import { WEEK_DISPLAY_ORDER, weekdayLabel } from "@/lib/weekdays";
import { Card } from "@/components/Card";
import {
  RECORDING_FORMAT_LABELS,
  RECORDING_FORMAT_ICONS,
  CONTENT_FORMAT_ICONS,
  isApprovalPending,
  approvalBadge,
  type RecordingFormat,
  type MarketingTaskStatus,
  type ContentFormat,
  type ContentStatus,
  type ApprovalBadge,
} from "@/lib/marketing";
import { setTaskStatus, setContentStatus } from "./actions";
import { CopyField } from "./CopyField";

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
  { key: "tresci", label: "Treści" },
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
  const activeTab = tab === "kalendarz" || tab === "tresci" ? tab : "zadania";

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

      {activeTab === "zadania" && <CreatorTasks employeeId={employeeId} />}
      {activeTab === "tresci" && <CreatorContent employeeId={employeeId} />}
      {activeTab === "kalendarz" && <CreatorCalendar employeeId={employeeId} yearParam={yearParam} monthParam={monthParam} />}
    </div>
  );
}

// Koniec tygodnia (niedziela) i miesiąca bieżącego dnia — tydzień od
// poniedziałku, tak jak kalendarz treści (patrz CreatorCalendar poniżej).
function endOfWeekKey(d: Date): string {
  const dayIndex = (d.getDay() + 6) % 7; // 0=pon..6=niedz
  const end = new Date(d);
  end.setDate(d.getDate() + (6 - dayIndex));
  return toDateKey(end);
}
function endOfMonthKey(d: Date): string {
  return toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

type TaskBucket = "zalegle" | "tydzien" | "miesiac" | "pozniej";
const BUCKET_ORDER: TaskBucket[] = ["zalegle", "tydzien", "miesiac", "pozniej"];
const BUCKET_LABELS: Record<TaskBucket, string> = {
  zalegle: "Zaległe",
  tydzien: "W tym tygodniu",
  miesiac: "W tym miesiącu",
  pozniej: "Później",
};

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

  // Zadania "w ogóle razem, bez info czy to na ten tydzień czy za miesiąc"
  // był konkretny feedback (Oliwia) — grupujemy wg terminu, żeby priorytet
  // był widoczny na pierwszy rzut oka, bez liczenia dat w głowie.
  const now = new Date();
  const todayKey = toDateKey(now);
  const weekEndKey = endOfWeekKey(now);
  const monthEndKey = endOfMonthKey(now);
  function bucketFor(t: Task): TaskBucket {
    if (!t.due_date) return "pozniej";
    if (t.due_date < todayKey) return "zalegle";
    if (t.due_date <= weekEndKey) return "tydzien";
    if (t.due_date <= monthEndKey) return "miesiac";
    return "pozniej";
  }
  const grouped = new Map<TaskBucket, Task[]>();
  for (const t of active) {
    const b = bucketFor(t);
    if (!grouped.has(b)) grouped.set(b, []);
    grouped.get(b)!.push(t);
  }

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
    <div className="flex flex-col gap-5">
      {tasks.length === 0 && <Card className="text-center text-sm text-zinc-400">Brak zadań.</Card>}
      {BUCKET_ORDER.filter((b) => grouped.has(b)).map((b) => (
        <div key={b} className="flex flex-col gap-3">
          <p className={`text-xs font-bold uppercase tracking-wide ${b === "zalegle" ? "text-red-600" : "text-zinc-500"}`}>
            {BUCKET_LABELS[b]} ({grouped.get(b)!.length})
          </p>
          {grouped.get(b)!.map(renderTask)}
        </div>
      ))}
      {published.length > 0 && (
        <details className="rounded-2xl border border-dashed border-zinc-300 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-500 marker:content-none">Opublikowane ({published.length}) ▾</summary>
          <div className="mt-3 flex flex-col gap-3">{published.map(renderTask)}</div>
        </details>
      )}
    </div>
  );
}

type ContentItem = {
  id: string;
  title: string;
  format: ContentFormat;
  scheduled_date: string;
  status: ContentStatus;
  needs_review: boolean;
  approved: boolean;
  reviewed_at: string | null;
  review_note: string;
  hook: string;
  content_fb: string;
  content_ig: string;
  screen_captions: string;
  what_to_record: string;
  hashtags: string;
  to_confirm: string;
  link_utm: string;
};

const APPROVAL_BANNER: Record<Exclude<ApprovalBadge, "approved">, (scheduledDate: string) => string> = {
  needs_changes: () => "✏️ Wymaga poprawki — zobacz uwagę niżej.",
  auto_approved: () => "🕒 Zatwierdzono automatycznie — minął termin publikacji bez reakcji.",
  pending: (scheduledDate) => `⏳ Czeka na akceptację Krzysztofa — automatycznie dopuszczona ${scheduledDate}.`,
};
const APPROVAL_BANNER_STYLE: Record<Exclude<ApprovalBadge, "approved">, string> = {
  needs_changes: "bg-red-50 text-red-700",
  auto_approved: "bg-sky-50 text-sky-700",
  pending: "bg-amber-50 text-amber-700",
};

// "Treści" (zgłoszenie 19.11.2026) — od kroku 1 propozycji Marketing->Grafik
// zadanie NIE powstaje już automatycznie z wpisu kalendarza (patrz usunięte
// createLinkedTaskIfNeeded), więc content_creator musi widzieć wpisy
// marketing_content WPROST, nie przez pośredniczące zadanie — inaczej nowa
// treść przypisana do niej jest niewidoczna nigdzie w jej uproszczonym
// widoku. Pola gotowej treści (CopyField) są tu tylko do podglądu/kopiowania
// — edycja treści zostaje w pełnym widoku marketingu (rola marketing/admin),
// to nie jest formularz zapisu.
async function CreatorContent({ employeeId }: { employeeId: string }) {
  const supabase = createServerSupabaseClient();
  const today = toDateKey(new Date());
  const { data } = await supabase
    .from("marketing_content")
    .select(
      "id, title, format, scheduled_date, status, needs_review, approved, reviewed_at, review_note, hook, content_fb, content_ig, screen_captions, what_to_record, hashtags, to_confirm, link_utm"
    )
    .eq("assignee_employee_id", employeeId)
    .order("scheduled_date", { ascending: true });

  const items = (data ?? []) as ContentItem[];
  const active = items.filter((c) => c.status !== "opublikowane");
  const published = items.filter((c) => c.status === "opublikowane");

  const now = new Date();
  const todayKey = toDateKey(now);
  const weekEndKey = endOfWeekKey(now);
  const monthEndKey = endOfMonthKey(now);
  function bucketFor(c: ContentItem): TaskBucket {
    if (c.scheduled_date < todayKey) return "zalegle";
    if (c.scheduled_date <= weekEndKey) return "tydzien";
    if (c.scheduled_date <= monthEndKey) return "miesiac";
    return "pozniej";
  }
  const grouped = new Map<TaskBucket, ContentItem[]>();
  for (const c of active) {
    const b = bucketFor(c);
    if (!grouped.has(b)) grouped.set(b, []);
    grouped.get(b)!.push(c);
  }

  function renderContent(c: ContentItem) {
    const isGotowe = c.status === "gotowe";
    const isPublished = c.status === "opublikowane";
    const pendingApproval = c.needs_review && isApprovalPending(c, today);
    const badge: ApprovalBadge | null = c.needs_review ? approvalBadge(c, today) : null;

    return (
      <div key={c.id} className="flex flex-col gap-2.5 rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span>{CONTENT_FORMAT_ICONS[c.format]}</span>
          <p className={`font-semibold ${isPublished ? "text-zinc-400 line-through" : "text-zinc-900"}`}>{c.title}</p>
          {isGotowe && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">⏳ Czeka na publikację</span>}
        </div>
        <p className="text-xs text-zinc-500">
          publikacja: {new Date(c.scheduled_date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}
        </p>

        {badge && badge !== "approved" && (
          <div className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${APPROVAL_BANNER_STYLE[badge]}`}>
            <p>{APPROVAL_BANNER[badge](c.scheduled_date)}</p>
            {badge === "needs_changes" && c.review_note && <p className="mt-1 font-normal">💬 {c.review_note}</p>}
          </div>
        )}

        {(c.what_to_record || c.screen_captions) && (
          <div className="flex flex-col gap-1.5 rounded-lg bg-violet-50 p-2.5 text-sm">
            {c.what_to_record && (
              <p className="text-zinc-700">
                <span className="font-semibold text-violet-800">🎥 Co nagrać: </span>
                {c.what_to_record}
              </p>
            )}
            {c.screen_captions && (
              <p className="whitespace-pre-wrap text-zinc-700">
                <span className="font-semibold text-violet-800">Napisy na ekran: </span>
                {c.screen_captions}
              </p>
            )}
          </div>
        )}

        {(c.hook || c.content_fb || c.content_ig || c.hashtags || c.link_utm) && (
          <details className="rounded-lg border border-zinc-200">
            <summary className="cursor-pointer px-2.5 py-2 text-xs font-semibold text-zinc-600 marker:content-none">📋 Tekst do publikacji ▾</summary>
            <div className="flex flex-col gap-2.5 border-t border-zinc-200 p-2.5">
              {c.hook && <CopyField name="hook" label="Haczyk" defaultValue={c.hook} />}
              {c.content_fb && <CopyField name="content_fb" label="Treść FB" defaultValue={c.content_fb} rows={4} />}
              {c.content_ig && <CopyField name="content_ig" label="Treść IG" defaultValue={c.content_ig} rows={4} />}
              {c.hashtags && <CopyField name="hashtags" label="Hashtagi" defaultValue={c.hashtags} rows={1} />}
              {c.link_utm && <CopyField name="link_utm" label="Link (z UTM)" defaultValue={c.link_utm} rows={1} />}
            </div>
          </details>
        )}

        {c.to_confirm && <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-700">⚠ Do potwierdzenia: {c.to_confirm}</p>}

        {!isPublished &&
          (pendingApproval ? (
            <p className="text-xs font-semibold text-amber-600">⏳ Czeka na akceptację — nie można jeszcze oznaczyć jako opublikowane.</p>
          ) : (
            <form action={setContentStatus}>
              <input type="hidden" name="id" value={c.id} />
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
          ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {items.length === 0 && <Card className="text-center text-sm text-zinc-400">Brak treści przypisanych do Ciebie.</Card>}
      {BUCKET_ORDER.filter((b) => grouped.has(b)).map((b) => (
        <div key={b} className="flex flex-col gap-3">
          <p className={`text-xs font-bold uppercase tracking-wide ${b === "zalegle" ? "text-red-600" : "text-zinc-500"}`}>
            {BUCKET_LABELS[b]} ({grouped.get(b)!.length})
          </p>
          {grouped.get(b)!.map(renderContent)}
        </div>
      ))}
      {published.length > 0 && (
        <details className="rounded-2xl border border-dashed border-zinc-300 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-500 marker:content-none">Opublikowane ({published.length}) ▾</summary>
          <div className="mt-3 flex flex-col gap-3">{published.map(renderContent)}</div>
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
