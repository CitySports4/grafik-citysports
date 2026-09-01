import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { assertCronSecret, getAiNoteAuthorId } from "@/lib/cron-auth";
import { toDateKey } from "@/lib/schedule-month";

// Retencja danych — ustalone z adminem (nie jestem prawnikiem, to
// maksimum ostrożności ustalone w rozmowie, nie oficjalna porada prawna):
//
// - Ewidencja godzin (time_entry) to podstawa rozliczenia zlecenia (art. 8b
//   ustawy o minimalnym wynagrodzeniu za pracę + ogólny ~5-letni okres
//   związany z przedawnieniem zobowiązań podatkowych) — musi przeżyć 5 LAT.
//   Ale nie musi cały czas siedzieć w "gorącej" tabeli przeglądanej przy
//   KAŻDYM wejściu w /grafik i /godziny — po 3 miesiącach wpis przenosi się
//   do time_entry_archive (osobna, przeszukiwalna po miesiącu strona w
//   panelu admina, patrz /admin/godziny/archiwum), a dopiero po kolejnych
//   latach — łącznie 5 lat od `date` — znika z archiwum na zawsze.
// - Grafik (schedule_month, kaskadowo schedule_day/schedule_shift/
//   schedule_event i availability_submission/availability_entry) — bez
//   osobnego archiwum (to nie jest ewidencja płacowa sama w sobie), usuwany
//   wprost po 5 latach.
// - Historia sprzątania (cleaning_completion, cleaning_ai_day_choice) —
//   czysto operacyjna, bez znaczenia płacowego (raporty instruktorów są
//   już tylko po stronie przeglądarki — localStorage w
//   InstructorCalculator, więc nie ma tu nic do czyszczenia po stronie
//   serwera) — usuwana wprost po 3 MIESIĄCACH, bez archiwum.
//
// Raz w tygodniu wystarczy (to porządkowanie, nie coś pilnego jak
// hour-anomalies) — patrz vercel.json. Podsumowanie trafia jako notatka,
// żeby zostawić ślad, co i kiedy się przesunęło/zniknęło.
export async function GET(request: Request) {
  try {
    assertCronSecret(request);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();

  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthsAgoKey = toDateKey(threeMonthsAgo);

  const fiveYearsAgo = new Date(now);
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const fiveYearsAgoKey = toDateKey(fiveYearsAgo);
  const fiveYearsAgoYear = fiveYearsAgo.getFullYear();
  const fiveYearsAgoMonth = fiveYearsAgo.getMonth() + 1;

  const [{ count: completionsDeleted }, { count: aiChoicesDeleted }] = await Promise.all([
    supabase.from("cleaning_completion").delete({ count: "exact" }).lt("date", threeMonthsAgoKey),
    supabase.from("cleaning_ai_day_choice").delete({ count: "exact" }).lt("window_start", threeMonthsAgoKey),
  ]);

  // Ewidencja godzin starsza niż 3 mies.: przenosimy do archiwum (insert,
  // potem dopiero usuwamy z "gorącej" tabeli) zamiast od razu kasować —
  // upsert po id, żeby ewentualne ponowne odpalenie tego samego przebiegu
  // (np. po błędzie w połowie) nie duplikowało wierszy.
  const { data: toArchive } = await supabase
    .from("time_entry")
    .select("id, employee_id, date, actual_start, actual_end, note, is_remote")
    .lt("date", threeMonthsAgoKey);

  let archivedCount = 0;
  if (toArchive && toArchive.length > 0) {
    const { error: archiveError } = await supabase.from("time_entry_archive").upsert(
      toArchive.map((e) => ({
        id: e.id,
        employee_id: e.employee_id,
        date: e.date,
        actual_start: e.actual_start,
        actual_end: e.actual_end,
        note: e.note,
        is_remote: e.is_remote,
      })),
      { onConflict: "id" }
    );
    if (archiveError) {
      return NextResponse.json({ error: archiveError.message }, { status: 500 });
    }
    const { count } = await supabase
      .from("time_entry")
      .delete({ count: "exact" })
      .in("id", toArchive.map((e) => e.id));
    archivedCount = count ?? 0;
  }

  // Z archiwum wpisy znikają na zawsze dopiero po pełnych 5 latach od daty.
  const { count: archivePurged } = await supabase.from("time_entry_archive").delete({ count: "exact" }).lt("date", fiveYearsAgoKey);

  // schedule_month osobno — samo usunięcie miesiąca kaskaduje (on delete
  // cascade) na schedule_day → schedule_shift/schedule_event oraz na
  // availability_submission → availability_entry, więc jeden delete tutaj
  // czyści cały "grafik" tamtych miesięcy naraz.
  const { data: oldMonths } = await supabase
    .from("schedule_month")
    .select("id")
    .or(`year.lt.${fiveYearsAgoYear},and(year.eq.${fiveYearsAgoYear},month.lt.${fiveYearsAgoMonth})`);

  let monthsDeleted = 0;
  if (oldMonths && oldMonths.length > 0) {
    const { count } = await supabase
      .from("schedule_month")
      .delete({ count: "exact" })
      .in("id", oldMonths.map((m) => m.id));
    monthsDeleted = count ?? 0;
  }

  const totalChanged =
    (completionsDeleted ?? 0) + (aiChoicesDeleted ?? 0) + archivedCount + (archivePurged ?? 0) + monthsDeleted;
  if (totalChanged === 0) {
    return NextResponse.json({ ok: true, changed: 0 });
  }

  const lines = [
    `🧹 Automatyczne czyszczenie/archiwizacja danych (retencja):`,
    `- Historia sprzątania starsza niż 3 mies. (przed ${threeMonthsAgoKey}) — usunięta: ${completionsDeleted ?? 0} wykonań zadań, ${aiChoicesDeleted ?? 0} wyborów AI dnia.`,
    `- Ewidencja godzin starsza niż 3 mies. — przeniesiona do archiwum: ${archivedCount} wpisów.`,
    `- Ewidencja godzin starsza niż 5 lat (przed ${fiveYearsAgoKey}) — usunięta trwale z archiwum: ${archivePurged ?? 0} wpisów.`,
    `- Grafik starszy niż 5 lat — usunięty: ${monthsDeleted} miesięcy.`,
  ];

  const authorId = await getAiNoteAuthorId(supabase);
  const { error } = await supabase.from("note").insert({
    author_employee_id: authorId,
    title: "🧹 Czyszczenie danych — cotygodniowa retencja",
    body: lines.join("\n"),
    status: "done",
    source: "ai",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, changed: totalChanged });
}
