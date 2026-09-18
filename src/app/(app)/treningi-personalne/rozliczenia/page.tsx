import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canPreviewPersonalTraining, isPersonalTrainerOnly, ROLE_LABELS } from "@/lib/session";
import { currentMonth, monthLabel, daysInMonth, toDateKey } from "@/lib/schedule-month";
import { sessionAmount } from "@/lib/personal-training";
import { Card } from "@/components/Card";
import { ColorDot } from "@/components/ColorDot";
import { BackLink } from "@/components/BackLink";
import { SettleMonthPanel } from "../SettleMonthPanel";
import { settlePersonalTrainingSessions, settleAllPersonalTrainingForRange } from "../actions";

const CYCLE_LABELS: Record<string, string> = { weekly: "tygodniowo", monthly: "miesięcznie" };

export default async function PersonalTrainingBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const employee = await requireEmployee();
  const isAdmin = employee.roles.includes("admin");
  const isTrainer = employee.roles.includes("trener_personalny");
  const canPreview = canPreviewPersonalTraining(employee);

  if (!isAdmin && !isTrainer && !canPreview) {
    return (
      <div className="flex flex-col gap-6">
        {!isPersonalTrainerOnly(employee) && <BackLink href="/grafik" label="Mój grafik" />}
        <p className="text-sm text-zinc-500">Nie masz dostępu do rozliczeń treningów personalnych.</p>
      </div>
    );
  }

  // Widzi tylko swoje treningi, jeśli nie ma admina ani recepcji (zwykły
  // trener) — reszta (admin, recepcja) widzi rozliczenia WSZYSTKICH trenerów,
  // patrz canPreviewPersonalTraining.
  const seeAllTrainers = isAdmin || canPreview;

  const params = await searchParams;
  const fallback = currentMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;
  const dates = daysInMonth(year, month).map(toDateKey);
  const prevLink = month === 1 ? `?year=${year - 1}&month=12` : `?year=${year}&month=${month - 1}`;
  const nextLink = month === 12 ? `?year=${year + 1}&month=1` : `?year=${year}&month=${month + 1}`;

  const supabase = createServerSupabaseClient();
  let query = supabase
    .from("personal_training_session")
    .select(
      "id, trainer_employee_id, date, start_time, client_count, is_settled, rate_per_person_snapshot, trainer:trainer_employee_id(name, color_hex, pt_billing_cycle)"
    )
    .in("date", dates)
    .eq("status", "scheduled");
  if (!seeAllTrainers) query = query.eq("trainer_employee_id", employee.id);
  const { data: sessions } = await query;

  type Row = {
    id: string;
    trainer_employee_id: string;
    date: string;
    start_time: string;
    client_count: number;
    is_settled: boolean;
    rate_per_person_snapshot: number;
    trainer: { name: string; color_hex: string; pt_billing_cycle: string | null } | null;
  };

  const byTrainer = new Map<
    string,
    {
      trainerId: string;
      name: string;
      color: string;
      cycle: string | null;
      sessionCount: number;
      total: number;
      settled: number;
      sessions: { id: string; date: string; startTime: string; clientCount: number; amount: number; isSettled: boolean }[];
    }
  >();
  for (const s of (sessions ?? []) as unknown as Row[]) {
    const key = s.trainer_employee_id;
    if (!byTrainer.has(key)) {
      byTrainer.set(key, {
        trainerId: key,
        name: s.trainer?.name ?? "?",
        color: s.trainer?.color_hex ?? "#999",
        cycle: s.trainer?.pt_billing_cycle ?? null,
        sessionCount: 0,
        total: 0,
        settled: 0,
        sessions: [],
      });
    }
    const row = byTrainer.get(key)!;
    const amount = sessionAmount(s.rate_per_person_snapshot, s.client_count);
    row.sessionCount += 1;
    row.total += amount;
    if (s.is_settled) row.settled += amount;
    row.sessions.push({ id: s.id, date: s.date, startTime: s.start_time, clientCount: s.client_count, amount, isSettled: s.is_settled });
  }
  const rows = [...byTrainer.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/treningi-personalne" label="Grafik treningów" />

      <div>
        <h1 className="text-lg font-bold text-zinc-900">Rozliczenia — treningi personalne</h1>
        <p className="text-sm text-zinc-500">Suma należności trenerów wobec klubu (stawka × liczba osób), ile już rozliczone.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-base font-bold capitalize text-zinc-900">
          {monthLabel(month)} {year}
        </span>
        <div className="flex items-center gap-2 text-sm">
          <Link href={prevLink} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            ← poprzedni
          </Link>
          <Link href={nextLink} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            następny →
          </Link>
        </div>
      </div>

      <Card>
        {rows.length === 0 && <p className="text-sm text-zinc-400">Brak treningów w tym miesiącu.</p>}
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const unpaid = Math.round((r.total - r.settled) * 100) / 100;
            return (
              <div key={r.name} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold text-zinc-900">
                    <ColorDot color={r.color} />
                    {r.name}
                    {r.cycle && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
                        rozliczenie {CYCLE_LABELS[r.cycle] ?? r.cycle}
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-zinc-600">{r.sessionCount} treningów</span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                  <span>
                    <span className="text-zinc-400">Do zapłaty łącznie: </span>
                    <strong className="text-zinc-900">{r.total.toFixed(2)} PLN</strong>
                  </span>
                  <span>
                    <span className="text-zinc-400">Rozliczone: </span>
                    <strong className="text-emerald-700">{r.settled.toFixed(2)} PLN</strong>
                  </span>
                  <span>
                    <span className="text-zinc-400">Zostało do zebrania: </span>
                    <strong className={unpaid > 0 ? "text-amber-700" : "text-emerald-700"}>{unpaid.toFixed(2)} PLN</strong>
                  </span>
                </div>
                {canPreview && (
                  <SettleMonthPanel
                    sessions={r.sessions}
                    trainerId={r.trainerId}
                    startDate={dates[0]}
                    endDate={dates[dates.length - 1]}
                    settleSessionsAction={settlePersonalTrainingSessions}
                    settleAllAction={settleAllPersonalTrainingForRange}
                  />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {isAdmin && (
        <p className="text-xs text-zinc-400">
          Cykl rozliczeń każdego trenera (tydzień/miesiąc) ustawiasz w{" "}
          <Link href="/admin/pracownicy" className="font-semibold text-brand-orange hover:underline">
            Pracownicy
          </Link>
          , rolę {ROLE_LABELS.trener_personalny} tam samo.
        </p>
      )}
    </div>
  );
}
