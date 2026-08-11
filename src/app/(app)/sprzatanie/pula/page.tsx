import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { toDateKey } from "@/lib/schedule-month";
import { Card } from "@/components/Card";
import { PoolList } from "./PoolList";

const FREQ_LABELS: Record<string, string> = {
  daily: "Codziennie",
  "3xweek": "3× w tygodniu",
  "2xweek": "2× w tygodniu",
  weekly: "Co tydzień",
  biweekly: "Co 2 tygodnie",
  monthly: "Co 4 tygodnie",
  quarterly: "Co kwartał",
};
const FREQ_ORDER = ["daily", "3xweek", "2xweek", "weekly", "biweekly", "monthly", "quarterly"];

export default async function CleaningPoolPage() {
  await requireEmployee();
  const today = toDateKey(new Date());
  const supabase = createServerSupabaseClient();

  const [{ data: tasks }, { data: zones }, { data: todayCompletions }, { data: lastCompletions }] = await Promise.all([
    supabase
      .from("cleaning_task")
      .select("id, zone_id, name, time_minutes, frequency")
      .eq("active", true)
      .order("name"),
    supabase.from("cleaning_zone").select("id, name"),
    supabase.from("cleaning_completion").select("task_id, completed_at").eq("date", today),
    supabase.from("cleaning_completion").select("task_id, date").not("completed_at", "is", null).order("date", { ascending: false }),
  ]);

  const zoneNameById = new Map((zones ?? []).map((z) => [z.id, z.name]));
  const doneTodaySet = new Set((todayCompletions ?? []).filter((c) => c.completed_at).map((c) => c.task_id));
  const lastDoneByTask = new Map<string, string>();
  for (const c of lastCompletions ?? []) {
    if (!lastDoneByTask.has(c.task_id)) lastDoneByTask.set(c.task_id, c.date);
  }

  const items = (tasks ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    zoneName: zoneNameById.get(t.zone_id) ?? "?",
    timeMinutes: t.time_minutes,
    frequency: t.frequency,
    frequencyLabel: FREQ_LABELS[t.frequency] ?? t.frequency,
    lastDone: lastDoneByTask.get(t.id) ?? null,
    doneToday: doneTodaySet.has(t.id),
  }));
  items.sort((a, b) => FREQ_ORDER.indexOf(a.frequency) - FREQ_ORDER.indexOf(b.frequency));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Pula zadań sprzątania</h1>
          <p className="text-sm text-zinc-500">
            Masz wolną chwilę? Wybierz zadanie spoza dzisiejszego przydziału i zrób je teraz — liczy
            się do historii, nawet jeśli akurat nie wypada dziś.
          </p>
        </div>
        <Link href="/sprzatanie" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
          ← Wróć do dnia
        </Link>
      </div>

      <Card>
        <PoolList items={items} today={today} freqLabels={FREQ_LABELS} />
      </Card>
    </div>
  );
}
