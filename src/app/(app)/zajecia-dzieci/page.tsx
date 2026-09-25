import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee, canManageKidsClasses } from "@/lib/session";
import { toDateKey } from "@/lib/schedule-month";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  ageOnDate,
  computeOccupancy,
  GROUP_LABELS,
  STATUS_LABELS,
  SEASON_MONTHS,
  OCCUPYING_STATUSES,
  type KidsClassGroup,
  type KidsClassStatus,
} from "@/lib/kids-classes";
import { changeRegistrationStatus, toggleUsedTrial, toggleMonthPayment, setKidsClassLimits } from "./actions";

const TABS = [
  { key: "zgloszenia", label: "Zgłoszenia" },
  { key: "platnosci", label: "Płatności" },
  { key: "oczekujacy", label: "Lista oczekujących" },
  { key: "ustawienia", label: "Ustawienia" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const STATUS_PILL: Record<KidsClassStatus, string> = {
  nowe: "bg-blue-50 text-brand-navy",
  aktywny: "bg-emerald-50 text-emerald-700",
  oczekuje: "bg-amber-50 text-amber-700",
  brak_oplaty: "bg-red-50 text-red-700",
  rezygnacja: "bg-zinc-100 text-zinc-500",
};

// Kolejne akcje statusu dostępne z danego statusu — 1:1 z dawnym
// przyciskiAkcji w Admin.html.
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

type Registration = {
  id: string;
  created_at: string;
  child_name: string;
  birth_date: string;
  parent_name: string;
  phone: string;
  group_choice: KidsClassGroup;
  has_experience: boolean;
  status: KidsClassStatus;
  used_trial: boolean;
};

export default async function KidsClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const employee = await requireEmployee();
  if (!canManageKidsClasses(employee)) {
    throw new Error("Brak uprawnień — ta sekcja jest dostępna dla recepcji i administratora.");
  }
  const isAdmin = employee.roles.includes("admin");

  const params = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === params.tab)?.key ?? "zgloszenia") as TabKey;
  const today = toDateKey(new Date());

  const supabase = createServerSupabaseClient();
  const [{ data: settings }, { data: registrationsRaw }, { data: paymentsRaw }] = await Promise.all([
    supabase.from("kids_class_settings").select("limit_poniedzialek, limit_czwartek").eq("id", true).single(),
    supabase
      .from("kids_class_registration")
      .select("id, created_at, child_name, birth_date, parent_name, phone, group_choice, has_experience, status, used_trial")
      .order("created_at"),
    supabase.from("kids_class_payment").select("registration_id, months"),
  ]);

  const registrations = (registrationsRaw ?? []) as Registration[];
  const limits = settings ?? { limit_poniedzialek: 8, limit_czwartek: 8 };
  const occupancy = computeOccupancy(registrations);
  const paymentsByRegistration = new Map((paymentsRaw ?? []).map((p) => [p.registration_id, p.months as boolean[]]));

  const waiting = registrations.filter((r) => r.status === "oczekuje");
  const payable = registrations.filter((r) => OCCUPYING_STATUSES.includes(r.status));
  const payableByGroup = new Map<KidsClassGroup, Registration[]>();
  for (const r of payable) {
    if (!payableByGroup.has(r.group_choice)) payableByGroup.set(r.group_choice, []);
    payableByGroup.get(r.group_choice)!.push(r);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">🏸 Zajęcia dla dzieci</h1>
          <p className="text-sm text-zinc-500">Zapisy, płatności i listy oczekujących na zajęcia badmintona dla dzieci.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className={`rounded-full px-3 py-1.5 ${occupancy.poniedzialek >= limits.limit_poniedzialek ? "bg-brand-orange text-white" : "bg-zinc-100 text-zinc-700"}`}>
            Pon. {occupancy.poniedzialek}/{limits.limit_poniedzialek}
          </span>
          <span className={`rounded-full px-3 py-1.5 ${occupancy.czwartek >= limits.limit_czwartek ? "bg-brand-orange text-white" : "bg-zinc-100 text-zinc-700"}`}>
            Czw. {occupancy.czwartek}/{limits.limit_czwartek}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "zgloszenia" ? "/zajecia-dzieci" : `/zajecia-dzieci?tab=${t.key}`}
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
              {registrations.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-medium text-zinc-900">{r.child_name}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{ageOnDate(r.birth_date, today)}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{r.parent_name}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{r.phone}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{GROUP_LABELS[r.group_choice]}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_PILL[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <form action={toggleUsedTrial}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="value" value={String(!r.used_trial)} />
                      <button type="submit" className={`h-5 w-5 rounded border-2 ${r.used_trial ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300"}`}>
                        {r.used_trial ? "✓" : ""}
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {statusActions(r.status).map((a) => (
                        <form key={a.next + a.label} action={changeRegistrationStatus}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value={a.next} />
                          <ConfirmButton
                            confirmText={`Zmienić status dla ${r.child_name} na "${STATUS_LABELS[a.next]}"?`}
                            className={a.variant === "green" ? BTN_GREEN : BTN_RED}
                          >
                            {a.label}
                          </ConfirmButton>
                        </form>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {registrations.length === 0 && (
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
          {(["poniedzialek", "czwartek", "obie"] as KidsClassGroup[]).map((group) => {
            const items = payableByGroup.get(group) ?? [];
            return (
              <Card key={group}>
                <h2 className="mb-3 font-semibold text-zinc-900">
                  {GROUP_LABELS[group]} <span className="text-xs font-normal text-zinc-400">({items.length})</span>
                </h2>
                {items.length === 0 ? (
                  <p className="text-sm text-zinc-400">Brak dzieci w tej grupie.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="py-1.5 pr-3">Dziecko</th>
                          {SEASON_MONTHS.map((m) => (
                            <th key={m} className="py-1.5 px-1.5 text-center">
                              {m.slice(0, 3)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {items.map((r) => {
                          const months = paymentsByRegistration.get(r.id) ?? new Array(SEASON_MONTHS.length).fill(false);
                          return (
                            <tr key={r.id}>
                              <td className="py-1.5 pr-3 font-medium text-zinc-900">{r.child_name}</td>
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
        </div>
      )}

      {tab === "oczekujacy" && (
        <Card>
          <p className="mb-3 text-sm text-zinc-500">
            Nie gwarantujemy miejsca — sprawdź, czy liczba osób uzasadnia otwarcie kolejnego kortu (przy 1 osobie
            zwykle się to nie opłaca).
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
                {waiting.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-3 font-medium text-zinc-900">{r.child_name}</td>
                    <td className="py-1.5 pr-3 text-zinc-600">{r.phone}</td>
                    <td className="py-1.5 pr-3 text-zinc-600">{GROUP_LABELS[r.group_choice]}</td>
                    <td className="py-1.5 pr-3 text-zinc-600">{new Date(r.created_at).toLocaleDateString("pl-PL")}</td>
                    <td className="py-1.5 pr-3">
                      <form action={changeRegistrationStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="aktywny" />
                        <ConfirmButton confirmText={`Zaakceptować ${r.child_name}?`} className={BTN_GREEN}>
                          ✅ Zaakceptuj
                        </ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "ustawienia" && (
        <Card>
          <h2 className="mb-1 font-semibold text-zinc-900">Limity miejsc</h2>
          {isAdmin ? (
            <form action={setKidsClassLimits} className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-600">Poniedziałek — limit miejsc</label>
                <input
                  type="number"
                  name="limit_poniedzialek"
                  min={1}
                  defaultValue={limits.limit_poniedzialek}
                  className="w-28 rounded-xl border-[1.5px] border-zinc-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-600">Czwartek — limit miejsc</label>
                <input
                  type="number"
                  name="limit_czwartek"
                  min={1}
                  defaultValue={limits.limit_czwartek}
                  className="w-28 rounded-xl border-[1.5px] border-zinc-300 px-3 py-1.5 text-sm"
                />
              </div>
              <SubmitButton className="rounded-xl bg-brand-orange px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
                Zapisz limity
              </SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-zinc-500">
              Poniedziałek: <span className="font-semibold text-zinc-900">{limits.limit_poniedzialek}</span> miejsc · Czwartek:{" "}
              <span className="font-semibold text-zinc-900">{limits.limit_czwartek}</span> miejsc.{" "}
              <span className="text-zinc-400">Zmianę limitów może wykonać tylko administrator.</span>
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
