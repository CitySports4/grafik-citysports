import { redirect } from "next/navigation";

// Przebudowa (migracja 0075, 18.11.2026) — projekty marketingowe złączone z
// /projekty (eventowe) w jedną zakładkę "Wydarzenia i kampanie".
export default function LegacyMarketingProjektyPage() {
  redirect("/marketing?tab=wydarzenia");
}
