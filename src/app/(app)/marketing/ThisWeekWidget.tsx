import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import { Card } from "@/components/Card";
import { PLATFORM_ICONS, type ContentPlatform } from "@/lib/marketing";

// Szybki podgląd "co najbliżej" bez wchodzenia w Kalendarz treści i szukania
// bieżącego dnia (patrz feedback z użycia) — 3 najbliższe zaplanowane
// publikacje, zawsze na górze strony, niezależnie od tego, która zakładka
// jest akurat otwarta.
export async function ThisWeekWidget() {
  const supabase = createServerSupabaseClient();
  const today = toDateKey(new Date());
  const { data } = await supabase
    .from("marketing_content")
    .select("id, title, platform, scheduled_date")
    .gte("scheduled_date", today)
    .order("scheduled_date", { ascending: true })
    .limit(3);

  const items = (data ?? []) as { id: string; title: string; platform: ContentPlatform; scheduled_date: string }[];
  if (items.length === 0) return null;

  return (
    <Card className="!p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Najbliższe publikacje</p>
      <div className="flex flex-col gap-1.5 sm:flex-row">
        {items.map((item) => {
          const year = item.scheduled_date.slice(0, 4);
          const month = Number(item.scheduled_date.slice(5, 7));
          return (
            <Link
              key={item.id}
              href={`/marketing?tab=kalendarz&year=${year}&month=${month}`}
              className="flex flex-1 items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm hover:bg-zinc-100"
            >
              <span>{PLATFORM_ICONS[item.platform]}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{item.title}</span>
              <span className="shrink-0 text-xs text-zinc-500">
                {new Date(item.scheduled_date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
