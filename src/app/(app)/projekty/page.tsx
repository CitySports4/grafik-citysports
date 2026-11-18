import { redirect } from "next/navigation";

// Przebudowa (migracja 0075, 18.11.2026) — /projekty złączone z
// /marketing/projekty w jedną zakładkę "Wydarzenia i kampanie" pod
// /marketing. Przekierowanie zostaje pod starym adresem, żeby zakładki w
// przeglądarce i stare linki nie lądowały na 404.
export default function LegacyProjektyPage() {
  redirect("/marketing?tab=wydarzenia");
}
