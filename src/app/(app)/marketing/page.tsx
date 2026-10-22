import Link from "next/link";
import { requireEmployee, canAccessMarketing } from "@/lib/session";
import { TasksSection } from "./TasksSection";
import { ContentCalendarSection } from "./ContentCalendarSection";
import { PlansSection } from "./PlansSection";

const TABS = [
  { key: "zadania", label: "Zadania" },
  { key: "kalendarz", label: "Kalendarz treści" },
  { key: "plany", label: "Strategie i plany" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; monday?: string }>;
}) {
  const employee = await requireEmployee();
  if (!canAccessMarketing(employee)) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">Nie masz dostępu do narzędzia marketingu.</p>
      </div>
    );
  }

  const params = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === params.tab)?.key ?? "zadania") as TabKey;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">📣 Marketing</h1>
        <p className="text-sm text-zinc-500">Zadania, kalendarz treści oraz strategie i plany zespołu marketingu.</p>
      </div>

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

      {tab === "zadania" && <TasksSection currentEmployeeId={employee.id} />}
      {tab === "kalendarz" && <ContentCalendarSection mondayParam={params.monday} />}
      {tab === "plany" && <PlansSection />}
    </div>
  );
}
