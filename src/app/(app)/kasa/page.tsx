import Link from "next/link";
import { requireEmployee, canAccessKasa } from "@/lib/session";
import { Card } from "@/components/Card";
import { Banner } from "@/components/Banner";
import { SubmitButton } from "@/components/SubmitButton";
import {
  CASH_COUNT_SLOT_ORDER,
  CASH_COUNT_SLOT_LABELS,
  CASH_INCOME_WINDOW_ORDER,
  CASH_INCOME_WINDOW_LABELS,
  CASH_DAY_STATUS_LABELS,
  ATTACHMENT_KIND_LABELS,
} from "@/lib/kasa";
import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import { getOrCreateCashDay, getCashDayDetails, getDocumentAttachments, getEmployeesOnShift, computeExpected, today } from "./data";
import { saveCashCount, saveIncomeEntry, updateExplanation, deleteCashDocument } from "./actions";
import { AddDocumentButton } from "./AddDocumentButton";
import { DayAttachmentUpload } from "./DayAttachmentUpload";
import { CloseDayButton } from "./CloseDayButton";

const INPUT = "w-full rounded-lg border-[1.5px] border-zinc-300 px-2.5 py-1.5 text-sm";
const LABEL = "text-xs font-semibold text-zinc-600";

export default async function KasaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const employee = await requireEmployee();
  if (!canAccessKasa(employee)) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">Nie masz dostępu do Kasy.</p>
      </div>
    );
  }
  const isAdmin = employee.roles.includes("admin");

  const params = await searchParams;
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today();
  const prevDate = toDateKey(new Date(new Date(date + "T00:00:00").getTime() - 86400000));
  const nextDate = toDateKey(new Date(new Date(date + "T00:00:00").getTime() + 86400000));

  const day = await getOrCreateCashDay(date);
  const [{ counts, incomeEntries, documents, dayAttachments }, employeesOnShift, { data: categoriesRaw }] = await Promise.all([
    getCashDayDetails(day.id),
    getEmployeesOnShift(date),
    createServerSupabaseClient().from("kasa_category").select("name").eq("active", true).order("sort_order"),
  ]);
  const documentAttachments = await getDocumentAttachments(documents.map((d) => d.id));
  const categories = (categoriesRaw ?? []).map((c) => c.name);

  const countBySlot = new Map(counts.map((c) => [c.slot, c]));
  const incomeByWindow = new Map(incomeEntries.map((e) => [e.time_window, e]));
  const expected = computeExpected(day, incomeEntries, documents);
  const isOpen = day.status === "open";
  const countedClosing = countBySlot.get("zamkniecie")?.counted_amount ?? null;
  const difference = countedClosing !== null ? Math.round((countedClosing - expected) * 100) / 100 : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Kasa — zamknięcie dnia</h1>
        <p className="text-sm text-zinc-500">Zastępuje papierowy raport dobowy — stan kasy, wpływy, KW/KP i załączniki.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/kasa?date=${prevDate}`} className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">
            ← poprzedni dzień
          </Link>
          <span className="text-base font-bold text-zinc-900">
            {new Date(date + "T00:00:00").toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </span>
          <Link href={`/kasa?date=${nextDate}`} className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">
            następny dzień →
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {day.rd_number && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-600">RD {day.rd_number}</span>}
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              day.status === "open" ? "bg-amber-100 text-amber-700" : day.status === "closed" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}
          >
            {CASH_DAY_STATUS_LABELS[day.status]}
          </span>
          <Link href="/kasa/historia" className="text-sm font-semibold text-brand-orange hover:underline">
            Historia →
          </Link>
        </div>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Stan kasy</h2>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className={LABEL}>Otwarcie</p>
            <p className="text-lg font-bold text-zinc-900">{day.opening_balance.toFixed(2)} zł</p>
          </div>
          <div>
            <p className={LABEL}>Oczekiwany stan</p>
            <p className="text-lg font-bold text-zinc-900">{expected.toFixed(2)} zł</p>
          </div>
          <div>
            <p className={LABEL}>Policzono (zamknięcie)</p>
            <p className="text-lg font-bold text-zinc-900">{countedClosing !== null ? `${countedClosing.toFixed(2)} zł` : "—"}</p>
          </div>
          <div>
            <p className={LABEL}>Różnica</p>
            <p className={`text-lg font-bold ${difference === null ? "text-zinc-400" : difference === 0 ? "text-emerald-600" : "text-red-600"}`}>
              {difference !== null ? `${difference > 0 ? "+" : ""}${difference.toFixed(2)} zł` : "—"}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Wpływy gotówką i kartą</h2>
        <div className="flex flex-col gap-2">
          {CASH_INCOME_WINDOW_ORDER.map((w) => {
            const entry = incomeByWindow.get(w);
            return (
              <form key={w} action={saveIncomeEntry} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="cash_day_id" value={day.id} />
                <input type="hidden" name="time_window" value={w} />
                <span className="w-32 shrink-0 text-sm font-semibold text-zinc-700">{CASH_INCOME_WINDOW_LABELS[w]}</span>
                <div className="flex flex-col gap-1">
                  <label className={LABEL}>Gotówka</label>
                  <input type="number" step="0.01" name="cash_amount" defaultValue={entry?.cash_amount ?? ""} disabled={!isOpen} className={`${INPUT} w-[110px]`} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={LABEL}>Karta</label>
                  <input type="number" step="0.01" name="card_amount" defaultValue={entry?.card_amount ?? ""} disabled={!isOpen} className={`${INPUT} w-[110px]`} />
                </div>
                {isOpen && (
                  <SubmitButton className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
                    Zapisz
                  </SubmitButton>
                )}
              </form>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Liczenie gotówki w szufladzie</h2>
        <div className="flex flex-col gap-2">
          {CASH_COUNT_SLOT_ORDER.map((slot) => {
            const c = countBySlot.get(slot);
            return (
              <form key={slot} action={saveCashCount} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="cash_day_id" value={day.id} />
                <input type="hidden" name="slot" value={slot} />
                <span className="w-32 shrink-0 text-sm font-semibold text-zinc-700">{CASH_COUNT_SLOT_LABELS[slot]}</span>
                <div className="flex flex-col gap-1">
                  <label className={LABEL}>Policzyłem/am</label>
                  <input type="number" step="0.01" name="counted_amount" defaultValue={c?.counted_amount ?? ""} required disabled={!isOpen} className={`${INPUT} w-[110px]`} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={LABEL}>Kto liczył (z grafiku)</label>
                  <select name="employee_id" defaultValue={c?.employee_id ?? ""} disabled={!isOpen} className={`${INPUT} w-[160px]`}>
                    <option value="">— wybierz —</option>
                    {employeesOnShift.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>
                {isOpen && (
                  <SubmitButton className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
                    Zapisz
                  </SubmitButton>
                )}
              </form>
            );
          })}
          {employeesOnShift.length === 0 && <p className="text-xs text-zinc-400">Brak zmian w grafiku na ten dzień — nie ma kogo wybrać jako liczącego.</p>}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900">KW / KP</h2>
          {isOpen && (
            <div className="flex gap-2">
              <AddDocumentButton cashDayId={day.id} type="KW" categories={categories} />
              <AddDocumentButton cashDayId={day.id} type="KP" categories={categories} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {documents.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 p-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${d.type === "KW" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
                  {d.type} {d.number}
                </span>
                <span className="font-semibold text-zinc-900">{d.counterparty || "—"}</span>
                {d.source_doc_number && <span className="text-xs text-zinc-500">{d.source_doc_number}</span>}
                {d.category && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">{d.category}</span>}
                {(documentAttachments[d.id] ?? []).map((a) => (
                  <a key={a.id} href={a.drive_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-blue hover:underline">
                    📎 skan
                  </a>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-zinc-900">{d.amount.toFixed(2)} zł</span>
                {isOpen && (
                  <form action={deleteCashDocument}>
                    <input type="hidden" name="id" value={d.id} />
                    <button type="submit" className="text-xs font-semibold text-red-600 hover:underline">
                      Usuń
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
          {documents.length === 0 && <p className="text-sm text-zinc-400">Brak dokumentów tego dnia.</p>}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900">Załączniki dnia</h2>
          {isOpen && <DayAttachmentUpload cashDayId={day.id} />}
        </div>
        <div className="flex flex-col gap-1.5">
          {dayAttachments.map((a) => (
            <a key={a.id} href={a.drive_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-brand-blue hover:underline">
              📎 {ATTACHMENT_KIND_LABELS[a.kind]} — {a.file_name}
            </a>
          ))}
          {dayAttachments.length === 0 && <p className="text-sm text-zinc-400">Brak załączników (wydruk z terminala, potwierdzenia kartowe…).</p>}
        </div>
      </Card>

      {difference !== null && difference !== 0 && (
        <Card className="border-2 border-amber-300">
          <h2 className="mb-1 font-semibold text-zinc-900">Wyjaśnienia</h2>
          <p className="mb-3 text-sm text-amber-700">Jest różnica {difference > 0 ? "+" : ""}{difference.toFixed(2)} zł — wymagane przed zamknięciem dnia.</p>
          <form action={updateExplanation} className="flex flex-col gap-2">
            <input type="hidden" name="cash_day_id" value={day.id} />
            <textarea name="explanation" defaultValue={day.explanation} rows={2} disabled={!isOpen} className={INPUT} placeholder="Co się stało z różnicą…" />
            {isOpen && (
              <SubmitButton className="self-start rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
                Zapisz wyjaśnienie
              </SubmitButton>
            )}
          </form>
        </Card>
      )}

      {isOpen ? (
        <CloseDayButton cashDayId={day.id} />
      ) : (
        <Banner variant="success">
          Dzień zamknięty{day.rd_number ? ` jako RD ${day.rd_number}` : ""}.
          {isAdmin && " Admin może cofnąć zamknięcie w Historii, jeśli trzeba coś poprawić."}
        </Banner>
      )}
    </div>
  );
}
