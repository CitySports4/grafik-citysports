import { DocLinkDetail } from "@/app/(app)/kasa/DocLinkDetail";

// Bramka PIN-em już w /recepcja/layout.tsx.
export default async function RecepcjaKasaDokumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocLinkDetail id={id} backHref="/recepcja/kasa" />;
}
