import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { toDateKey, daysInMonth, monthLabel, currentMonth } from "@/lib/schedule-month";
import { WEEK_DISPLAY_ORDER, weekdayLabel } from "@/lib/weekdays";
import { Banner } from "@/components/Banner";
import { ColorDot } from "@/components/ColorDot";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_ORDER,
  isApprovalPending,
  type ContentPlatform,
  type ContentStatus,
  type ContentPurpose,
  type ContentFormat,
} from "@/lib/marketing";
import { setContentStatus } from "./actions";
import { ContentItemChip } from "./ContentItemChip";
import { AddContentButton } from "./AddContentButton";

// Przypomnienie o regularności (Krzysztof, kwestionariusz październik 2026:
// "regularne wrzucanie i przypominanie o tym co mamy") — jeśli od tylu dni
// nic nie zostało opublikowane, kalendarz sam o tym mówi zamiast czekać, aż
// ktoś to zauważy.
const REGULARITY_GAP_DAYS = 7;

type ContentItem = {
  id: string;
  title: string;
  platform: ContentPlatform;
  scheduled_date: string;
  status: ContentStatus;
  purpose: ContentPurpose;
  format: ContentFormat;
  needs_review: boolean;
  approved: boolean;
  review_note: string;
  notes: string;
  assignee_employee_id: string | null;
  project: string;
};

type Assignee = { id: string; name: string; color_hex: string };
type Project = { id: string; name: string; color: string };

const STATUS_DOT: Record<ContentStatus, string> = {
  pomysl: "bg-zinc-400",
  w_przygotowaniu: "bg-amber-500",
  gotowe: "bg-sky-500",
  opublikowane: "bg-emerald-500",
};

// Sentinel dla jawnego "moje" w URL (?osoba=_moje) — w przeciwieństwie do
// Zadań kalendarz NIE zawęża się domyślnie do zalogowanej osoby (to wspólny
// widok publikacji całego zespołu, pełna widoczność jest tu wartością), ale
// każdy może się do siebie zawęzić jednym klikiem, tak samo jak w Zadaniach.
const MINE = "_moje";
// Sentinel dla "bez projektu" w filtrze po projekcie (?projekt=_brak) — ten
// sam wzorzec co UNASSIGNED w Zadaniach.
const PROJECT_NONE = "_brak";

