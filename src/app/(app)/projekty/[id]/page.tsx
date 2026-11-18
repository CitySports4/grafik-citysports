import { redirect } from "next/navigation";

// Przebudowa (migracja 0075, 18.11.2026) — tablica wydarzenia żyje teraz pod
// /marketing/wydarzenia/[id], ten sam id (project_id się nie zmienił).
export default async function LegacyProjektyIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/marketing/wydarzenia/${id}`);
}
