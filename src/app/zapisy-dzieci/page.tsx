import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import {
  computeCommittedOccupancy,
  hasGroupCapacity,
  upcomingSessionDates,
  type KidsClassGroup,
  type PriceTier,
} from "@/lib/kids-classes";
import { SignupForm } from "./SignupForm";

// Jedyna strona w apce bez sesji/ciasteczek (żadnego requireEmployee) —
// bez tego Next.js może ją zbuforować statycznie przy starcie, pokazując
// ten sam wynik każdemu, mimo że liczba wolnych miejsc zmienia się z
// każdym nowym zgłoszeniem.
export const dynamic = "force-dynamic";

export default async function ZapisyDzieciPage() {
  const supabase = createServerSupabaseClient();
  const [{ data: groups }, { data: enrollments }, { data: priceTiers }] = await Promise.all([
    supabase.from("kids_class_group").select("id, weekday, start_time, end_time, label, capacity, active, sort_order").eq("active", true).order("sort_order"),
    supabase.from("kids_class_enrollment").select("id, group_id, status, effective_from, effective_until"),
    supabase.from("kids_class_price_tier").select("group_count, monthly_fee").order("group_count"),
  ]);

  const today = toDateKey(new Date());
  // Zapisanie się choćby na próbne zajmuje miejsce w grupie OD RAZU, aż do
  // jawnej rezygnacji (patrz computeCommittedOccupancy w kids-classes.ts) —
  // jeden wspólny limit na grupę, nie osobny per termin próbnych.
  const committedOccupancy = computeCommittedOccupancy(enrollments ?? [], today);

  const groupsWithFreeSpots = ((groups ?? []) as KidsClassGroup[]).map((g) => {
    const freeSpots = Math.max(0, g.capacity - (committedOccupancy.get(g.id) ?? 0));
    const hasCapacity = hasGroupCapacity(g, committedOccupancy);
    const trialDates = hasCapacity ? upcomingSessionDates(g.weekday, today) : [];
    // upcomingSessionDates cicho przeskakuje na KOLEJNY miesiąc, gdy w tym
    // nic już nie zostało (patrz komentarz w kids-classes.ts) — po samej
    // liście dat nie da się tego odróżnić od "są jeszcze terminy w tym
    // miesiącu", a formularz (SignupForm) musi to rozróżnić, żeby
    // zaproponować rodzicowi świadomy wybór zamiast cichego przełożenia.
    const thisMonthExhausted = trialDates.length > 0 && trialDates[0].slice(0, 7) !== today.slice(0, 7);
    return {
      group: g,
      freeSpots,
      trialDates,
      thisMonthExhausted,
    };
  });

  return (
    // Bez pionowego wyśrodkowania (min-h-screen + items-center) celowo —
    // strona jest osadzana w <iframe> o stałej, dużej wysokości (WordPress),
    // gdzie wyśrodkowanie w całej wysokości ekranu zostawia puste miejsce
    // u góry/dołu zamiast zacząć treść od góry.
    <main className="min-h-screen bg-zinc-50 p-4 py-10">
      <SignupForm groups={groupsWithFreeSpots} priceTiers={(priceTiers ?? []) as PriceTier[]} />
    </main>
  );
}
