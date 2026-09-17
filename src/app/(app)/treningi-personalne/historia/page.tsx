import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canPreviewPersonalTraining, isPersonalTrainerOnly } from "@/lib/session";
import { currentMonth, monthLabel, daysInMonth, toDateKey } from "@/lib/schedule-month";
import { formatHm, timeToMinutes } from "@/lib/time";
import { sessionAmount, minutesToTime } from "@/lib/personal-training";
import { weekdayLabel } from "@/lib/weekdays";
import { Card } from "@/components/Card";
import { ColorDot } from "@/components/ColorDot";
import { BackLink } from "@/components/BackLink";

const INPUT =
  "rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

type SessionRow = {
  id: string;
  trainer_employee_id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  client_count: number;
  client_name: string | null;
  status: string;
  is_settled: boolean;
  rate_per_person_snapshot: number;
  trainer: { name: string; color_hex: string } | null;
};

// Historia — pełny zapis (w tym odbyte i anulowane), przeglądany po
// miesiącu, w przeciwieństwie do głównego grafiku (tylko bieżący tydzień,
// tylko zaplanowane) — to ma odpowiadać na "co się działo w zeszłym
// miesiącu / czy ten trening na pewno zniknął".
export default async function PersonalTrainingHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; trainer?: string }>;
}) {
  const employee = await requireEmployee();
  const isAdmin = employee.roles.includes("admin");
  const isTrainer = employee.roles.includes("trener_personalny");
  const canPreview = canPreviewPersonalTraining(employee);

  if (!isAdmin && !isTrainer && !canPreview) {
    return (
      <div className="flex flex-col gap-6">
        {!isPersonalTrainerOnly(employee) && <BackLink href="/grafik" label="Mój grafik" />}
        <p className="text-sm text-zinc-500">Nie masz dostępu do historii treningów personalnych.</p>
      </div>
    );
  }

  // Widzi historię WSZYSTKICH trenerów (bez imion klientów — patrz niżej)
  // tylko admin/recepcja; zwykły trener widzi tylko swoją, jak własny grafik.
  const seeAllTrainers = isAdmin || canPreview;

  const params = await searchParams;
  const fallback = currentMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;
  const trainerFilter = seeAllTrainers ? params.trainer || "" : employee.id;
  const dates = daysInMonth(year, month).map(toDateKey);
  const firstDay = dates[0];
  const lastDay = dates[dates.length - 1];
  const today = toDateKey(new Date());

  const supabase = createServerSupabaseClient();
  const [{ data: sessions }, trainerOptionsResult] = await Promise.all([
    (() => {
      let q = supabase
        .from("personal_training_session")
        .select(
          "id, trainer_employee_id, date, start_time, duration_minutes, client_count, client_name, status, is_settled, rate_per_person_snapshot, trainer:trainer_employee_id(name, color_hex)"
        )
        .gte("date", firstDay)
        .lte("date", lastDay)
        .order("date")
        .order("start_time");
      if (trainerFilter) q = q.eq("trainer_employee_id", trainerFilter);
      return q;
    })(),
    seeAllTrainers
      ? supabase
          .from("employee")
          .select("id, name, employee_role!inner(role)")
          .eq("active", true)
          .eq("employee_role.role", "trener_personalny")
          .order("name")
      : Promise.resolve({ data: null }),
  ]);

  const trainerOptions = (trainerOptionsResult.data ?? []) as unknown as { id: string; name: string }[];

  const qs = (overrides: Record<string, string | number>) => {
    const p = new URLSearchParams({
      year: String(year),
      month: String(month),
      ...(trainerFilter && seeAllTrainers ? { trainer: trainerFilter } : {}),
      ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, String(v)])),
    });
    return `?${p.toString()}`;
  };
  const prevLink = month === 1 ? qs({ year: year - 1, month: 12 }) : qs({ month: month - 1 });
  const nextLink = month === 12 ? qs({ year: year + 1, month: 1 }) : qs({ month: month + 1 });

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/treningi-personalne" label="Grafik treningów" />

      <div>
        <h1 className="text-lg font-bold text-zinc-900">Historia treningów personalnych</h1>
        <p className="text-sm text-zinc-500">
          Pełny zapis miesiąca — odbyte, nadchodzące i anulowane.
          {!seeAllTrainers && " Imię klienta widzisz tylko przy swoich treningach."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {seeAllTrainers ? (
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <select name="trainer" defaultValue={trainerFilter} className={INPUT}>
              <option value="">— wszyscy trenerzy —</option>
              {trainerOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-xl bg-zinc-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-zinc-900">
              Pokaż
            </button>
          </form>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <Link href={prevLink} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
            ← Poprzedni
          </Link>
          <span className="text-sm font-bold capitalize text-zinc-900">
            {monthLabel(month)} {year}
          </span>
          <Link href={nextLink} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100">
            Następny →
          </Link>
        </div>
      </div>

      <Card>
        {!sessions || sessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">Brak treningów w tym miesiącu.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {(sessions as unknown as SessionRow[])
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date) || timeToMinutes(a.start_time) - timeToMinutes(b.start_time))
              .map((s) => {
                const weekday = new Date(s.date + "T00:00:00").getDay();
                const dateLabel = new Date(s.date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
                const endTime = minutesToTime(timeToMinutes(s.start_time) + s.duration_minutes);
                const amount = sessionAmount(s.rate_per_person_snapshot, s.client_count);
                const statusBadge =
                  s.status === "cancelled"
                    ? { label: "anulowany", cls: "bg-red-100 text-red-700" }
                    : s.date < today
                      ? { label: "odbyty", cls: "bg-zinc-100 text-zinc-600" }
                      : { label: "nadchodzący", cls: "bg-blue-100 text-blue-700" };
                const isMine = s.trainer_employee_id === employee.id;

                return (
                  <li
                    key={s.id}
                    className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ${
                      s.status === "cancelled" ? "bg-zinc-50/60 text-zinc-400 line-through" : "bg-zinc-50/60 text-zinc-700"
                    }`}
                  >
                    <span className="font-semibold capitalize text-zinc-900">
                      {dateLabel} <span className="font-normal lowercase text-zinc-400">({weekdayLabel(weekday).slice(0, 3)})</span>
                    </span>
                    <span>
                      {formatHm(s.start_time)}–{endTime}
                    </span>
                    {seeAllTrainers && s.trainer && (
                      <span className="flex items-center gap-1">
                        <ColorDot color={s.trainer.color_hex} />
                        {s.trainer.name}
                      </span>
                    )}
                    {isMine && s.client_name && <span>· {s.client_name}</span>}
                    <span className="text-zinc-400">
                      · {s.client_count} {s.client_count === 1 ? "osoba" : "osób"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusBadge.cls}`}>{statusBadge.label}</span>
                    {s.status !== "cancelled" && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          s.is_settled ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {s.is_settled ? "✓ rozliczone" : "nierozliczone"} · {amount.toFixed(2)} PLN
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </Card>
    </div>
  );
}
