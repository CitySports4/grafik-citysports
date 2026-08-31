import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { getOrCreateScheduleMonth, nextMonth, monthLabel, daysInMonth, toDateKey } from "@/lib/schedule-month";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { Banner } from "@/components/Banner";
import { AvailabilityCalendar } from "./AvailabilityCalendar";
import { PreferredDaysOff } from "./PreferredDaysOff";
import { submitAvailability } from "./actions";
import { PlannedAbsencesSection } from "../nieobecnosci/PlannedAbsencesSection";

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const employee = await requireEmployee();
  const params = await searchParams;
  const tab = params.tab === "absences" ? "absences" : "availability";
  const { year, month } = nextMonth();
  const scheduleMonth = await getOrCreateScheduleMonth(year, month);

  const supabase = createServerSupabaseClient();

  const dates = daysInMonth(year, month).map(toDateKey);

  const [{ data: submission }, { data: shiftTemplate }, { data: preferredDaysOff }, { data: plannedAbsences }] = await Promise.all([
    supabase
      .from("availability_submission")
      .select("id, status, submitted_at")
      .eq("employee_id", employee.id)
      .eq("schedule_month_id", scheduleMonth.id)
      .maybeSingle(),
    supabase
      .from("shift_template")
      .select("weekday, slot_index, default_start_time, default_end_time, label")
      .eq("active", true)
      .order("slot_index"),
    supabase.from("preferred_day_off").select("weekday, note").eq("employee_id", employee.id),
    supabase
      .from("planned_absence")
      .select("start_date, end_date")
      .eq("employee_id", employee.id)
      .lte("start_date", dates[dates.length - 1])
      .gte("end_date", dates[0]),
  ]);

  // Dni pokryte zgłoszonym urlopem są niedostępne "z automatu" — nie ma
  // sensu dawać ich jeszcze raz do ręcznego zaznaczenia w kalendarzu
  // dyspozycyjności, to samo policzyłoby się dwa razy i myliło. Kalendarz
  // pokazuje je jako zablokowane, patrz absenceDates w AvailabilityCalendar.
  const absenceDates = new Set<string>();
  for (const a of plannedAbsences ?? []) {
    for (const dateKey of dates) {
      if (dateKey >= a.start_date && dateKey <= a.end_date) absenceDates.add(dateKey);
    }
  }

  let entries: { date: string; whole_day: boolean; slot_index: number | null }[] = [];
  if (submission) {
    const { data } = await supabase
      .from("availability_entry")
      .select("date, whole_day, slot_index")
      .eq("availability_submission_id", submission.id);
    entries = data ?? [];
  }

  const entriesByDate: Record<string, { wholeDay: boolean; slots: number[] }> = {};
  for (const e of entries) {
    const dateKey = e.date;
    if (!entriesByDate[dateKey]) entriesByDate[dateKey] = { wholeDay: false, slots: [] };
    if (e.whole_day) entriesByDate[dateKey].wholeDay = true;
    else if (e.slot_index !== null) entriesByDate[dateKey].slots.push(e.slot_index);
  }

  const shiftsByWeekday: Record<number, typeof shiftTemplate> = {};
  for (const s of shiftTemplate ?? []) {
    if (!shiftsByWeekday[s.weekday]) shiftsByWeekday[s.weekday] = [];
    shiftsByWeekday[s.weekday]!.push(s);
  }

  const days = daysInMonth(year, month).map((d) => ({
    dateKey: toDateKey(d),
    day: d.getDate(),
    weekday: d.getDay(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Dyspozycyjność</h1>
        <p className="text-sm text-zinc-500">
          Comiesięczna dyspozycyjność na najbliższy grafik oraz planowane nieobecności z dłuższym
          wyprzedzeniem.
        </p>
      </div>

      <div className="flex gap-1 border-b border-zinc-200">
        <Link
          href="/dyspozycyjnosc"
          className={`px-3 py-2 text-sm font-semibold ${tab === "availability" ? "border-b-2 border-brand-orange text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}
        >
          Dyspozycyjność
        </Link>
        <Link
          href="/dyspozycyjnosc?tab=absences"
          className={`px-3 py-2 text-sm font-semibold ${tab === "absences" ? "border-b-2 border-brand-orange text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}
        >
          Urlopy i nieobecności
        </Link>
      </div>

      {tab === "absences" ? (
        <PlannedAbsencesSection employeeId={employee.id} />
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            <span className="capitalize">{monthLabel(month)}</span> {year}
          </p>
          <Banner variant="info" className="font-semibold">
            Zaznacz tylko dni i zmiany, w których na pewno Cię <u>nie będzie</u> — nie zaznaczaj tych, w
            których możesz pracować.
          </Banner>

          {submission?.status === "submitted" && (
            <Banner variant="success">
              Zgłoszono {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString("pl-PL") : ""} — nadal
              możesz coś zmienić, jeśli trzeba.
            </Banner>
          )}

          <Card>
            <AvailabilityCalendar
              scheduleMonthId={scheduleMonth.id}
              days={days}
              entriesByDate={entriesByDate}
              shiftsByWeekday={shiftsByWeekday as Record<number, { slot_index: number; default_start_time: string; default_end_time: string; label: string | null }[]>}
              absenceDates={Array.from(absenceDates)}
            />
            <form action={submitAvailability} className="mt-4">
              <input type="hidden" name="schedule_month_id" value={scheduleMonth.id} />
              <SubmitButton
                savedText="Zgłoszono"
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Zgłoś dyspozycyjność
              </SubmitButton>
            </form>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-zinc-900">Preferowane dni wolne</h2>
            <PreferredDaysOff
              initialWeekdays={(preferredDaysOff ?? []).map((p) => p.weekday)}
              initialNote={preferredDaysOff?.[0]?.note ?? ""}
            />
          </Card>
        </>
      )}
    </div>
  );
}
