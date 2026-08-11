import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { Card } from "@/components/Card";
import { AssistantChat } from "./AssistantChat";

export default async function AssistantPage() {
  await requireEmployee();
  const supabase = createServerSupabaseClient();
  const { data: aiNotes } = await supabase
    .from("note")
    .select("id, title, body, is_task, status, created_at")
    .eq("source", "ai")
    .order("created_at", { ascending: false })
    .limit(8);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Asystent</h1>
        <p className="text-sm text-zinc-500">
          Zapytaj o grafik, godziny, sprzątanie lub zadania w naturalnym języku — odpowiada na
          podstawie realnych danych i nie zmienia niczego samodzielnie. Poniżej też to, co AI już
          wykryło automatycznie w tle.
        </p>
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900">🤖 Wykryte przez AI</h2>
          <Link href="/notatnik" className="text-xs font-semibold text-brand-orange hover:underline">
            Zobacz w Notatniku →
          </Link>
        </div>
        {(aiNotes ?? []).length === 0 ? (
          <p className="text-sm text-zinc-400">Brak automatycznych wykryć na razie — pojawią się tu po nocnych/tygodniowych sprawdzeniach.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {(aiNotes ?? []).map((n) => (
              <div key={n.id} className="rounded-lg border border-brand-blue/20 bg-blue-50/40 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-900">{n.title}</span>
                  <span className="shrink-0 text-xs text-zinc-400">{new Date(n.created_at).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</span>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-zinc-600">{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <AssistantChat />
      </Card>
    </div>
  );
}
