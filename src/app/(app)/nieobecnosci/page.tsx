import { redirect } from "next/navigation";

// Nieobecności są teraz zakładką w Dyspozycyjności — stary URL przekierowuje
// tam, żeby nie zepsuć istniejących zakładek/linków.
export default function PlannedAbsencesRedirect() {
  redirect("/dyspozycyjnosc?tab=absences");
}
