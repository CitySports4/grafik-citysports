import { getCleaningDayItems } from "@/lib/cleaning-day";
import { toDateKey } from "@/lib/schedule-month";
import { Card } from "@/components/Card";
import { ColorDot } from "@/components/ColorDot";

export default async function RecepcjaZadaniaPage() {
  const today = toDateKey(new Date());
  const { items: cleaningItems } = await getCleaningDayItems(today);

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-bold text-zinc-900">
        Zadania sprzątania — {new Date(today + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}{" "}
        <span className="text-sm font-normal text-zinc-400">(tylko podgląd)</span>
      </h1>
      <Card>
        {cleaningItems.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak zadań sprzątania na dziś.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {cleaningItems.map((it) => (
              <div
                key={it.taskId}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 text-sm ${
                  it.done ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"
                }`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`font-semibold ${it.done ? "text-emerald-700 line-through" : "text-zinc-900"}`}>{it.name}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">{it.zoneName}</span>
                  {it.exceedsBudget && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">⚠ ponad budżet</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {it.assignee ? (
                    <span className="flex items-center gap-1 text-xs text-zinc-600">
                      <ColorDot color={it.assignee.color_hex} />
                      {it.assignee.name}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-red-500">brak przypisania</span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      it.done ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {it.done ? "✓ zrobione" : "do zrobienia"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
