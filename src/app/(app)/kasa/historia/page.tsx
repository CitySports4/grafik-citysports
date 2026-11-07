import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canAccessKasa } from "@/lib/session";
import { Card } from "@/components/Card";
import { BackLink } from "@/components/BackLink";
import { CASH_DAY_STATUS_LABELS } from "@/lib/kasa";
import { reopenCashDay } from "../actions";
import { ReopenDayForm } from "./ReopenDayForm";

type Row = {
  id: string;
  date: string;
  rd_number: number | null;
  opening_balance: number;
  expected_closing: number | null;
  counted_closing: number | null;
  difference: number | null;
  status: "open" | "closed" | "corrected";
};

export default async function KasaHistoriaPage() {
  const employee = await requireEmployee();
  if (!canAccessKasa(employee)) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">Nie masz dostępu do Kasy.</p>
      </div>
    );
  }
  const isAdmin = employee.roles.includes("admin");

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("cash_day")
    .select("id, date, rd_number, opening_balance, expected_closing, counted_closing, difference, status")
    .order("date", { ascending: false })
    .limit(90);
  const days = (data ?? []) as Row[];

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/kasa" label="Kasa" />

      <div>
        <h1 className="text-lg font-bold text-zinc-900">Historia kasy</h1>
        <p className="text-sm text-zinc-500">Archiwum zamkniętych dni — raporty dobowe (RD).</p>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-3">Data</th>
              <th className="py-2 pr-3">RD</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Otwarcie</th>
              <th className="py-2 pr-3">Oczekiwane</th>
              <th className="py-2 pr-3">Policzone</th>
              <th className="py-2 pr-3">Różnica</th>
              {isAdmin && <th className="py-2 pr-3">Korekta</th>}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.id} className="border-b border-zinc-100 last:border-0">
                <td className="py-2 pr-3 font-semibold text-zinc-900">
                  <a href={`/kasa?date=${d.date}`} className="hover:underline">
                    {new Date(d.date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" })}
                  </a>
                </td>
                <td className="py-2 pr-3">{d.rd_number ?? "—"}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      d.status === "open" ? "bg-amber-100 text-amber-700" : d.status === "closed" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {CASH_DAY_STATUS_LABELS[d.status]}
                  </span>
                </td>
                <td className="py-2 pr-3">{d.opening_balance.toFixed(2)} zł</td>
                <td className="py-2 pr-3">{d.expected_closing !== null ? `${d.expected_closing.toFixed(2)} zł` : "—"}</td>
                <td className="py-2 pr-3">{d.counted_closing !== null ? `${d.counted_closing.toFixed(2)} zł` : "—"}</td>
                <td className={`py-2 pr-3 font-semibold ${d.difference ? "text-red-600" : "text-emerald-600"}`}>
                  {d.difference !== null ? `${d.difference > 0 ? "+" : ""}${d.difference.toFixed(2)} zł` : "—"}
                </td>
                {isAdmin && (
                  <td className="py-2 pr-3">
                    {d.status === "closed" && <ReopenDayForm cashDayId={d.id} action={reopenCashDay} />}
                  </td>
                )}
              </tr>
            ))}
            {days.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="py-6 text-center text-zinc-400">
                  Brak zamkniętych dni.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
