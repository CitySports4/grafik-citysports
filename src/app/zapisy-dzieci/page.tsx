import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import {
  computeCommittedOccupancy,
  computeTrialBookingCounts,
  hasTrialDateCapacity,
  currentSeasonMonthIndex,
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
  const [{ data: groups }, { data: enrollments }, { data: priceTiers }, { data: payments }] = await Promise.all([
    supabase.from("kids_class_group").select("id, weekday, start_time, end_time, label, capacity, active, sort_order").eq("active", true).order("sort_order"),
    supabase.from("kids_class_enrollment").select("id, group_id, registration_id, status, effective_from, effective_until, trial_date"),
    supabase.from("kids_class_price_tier").select("group_count, monthly_fee").order("group_count"),
    supabase.from("kids_class_payment").select("registration_id, months"),
  ]);

  const today = toDateKey(new Date());
  const currentMonthIdx = currentSeasonMonthIndex(today);
  const paymentsByRegistration = new Map((payments ?? []).map((p) => [p.registration_id, p.months as boolean[]]));
  // Miejsce zajęte NA STAŁE (Aktywny + opłacony bieżący miesiąc) liczy się
  // do każdych zajęć tej grupy — brak opłaty zwalnia miejsce (patrz
  // isPaidForMonth); dziecko "na próbnym" (Nowe) zajmuje miejsce TYLKO na
  // swój wybrany termin — inaczej dwoje dzieci próbujących w różnych
  // terminach zamykałoby grupę na cały miesiąc mimo wolnych miejsc na
  // większości terminów (patrz hasTrialDateCapacity w kids-classes.ts).
  const committedOccupancy = computeCommittedOccupancy(enrollments ?? [], paymentsByRegistration, today, currentMonthIdx);
  const trialBookingCounts = computeTrialBookingCounts(enrollments ?? []);

  const groupsWithFreeSpots = ((groups ?? []) as KidsClassGroup[]).map((g) => {
    const freeSpots = Math.max(0, g.capacity - (committedOccupancy.get(g.id) ?? 0));
    const booked = trialBookingCounts.get(g.id);
    return {
      group: g,
      freeSpots,
      trialDates: upcomingSessionDates(g.weekday, today, (date) => hasTrialDateCapacity(g, committedOccupancy, booked?.get(date) ?? 0)),
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
