import Link from "next/link";
import { requireEmployee, canAccessKasa } from "@/lib/session";
import { createServerSupabaseClient } from "@/lib/supabase";
import { Card, CardLink } from "@/components/Card";
import { BackLink } from "@/components/BackLink";

function money(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}

export default async function KasaHistoriaPage() {
  const employee = await requireEmployee();
  if (!canAccessKasa(employee)) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">Nie masz dostępu do Kasy.</p>
      </div>
    );
  }

  const supabase = createServerSupabaseClient();
  const { data: daysRaw } = await supabase
    .from("cash_days")
    .select("id, date, rd_number, status")
    .eq("status", "closed")
    .order("date", { ascending: false })
    .limit(60);
  const days = daysRaw ?? [];

  const { data: countsRaw } =
    days.length > 0
      ? await supabase
          .from("cash_counts")
          .select("cash_day_id, slot, counted, difference")
          .in(
            "cash_day_id",
            days.map((d) => d.id)
          )
          .eq("slot", "close")
      : { data: [] };
  const closeByDay = new Map((countsRaw ?? []).map((c) => [c.cash_day_id, c]));

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/kasa" label="Kasa" />
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Historia dni kasowych</h1>
        <p className="text-sm text-zinc-500">Ostatnie zamknięte dni. Korekta zamkniętego dnia tylko przez admina.</p>
      </div>

      {days.length === 0 ? (
        <Card className="text-center text-sm text-zinc-400">Brak zamkniętych dni.</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {days.map((d) => {
            const close = closeByDay.get(d.id);
            const ok = close ? close.difference === 0 : true;
            return (
              <CardLink key={d.id} href={`/kasa?date=${d.date}`} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-900">
                    RD {d.rd_number} ·{" "}
                    {new Date(d.date + "T00:00:00").toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "long" })}
                  </p>
                  {close && <p className="text-sm text-zinc-500">stan kasy: {money(close.counted)}</p>}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {ok ? "zgadza się" : "różnica"}
                </span>
              </CardLink>
            );
          })}
        </div>
      )}

      <Link href="/kasa" className="text-center text-sm font-semibold text-zinc-500 hover:text-zinc-800">
        ← Dziś
      </Link>
    </div>
  );
}
