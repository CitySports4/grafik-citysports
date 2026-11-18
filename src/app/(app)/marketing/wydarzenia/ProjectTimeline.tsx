import Link from "next/link";
import type { TimelineStep } from "@/lib/marketing";

// Oś komunikacji — czysto prezentacyjny, bez stanu klienckiego: "Dodaj
// wpis" prowadzi do miesiąca kalendarza treści, NIE tworzy wpisu
// automatycznie (zgłoszenie 18.11.2026: oś ma tylko pokazywać, czego
// brakuje, nigdy nic tworzyć sama).
export function ProjectTimeline({ steps, matched }: { steps: TimelineStep[]; matched: Record<string, boolean> }) {
  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((s) => {
        const done = matched[s.key];
        const year = s.date.slice(0, 4);
        const month = Number(s.date.slice(5, 7));
        return (
          <div
            key={s.key}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${done ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"}`}
          >
            <span className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${done ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-500"}`}
              >
                {done ? "✓" : ""}
              </span>
              <span className="font-semibold text-zinc-900">{s.label}</span>
              <span className="text-xs text-zinc-500">{new Date(s.date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</span>
            </span>
            {!done && (
              <Link href={`/marketing?tab=kalendarz&year=${year}&month=${month}`} className="text-xs font-semibold text-brand-orange hover:underline">
                Brakuje — dodaj wpis →
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
