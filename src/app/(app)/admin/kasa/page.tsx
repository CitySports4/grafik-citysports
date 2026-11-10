import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { BackLink } from "@/components/BackLink";
import { importKasaExcel, setPaymentFormCategory, type ImportSummary } from "./actions";

const CATEGORY_LABELS: Record<string, string> = {
  cash: "Gotówka",
  card: "Karta",
  nonfiscal: "Niefiskalna (kaucje)",
  online: "Online",
  ignore: "Pomijane w kasie",
};
const CATEGORY_OPTIONS = ["cash", "card", "nonfiscal", "online", "ignore"];

// Ekran importu z Excela (krok 0 specyfikacji v1) — zostaje na stałe jako
// plan awaryjny, gdyby Data Lake API kiedyś nie działało (patrz pkt 8.0
// SPEC_kasa_v1.md). Wynik ostatniego importu czytamy z kasa_audit_log
// (patrz importKasaExcel w actions.ts).
export default async function KasaImportPage() {
  await requireAdmin();

  const supabase = createServerSupabaseClient();
  const [{ data: lastImportRaw }, { data: paymentForms }, { data: txStats }] = await Promise.all([
    supabase.from("kasa_audit_log").select("note, created_at").eq("action", "import_excel").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("payment_forms_map").select("id, name, category").order("name"),
    supabase.from("efitness_transactions").select("transaction_date").order("transaction_date", { ascending: true }).limit(1),
  ]);

  let lastImport: ImportSummary | null = null;
  try {
    lastImport = lastImportRaw ? (JSON.parse(lastImportRaw.note) as ImportSummary) : null;
  } catch {
    lastImport = null;
  }

  const { count: totalCount } = await supabase.from("efitness_transactions").select("id", { count: "exact", head: true });
  const earliestDate = txStats?.[0]?.transaction_date ?? null;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin" label="Panel admina" />

      <div>
        <h1 className="text-lg font-bold text-zinc-900">Kasa — import z eFitness</h1>
        <p className="text-sm text-zinc-500">
          Dane logowania do eFitness Data Lake API jeszcze nie przyszły — na razie import ręczny z eksportu Excela (eFitness → Sprzedaż → Kasa → zakres
          dat → „Eksport do Excela”).
        </p>
      </div>

      <Card>
        <h2 className="mb-1 font-semibold text-zinc-900">Wgraj eksport</h2>
        <p className="mb-3 text-sm text-zinc-500">Upsert po numerze dokumentu + dacie + kwocie — ponowny import tego samego pliku jest bezpieczny.</p>
        <form action={importKasaExcel} className="flex flex-wrap items-center gap-2">
          <input type="file" name="file" accept=".xlsx,.xls" required className="flex-1 text-sm" />
          <SubmitButton className="shrink-0 rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
            Importuj
          </SubmitButton>
        </form>
        <p className="mt-3 text-xs text-zinc-500">
          W bazie: <span className="font-semibold text-zinc-700">{totalCount ?? 0}</span> transakcji
          {earliestDate && (
            <>
              {" "}
              od <span className="font-semibold text-zinc-700">{new Date(earliestDate + "T00:00:00").toLocaleDateString("pl-PL")}</span>
            </>
          )}
          .
        </p>
      </Card>

      {lastImport && (
        <Card>
          <h2 className="mb-3 font-semibold text-zinc-900">Ostatni import</h2>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-zinc-50 p-2.5 text-center">
              <p className="text-xl font-bold text-zinc-900">{lastImport.imported}</p>
              <p className="text-xs text-zinc-500">zaimportowano</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-2.5 text-center">
              <p className="text-xl font-bold text-zinc-900">{lastImport.kwKpInBatch}</p>
              <p className="text-xs text-zinc-500">KW/KP w paczce</p>
            </div>
            <div className={`rounded-lg p-2.5 text-center ${lastImport.skippedWarnings > 0 ? "bg-amber-50" : "bg-zinc-50"}`}>
              <p className={`text-xl font-bold ${lastImport.skippedWarnings > 0 ? "text-amber-700" : "text-zinc-900"}`}>{lastImport.skippedWarnings}</p>
              <p className="text-xs text-zinc-500">ostrzeżeń / pominięto</p>
            </div>
            <div className={`rounded-lg p-2.5 text-center ${lastImport.newPaymentForms.length > 0 ? "bg-amber-50" : "bg-zinc-50"}`}>
              <p className={`text-xl font-bold ${lastImport.newPaymentForms.length > 0 ? "text-amber-700" : "text-zinc-900"}`}>
                {lastImport.newPaymentForms.length}
              </p>
              <p className="text-xs text-zinc-500">nowe formy płatności</p>
            </div>
          </div>
          {lastImport.newPaymentForms.length > 0 && (
            <p className="mb-2 text-sm text-amber-700">
              Nowe formy płatności (ustaw kategorię niżej): <span className="font-semibold">{lastImport.newPaymentForms.join(", ")}</span>
            </p>
          )}
          {lastImport.warnings.length > 0 && (
            <details className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-amber-700 marker:content-none">
                Ostrzeżenia ({lastImport.skippedWarnings}
                {lastImport.warnings.length < lastImport.skippedWarnings ? `, pokazano ${lastImport.warnings.length}` : ""}) ▾
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-amber-800">
                {lastImport.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      <Card>
        <h2 className="mb-1 font-semibold text-zinc-900">Formy płatności → kategoria kasowa</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Decyduje, co liczy się jako gotówka fiskalna / karta / niefiskalne (kaucje) / online / pomijane. Nierozpoznane formy wpadają tu automatycznie
          jako „Pomijane” przy imporcie.
        </p>
        <div className="flex flex-col gap-1.5">
          {(paymentForms ?? []).map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-1.5 text-sm">
              <span className="font-semibold text-zinc-900">{f.name}</span>
              <form action={setPaymentFormCategory} className="flex items-center gap-2">
                <input type="hidden" name="id" value={f.id} />
                <select name="category" defaultValue={f.category} className="rounded-lg border border-zinc-300 px-2 py-1 text-xs">
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <SubmitButton className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
                  Zapisz
                </SubmitButton>
              </form>
            </div>
          ))}
          {(paymentForms ?? []).length === 0 && <p className="text-sm text-zinc-400">Brak form płatności — zaimportuj dane.</p>}
        </div>
      </Card>
    </div>
  );
}