export async function ContentCalendarSection({
  yearParam,
  monthParam,
  assigneeFilter,
  projectFilter,
}: {
  yearParam?: string;
  monthParam?: string;
  assigneeFilter?: string;
  projectFilter?: string;
}) {
  const employee = await requireEmployee();
  const isAdmin = employee.roles.includes("admin");
  const today = toDateKey(new Date());
  const fallback = currentMonth();
  const year = Number(yearParam) || fallback.year;
  const month = Number(monthParam) || fallback.month;

  const days = daysInMonth(year, month);
  const dateKeys = days.map(toDateKey);
  const osobaSuffix = assigneeFilter ? `&osoba=${assigneeFilter}` : "";
  const projektSuffix = projectFilter ? `&projekt=${encodeURIComponent(projectFilter)}` : "";
  const prevLink =
    month === 1
      ? `?tab=kalendarz&year=${year - 1}&month=12${osobaSuffix}${projektSuffix}`
      : `?tab=kalendarz&year=${year}&month=${month - 1}${osobaSuffix}${projektSuffix}`;
  const nextLink =
    month === 12
      ? `?tab=kalendarz&year=${year + 1}&month=1${osobaSuffix}${projektSuffix}`
      : `?tab=kalendarz&year=${year}&month=${month + 1}${osobaSuffix}${projektSuffix}`;

  const supabase = createServerSupabaseClient();
  const [{ data: contentRaw }, { data: assigneesRaw }, { data: linkedTasksRaw }, { data: lastPublishedRaw }, { data: projectsRaw }] = await Promise.all([
    supabase
      .from("marketing_content")
      .select("id, title, platform, scheduled_date, status, purpose, format, needs_review, approved, review_note, notes, assignee_employee_id, project")
      .gte("scheduled_date", dateKeys[0])
      .lte("scheduled_date", dateKeys[dateKeys.length - 1])
      .order("scheduled_date"),
    supabase
      .from("employee")
      .select("id, name, color_hex, employee_role!inner(role)")
      .eq("active", true)
      .eq("employee_role.role", "marketing")
      .order("name"),
    // Które wpisy mają już automatycznie utworzone zadanie (patrz
    // createLinkedTaskIfNeeded w actions.ts) — tylko żeby pokazać małą
    // plakietkę "zadanie dodane", bez tego dodanie zadania byłoby
    // niewidocznym efektem ubocznym.
    supabase.from("marketing_task").select("content_id").not("content_id", "is", null),
    // Ostatnia FAKTYCZNIE opublikowana treść — niezależnie od oglądanego
    // miesiąca (stąd osobne zapytanie, nie filtrowanie po dateKeys), żeby
    // przypomnienie o regularności działało nawet gdy ktoś przegląda stary
    // albo przyszły miesiąc.
    supabase
      .from("marketing_content")
      .select("scheduled_date")
      .eq("status", "opublikowane")
      .lte("scheduled_date", today)
      .order("scheduled_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Projekty zarządzane z /marketing/projekty (patrz migracja 0063) — do
    // chipów filtra po projekcie, tylko aktywne.
    supabase.from("marketing_project").select("id, name, color").eq("is_active", true).order("name"),
  ]);

  const allContent = (contentRaw ?? []) as ContentItem[];
  const assignees = (assigneesRaw ?? []) as Assignee[];
  const activeProjects = (projectsRaw ?? []) as Project[];
  const contentIdsWithTask = new Set((linkedTasksRaw ?? []).map((t) => t.content_id as string));

  const effectiveFilter = assigneeFilter === MINE ? employee.id : assigneeFilter;
  const assigneeFiltered = !effectiveFilter ? allContent : allContent.filter((c) => c.assignee_employee_id === effectiveFilter);
  const content = !projectFilter
    ? assigneeFiltered
    : assigneeFiltered.filter((c) => (projectFilter === PROJECT_NONE ? !c.project.trim() : c.project.trim() === projectFilter));

  const byDate = new Map<string, ContentItem[]>();
  for (const c of content) {
    if (!byDate.has(c.scheduled_date)) byDate.set(c.scheduled_date, []);
    byDate.get(c.scheduled_date)!.push(c);
  }

  // Tydzień zaczyna się w poniedziałek — kolumna 0 to poniedziałek (weekday
  // 1), kolumna 6 to niedziela (weekday 0), ten sam wzorzec co
  // AvailabilityCalendar.
  const leadingBlanks = days.length > 0 ? (days[0].getDay() + 6) % 7 : 0;

  const daysSinceLastPublished = lastPublishedRaw
    ? Math.round((new Date(today + "T00:00:00").getTime() - new Date(lastPublishedRaw.scheduled_date + "T00:00:00").getTime()) / 86400000)
    : null;
  const regularityWarning =
    daysSinceLastPublished === null
      ? "Jeszcze nic nie zostało oznaczone jako opublikowane — czas dodać pierwszą treść."
      : daysSinceLastPublished > REGULARITY_GAP_DAYS
        ? `Minęło ${daysSinceLastPublished} dni od ostatniej opublikowanej treści — czas dodać coś nowego.`
        : null;

  return (
    <div className="flex flex-col gap-3">
      {regularityWarning && <Banner variant="warning">⏰ {regularityWarning}</Banner>}
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

      {/* Filtr po osobie — ten sam wzorzec co w Zadaniach, ale BEZ domyślnego
          zawężenia: kalendarz to wspólny widok publikacji całego zespołu,
          pełna widoczność jest tu wartością (patrz komentarz przy MINE
          wyżej). Liczniki liczone w obrębie oglądanego miesiąca. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={`?tab=kalendarz&year=${year}&month=${month}&osoba=${MINE}${projektSuffix}`}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${effectiveFilter === employee.id ? "bg-brand-orange text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
        >
          Moje ({allContent.filter((c) => c.assignee_employee_id === employee.id).length})
        </Link>
        <Link
          href={`?tab=kalendarz&year=${year}&month=${month}${projektSuffix}`}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${!assigneeFilter ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
        >
          Wszyscy ({allContent.length})
        </Link>
        {assignees
          .filter((a) => a.id !== employee.id)
          .map((a) => (
            <Link
              key={a.id}
              href={`?tab=kalendarz&year=${year}&month=${month}&osoba=${a.id}${projektSuffix}`}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                effectiveFilter === a.id ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              <ColorDot color={a.color_hex} />
              {a.name} ({allContent.filter((c) => c.assignee_employee_id === a.id).length})
            </Link>
          ))}
      </div>

      {/* Filtr po projekcie — osobny wymiar od filtra po osobie (oba
          działają razem, patrz osobaSuffix/projektSuffix). Liczniki liczone
          w obrębie oglądanego miesiąca I już zawężone do filtra po osobie
          (assigneeFiltered), żeby pokazywały realny wynik kolejnego kliku. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={`?tab=kalendarz&year=${year}&month=${month}${osobaSuffix}`}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${!projectFilter ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
        >
          Wszystkie projekty ({assigneeFiltered.length})
        </Link>
        {activeProjects.map((p) => {
          const active = projectFilter === p.name;
          return (
            <Link
              key={p.id}
              href={`?tab=kalendarz&year=${year}&month=${month}${osobaSuffix}&projekt=${encodeURIComponent(p.name)}`}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ backgroundColor: active ? p.color : `${p.color}1a`, color: active ? "#fff" : p.color }}
            >
              <ColorDot color={active ? "#fff" : p.color} />
              {p.name} ({assigneeFiltered.filter((c) => c.project.trim() === p.name).length})
            </Link>
          );
        })}
        {(() => {
          const noneCount = assigneeFiltered.filter((c) => !c.project.trim()).length;
          return noneCount > 0 ? (
            <Link
              href={`?tab=kalendarz&year=${year}&month=${month}${osobaSuffix}&projekt=${PROJECT_NONE}`}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${projectFilter === PROJECT_NONE ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
            >
              Bez projektu ({noneCount})
            </Link>
          ) : null;
        })()}
      </div>

      {/* Legenda statusów — same kolory w chipach poniżej byłyby czytelne
          tylko po otwarciu szczegółów; tu widać od razu, co dany kolor
          znaczy, bez klikania. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        {CONTENT_STATUS_ORDER.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
            {CONTENT_STATUS_LABELS[s]}
          </span>
        ))}
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
          const dateLabel = d.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });

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
                  const published = item.status === "opublikowane";
                  // Blokada akceptacji dotyczy tylko kierunku "oznacz jako
                  // opublikowane" — cofnięcie z powrotem na "Gotowe" nie musi
                  // nikogo pytać. Admin omija blokadę zawsze (patrz
                  // assertCanPublish w actions.ts — to samo po stronie
                  // serwera, tu tylko unikamy pokazywania przycisku, który i
                  // tak skończyłby się błędem).
                  const blockedByApproval = !published && !isAdmin && isApprovalPending(item, today);
                  return (
                    <div key={item.id} className="flex items-start gap-1">
                      {/* Checkbox jednym kliknięciem — odznacza "Opublikowane"
                          (odpowiednik "zrobione" dla treści) bez otwierania
                          pełnej edycji. */}
                      {blockedByApproval ? (
                        <span
                          title={`Czeka na akceptację — automatycznie dopuszczona ${item.scheduled_date}`}
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-amber-300 pt-0.5 text-[9px] text-amber-600"
                        >
                          ⏳
                        </span>
                      ) : (
                        <form action={setContentStatus} className="pt-0.5">
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="status" value={published ? "gotowe" : "opublikowane"} />
                          <button
                            type="submit"
                            aria-label={published ? "Cofnij na Gotowe" : "Oznacz jako opublikowane"}
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[9px] ${
                              published ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 hover:border-emerald-500"
                            }`}
                          >
                            {published && "✓"}
                          </button>
                        </form>
                      )}
                      {/* Pełna edycja otwiera się jako pływające okno (Modal)
                          zamiast rozwijać się w tej ciasnej komórce siatki —
                          patrz ContentItemChip. */}
                      <div className="min-w-0 flex-1">
                        <ContentItemChip item={item} assignees={assignees} hasLinkedTask={contentIdsWithTask.has(item.id)} isAdmin={isAdmin} today={today} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <AddContentButton date={date} dateLabel={dateLabel} assignees={assignees} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
