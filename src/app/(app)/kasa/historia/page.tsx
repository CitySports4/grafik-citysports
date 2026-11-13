import Link from "next/link";
import { requireEmployee, canAccessKasa } from "@/lib/session";
import { createServerSupabaseClient } from "@/lib/supabase";
import { BackLink } from "@/components/BackLink";

function money(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}

// Tailwind "capitalize" wielkie litery daje KAŻDEMU słowu, co po polsku
// jest błędne — tylko pierwsza litera całego ciągu (patrz CashDayScreen).
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthKey(date: string): string {
  return date.slice(0, 7); // "RRRR-MM"
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return capitalizeFirst(new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pl-PL", { month: "long", year: "numeric" }));
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

  const withDiff = days.filter((d) => closeByDay.has(d.id));
  const mismatched = withDiff.filter((d) => closeByDay.get(d.id)!.difference !== 0);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/kasa" label="Kasa" />
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Historia dni kasowych</h1>
        <p className="text-sm text-zinc-500">Ostatnie zamknięte dni. Korekta zamkniętego dnia tylko przez admina.</p>
      </div>

      {days.length === 0 ? (
        <p className="text-center text-sm text-zinc-400">Brak zamkniętych dni.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-zinc-50 p-3 text-center">
              <p className="text-xl font-bold text-zinc-900">{days.length}</p>
              <p className="text-xs text-zinc-500">zamkniętych dni</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-xl font-bold text-emerald-700">{withDiff.length - mismatched.length}</p>
              <p className="text-xs text-emerald-700">zgadza się</p>
            </div>
            <div className={`rounded-xl p-3 text-center ${mismatched.length > 0 ? "bg-red-50" : "bg-zinc-50"}`}>
              <p className={`text-xl font-bold ${mismatched.length > 0 ? "text-red-700" : "text-zinc-900"}`}>{mismatched.length}</p>
              <p className={`text-xs ${mismatched.length > 0 ? "text-red-700" : "text-zinc-500"}`}>różnica</p>
            </div>
          </div>

          {/* Tylko admin, tylko komputer (jak panel admina / ScheduleTable)
          — bez telefonu nie ma po co dublować tabeli listą kart. */}
          <div className="overflow-x-auto rounded-2xl bg-white">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5">RD</th>
                  <th className="px-3 py-2.5">Data</th>
                  <th className="px-3 py-2.5 text-right">Stan kasy</th>
                  <th className="px-3 py-2.5">Wynik</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              {Object.entries(
                days.reduce<Record<string, typeof days>>((groups, d) => {
                  const key = monthKey(d.date);
                  (groups[key] ??= []).push(d);
                  return groups;
                }, {})
              ).map(([key, monthDays]) => (
                <tbody key={key}>
                  <tr>
                    <td colSpan={5} className="bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {monthLabel(key)}
                    </td>
                  </tr>
                  {monthDays.map((d) => {
                    const close = closeByDay.get(d.id);
                    const ok = close ? close.difference === 0 : true;
                    return (
                      <tr key={d.id} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                        <td className="px-3 py-2.5 font-semibold text-zinc-900">{d.rd_number ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 capitalize text-zinc-700">
                          {new Date(d.date + "T00:00:00").toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "long" })}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-zinc-900">{close ? money(close.counted) : "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                            {ok ? "zgadza się" : `różnica ${close!.difference > 0 ? "+" : ""}${money(close!.difference)}`}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Link href={`/kasa?date=${d.date}`} className="font-semibold text-brand-blue hover:underline">
                            Otwórz →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        </>
      )}

      <Link href="/kasa" className="text-center text-sm font-semibold text-zinc-500 hover:text-zinc-800">
        ← Dziś
      </Link>
    </div>
  );
}
