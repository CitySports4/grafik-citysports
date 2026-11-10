import { requireEmployee, canAccessKasa } from "@/lib/session";
import { DocLinkDetail } from "../../DocLinkDetail";

export default async function KasaDokumentPage({ params }: { params: Promise<{ id: string }> }) {
  const employee = await requireEmployee();
  if (!canAccessKasa(employee)) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">Nie masz dostępu do Kasy.</p>
      </div>
    );
  }
  const { id } = await params;
  return <DocLinkDetail id={id} backHref="/kasa" />;
}
