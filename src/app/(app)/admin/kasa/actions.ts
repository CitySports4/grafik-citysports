"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { parseExcelExport, fetchDataLakeTransactions, type ParsedTransaction, type ImportWarning } from "@/lib/kasa-import";
import { classifyTransaction, needsDocLink, defaultDocForClass, type TxClass } from "@/lib/kasa";

export type ImportSummary = {
  rowsInBatch: number;
  imported: number;
  skippedWarnings: number;
  warnings: string[];
  newPaymentForms: string[];
  // Rozbicie wg klasyfikacji (pkt 2a) — ile transakcji w tej paczce trafiło
  // do każdej kategorii, żeby dało się na oko zweryfikować sensowność.
  classCounts: Partial<Record<TxClass, number>>;
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
  const { transactions, warnings: parseWarnings } = parseExcelExport(buffer);
  await runImport(transactions, parseWarnings, employee.id, "import_excel");
  revalidatePath("/admin/kasa");
}

// Import z Data Lake API (krok 1 specyfikacji) — okno UpdatedFrom = ostatni
// import_api − 1 dzień (pkt 1 spec: zmiany/anulacje nadpisują się przez
// upsert po Id, więc 1-dniowy zakład jest bezpieczny), albo start_date z
// kasa_settings jeśli to pierwszy import. Na razie wyzwalane ręcznie
// przyciskiem „Odśwież” (jak w specyfikacji — ma być też cron co 10-15 min,
// to osobny krok: Supabase Edge Function).
export async function importKasaDataLake() {
  const employee = await requireAdmin();
  const supabase = createServerSupabaseClient();

  const { data: lastImport } = await supabase
    .from("kasa_audit_log")
    .select("created_at")
    .eq("action", "import_api")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let updatedFrom: string;
  if (lastImport) {
    const d = new Date(lastImport.created_at);
    d.setDate(d.getDate() - 1);
    updatedFrom = d.toISOString().slice(0, 10);
  } else {
    const { data: settings } = await supabase.from("kasa_settings").select("start_date").eq("id", 1).single();
    updatedFrom = settings?.start_date ?? new Date().toISOString().slice(0, 10);
  }

  const { transactions, warnings: parseWarnings } = await fetchDataLakeTransactions(updatedFrom);
  await runImport(transactions, parseWarnings, employee.id, "import_api");
  revalidatePath("/admin/kasa");
}

// Wspólna ścieżka zapisu do bazy dla obu źródeł (Excel i Data Lake) — patrz
// komentarz w lib/kasa-import.ts, oba produkują ten sam ParsedTransaction.
async function runImport(transactions: ParsedTransaction[], parseWarnings: ImportWarning[], employeeId: string, action: "import_excel" | "import_api") {
  const warnings = [...parseWarnings];

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

  const rows = transactions.map((t, idx) => {
    const txClass = classifyTransaction(t.fullNumber, t.typeLabel);
    // "System niczego nie zgaduje" (pkt 2a) — nieznany Typ albo numer
    // dokumentu bez prefiksu KW/KP trafia do przeglądu, zawsze widocznie.
    if (txClass === "unknown") {
      warnings.push({ row: idx + 2, message: `Nierozpoznana operacja: numer "${t.fullNumber}", Typ "${t.typeLabel}" — do przeglądu` });
    }
    return {
      source: t.source,
      type_label: t.typeLabel,
      tx_class: txClass,
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
    };
  });

  const classCounts: Partial<Record<TxClass, number>> = {};
  for (const r of rows) classCounts[r.tx_class] = (classCounts[r.tx_class] ?? 0) + 1;

  let imported = 0;
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("efitness_transactions").upsert(batch, { onConflict: "full_number,transaction_date,value" });
    if (error) throw new Error(dbErrorMessage(error));
    imported += batch.length;
  }

  // KW/KP (wszystko poza zwykłą sprzedażą, patrz needsDocLink) dostaje
  // wiersz w cash_doc_links z domyślnym statusem wg klasy (pkt 2a) — ale
  // tylko dla NOWYCH transakcji (ignoreDuplicates), żeby nie nadpisywać już
  // uzupełnionego/ręcznie zmienionego statusu przy ponownym imporcie.
  const linkableFullNumbers = [...new Set(rows.filter((r) => needsDocLink(r.tx_class)).map((r) => r.full_number))];
  if (linkableFullNumbers.length > 0) {
    const { data: linkableTx } = await supabase.from("efitness_transactions").select("id, tx_class").in("full_number", linkableFullNumbers);
    if (linkableTx && linkableTx.length > 0) {
      const { error } = await supabase.from("cash_doc_links").upsert(
        linkableTx.map((t) => {
          const { docType, status } = defaultDocForClass(t.tx_class as TxClass);
          return { transaction_id: t.id, doc_type: docType, status };
        }),
        { onConflict: "transaction_id", ignoreDuplicates: true }
      );
      if (error) throw new Error(dbErrorMessage(error));
    }
  }

  const summary: ImportSummary = {
    rowsInBatch: transactions.length + parseWarnings.length,
    imported,
    skippedWarnings: warnings.length,
    warnings: warnings.slice(0, 50).map((w) => `Wiersz ${w.row}: ${w.message}`),
    newPaymentForms,
    classCounts,
  };

  const { error: logError } = await supabase.from("kasa_audit_log").insert({
    employee_id: employeeId,
    action,
    note: JSON.stringify(summary),
  });
  if (logError) throw new Error(dbErrorMessage(logError));

  return summary;
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
