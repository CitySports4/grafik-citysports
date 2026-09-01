import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { currentMonth, monthLabel, daysInMonth, toDateKey } from "@/lib/schedule-month";
import { hoursBetween, timeToMinutes, formatHm } from "@/lib/time";
import { requiresDiscrepancyNote, EARLY_START_MARGIN_MIN, LATE_START_MARGIN_MIN, LATE_END_MARGIN_MIN } from "@/lib/time-entry-window";
import { weekdayLabel } from "@/lib/weekdays";
import { Card } from "@/components/Card";
import { ColorDot } from "@/components/ColorDot";
import { BackLink } from "@/components/BackLink";
import { InstructorCalculator } from "./InstructorCalculator";

export default async function WynagrodzeniaPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const fallback = currentMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;

  // Rozliczenie godzinowe dotyczy tego, kto ma ustawioną stawkę godzinową —
  // nie roli "Recepcja" samej w sobie. Dzięki temu np. szef może mieć
  // zaznaczoną rolę Recepcja (bo faktycznie tam pracuje i ma tam swoje
  // miejsce w grafiku), ale bez stawki nie wpisuje godzin i nie ma tu
  // wypłaty — jest po prostu na stałej pensji.
  const supabase = createServerSupabaseClient();
  const dates = daysInMonth(year, month).map(toDateKey);

  // Wpisy starsze niż 3 miesiące przenoszą się do time_entry_archive (patrz
  // api/cron/data-retention) — miesiąc sprzed tego okna miałby tu zerowe
  // godziny, gdyby pytać tylko "gorącej" tabeli. Każda data leży dokładnie w
  // jednej z tych dwóch tabel naraz, więc bezpiecznie łączymy oba wyniki.
  const [{ data: employees }, { data: entries }, { data: archivedEntries }, { data: shiftRows }] = await Promise.all([
    supabase
      .from("employee")
      .select("id, name, color_hex, hourly_rate")
      .eq("active", true)
      .gt("hourly_rate", 0)
      .order("name"),
    supabase
      .from("time_entry")
      .select("employee_id, date, actual_start, actual_end, is_remote, note")
      .in("date", dates),
    supabase
      .from("time_entry_archive")
      .select("employee_id, date, actual_start, actual_end, is_remote, note")
      .in("date", dates),
    supabase
      .from("schedule_shift")
      .select(
        "employee_id, start_time, end_time, schedule_day!inner(date, weekday, schedule_month!inner(status))"
      )
      .not("employee_id", "is", null)
      .eq("schedule_day.schedule_month.status", "published")
      .in("schedule_day.date", dates),
  ]);
  const allEntries = [...(entries ?? []), ...(archivedEntries ?? [])];

  type ShiftRow = {
    employee_id: string;
    start_time: string;
    end_time: string;
    schedule_day: { date: string; weekday: number };
  };
  // Zbiorczy zakres (min start/max end) dla samego WYŚWIETLANIA "grafik: X–Y"
  // w liście dni wymagających uwagi — a osobno surowa lista zmian per dzień
  // (scheduledListByEmpDate), bo requiresDiscrepancyNote (ta sama reguła co
  // przy wpisywaniu godzin — patrz godziny/actions.ts) dopasowuje KAŻDY
  // wpis do najbliższej pojedynczej zmiany, nie do zbiorczego zakresu.
  const scheduledByEmpDate = new Map<string, { start_time: string; end_time: string; weekday: number }>();
  const scheduledListByEmpDate = new Map<string, { start_time: string; end_time: string }[]>();
  for (const s of (shiftRows ?? []) as unknown as ShiftRow[]) {
    const key = `${s.employee_id}|${s.schedule_day.date}`;
    const existing = scheduledByEmpDate.get(key);
    if (!existing) {
      scheduledByEmpDate.set(key, { start_time: s.start_time, end_time: s.end_time, weekday: s.schedule_day.weekday });
    } else {
      // Kilka zmian tego dnia (nietypowe dla recepcji) — bierz najwcześniejszy
      // start i najpóźniejszy koniec jako całe okno do porównania.
      existing.start_time = timeToMinutes(s.start_time) < timeToMinutes(existing.start_time) ? s.start_time : existing.start_time;
      existing.end_time = timeToMinutes(s.end_time) > timeToMinutes(existing.end_time) ? s.end_time : existing.end_time;
    }
    if (!scheduledListByEmpDate.has(key)) scheduledListByEmpDate.set(key, []);
    scheduledListByEmpDate.get(key)!.push({ start_time: s.start_time, end_time: s.end_time });
  }
  // Jeden dzień może mieć kilka niezależnych wpisów (podzielona zmiana z
  // przerwą, np. 08:00–10:00 i 15:00–22:00) — stąd mapa na LISTĘ wpisów, a
  // przepracowane godziny to suma wszystkich, nie jedna para start/koniec.
  const entriesByEmpDate = new Map<string, { actual_start: string | null; actual_end: string | null; is_remote: boolean; note: string | null }[]>();
  for (const e of allEntries) {
    const key = `${e.employee_id}|${e.date}`;
    if (!entriesByEmpDate.has(key)) entriesByEmpDate.set(key, []);
    entriesByEmpDate.get(key)!.push(e);
  }
  const todayKey = toDateKey(new Date());

  const prevLink = month === 1 ? `?year=${year - 1}&month=12` : `?year=${year}&month=${month - 1}`;
  const nextLink = month === 12 ? `?year=${year + 1}&month=1` : `?year=${year}&month=${month + 1}`;

  const rows = (employees ?? []).map((emp) => {
    const days = dates.map((date) => {
      const scheduled = scheduledByEmpDate.get(`${emp.id}|${date}`) ?? null;
      const scheduledList = scheduledListByEmpDate.get(`${emp.id}|${date}`) ?? [];
      const dayEntries = (entriesByEmpDate.get(`${emp.id}|${date}`) ?? []).filter(
        (e): e is { actual_start: string; actual_end: string; is_remote: boolean; note: string | null } => Boolean(e.actual_start && e.actual_end)
      );
      const workedHours = dayEntries.reduce((sum, e) => sum + hoursBetween(e.actual_start, e.actual_end), 0);

      // "Brak wpisu godzin" ma sens tylko dla dnia, który już się odbył — dla
      // przyszłych zmian (cały nadchodzący miesiąc na starcie) nikt jeszcze
      // fizycznie nie mógł wpisać rzeczywistych godzin, więc to nie jest brak,
      // tylko naturalny stan rzeczy. Bez tego warunku widok zapełniał się
      // dziesiątkami identycznych, przedwczesnych ostrzeżeń na cały miesiąc.
      //
      // Rozbieżność liczona teraz DOKŁADNIE tą samą regułą co przy samym
      // wpisywaniu godzin (requiresDiscrepancyNote) — każdy wpis osobno,
      // dopasowany do najbliższej zmiany, z marginesem (wcześniej/później) —
      // zamiast osobnej, symetrycznej reguły ±30 min na zbiorczym zakresie,
      // która potrafiła dać INNY wynik niż to, co system faktycznie wymusił
      // przy zapisie (i pokazywał administratorowi mylące "wymaga uwagi" na
      // dzień, który pracownik już wyjaśnił notatką).
      let flag: string | null = null;
      if (scheduled && dayEntries.length === 0 && date < todayKey) {
        flag = "brak wpisu godzin";
      } else if (!scheduled && dayEntries.length > 0 && !dayEntries.every((e) => e.is_remote)) {
        // Dzień bez zmiany w grafiku, ale w całości praca zdalna (zgoda
        // pracownika) — to nie anomalia, tylko normalny, oczekiwany
        // przypadek, więc nie ma po co go flagować.
        flag = "brak w grafiku";
      } else if (scheduled && dayEntries.some((e) => requiresDiscrepancyNote(e.actual_start, e.actual_end, scheduledList))) {
        flag = "odbiega od grafiku";
      }

      return { date, scheduled, dayEntries, workedHours, flag };
    });

    const totalHours = Math.round(days.reduce((sum, d) => sum + d.workedHours, 0) * 100) / 100;
    const wage = Math.round(totalHours * emp.hourly_rate * 100) / 100;
    const flaggedDays = days.filter((d) => d.flag);

    return { emp, days, totalHours, wage, flaggedDays };
  });

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin" label="Panel admina" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Wynagrodzenia</h1>
          <p className="text-sm text-zinc-500">
            Recepcja: {monthLabel(month)} {year} — godziny × stawka, zgodność z grafikiem (margines {EARLY_START_MARGIN_MIN} min
            wcześniej / {LATE_START_MARGIN_MIN} min później na starcie, {LATE_END_MARGIN_MIN} min później na końcu — jak przy
            wpisywaniu godzin).
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/admin/godziny/archiwum" className="rounded-lg px-2 py-1 font-semibold text-zinc-500 hover:bg-zinc-100">
            Archiwum
          </Link>
          <Link href={`/admin/wynagrodzenia${prevLink}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            ← poprzedni
          </Link>
          <Link href={`/admin/wynagrodzenia${nextLink}`} className="rounded-lg px-2 py-1 hover:bg-zinc-100">
            następny →
          </Link>
        </div>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Recepcja</h2>
        {rows.length === 0 && (
          <p className="text-sm text-zinc-400">Brak aktywnych osób z ustawioną stawką godzinową.</p>
        )}
        <div className="flex flex-col gap-4">
          {rows.map(({ emp, totalHours, wage, flaggedDays }) => (
            <div key={emp.id} className="rounded-xl border border-zinc-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold text-zinc-900">
                  <ColorDot color={emp.color_hex} />
                  {emp.name}
                </span>
                <span className="text-sm text-zinc-600">
                  {totalHours}h × {emp.hourly_rate} PLN/h ={" "}
                  <strong className="text-zinc-900">{wage.toFixed(2)} PLN</strong>
                </span>
              </div>
              {flaggedDays.length === 0 ? (
                <p className="mt-2 text-xs text-emerald-600">Zgodne z grafikiem, bez braków.</p>
              ) : (
                // Zwinięte domyślnie — przy kilkunastu dniach do sprawdzenia
                // pełna lista każdego wcześniej zamieniała całą stronę w ścianę
                // tekstu; teraz widać od razu tylko liczbę, a szczegóły na życzenie.
                <details className="group mt-2">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold text-red-600 marker:content-none">
                    <span>
                      ⚠ {flaggedDays.length} {flaggedDays.length === 1 ? "dzień wymaga uwagi" : "dni wymagają uwagi"}
                    </span>
                    <span className="font-normal text-zinc-400 group-open:hidden">— pokaż ▸</span>
                    <span className="hidden font-normal text-zinc-400 group-open:inline">— ukryj ▾</span>
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1 border-t border-zinc-100 pt-2">
                    {flaggedDays.map((d) => {
                      // Notatka, którą pracownik musiał podać przy wpisywaniu
                      // godzin odbiegających od grafiku (patrz godziny/actions.ts)
                      // — dotąd nigdzie tu się nie pokazywała, mimo że cała ta
                      // funkcja istnieje właśnie po to, żeby admin ją zobaczył.
                      const notes = d.dayEntries.map((e) => e.note).filter((n): n is string => Boolean(n?.trim()));
                      return (
                        <li key={d.date} className="text-xs">
                          <span className="font-semibold text-zinc-700">
                            {new Date(d.date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
                            {" "}
                            ({weekdayLabel(d.scheduled?.weekday ?? new Date(d.date + "T00:00:00").getDay()).slice(0, 3)})
                          </span>{" "}
                          — grafik:{" "}
                          {d.scheduled ? `${formatHm(d.scheduled.start_time)}–${formatHm(d.scheduled.end_time)}` : "—"}, rzeczywiste:{" "}
                          {d.dayEntries.length > 0
                            ? d.dayEntries.map((e) => `${e.actual_start.slice(0, 5)}–${e.actual_end.slice(0, 5)}${e.is_remote ? " 🏠 zdalnie" : ""}`).join(", ")
                            : "—"}{" "}
                          <span className="font-bold text-red-600">⚠ {d.flag}</span>
                          {notes.length > 0 ? (
                            <span className="text-zinc-500"> · notatka: {notes.join("; ")}</span>
                          ) : d.flag === "odbiega od grafiku" ? (
                            <span className="font-semibold text-amber-600"> · brak notatki</span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-zinc-900">Instruktorzy</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Wgraj raport frekwencji (.xlsx) — stawka za zajęcia zależy od liczby uczestników.
        </p>
        <InstructorCalculator />
      </Card>
    </div>
  );
}
