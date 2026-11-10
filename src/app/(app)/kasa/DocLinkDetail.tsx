import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { BackLink } from "@/components/BackLink";
import { DOC_TYPE_LABELS, DOC_TYPE_REQUIRES_ATTACHMENT, DOC_STATUS_LABELS, DOC_STATUS_ICONS, TX_CLASS_LABELS, type DocType, type DocStatus } from "@/lib/kasa";
import { saveDocLink } from "./actions";

const DOC_TYPE_OPTIONS: DocType[] = ["receipt", "ksef_invoice", "foreign_invoice", "awaiting_invoice", "client_correction", "wallet_operation", "other"];

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2.5 text-base outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

function money(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}

// Wspólny widok uzupełnienia jednego KW/KP (pkt 4 spec) pod /kasa i
// /recepcja/kasa — backHref różni się, bo w kiosku nie ma historii.
export async function DocLinkDetail({ id, backHref }: { id: string; backHref: string }) {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("cash_doc_links")
    .select(
      "id, doc_type, status, note, ksef_number, efitness_transactions!inner(full_number, contractor, description, value, tx_class, transaction_date, type_label)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const status = data.status as DocStatus;

  const tx = data.efitness_transactions as unknown as {
    full_number: string;
    contractor: string;
    description: string | null;
    value: number;
    tx_class: keyof typeof TX_CLASS_LABELS;
    transaction_date: string;
    type_label: string;
  };

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={backHref} label="Kasa" />

      <Card>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-zinc-900">{tx.contractor || tx.full_number}</p>
            <p className="text-sm text-zinc-500">{tx.full_number}</p>
          </div>
          <span className={`text-xl font-black ${tx.value < 0 ? "text-red-600" : "text-zinc-900"}`}>{money(Math.abs(tx.value))}</span>
        </div>
        {tx.description && <p className="mt-2 text-sm text-zinc-700">{tx.description}</p>}
        <p className="mt-2 text-xs text-zinc-400">
          {new Date(tx.transaction_date + "T00:00:00").toLocaleDateString("pl-PL")} · {tx.type_label} · {TX_CLASS_LABELS[tx.tx_class]}
        </p>
      </Card>

      <Card>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <span aria-hidden>{DOC_STATUS_ICONS[status]}</span> {DOC_STATUS_LABELS[status]}
        </p>
        <form action={saveDocLink} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={data.id} />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700">Rodzaj dokumentu</label>
            <select name="doc_type" defaultValue={data.doc_type ?? ""} required className={INPUT}>
              <option value="" disabled>
                Wybierz…
              </option>
              {DOC_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPE_LABELS[t]}
                  {DOC_TYPE_REQUIRES_ATTACHMENT[t] ? " (wymaga skanu)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700">Numer faktury (opcjonalnie)</label>
            <input type="text" name="ksef_number" defaultValue={data.ksef_number ?? ""} className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700">Notatka</label>
            <input type="text" name="note" defaultValue={data.note ?? ""} placeholder="np. dostawa, czekamy na FV" className={INPUT} />
          </div>
          <p className="text-xs text-zinc-400">Dodawanie skanu/zdjęcia dojdzie w ekranie hurtowego uzupełniania dokumentów.</p>
          <SubmitButton className="self-start rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
            Zapisz
          </SubmitButton>
        </form>
      </Card>

      <Link href={backHref} className="text-center text-sm font-semibold text-zinc-500 hover:text-zinc-800">
        Gotowe, wróć do Kasy
      </Link>
    </div>
  );
}
