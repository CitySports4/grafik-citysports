import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { toDateKey } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  ageOnDate,
  computeGroupOccupancy,
  groupLabel,
  feeForGroupCount,
  sessionDatesInMonth,
  currentSeasonMonthIndex,
  isStaleNew,
  STATUS_LABELS,
  SEASON_MONTHS,
  OCCUPYING_STATUSES,
  isEnrollmentEffective,
  type KidsClassGroup,
  type KidsClassStatus,
  type PriceTier,
} from "@/lib/kids-classes";
import {
  changeEnrollmentStatus,
  toggleUsedTrial,
  scheduleGroupChange,
  toggleMonthPayment,
  markContacted,
  setPriceTier,
  deletePriceTier,
  toggleAttendance,
  addGroup,
  updateGroup,
  toggleGroupActive,
} from "./actions";
import { FrekwencjaFilters } from "./FrekwencjaFilters";

// Wspólna treść dla dwóch wejść: pełna appka (/zajecia-dzieci, tylko admin)
// i kiosk recepcji (/recepcja/zajecia-dzieci, PIN) — patrz komentarz przy
// canEditGroups. Sama bramka dostępu (requireAdmin / PIN) żyje w dwóch
// osobnych page.tsx, nie tutaj.
const TABS = [
  { key: "frekwencja", label: "Frekwencja" },
  { key: "platnosci", label: "Płatności" },
  { key: "zgloszenia", label: "Zgłoszenia" },
  { key: "oczekujacy", label: "Lista oczekujących" },
  { key: "grupy", label: "Grupy" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const STATUS_PILL: Record<KidsClassStatus, string> = {
  nowe: "bg-blue-50 text-brand-navy",
  aktywny: "bg-emerald-50 text-emerald-700",
  oczekuje: "bg-amber-50 text-amber-700",
  brak_oplaty: "bg-red-50 text-red-700",
  rezygnacja: "bg-zinc-100 text-zinc-500",
};

function statusActions(status: KidsClassStatus): { label: string; next: KidsClassStatus; variant: "green" | "red" }[] {
  if (status === "nowe") {
    return [
      { label: "✅ Opłacono → Aktywny", next: "aktywny", variant: "green" },
      { label: "🚫 Brak opłaty", next: "brak_oplaty", variant: "red" },
    ];
  }
  if (status === "aktywny") {
    return [
      { label: "🚫 Brak opłaty", next: "brak_oplaty", variant: "red" },
      { label: "🚫 Rezygnacja", next: "rezygnacja", variant: "red" },
    ];
  }
  if (status === "oczekuje") {
    return [{ label: "✅ Zaakceptuj → Aktywny", next: "aktywny", variant: "green" }];
  }
  return [{ label: "♻️ Przywróć → Aktywny", next: "aktywny", variant: "green" }];
}

const BTN_GREEN = "rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100";
const BTN_RED = "rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100";
const INPUT_SM = "rounded-lg border-[1.5px] border-zinc-300 px-2 py-1 text-xs";

type EnrollmentRow = {
  id: string;
  group_id: string;
  status: KidsClassStatus;
  created_at: string;
  effective_from: string;
  effective_until: string | null;
  used_trial: boolean;
  paid_trial_fee: boolean;
  needs_parent_contact: boolean;
  kids_class_registration: {
    id: string;
    child_name: string;
    birth_date: string;
    parent_name: string;
    phone: string;
  };
};

function nextMonthFirstDay(todayKey: string): string {
  const d = new Date(todayKey + "T00:00:00");
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return toDateKey(next);
}

export async function KidsClassesContent({
  searchParams,
  basePath,
  canEditGroups,
}: {
  searchParams: Promise<{ tab?: string; frekwencja_grupa?: string; frekwencja_miesiac?: string }>;
  basePath: string;
  // Dzień/godzina/pojemność grup i cennik zmienia tylko admin (przez pełną
  // appkę) — recepcja przez kiosk PIN ma pełny dostęp operacyjny
  // (zgłoszenia, płatności, frekwencja, lista oczekujących, zmiana grupy
  // dziecku), ale nie konfigurację samych grup/cen.
  canEditGroups: boolean;
}) {
  const params = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === params.tab)?.key ?? "frekwencja") as TabKey;
  const today = toDateKey(new Date());

  const supabase = createServerSupabaseClient();
  const [{ data: groupsRaw }, { data: enrollmentsRaw }, { data: paymentsRaw }, { data: priceTiersRaw }] = await Promise.all([
    supabase.from("kids_class_group").select("id, weekday, start_time, end_time, label, capacity, active, sort_order").order("sort_order"),
    supabase
      .from("kids_class_enrollment")
      .select(
        "id, group_id, status, created_at, effective_from, effective_until, used_trial, paid_trial_fee, needs_parent_contact, kids_class_registration(id, child_name, birth_date, parent_name, phone)"
      )
      .order("created_at"),
    supabase.from("kids_class_payment").select("registration_id, months"),
    supabase.from("kids_class_price_tier").select("group_count, monthly_fee").order("group_count"),
  ]);

  const groups = (groupsRaw ?? []) as KidsClassGroup[];
  const activeGroups = groups.filter((g) => g.active);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const enrollments = (enrollmentsRaw ?? []) as unknown as EnrollmentRow[];
  const occupancy = computeGroupOccupancy(enrollments, today);
  const paymentsByRegistration = new Map((paymentsRaw ?? []).map((p) => [p.registration_id, p.months as boolean[]]));
  const priceTiers = (priceTiersRaw ?? []) as PriceTier[];

  const currentEnrollments = enrollments.filter((e) => isEnrollmentEffective(e, today));
  const waiting = currentEnrollments.filter((e) => e.status === "oczekuje");
  const visibleTabs = TABS.filter((t) => t.key !== "grupy" || canEditGroups);

  const needsContact = enrollments.filter((e) => e.needs_parent_contact);
  const staleNew = currentEnrollments.filter((e) => isStaleNew(e.status, e.created_at, today));

  // Zaległość za BIEŻĄCY miesiąc sezonu — poza sezonem (lipiec/sierpień,
  // currentMonthIdx === null) nie ma czego pilnować, zajęć wtedy nie ma.
  const currentMonthIdx = currentSeasonMonthIndex(today);
  const payableChildIds =
    currentMonthIdx === null
      ? []
      : [...new Map(currentEnrollments.filter((e) => OCCUPYING_STATUSES.includes(e.status)).map((e) => [e.kids_class_registration.id, e.kids_class_registration.id])).keys()];
  const unpaidCount =
    currentMonthIdx === null ? 0 : payableChildIds.filter((id) => !(paymentsByRegistration.get(id) ?? [])[currentMonthIdx]).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">🏸 Zajęcia dla dzieci</h1>
          <p className="text-sm text-zinc-500">Zapisy, płatności, frekwencja i listy oczekujących na zajęcia badmintona dla dzieci.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          {needsContact.length > 0 && (
            <Link href={`${basePath}?tab=zgloszenia`} className="rounded-full bg-red-600 px-3 py-1.5 text-white hover:bg-red-700">
              🔔 {needsContact.length} do obdzwonienia
            </Link>
          )}
          {unpaidCount > 0 && (
            <Link href={`${basePath}?tab=platnosci`} className="rounded-full bg-brand-orange px-3 py-1.5 text-white hover:bg-brand-orange-dark">
              ⚠ {unpaidCount} bez opłaty za {SEASON_MONTHS[currentMonthIdx!]}
            </Link>
          )}
          {staleNew.length > 0 && (
            <Link href={`${basePath}?tab=zgloszenia`} className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-800 hover:bg-amber-200">
              ⏳ {staleNew.length} czeka na decyzję
            </Link>
          )}
          {activeGroups.map((g) => {
            const occ = occupancy.get(g.id) ?? 0;
            return (
              <span key={g.id} className={`rounded-full px-3 py-1.5 ${occ >= g.capacity ? "bg-brand-orange text-white" : "bg-zinc-100 text-zinc-700"}`}>
                {groupLabel(g)}: {occ}/{g.capacity}
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-200">
        {visibleTabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "frekwencja" ? basePath : `${basePath}?tab=${t.key}`}
            className={`px-3 py-2 text-sm font-semibold ${
              tab === t.key ? "border-b-2 border-brand-orange text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
            {t.key === "oczekujacy" && waiting.length > 0 && ` (${waiting.length})`}
          </Link>
        ))}
      </div>

      {tab === "zgloszenia" && (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">Dziecko</th>
                <th className="px-4 py-2.5">Wiek</th>
                <th className="px-4 py-2.5">Rodzic</th>
                <th className="px-4 py-2.5">Telefon</th>
                <th className="px-4 py-2.5">Grupa</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">1. wejście</th>
                <th className="px-4 py-2.5">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {enrollments.map((e) => {
                const group = groupById.get(e.group_id);
                const scheduled = e.effective_from > today;
                const target = activeGroups.filter((g) => g.id !== e.group_id);
                const stale = isStaleNew(e.status, e.created_at, today);
                return (
                  <tr key={e.id} className={e.needs_parent_contact ? "bg-red-50" : stale ? "bg-amber-50" : undefined}>
                    <td className="px-4 py-2.5 font-medium text-zinc-900">
                      {e.kids_class_registration.child_name}
                      {e.needs_parent_contact && (
                        <div className="text-[11px] font-bold text-red-600">🔔 awans z rezerwy — zadzwoń</div>
                      )}
                      {stale && <div className="text-[11px] font-bold text-amber-700">⏳ czeka na decyzję</div>}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">{ageOnDate(e.kids_class_registration.birth_date, today)}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{e.kids_class_registration.parent_name}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{e.kids_class_registration.phone}</td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {group ? groupLabel(group) : "?"}
                      {scheduled && <div className="text-[11px] text-amber-600">od {e.effective_from}</div>}
                      {e.effective_until && <div className="text-[11px] text-zinc-400">do {e.effective_until}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_PILL[e.status]}`}>{STATUS_LABELS[e.status]}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <form action={toggleUsedTrial}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="value" value={String(!e.used_trial)} />
                        <button type="submit" className={`h-5 w-5 rounded border-2 ${e.used_trial ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300"}`}>
                          {e.used_trial ? "✓" : ""}
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {e.needs_parent_contact && (
                          <form action={markContacted}>
                            <input type="hidden" name="id" value={e.id} />
                            <button type="submit" className={BTN_GREEN}>
                              ✓ Skontaktowano
                            </button>
                          </form>
                        )}
                        {statusActions(e.status).map((a) => (
                          <form key={a.next + a.label} action={changeEnrollmentStatus}>
                            <input type="hidden" name="id" value={e.id} />
                            <input type="hidden" name="status" value={a.next} />
                            <ConfirmButton
                              confirmText={`Zmienić status dla ${e.kids_class_registration.child_name} na "${STATUS_LABELS[a.next]}"?`}
                              className={a.variant === "green" ? BTN_GREEN : BTN_RED}
                            >
                              {a.label}
                            </ConfirmButton>
                          </form>
                        ))}
                        {target.length > 0 && (
                          <details className="inline-block">
                            <summary className="cursor-pointer rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 [&::-webkit-details-marker]:hidden">
                              🔁 Zmień grupę
                            </summary>
                            <form action={scheduleGroupChange} className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <input type="hidden" name="enrollment_id" value={e.id} />
                              <select name="new_group_id" required className={INPUT_SM} defaultValue="">
                                <option value="" disabled>
                                  nowa grupa…
                                </option>
                                {target.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {groupLabel(g)}
                                  </option>
                                ))}
                              </select>
                              <input type="date" name="effective_from" required defaultValue={nextMonthFirstDay(today)} className={INPUT_SM} />
                              <SubmitButton className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
                                Zaplanuj
                              </SubmitButton>
                            </form>
                          </details>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {enrollments.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-zinc-400">
                    Brak zgłoszeń.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "platnosci" && (
        <div className="flex flex-col gap-4">
          {activeGroups.map((g) => {
            // Dzieci z TEJ grupy — jeśli ktoś chodzi na dwie grupy naraz,
            // pojawia się w obu sekcjach (płaci raz, ale widać go w każdym
            // dniu, na który faktycznie przychodzi).
            const rows = currentEnrollments
              .filter((e) => e.group_id === g.id && OCCUPYING_STATUSES.includes(e.status))
              .slice()
              .sort((a, b) => a.kids_class_registration.child_name.localeCompare(b.kids_class_registration.child_name, "pl"));
            return (
              <Card key={g.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold text-zinc-900">{groupLabel(g)}</h2>
                  <span className="text-xs font-bold text-zinc-500">
                    {rows.length} {rows.length === 1 ? "dziecko" : "dzieci"}
                  </span>
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-zinc-400">Brak dzieci w tej grupie.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="py-1.5 pr-3">Dziecko</th>
                          <th className="py-1.5 pr-3">Łącznie/mies.</th>
                          {SEASON_MONTHS.map((m) => (
                            <th key={m} className="py-1.5 px-1.5 text-center">
                              {m.slice(0, 3)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {rows.map((e) => {
                          const r = e.kids_class_registration;
                          const months = paymentsByRegistration.get(r.id) ?? new Array(SEASON_MONTHS.length).fill(false);
                          // Cena z cennika wg LICZBY grup, do których to
                          // dziecko aktualnie należy — nie tylko z tej
                          // jednej sekcji — bo płatność jest jedna, na całe
                          // dziecko, nie osobno per grupa.
                          const groupCount = currentEnrollments.filter(
                            (oe) => oe.kids_class_registration.id === r.id && OCCUPYING_STATUSES.includes(oe.status)
                          ).length;
                          const fee = feeForGroupCount(priceTiers, groupCount);
                          return (
                            <tr key={e.id}>
                              <td className="py-1.5 pr-3 font-medium text-zinc-900">{r.child_name}</td>
                              <td className="py-1.5 pr-3 text-xs text-zinc-500">{fee !== null ? `${fee} zł` : "brak w cenniku"}</td>
                              {SEASON_MONTHS.map((m, mi) => (
                                <td key={m} className="py-1.5 px-1.5 text-center">
                                  <form action={toggleMonthPayment}>
                                    <input type="hidden" name="registration_id" value={r.id} />
                                    <input type="hidden" name="month_index" value={mi} />
                                    <input type="hidden" name="value" value={String(!months[mi])} />
                                    <button
                                      type="submit"
                                      className={`mx-auto flex h-5 w-5 items-center justify-center rounded border-2 ${
                                        months[mi] ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300"
                                      }`}
                                    >
                                      {months[mi] ? "✓" : ""}
                                    </button>
                                  </form>
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
          {activeGroups.length === 0 && (
            <Card>
              <p className="text-sm text-zinc-400">Brak grup.</p>
            </Card>
          )}
        </div>
      )}

      {tab === "frekwencja" && (
        <FrekwencjaTab
          groups={activeGroups}
          enrollments={currentEnrollments}
          selectedGroupId={params.frekwencja_grupa}
          selectedMonth={params.frekwencja_miesiac}
          today={today}
          basePath={basePath}
        />
      )}

      {tab === "oczekujacy" && (
        <Card>
          <p className="mb-3 text-sm text-zinc-500">
            Nie gwarantujemy miejsca — sprawdź, czy liczba osób uzasadnia otwarcie kolejnej grupy (przy 1 osobie
            zwykle się to nie opłaca). Kolejność = kolejność zgłoszenia.
          </p>
          {waiting.length === 0 ? (
            <p className="text-sm text-zinc-400">Nikt obecnie nie czeka.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-1.5 pr-3">Dziecko</th>
                  <th className="py-1.5 pr-3">Telefon</th>
                  <th className="py-1.5 pr-3">Grupa</th>
                  <th className="py-1.5 pr-3">Zgłoszenie</th>
                  <th className="py-1.5 pr-3">Akcja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {waiting.map((e) => {
                  const group = groupById.get(e.group_id);
                  return (
                    <tr key={e.id}>
                      <td className="py-1.5 pr-3 font-medium text-zinc-900">{e.kids_class_registration.child_name}</td>
                      <td className="py-1.5 pr-3 text-zinc-600">{e.kids_class_registration.phone}</td>
                      <td className="py-1.5 pr-3 text-zinc-600">{group ? groupLabel(group) : "?"}</td>
                      <td className="py-1.5 pr-3 text-zinc-600">{new Date(e.created_at).toLocaleDateString("pl-PL")}</td>
                      <td className="py-1.5 pr-3">
                        <form action={changeEnrollmentStatus}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="status" value="aktywny" />
                          <ConfirmButton confirmText={`Zaakceptować ${e.kids_class_registration.child_name}?`} className={BTN_GREEN}>
                            ✅ Zaakceptuj
                          </ConfirmButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "grupy" && canEditGroups && (
        <Card>
          <h2 className="mb-1 font-semibold text-zinc-900">Grupy</h2>
          <p className="mb-3 text-sm text-zinc-500">Dzień, godzina i pojemność każdej grupy — nowa grupa od razu pojawia się w formularzu zapisu.</p>
          <div className="flex flex-col gap-2">
            {groups.map((g) => (
              <div key={g.id} className={`rounded-lg border p-2.5 ${g.active ? "border-zinc-200 bg-zinc-50" : "border-zinc-100 bg-zinc-100 opacity-60"}`}>
                <form action={updateGroup} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={g.id} />
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-zinc-500">Dzień</label>
                    <select name="weekday" defaultValue={g.weekday} className={INPUT_SM}>
                      {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                        <option key={wd} value={wd}>
                          {weekdayLabel(wd)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-zinc-500">Od</label>
                    <input type="time" name="start_time" defaultValue={g.start_time.slice(0, 5)} className={INPUT_SM} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-zinc-500">Do</label>
                    <input type="time" name="end_time" defaultValue={g.end_time.slice(0, 5)} className={INPUT_SM} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-zinc-500">Nazwa (opcjonalnie)</label>
                    <input name="label" defaultValue={g.label ?? ""} className={`${INPUT_SM} w-32`} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-zinc-500">Pojemność</label>
                    <input type="number" name="capacity" min={1} defaultValue={g.capacity} className={`${INPUT_SM} w-16`} />
                  </div>
                  <SubmitButton className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50">
                    Zapisz
                  </SubmitButton>
                </form>
                <form action={toggleGroupActive} className="mt-1.5">
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="active" value={String(g.active)} />
                  <button type="submit" className="rounded-lg px-2 py-0.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200">
                    {g.active ? "Wyłącz grupę" : "Włącz grupę"}
                  </button>
                </form>
              </div>
            ))}
            {groups.length === 0 && <p className="text-sm text-zinc-400">Brak grup.</p>}
          </div>

          <details className="mt-3 rounded-lg border border-dashed border-zinc-200 p-2.5">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-600 marker:content-none">+ Dodaj grupę</summary>
            <form action={addGroup} className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-zinc-500">Dzień</label>
                <select name="weekday" defaultValue={1} className={INPUT_SM}>
                  {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                    <option key={wd} value={wd}>
                      {weekdayLabel(wd)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-zinc-500">Od</label>
                <input type="time" name="start_time" required defaultValue="16:00" className={INPUT_SM} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-zinc-500">Do</label>
                <input type="time" name="end_time" required defaultValue="17:00" className={INPUT_SM} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-zinc-500">Nazwa (opcjonalnie)</label>
                <input name="label" className={`${INPUT_SM} w-32`} placeholder="np. Grupa zaawansowana" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-zinc-500">Pojemność</label>
                <input type="number" name="capacity" min={1} defaultValue={8} className={`${INPUT_SM} w-16`} />
              </div>
              <SubmitButton className="rounded-xl bg-brand-orange px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
                Dodaj grupę
              </SubmitButton>
            </form>
          </details>
        </Card>
      )}

      {tab === "grupy" && canEditGroups && (
        <Card>
          <h2 className="mb-1 font-semibold text-zinc-900">Cennik</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Cena zależy od LICZBY grup, do których dziecko aktualnie należy (1×/tydz., 2×/tydz., ...) — nie od
            konkretnej grupy. Widoczna na formularzu zapisu i w Płatnościach.
          </p>
          <div className="flex flex-col gap-2">
            {priceTiers.map((t) => (
              <div key={t.group_count} className="flex items-center gap-2">
                <form action={setPriceTier} className="flex items-center gap-2">
                  <input type="hidden" name="group_count" value={t.group_count} />
                  <span className="text-sm text-zinc-700">{t.group_count}×/tydz.:</span>
                  <input type="number" name="monthly_fee" min={0} step="0.01" defaultValue={t.monthly_fee} className={`${INPUT_SM} w-20`} />
                  <span className="text-xs text-zinc-400">zł/mies.</span>
                  <SubmitButton className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50">
                    Zapisz
                  </SubmitButton>
                </form>
                <form action={deletePriceTier}>
                  <input type="hidden" name="group_count" value={t.group_count} />
                  <ConfirmButton confirmText={`Usunąć próg cenowy ${t.group_count}×/tydz.?`} className={BTN_RED}>
                    Usuń
                  </ConfirmButton>
                </form>
              </div>
            ))}
            {priceTiers.length === 0 && <p className="text-sm text-zinc-400">Brak progów cenowych.</p>}
          </div>
          <form action={setPriceTier} className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-zinc-500">Liczba grup/tydz.</label>
              <input type="number" name="group_count" min={1} defaultValue={priceTiers.length + 1} className={`${INPUT_SM} w-20`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-zinc-500">Cena (zł/mies.)</label>
              <input type="number" name="monthly_fee" min={0} step="0.01" defaultValue={0} className={`${INPUT_SM} w-20`} />
            </div>
            <SubmitButton className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
              Dodaj próg
            </SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}

async function FrekwencjaTab({
  groups,
  enrollments,
  selectedGroupId,
  selectedMonth,
  today,
  basePath,
}: {
  groups: KidsClassGroup[];
  enrollments: EnrollmentRow[];
  selectedGroupId?: string;
  selectedMonth?: string;
  today: string;
  basePath: string;
}) {
  const groupId = selectedGroupId && groups.some((g) => g.id === selectedGroupId) ? selectedGroupId : groups[0]?.id;
  const group = groups.find((g) => g.id === groupId);
  const monthKey = selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth) ? selectedMonth : today.slice(0, 7);
  const [year, month] = monthKey.split("-").map(Number);

  const children = group
    ? enrollments.filter((e) => e.group_id === group.id && OCCUPYING_STATUSES.includes(e.status))
    : [];
  const dates = group ? sessionDatesInMonth(group.weekday, year, month) : [];

  // Jedno zapytanie o CAŁĄ frekwencję tej grupy w tym miesiącu, zamiast
  // osobnego zapytania per komórka (dziecko × data) — przy kilkunastu
  // dzieciach i kilku datach to byłyby dziesiątki zapytań na jedno
  // renderowanie strony.
  const presenceByCell = new Map<string, boolean>();
  if (children.length > 0 && dates.length > 0) {
    const supabase = createServerSupabaseClient();
    const { data: attendance } = await supabase
      .from("kids_class_attendance")
      .select("enrollment_id, session_date, present")
      .in("enrollment_id", children.map((c) => c.id))
      .gte("session_date", dates[0])
      .lte("session_date", dates[dates.length - 1]);
    for (const a of attendance ?? []) {
      presenceByCell.set(`${a.enrollment_id}|${a.session_date}`, a.present);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <FrekwencjaFilters groups={groups} groupId={groupId} monthKey={monthKey} basePath={basePath} />
      </div>

      {!group ? (
        <p className="text-sm text-zinc-400">Brak grup.</p>
      ) : dates.length === 0 ? (
        <p className="text-sm text-zinc-400">Brak zajęć tej grupy w wybranym miesiącu.</p>
      ) : children.length === 0 ? (
        <p className="text-sm text-zinc-400">Brak aktywnych dzieci w tej grupie.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-1.5 pr-3">Dziecko</th>
                {dates.map((d) => (
                  <th key={d} className="py-1.5 px-1.5 text-center">
                    {d.slice(8, 10)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {children.map((c) => (
                <tr key={c.id}>
                  <td className="py-1.5 pr-3 font-medium text-zinc-900">{c.kids_class_registration.child_name}</td>
                  {dates.map((d) => {
                    const present = presenceByCell.get(`${c.id}|${d}`) ?? null;
                    return (
                      <td key={d} className="py-1.5 px-1.5 text-center">
                        <form action={toggleAttendance}>
                          <input type="hidden" name="enrollment_id" value={c.id} />
                          <input type="hidden" name="session_date" value={d} />
                          <input type="hidden" name="present" value={String(present !== true)} />
                          <button
                            type="submit"
                            title={present === null ? "nieoznaczone" : present ? "obecny" : "nieobecny"}
                            className={`mx-auto flex h-5 w-5 items-center justify-center rounded border-2 ${
                              present === true
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : present === false
                                  ? "border-red-400 bg-red-50 text-red-500"
                                  : "border-zinc-300"
                            }`}
                          >
                            {present === true ? "✓" : present === false ? "✕" : ""}
                          </button>
                        </form>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
