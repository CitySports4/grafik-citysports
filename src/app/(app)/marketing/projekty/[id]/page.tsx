import { redirect } from "next/navigation";

// Przebudowa (migracja 0075, 18.11.2026) — tablica projektu żyje teraz pod
// /marketing/wydarzenia/[id], ten sam id.
export default async function LegacyMarketingProjektyIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/marketing/wydarzenia/${id}`);
}
