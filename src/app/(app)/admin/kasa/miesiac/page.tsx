import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { BackLink } from "@/components/BackLink";
import { monthLabel } from "@/lib/schedule-month";
import { closeCashMonth } from "./actions";

// Ekran "Miesiąc" (pkt 6): lista miesięcy z dniami kasowymi, zamykanie
// miesiąca (nadaje numer RK) i pobieranie RK (PDF) oraz paczki ZIP.
export default async function KasaMiesiacPage() {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  const [{ data: days }, { data: months }] = await Promise.all([
    supabase.from("cash_days").select("date, status").order("date", { ascending: false }),
    supabase.from("cash_months").select("year, month, rk_number, status"),
  ]);

  const byMonth = new Map<string, { year: number; month: number; total: number; closed: number }>();
  for (const d of days ?? []) {
    const year = Number(d.date.slice(0, 4));
    const month = Number(d.date.slice(5, 7));
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const cur = byMonth.get(key) ?? { year, month, total: 0, closed: 0 };
    cur.total += 1;
    if (d.status === "closed") cur.closed += 1;
    byMonth.set(key, cur);
  }
  const rkByKey = new Map((months ?? []).map((m) => [`${m.year}-${String(m.month).padStart(2, "0")}`, m]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <BackLink href="/admin/kasa" label="Import kasy" />
      <h1 className="text-xl font-bold text-zinc-900">Kasa — miesiąc</h1>
      {byMonth.size === 0 && <p className="text-sm text-zinc-500">Brak dni kasowych.</p>}
      {[...byMonth.entries()].map(([key, m]) => {
        const rk = rkByKey.get(key);
        const isClosed = rk?.status === "closed";
        const allClosed = m.total > 0 && m.closed === m.total;
        return (
          <Card key={key}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-zinc-900">
                  {monthLabel(m.month)} {m.year}
                </p>
                <p className="text-xs text-zinc-500">
                  dni zamkniętych: {m.closed}/{m.total}
                  {isClosed && rk?.rk_number ? ` · RK ${rk.rk_number}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <a href={`/api/kasa/miesiac/${key}/rk`} className="rounded-lg bg-zinc-100 px-3 py-1.5 font-semibold text-zinc-800 hover:bg-zinc-200">
                  RK (PDF)
                </a>
                <a href={`/api/kasa/miesiac/${key}/paczka`} className="rounded-lg bg-zinc-100 px-3 py-1.5 font-semibold text-zinc-800 hover:bg-zinc-200">
                  Paczka (ZIP)
                </a>
              </div>
            </div>
            {!isClosed && (
              <form action={closeCashMonth} className="mt-3">
                <input type="hidden" name="year" value={m.year} />
                <input type="hidden" name="month" value={m.month} />
                <SubmitButton disabled={!allClosed} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-40">
                  Zamknij miesiąc (nadaj numer RK)
                </SubmitButton>
                {!allClosed && <p className="mt-1 text-xs text-zinc-500">Najpierw zamknij wszystkie dni tego miesiąca.</p>}
              </form>
            )}
          </Card>
        );
      })}
    </div>
  );
}
