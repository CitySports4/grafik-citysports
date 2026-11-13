import Link from "next/link";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import type { SessionEmployee } from "@/lib/session";
import { CASH_COUNT_SLOT_LABELS, CASH_COUNT_SLOT_ORDER, DOC_STATUS_ICONS, DOC_STATUS_LABELS, expectedCashBalance, type CashCountSlot } from "@/lib/kasa";
import { getCashDay, getDayTransactions, computeDayTotals, getDayCounts, getDayDocLinks, getEmployeesOnShift, resolveOpeningBalance, type CashCount } from "./data";
import { saveCashCount, closeCashDay } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2.5 text-base outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";

function money(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}

// Tailwind "capitalize" wielkie litery daje KAŻDEMU słowu ("5 Listopada"),
// co po polsku jest błędne — tylko pierwsza litera całego ciągu.
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dayLink(basePath: string, date: string): string {
  return `${basePath}?date=${date}`;
}

export async function CashDayScreen({
  date,
  basePath,
  historiaHref,
  employee,
}: {
  date: string;
  basePath: string;
  historiaHref?: string;
  employee: SessionEmployee | null;
}) {
  const day = await getCashDay(date);
  const [transactions, counts, docLinks, shiftEmployees] = await Promise.all([
    getDayTransactions(date),
    getDayCounts(day?.id ?? null),
    getDayDocLinks(date),
    employee ? Promise.resolve([]) : getEmployeesOnShift(date),
  ]);
  const totals = computeDayTotals(transactions);
  const openingBalance = day?.opening_balance ?? (await resolveOpeningBalance(date));
  const countsBySlot = new Map(counts.map((c) => [c.slot, c]));
  const closeCounted = countsBySlot.get("close");
  const isClosed = day?.status === "closed";

  // Ile ma być TERAZ w kasetce, zanim ktokolwiek policzy — recepcja ma to
  // widzieć PRZED wpisaniem swojej kwoty (nie dopiero po zapisaniu), żeby
  // liczenie było sprawdzeniem, nie zgadywaniem. "open": samo saldo otwarcia
  // (żadny ruch dnia jeszcze nie wchodzi, zgodnie z saveCashCount). "shift":
  // saldo otwarcia + ruchy dnia do tej pory (bez kaucji — te rozdzielamy
  // tylko przy "close", gdy znamy sumę z terminala). "close": NIE da się
  // policzyć z góry, bo wzór potrzebuje terminal_total, który recepcja
  // dopiero wpisuje w tym samym formularzu — zostaje ujawniane po zapisie.
  const expectedShift = expectedCashBalance({ openingBalance, cashFiscal: totals.cashFiscal, depositsCash: 0, kp: totals.manualKp, kw: totals.kw });
  const expectedBySlot: Record<CashCountSlot, number | null> = { open: openingBalance, shift: expectedShift, close: null };

  const stanKasy = closeCounted ? closeCounted.counted : expectedShift;

  const prevDate = shiftDate(date, -1);
  const nextDate = shiftDate(date, 1);
  const dateLabel = capitalizeFirst(
    new Date(date + "T00:00:00").toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={dayLink(basePath, prevDate)} className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">
            ←
          </Link>
          <div>
            <p className="text-base font-bold text-zinc-900">{dateLabel}</p>
            {isClosed && day?.rd_number && <p className="text-xs font-semibold text-zinc-500">RD {day.rd_number} — zamknięty</p>}
          </div>
          <Link href={dayLink(basePath, nextDate)} className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100">
            →
          </Link>
        </div>
        {historiaHref && (
          <Link href={historiaHref} className="text-sm font-semibold text-zinc-500 hover:text-zinc-800">
            Historia →
          </Link>
        )}
      </div>

      <Card className="bg-zinc-900">
        <p className="text-sm font-semibold text-zinc-400">Stan kasy {isClosed ? "(policzony)" : "(wyliczony)"}</p>
        <p className="mt-1 text-4xl font-black tracking-tight text-white">{money(stanKasy)}</p>
      </Card>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {[
          { label: "Gotówka dziś", value: totals.cashFiscal },
          { label: "Karta dziś", value: totals.card },
          { label: "Kaucje dziś", value: totals.nonfiscal },
          { label: "KW dziś", value: totals.kw },
          { label: "KP dziś", value: totals.manualKp },
        ].map((t) => (
          <Card key={t.label} className="bg-zinc-50 !p-3">
            <p className="text-xs font-semibold text-zinc-500">{t.label}</p>
            <p className="mt-0.5 text-lg font-bold text-zinc-900">{money(t.value)}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {CASH_COUNT_SLOT_ORDER.map((slot) => (
          <CountCard
            key={slot}
            slot={slot}
            date={date}
            count={countsBySlot.get(slot)}
            expected={expectedBySlot[slot]}
            isClosed={isClosed}
            employee={employee}
            shiftEmployees={shiftEmployees}
          />
        ))}
      </div>

      <Card>
        <h2 className="mb-1 font-semibold text-zinc-900">
          KW / KP dziś <span className="font-normal text-zinc-400">({docLinks.length})</span>
        </h2>
        {docLinks.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak KW/KP dzisiaj.</p>
        ) : (
          <div className="mt-2 flex flex-col divide-y divide-zinc-100">
            {docLinks.map((d) => (
              <Link key={d.id} href={`${basePath === "/recepcja/kasa" ? "/recepcja/kasa" : "/kasa"}/dokument/${d.id}`} className="flex items-center gap-3 py-2.5 hover:bg-zinc-50">
                <span className="text-lg" aria-hidden>
                  {DOC_STATUS_ICONS[d.status]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900">{d.contractor || d.full_number}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {d.full_number}
                    {d.description ? ` · ${d.description}` : ""} · {DOC_STATUS_LABELS[d.status]}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-bold ${d.value < 0 ? "text-red-600" : "text-zinc-900"}`}>{money(Math.abs(d.value))}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {isClosed ? (
        <Card className="bg-emerald-50 text-center">
          <p className="font-semibold text-emerald-700">Dzień zamknięty — RD {day?.rd_number}</p>
        </Card>
      ) : closeCounted ? (
        <form action={closeCashDay}>
          <input type="hidden" name="date" value={date} />
          {!employee && <EmployeePicker shiftEmployees={shiftEmployees} />}
          <SubmitButton className="w-full rounded-xl bg-brand-orange px-4 py-3 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
            Zamknij dzień
          </SubmitButton>
        </form>
      ) : (
        <p className="text-center text-sm text-zinc-400">Zapisz liczenie na zamknięcie, żeby móc zamknąć dzień.</p>
      )}
    </div>
  );
}

function EmployeePicker({ shiftEmployees }: { shiftEmployees: { id: string; name: string }[] }) {
  return (
    <select name="employee_id" required defaultValue="" className={`${INPUT} mb-2`}>
      <option value="" disabled>
        Kto liczy?
      </option>
      {shiftEmployees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  );
}

function CountCard({
  slot,
  date,
  count,
  expected,
  isClosed,
  employee,
  shiftEmployees,
}: {
  slot: CashCountSlot;
  date: string;
  count: CashCount | undefined;
  expected: number | null;
  isClosed: boolean;
  employee: SessionEmployee | null;
  shiftEmployees: { id: string; name: string }[];
}) {
  if (count) {
    const ok = count.difference === 0;
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={LABEL}>{CASH_COUNT_SLOT_LABELS[slot]}</p>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {ok ? "zgadza się" : `różnica ${count.difference > 0 ? "+" : ""}${money(count.difference)}`}
          </span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          policzono <span className="font-semibold text-zinc-900">{money(count.counted)}</span> · oczekiwano{" "}
          <span className="font-semibold text-zinc-900">{money(count.expected)}</span>
        </p>
        {count.explanation && <p className="mt-1 text-sm text-zinc-700">„{count.explanation}”</p>}
      </Card>
    );
  }

  if (isClosed) return null;

  return (
    <Card>
      <p className={`${LABEL} mb-2`}>{CASH_COUNT_SLOT_LABELS[slot]}</p>
      {expected !== null && (
        <div className="mb-2.5 rounded-xl bg-blue-50 px-3.5 py-2.5 text-center">
          <p className="text-xs font-semibold text-brand-blue">Powinno być teraz w kasetce</p>
          <p className="text-xl font-black text-brand-navy">{money(expected)}</p>
        </div>
      )}
      <form action={saveCashCount} className="flex flex-col gap-2.5">
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="slot" value={slot} />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-700">Gotówka w szufladzie</label>
          <p className="text-xs text-zinc-400">Policz fizycznie banknoty i monety w kasie, i wpisz ile faktycznie naliczyłaś/eś.</p>
          <input type="number" step="0.01" name="counted" required inputMode="decimal" className={INPUT} />
        </div>
        {slot === "close" && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700">Suma z wydruku terminala</label>
              <p className="text-xs text-zinc-400">
                Kwota &quot;SUMA&quot; z raportu dobowego terminala płatniczego (wszystkie płatności kartą dziś, łącznie z kaucjami za butelki płaconymi
                kartą).
              </p>
              <input type="number" step="0.01" name="terminal_total" required inputMode="decimal" className={INPUT} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700">Suma z raportu fiskalnego dobowego (opcjonalnie)</label>
              <p className="text-xs text-zinc-400">Kwota sprzedaży z wydruku dobowego z kasy fiskalnej (FAWAG BOX) — do porównania z systemem.</p>
              <input type="number" step="0.01" name="fiscal_daily_total" inputMode="decimal" className={INPUT} />
            </div>
          </>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-zinc-700">Wyjaśnienie</label>
          <p className="text-xs text-zinc-400">Tylko jeśli policzona kwota nie zgadza się z oczekiwaną — inaczej zostaw puste.</p>
          <input type="text" name="explanation" placeholder="np. KW czeka na wpis w eFitness" className={INPUT} />
        </div>
        {!employee && <EmployeePicker shiftEmployees={shiftEmployees} />}
        <SubmitButton className="self-start rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
          Zapisz
        </SubmitButton>
      </form>
    </Card>
  );
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
