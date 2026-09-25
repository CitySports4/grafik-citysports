import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import { computeGroupOccupancy, type KidsClassGroup, type Enrollment } from "@/lib/kids-classes";
import { SignupForm } from "./SignupForm";

export default async function ZapisyDzieciPage() {
  const supabase = createServerSupabaseClient();
  const [{ data: groups }, { data: enrollments }] = await Promise.all([
    supabase.from("kids_class_group").select("id, weekday, start_time, end_time, label, capacity, active, sort_order").eq("active", true).order("sort_order"),
    supabase.from("kids_class_enrollment").select("id, group_id, status, effective_from, effective_until"),
  ]);

  const today = toDateKey(new Date());
  const occupancy = computeGroupOccupancy((enrollments ?? []) as Enrollment[], today);
  const groupsWithFreeSpots = ((groups ?? []) as KidsClassGroup[]).map((g) => ({
    group: g,
    freeSpots: Math.max(0, g.capacity - (occupancy.get(g.id) ?? 0)),
  }));

  return (
    // Bez pionowego wyśrodkowania (min-h-screen + items-center) celowo —
    // strona jest osadzana w <iframe> o stałej, dużej wysokości (WordPress),
    // gdzie wyśrodkowanie w całej wysokości ekranu zostawia puste miejsce
    // u góry/dołu zamiast zacząć treść od góry.
    <main className="min-h-screen bg-zinc-50 p-4 py-10">
      <SignupForm groups={groupsWithFreeSpots} />
    </main>
  );
}
