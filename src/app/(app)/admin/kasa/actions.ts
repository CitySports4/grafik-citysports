"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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

// Pobranie z Data Lake od ostatniej synchronizacji (okno UpdatedFrom =
// ostatnia synchronizacja − 1 dzień, pkt 1 spec: zmiany/anulacje nadpisują
// się przez upsert po Id, więc 1-dniowy zakład jest bezpieczny; albo
// start_date z kasa_settings, jeśli to pierwsza synchronizacja w ogóle).
// Wspólne dla ręcznego przycisku "Odśwież" (admin, loguje do audytu) i
// cichego auto-odświeżenia przy otwarciu ekranu Kasy (patrz
// autoRefreshKasaFromDataLake niżej) — oba mają dokładnie ten sam problem
// "ile wstecz pytać", więc jeden licznik czasu, kasa_settings.last_api_sync_at,
// zamiast kasa_audit_log (który jest śladem RĘCZNYCH akcji, nie stanem
// synchronizacji — employee_id tam jest NOT NULL, auto-odświeżenie nie ma
// naturalnego "kto").
async function fetchDataLakeSinceLastSync() {
  const supabase = createServerSupabaseClient();
  const { data: settings } = await supabase.from("kasa_settings").select("start_date, last_api_sync_at").eq("id", 1).single();

  let updatedFrom: string;
  if (settings?.last_api_sync_at) {
    const d = new Date(settings.last_api_sync_at);
    d.setDate(d.getDate() - 1);
    updatedFrom = d.toISOString().slice(0, 10);
  } else {
    updatedFrom = settings?.start_date ?? new Date().toISOString().slice(0, 10);
  }

  const result = await fetchDataLakeTransactions(updatedFrom);
  const { error } = await supabase.from("kasa_settings").update({ last_api_sync_at: new Date().toISOString() }).eq("id", 1);
  if (error) throw new Error(dbErrorMessage(error));
  return result;
}

// Import z Data Lake API (krok 1 specyfikacji), wyzwalane ręcznie przyciskiem
// „Odśwież” — loguje do kasa_audit_log (podsumowanie widoczne na ekranie).
export async function importKasaDataLake() {
  const employee = await requireAdmin();
  const { transactions, warnings: parseWarnings } = await fetchDataLakeSinceLastSync();
  await runImport(transactions, parseWarnings, employee.id, "import_api");
  revalidatePath("/admin/kasa");
}

// Throttling samo w sobie jest szybkie (jedno zapytanie) — rozbite na
// osobną funkcję, żeby CashDayScreen mógł sprawdzić PRZED renderem, czy
// synchronizacja w ogóle się odbędzie, bez czekania na nią (patrz niżej).
async function shouldSyncKasaFromDataLake(): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data: settings } = await supabase.from("kasa_settings").select("last_api_sync_at").eq("id", 1).maybeSingle();
  if (!settings?.last_api_sync_at) return true;
  return Date.now() - new Date(settings.last_api_sync_at).getTime() >= 2 * 60 * 1000;
}

// Rdzeń synchronizacji z Data Lake, bez throttlingu i bez chowania błędów —
// wspólny dla autoRefreshKasaFromDataLake (chowa błąd, patrz niżej) i crona
// /api/cron/kasa-sync (patrz vercel.json), który celowo NIE chowa błędu: to
// jedyna droga, którą zepsuta synchronizacja (np. brakujące DATALAKE_* w
// środowisku produkcyjnym — tak było naprawdę, odkryte 14.11.2026, zob.
// komentarz w autoRefreshKasaFromDataLake) staje się widoczna — jako
// niepowodzenie zadania w logach Vercel — zamiast cicho stać w miejscu
// tygodniami bez żadnego sygnału.
export async function syncKasaFromDataLake(): Promise<ImportSummary> {
  const { transactions, warnings } = await fetchDataLakeSinceLastSync();
  return runImport(transactions, warnings, null, "import_api");
}

// Ciche auto-odświeżenie przy KAŻDYM otwarciu /kasa i /recepcja/kasa (patrz
// CashDayScreen) — zgodnie ze specyfikacją ("przed każdym liczeniem"), żeby
// recepcja/admin zawsze widzieli świeże dane. Throttling 2 min
// (last_api_sync_at), żeby częste przełączanie zakładek nie odpytywało Data
// Lake bez potrzeby. Sam fetch + upsert (wolna część: zapytanie HTTP + kilka
// round-tripów do bazy) leci w after(), PO wysłaniu odpowiedzi — nie blokuje
// przejścia między dniami. Zwraca, czy synchronizacja faktycznie wystartowała
// (throttling jeszcze nie minął = false), żeby ekran wiedział, czy warto się
// za chwilę samo odświeżyć (patrz RefreshOnMount) — bez tego recepcja widzi
// dane z przed chwili i dowiaduje się o świeższych tylko przy następnym
// przejściu na inny dzień, co zgłoszone 14.11.2026 jako "nie mam aktualnych
// danych". Bez requireAdmin (obie strony i tak już widzą te dane) i bez
// wpisu do kasa_audit_log (nie ma naturalnego "kto", i nie powinno zaśmiecać
// śladu ręcznych akcji przy każdym wejściu na ekran) — podsumowanie zobaczysz
// dopiero po ręcznym "Odśwież" w /admin/kasa. Błąd w tle połknięty celowo:
// zepsuta synchronizacja nie może wywalić ekranu Kasy — ALE to właśnie ta
// cisza sprawiła, że brak DATALAKE_* w środowisku produkcyjnym (Vercel) stał
// w miejscu niezauważony od uruchomienia funkcji aż do 14.11.2026 (last_api_
// sync_at było NULL cały czas — zero udanych synchronizacji na produkcji).
// Dlatego oprócz tej cichej wersji istnieje też /api/cron/kasa-sync (patrz
// vercel.json), który odpala ten sam rdzeń (syncKasaFromDataLake) RAZ DZIENNIE
// (plan Hobby na Vercelu pozwala cronom co najwyżej raz dziennie — częstszy
// harmonogram psuje cały deployment, tak jak się stało 14.11.2026) NIEZALEŻNIE
// od otwartych zakładek i NIE chowa błędu — niepowodzenie zadania crona jest
// widoczne w logach Vercel, więc kolejna taka awaria nie przejdzie bez śladu
// przez tygodnie.
export async function autoRefreshKasaFromDataLake(): Promise<boolean> {
  const willSync = await shouldSyncKasaFromDataLake();
  if (!willSync) return false;
  after(async () => {
    try {
      await syncKasaFromDataLake();
    } catch {
      // patrz komentarz wyżej — celowo ciche.
    }
  });
  return true;
}

// Wspólna ścieżka zapisu do bazy dla obu źródeł (Excel i Data Lake) — patrz
// komentarz w lib/kasa-import.ts, oba produkują ten sam ParsedTransaction.
// employeeId=null (auto-odświeżenie) pomija wpis do kasa_audit_log — patrz
// autoRefreshKasaFromDataLake.
async function runImport(transactions: ParsedTransaction[], parseWarnings: ImportWarning[], employeeId: string | null, action: "import_excel" | "import_api") {
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

  if (employeeId) {
    const { error: logError } = await supabase.from("kasa_audit_log").insert({
      employee_id: employeeId,
      action,
      note: JSON.stringify(summary),
    });
    if (logError) throw new Error(dbErrorMessage(logError));
  }

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
