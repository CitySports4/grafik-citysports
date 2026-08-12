import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { toDateKey } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { getCleaningDayItems } from "@/lib/cleaning-day";
import { Card } from "@/components/Card";
import { BackLink } from "@/components/BackLink";
import { CleaningDayList } from "./CleaningDayList";

export default async function CleaningDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireEmployee();
  const params = await searchParams;
  const dateKey = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : toDateKey(new Date());
  const dateObj = new Date(dateKey + "T00:00:00");
  const weekday = dateObj.getDay();

  const prevDate = new Date(dateObj);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(dateObj);
  nextDate.setDate(nextDate.getDate() + 1);

  const { items, todayPublished } = await getCleaningDayItems(dateKey);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/zadania" label="Zadania" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold capitalize text-zinc-900">
            Sprzątanie — {weekdayLabel(weekday)}, {dateObj.toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}
          </h1>
          {!todayPublished && <p className="text-sm text-amber-600">Grafik na ten dzień nie jest jeszcze opublikowany — przydział może być niepełny.</p>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/sprzatanie?date=${toDateKey(prevDate)}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            ← poprzedni dzień
          </Link>
          <Link href={`/sprzatanie?date=${toDateKey(nextDate)}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            następny dzień →
          </Link>
          <Link href="/sprzatanie/pula" className="rounded-lg bg-zinc-800 px-3 py-1.5 font-semibold text-white hover:bg-zinc-900">
            Pula zadań
          </Link>
        </div>
      </div>

      <Card>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak zadań sprzątania na ten dzień.</p>
        ) : (
          <CleaningDayList date={dateKey} items={items} />
        )}
      </Card>
    </div>
  );
}
