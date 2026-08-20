import Link from "next/link";
import { findScheduleMonth, nextMonth, monthLabel, daysInMonth, toDateKey } from "@/lib/schedule-month";
import { getCleaningMonthPreview } from "@/lib/cleaning-day";
import { weekdayLabel } from "@/lib/weekdays";
import { Card } from "@/components/Card";
import { BackLink } from "@/components/BackLink";
import { ColorDot } from "@/components/ColorDot";
import { AiPlanButton } from "./AiPlanButton";

const SLOT_LABELS: Record<string, string> = {
  otwarcie: "Otwarcie",
  srodek: "Środek",
  zamkniecie: "Zamknięcie",
  po_zamknieciu: "Po zamknięciu",
};
const SLOT_ORDER = ["otwarcie", "srodek", "zamkniecie", "po_zamknieciu"] as const;

// Zbiorczy podgląd całego miesiąca — kto sprząta co, którego dnia — liczony
// z DRAFTU grafiku (zanim admin go opublikuje), żeby dało się ocenić skutki
// układu zmian dla sprzątania (luki kompetencji, przeciążenie kogoś) zanim
// grafik pójdzie na żywo, a nie dopiero po fakcie na /sprzatanie dzień po
// dniu. Tylko do odczytu — nic tu się nie zapisuje.
export default async function CleaningMonthPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const fallback = nextMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;

  const scheduleMonth = await findScheduleMonth(year, month);
  const dateKeys = daysInMonth(year, month).map(toDateKey);
  const preview = scheduleMonth ? await getCleaningMonthPreview(dateKeys) : [];

  const prevLink = month === 1 ? `?year=${year - 1}&month=12` : `?year=${year}&month=${month - 1}`;
  const nextLink = month === 12 ? `?year=${year + 1}&month=1` : `?year=${year}&month=${month + 1}`;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin/sprzatanie" label="Konfiguracja sprzątania" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Podgląd sprzątania — {monthLabel(month)} {year}</h1>
          <p className="text-sm text-zinc-500">
            Kto sprząta co, którego dnia — liczone z aktualnego draftu grafiku w{" "}
            <Link href={`/admin/grafik?year=${year}&month=${month}`} className="font-semibold text-brand-orange hover:underline">
              Grafik
            </Link>
            , przed publikacją. Zmiana obsady w grafiku od razu zmienia ten podgląd.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Link href={prevLink} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
              ← poprzedni
            </Link>
            <Link href={nextLink} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
              następny →
            </Link>
          </div>
          {scheduleMonth && <AiPlanButton dateKeys={dateKeys} />}
        </div>
      </div>

      {!scheduleMonth ? (
        <Card>
          <p className="text-sm text-zinc-400">
            Grafik na {monthLabel(month)} {year} nie został jeszcze utworzony — zacznij w{" "}
            <Link href={`/admin/grafik?year=${year}&month=${month}`} className="font-semibold text-brand-orange hover:underline">
              Grafiku
            </Link>
            .
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {preview.map((day) => {
            const bySlot = new Map<string, typeof day.items>();
            for (const item of day.items) {
              if (!bySlot.has(item.slot)) bySlot.set(item.slot, []);
              bySlot.get(item.slot)!.push(item);
            }
            const unassignedCount = day.items.filter((i) => !i.assignee && !i.autoCovered).length;
            const overdueCount = day.items.filter((i) => i.overdue).length;
            const gapCount = day.items.filter((i) => i.coverageGap).length;

            if (day.items.length === 0) return null;

            return (
              <Card key={day.date}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold capitalize text-zinc-900">
                    {weekdayLabel(day.weekday)}, {new Date(day.date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}
                  </h2>
                  <div className="flex items-center gap-2 text-xs">
                    {unassignedCount > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700">{unassignedCount} bez przypisania</span>}
                    {overdueCount > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">{overdueCount} zaległych</span>}
                    {gapCount > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-bold text-violet-700">{gapCount} luk kompetencji</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  {SLOT_ORDER.filter((s) => bySlot.has(s)).map((slot) => {
                    const items = bySlot.get(slot)!;
                    const byAssignee = new Map<string, { name: string; color_hex: string; minutes: number; count: number }>();
                    const unassignedItems = items.filter((i) => !i.assignee);
                    for (const i of items) {
                      if (!i.assignee) continue;
                      const key = i.assignee.name;
                      if (!byAssignee.has(key)) byAssignee.set(key, { name: i.assignee.name, color_hex: i.assignee.color_hex, minutes: 0, count: 0 });
                      const entry = byAssignee.get(key)!;
                      entry.minutes += i.timeMinutes;
                      entry.count += 1;
                    }
                    return (
                      <div key={slot} className="min-w-[160px]">
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">{SLOT_LABELS[slot]}</p>
                        <div className="flex flex-col gap-1">
                          {[...byAssignee.values()].map((a) => (
                            <span key={a.name} className="flex items-center gap-1.5 text-xs text-zinc-700">
                              <ColorDot color={a.color_hex} />
                              {a.name} <span className="text-zinc-400">({a.count} zad., {a.minutes} min)</span>
                            </span>
                          ))}
                          {unassignedItems.length > 0 && (
                            <span className="text-xs font-semibold text-red-500">⚠ {unassignedItems.length} bez przypisania</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
          {preview.every((d) => d.items.length === 0) && <p className="text-sm text-zinc-400">Brak zadań sprzątania w tym miesiącu.</p>}
        </div>
      )}
    </div>
  );
}
