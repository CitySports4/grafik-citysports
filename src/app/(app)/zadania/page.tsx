import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { toDateKey } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { getCleaningDayItems } from "@/lib/cleaning-day";
import { Card } from "@/components/Card";
import { CleaningDayList } from "../sprzatanie/CleaningDayList";

export default async function ZadaniaPage() {
  await requireEmployee();
  const today = toDateKey(new Date());
  const weekday = new Date(today + "T00:00:00").getDay();

  const { items: cleaningItems } = await getCleaningDayItems(today);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Zadania</h1>
        <p className="text-sm text-zinc-500">Zadania sprzątania na dziś.</p>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-zinc-900">
            Zadania na sprzątanie — {weekdayLabel(weekday)}, {new Date(today + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}
          </h2>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/sprzatanie" className="font-semibold text-zinc-500 hover:text-zinc-800">
              inny dzień →
            </Link>
            <Link href="/sprzatanie/pula" className="font-semibold text-zinc-500 hover:text-zinc-800">
              pula zadań →
            </Link>
          </div>
        </div>
        {cleaningItems.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak zadań sprzątania na dziś.</p>
        ) : (
          <CleaningDayList date={today} items={cleaningItems} />
        )}
      </Card>
    </div>
  );
}
