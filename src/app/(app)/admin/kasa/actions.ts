"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { parseExcelExport, type ParsedTransaction } from "@/lib/kasa-import";
import { TX_TYPE_KP, TX_TYPE_KW } from "@/lib/kasa";

export type ImportSummary = {
  rowsInBatch: number;
  imported: number;
  skippedWarnings: number;
  warnings: string[];
  newPaymentForms: string[];
  // Liczba transakcji KW/KP w tej paczce (nie tylko nowo utworzone linki —
  // upsert z ignoreDuplicates nie zwraca, które wiersze faktycznie powstały).
  kwKpInBatch: number;
};

// Import z eksportu Excela eFitness (krok 0 specyfikacji — Data Lake API
// jeszcze bez danych logowania). Wynik zapisujemy w kasa_audit_log (jeden
// wpis na import), bo to prostsza droga niż wątek stanu klienta dla
// formularza z plikiem — strona po prostu czyta ostatni wpis po
// revalidatePath.
export async function importKasaExcel(formData: FormData) {
  const employee = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Wybierz plik eksportu Excela.");

  const buffer = await file.arrayBuffer();
  const { transactions, warnings } = parseExcelExport(buffer);

  const supabase = createServerSupabaseClient();

  const paymentFormNames = [...new Set(transactions.map((t) => t.paymentFormName).filter(Boolean))];
  const { data: existingForms } = await supabase.from("payment_forms_map").select("id, name, category").in("name", paymentFormNames);
  const formByName = new Map((existingForms ?? []).map((f) => [f.name, f]));
  const newPaymentForms = paymentFormNames.filter((n) => !formByName.has(n));
  if (newPaymentForms.length > 0) {
    const { data: inserted, error: insertFormsError } = await supabase
      .from("payment_forms_map")
      .insert(newPaymentForms.map((name) => ({ name, category: "ignore" as const })))
      .select("id, name, category");
    if (insertFormsError) throw new Error(dbErrorMessage(insertFormsError));
    for (const f of inserted ?? []) formByName.set(f.name, f);
  }

  const rows = transactions.map((t: ParsedTransaction) => ({
    source: "excel" as const,
    type: t.type,
    value: t.value,
    payment_form_name: t.paymentFormName,
    payment_form_id: formByName.get(t.paymentFormName)?.id ?? null,
    user_name: t.userName,
    contractor: t.contractor,
    member_ref: t.memberRef,
    description: t.description,
    number: t.number,
    full_number: t.fullNumber,
    transaction_date: t.transactionDate,
    transaction_at: t.transactionAt,
    updated_at: new Date().toISOString(),
  }));

  let imported = 0;
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("efitness_transactions").upsert(batch, { onConflict: "full_number,transaction_date,value" });
    if (error) throw new Error(dbErrorMessage(error));
    imported += batch.length;
  }

  // Dokument KW/KP dostaje status "Do uzupełnienia" od razu po imporcie
  // (pkt 4 spec) — ale tylko dla NOWYCH transakcji (on conflict do nothing),
  // żeby nie nadpisywać już uzupełnionego statusu przy ponownym imporcie.
  const { data: kwKpTx } = await supabase
    .from("efitness_transactions")
    .select("id")
    .in("type", [TX_TYPE_KW, TX_TYPE_KP])
    .in(
      "full_number",
      rows.filter((r) => r.type === TX_TYPE_KW || r.type === TX_TYPE_KP).map((r) => r.full_number)
    );
  const kwKpLinksCreated = kwKpTx?.length ?? 0;
  if (kwKpTx && kwKpTx.length > 0) {
    const { error } = await supabase
      .from("cash_doc_links")
      .upsert(
        kwKpTx.map((t) => ({ transaction_id: t.id })),
        { onConflict: "transaction_id", ignoreDuplicates: true }
      );
    if (error) throw new Error(dbErrorMessage(error));
  }

  const summary: ImportSummary = {
    rowsInBatch: transactions.length + warnings.length,
    imported,
    skippedWarnings: warnings.length,
    warnings: warnings.slice(0, 50).map((w) => `Wiersz ${w.row}: ${w.message}`),
    newPaymentForms,
    kwKpInBatch: kwKpLinksCreated,
  };

  const { error: logError } = await supabase.from("kasa_audit_log").insert({
    employee_id: employee.id,
    action: "import_excel",
    note: JSON.stringify(summary),
  });
  if (logError) throw new Error(dbErrorMessage(logError));

  revalidatePath("/admin/kasa");
}

export async function setPaymentFormCategory(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const category = String(formData.get("category") ?? "");
  if (!["cash", "card", "nonfiscal", "online", "ignore"].includes(category)) throw new Error("Nieprawidłowa kategoria.");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("payment_forms_map").update({ category }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/admin/kasa");
}
