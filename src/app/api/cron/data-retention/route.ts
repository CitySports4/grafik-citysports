import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { assertCronSecret, getAiNoteAuthorId } from "@/lib/cron-auth";
import { toDateKey } from "@/lib/schedule-month";

// Retencja danych — ustalone z adminem (nie jestem prawnikiem, to
// maksimum ostrożności ustalone w rozmowie, nie oficjalna porada prawna):
//
// - Grafik (schedule_month, kaskadowo schedule_day/schedule_shift/
//   schedule_event i availability_submission/availability_entry) oraz
//   ewidencja godzin (time_entry) to podstawa rozliczenia zlecenia
//   (art. 8b ustawy o minimalnym wynagrodzeniu za pracę — ewidencja
//   godzin zlecenia, plus ogólny ~5-letni okres związany z przedawnieniem
//   zobowiązań podatkowych) — trzymane 5 LAT, nie krócej.
// - Historia sprzątania (cleaning_completion, cleaning_ai_day_choice) —
//   czysto operacyjna, bez znaczenia płacowego (raporty instruktorów są
//   już tylko po stronie przeglądarki — localStorage w
//   InstructorCalculator, więc nie ma tu nic do czyszczenia po stronie
//   serwera) — trzymana 3 MIESIĄCE.
//
// Raz w tygodniu wystarczy (to porządkowanie, nie coś pilnego jak
// hour-anomalies) — patrz vercel.json. Podsumowanie usuniętych wierszy
// trafia jako notatka, żeby zostawić ślad, co i kiedy zniknęło.
export async function GET(request: Request) {
  try {
    assertCronSecret(request);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const now = new Date();

  const cleaningCutoff = new Date(now);
  cleaningCutoff.setMonth(cleaningCutoff.getMonth() - 3);
  const cleaningCutoffKey = toDateKey(cleaningCutoff);

  const wageCutoff = new Date(now);
  wageCutoff.setFullYear(wageCutoff.getFullYear() - 5);
  const wageCutoffKey = toDateKey(wageCutoff);
  const wageCutoffYear = wageCutoff.getFullYear();
  const wageCutoffMonth = wageCutoff.getMonth() + 1;

  const [{ count: completionsDeleted }, { count: aiChoicesDeleted }, { count: timeEntriesDeleted }] = await Promise.all([
    supabase.from("cleaning_completion").delete({ count: "exact" }).lt("date", cleaningCutoffKey),
    supabase.from("cleaning_ai_day_choice").delete({ count: "exact" }).lt("window_start", cleaningCutoffKey),
    supabase.from("time_entry").delete({ count: "exact" }).lt("date", wageCutoffKey),
  ]);

  // schedule_month osobno — samo usunięcie miesiąca kaskaduje (on delete
  // cascade) na schedule_day → schedule_shift/schedule_event oraz na
  // availability_submission → availability_entry, więc jeden delete tutaj
  // czyści cały "grafik" tamtych miesięcy naraz.
  const { data: oldMonths } = await supabase
    .from("schedule_month")
    .select("id")
    .or(`year.lt.${wageCutoffYear},and(year.eq.${wageCutoffYear},month.lt.${wageCutoffMonth})`);

  let monthsDeleted = 0;
  if (oldMonths && oldMonths.length > 0) {
    const { count } = await supabase
      .from("schedule_month")
      .delete({ count: "exact" })
      .in("id", oldMonths.map((m) => m.id));
    monthsDeleted = count ?? 0;
  }

  const totalDeleted = (completionsDeleted ?? 0) + (aiChoicesDeleted ?? 0) + (timeEntriesDeleted ?? 0) + monthsDeleted;
  if (totalDeleted === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const lines = [
    `🧹 Automatyczne czyszczenie danych (retencja):`,
    `- Historia sprzątania starsza niż 3 mies. (przed ${cleaningCutoffKey}): ${completionsDeleted ?? 0} wykonań zadań, ${aiChoicesDeleted ?? 0} wyborów AI dnia.`,
    `- Grafik i ewidencja godzin starsze niż 5 lat (przed ${wageCutoffKey}): ${monthsDeleted} miesięcy grafiku, ${timeEntriesDeleted ?? 0} wpisów godzin.`,
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

  return NextResponse.json({ ok: true, deleted: totalDeleted });
}
