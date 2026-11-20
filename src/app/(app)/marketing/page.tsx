import Link from "next/link";
import { requireEmployee, canAccessMarketing, isContentCreator } from "@/lib/session";
import { TasksSection } from "./TasksSection";
import { archiveOldDoneTasks } from "./actions";
import { MarketingFlash } from "./FlashServer";
import { ContentCalendarSection } from "./ContentCalendarSection";
import { PlansSection } from "./PlansSection";
import { ImportFromFile } from "./ImportFromFile";
import { ThisWeekWidget } from "./ThisWeekWidget";
import { PendingApprovalBadge } from "./PendingApprovalBadge";
import { CreatorView } from "./CreatorView";
import { ProjectsSection } from "./wydarzenia/ProjectsSection";

const TABS = [
  { key: "zadania", label: "Zadania" },
  { key: "kalendarz", label: "Kalendarz treści" },
  { key: "wydarzenia", label: "Wydarzenia i kampanie" },
  { key: "plany", label: "Strategie i plany" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    year?: string;
    month?: string;
    osoba?: string;
    zakres?: string;
    widok?: string;
    filtr?: string;
    projekt?: string;
  }>;
}) {
  const employee = await requireEmployee();
  // Sprint A — osoba WYŁĄCZNIE z rolą content_creator (bez marketing/admin)
  // dostaje osobny, uproszczony widok zamiast reszty tej strony (Projekty,
  // Strategie, import, pełny Kalendarz treści — żadne z tego nie jest dla
  // niej). Ktoś z obiema rolami naraz (hipotetycznie) liczy się jako pełny
  // członek zespołu, nie trafia tutaj.
  if (!canAccessMarketing(employee) && isContentCreator(employee)) {
    const params = await searchParams;
    return <CreatorView employeeId={employee.id} tab={params.tab} yearParam={params.year} monthParam={params.month} />;
  }
  if (!canAccessMarketing(employee)) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">Nie masz dostępu do narzędzia marketingu.</p>
      </div>
    );
  }

  const params = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === params.tab)?.key ?? "zadania") as TabKey;
  if (tab === "zadania") await archiveOldDoneTasks();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">📣 Marketing</h1>
        <p className="text-sm text-zinc-500">Zadania, kalendarz treści, wydarzenia i kampanie oraz strategie i plany zespołu marketingu.</p>
      </div>

      <PendingApprovalBadge isAdmin={employee.roles.includes("admin")} />
      <ThisWeekWidget />

      <div className="flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "zadania" ? "/marketing" : `/marketing?tab=${t.key}`}
            className={`px-3 py-2 text-sm font-semibold ${
              tab === t.key ? "border-b-2 border-brand-orange text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <MarketingFlash />
      {tab === "zadania" && (
        <TasksSection
          currentEmployeeId={employee.id}
          assigneeFilter={params.osoba}
          showAll={params.zakres === "wszystkie"}
          view={params.widok}
          overdueOnly={params.filtr === "po_terminie"}
        />
      )}
      {tab === "kalendarz" && (
        <ContentCalendarSection yearParam={params.year} monthParam={params.month} assigneeFilter={params.osoba} projectFilter={params.projekt} />
      )}
      {tab === "wydarzenia" && <ProjectsSection />}
      {tab === "plany" && <PlansSection />}

      {/* Funkcja zaawansowana, używana rzadko — przeniesiona na sam dół,
          żeby nie konkurowała wizualnie z właściwą treścią strony (patrz
          feedback z użycia: był to pierwszy widoczny element na stronie). */}
      <ImportFromFile />
    </div>
  );
}
