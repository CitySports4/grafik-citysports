"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { submitRegistration, findChildrenByPhone, type SignupInput, type ReturningChildMatch } from "./actions";
import { groupLabel, feeForGroupCount, STATUS_LABELS, type KidsClassGroup, type PriceTier } from "@/lib/kids-classes";
import { Banner } from "@/components/Banner";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";
const PRIMARY_BTN =
  "mt-1.5 rounded-xl bg-brand-orange px-4 py-3 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50";

type GroupOption = { group: KidsClassGroup; freeSpots: number; trialDates: string[] };
type FormState = Omit<SignupInput, "groupIds" | "trialDates">;

const EMPTY: FormState = {
  childName: "",
  birthDate: "",
  parentName: "",
  phone: "",
  whatsappContact: false,
  hasExperience: false,
  rodoConsent: false,
  termsConsent: false,
};

export function SignupForm({ groups, priceTiers }: { groups: GroupOption[]; priceTiers: PriceTier[] }) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [trialDates, setTrialDates] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ label: string; waitlisted: boolean }[] | null>(null);

  const [phoneQuery, setPhoneQuery] = useState("");
  const [lookupPending, setLookupPending] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResults, setLookupResults] = useState<ReturningChildMatch[] | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleLookup() {
    setLookupError(null);
    setLookupResults(null);
    setLookupPending(true);
    try {
      setLookupResults(await findChildrenByPhone(phoneQuery));
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Nie udało się sprawdzić.");
    } finally {
      setLookupPending(false);
    }
  }

  function selectReturning(m: ReturningChildMatch) {
    setForm((prev) => ({ ...prev, childName: m.childName, birthDate: m.birthDate, parentName: m.parentName, phone: phoneQuery }));
    setReturningId(m.id);
  }

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  function setTrialDate(groupId: string, date: string) {
    setTrialDates((prev) => ({ ...prev, [groupId]: date }));
  }

  // Strona żyje w <iframe> o STAŁEJ wysokości ustawionej ręcznie na stronie
  // klubu (WordPress) — bez tego treść krótsza/dłuższa niż ta stała
  // wysokość albo ucina się, albo zostawia puste miejsce. WordPress dostaje
  // realną wysokość i sam dopasowuje iframe — przeliczane przy starcie,
  // zmianie rozmiaru okna, i przy KAŻDEJ zmianie w DOM (np. błąd albo
  // przejście do ekranu potwierdzenia).
  useEffect(() => {
    function sendHeight() {
      window.parent.postMessage({ type: "citysports-form-height", height: document.documentElement.scrollHeight }, "*");
    }
    sendHeight();
    window.addEventListener("resize", sendHeight);
    const observer = new MutationObserver(sendHeight);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      window.removeEventListener("resize", sendHeight);
      observer.disconnect();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (groupIds.length === 0) {
      setError("Wybierz przynajmniej jedną grupę.");
      return;
    }
    // Termin próbnych ma sens tylko tam, gdzie jest wolne miejsce — pełna
    // grupa (lista oczekujących) nie ma wolnego terminu na próbne.
    const groupsNeedingTrialDate = groups.filter((g) => groupIds.includes(g.group.id) && g.freeSpots > 0);
    if (groupsNeedingTrialDate.some((g) => !trialDates[g.group.id])) {
      setError("Wybierz termin zajęć próbnych dla każdej wybranej grupy z wolnym miejscem.");
      return;
    }
    setPending(true);
    try {
      const res = await submitRegistration({ ...form, groupIds, trialDates });
      if (res.ok) {
        setResult(res.groupResults);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    const anyWaitlisted = result.some((r) => r.waitlisted);
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Logo />
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-7 text-center shadow-sm">
          <span className="text-3xl">🏸</span>
          <h1 className="text-lg font-bold text-zinc-900">Zgłoszenie wysłane!</h1>
          <ul className="flex flex-col gap-1.5 text-left text-sm text-zinc-700">
            {result.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2">
                <span>{r.label}</span>
                {r.waitlisted ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">lista oczekujących</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">zapisano ✓</span>
                )}
              </li>
            ))}
          </ul>
          {anyWaitlisted ? (
            <p className="text-sm text-zinc-600">
              Część grup jest już pełna na ten miesiąc — dziecko trafiło na listę oczekujących. Możliwy jest start od
              kolejnego miesiąca, ale nie gwarantujemy miejsca — skontaktujemy się z decyzją, a na pierwsze bezpłatne
              zajęcia można dołączyć wcześniej, zapytaj recepcję.
            </p>
          ) : (
            <p className="text-sm text-zinc-600">Do zobaczenia na korcie. Skontaktujemy się, jeśli będziemy potrzebować dodatkowych informacji.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <Logo />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <h1 className="text-lg font-bold text-zinc-900">Zapisy — Zajęcia Badmintona dla dzieci</h1>
        {error && <Banner variant="error">{error}</Banner>}

        <div className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-3">
          <p className="text-xs font-semibold text-zinc-600">Dziecko już u nas chodziło i chcecie wrócić? Podaj numer telefonu.</p>
          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="Numer telefonu"
              value={phoneQuery}
              onChange={(e) => setPhoneQuery(e.target.value)}
              className={INPUT}
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={lookupPending || !phoneQuery}
              className="shrink-0 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-900 disabled:opacity-50"
            >
              {lookupPending ? "Szukam…" : "Sprawdź"}
            </button>
          </div>
          {lookupError && <p className="text-xs text-red-600">{lookupError}</p>}
          {lookupResults && lookupResults.length === 0 && (
            <p className="text-xs text-zinc-500">Nie znaleziono dziecka na ten numer — wypełnij formularz poniżej jako nowe zgłoszenie.</p>
          )}
          {lookupResults && lookupResults.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {lookupResults.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => selectReturning(m)}
                  className={`flex flex-col items-start gap-0.5 rounded-lg border-2 px-3 py-2 text-left transition-colors ${
                    returningId === m.id ? "border-brand-orange bg-orange-50" : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                >
                  <span className="text-sm font-semibold text-zinc-900">{m.childName}</span>
                  {m.groups.length > 0 && (
                    <span className="text-[11px] text-zinc-500">
                      {m.groups.map((g) => `${g.label} — ${STATUS_LABELS[g.status]}`).join(", ")}
                    </span>
                  )}
                  <span className="text-[11px] font-semibold text-brand-orange">
                    {returningId === m.id ? "✓ wybrano, uzupełnij dane poniżej" : "To moje dziecko, chcę wrócić →"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL}>Imię i nazwisko dziecka</label>
          <input required value={form.childName} onChange={(e) => set("childName", e.target.value)} className={INPUT} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={LABEL}>Data urodzenia dziecka</label>
          <input type="date" required value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} className={INPUT} />
          <p className="text-xs text-zinc-500">Zajęcia dla dzieci w wieku 8–14 lat.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={LABEL}>Imię i nazwisko rodzica/opiekuna</label>
          <input required value={form.parentName} onChange={(e) => set("parentName", e.target.value)} className={INPUT} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={LABEL}>Telefon</label>
          <input required value={form.phone} onChange={(e) => set("phone", e.target.value)} className={INPUT} />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={form.whatsappContact} onChange={(e) => set("whatsappContact", e.target.checked)} className="h-4 w-4" />
          Korzystam z WhatsApp
        </label>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL}>Grupa (można wybrać kilka)</label>
          <div className="flex flex-col gap-2">
            {groups.map(({ group, freeSpots, trialDates: groupTrialDates }) => {
              const full = freeSpots <= 0;
              const selected = groupIds.includes(group.id);
              return (
                <div key={group.id} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={`flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                      selected ? "border-brand-orange bg-orange-50" : "border-zinc-200 bg-white hover:border-zinc-300"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                          selected ? "border-brand-orange bg-brand-orange text-white" : "border-zinc-300"
                        }`}
                      >
                        {selected ? "✓" : ""}
                      </span>
                      <span className="text-sm font-semibold text-zinc-900">{groupLabel(group)}</span>
                    </span>
                    {full ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                        pełna — lista oczekujących
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        {freeSpots} {freeSpots === 1 ? "wolne miejsce" : "wolne miejsca"}
                      </span>
                    )}
                  </button>
                  {selected && full && (
                    <p className="ml-1 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-500">
                      Grupa jest pełna — trafisz na listę oczekujących, bez terminu zajęć próbnych. Skontaktujemy się, jeśli
                      zwolni się miejsce.
                    </p>
                  )}
                  {selected && !full && (
                    <div className="ml-1 flex flex-col gap-1.5 rounded-xl bg-zinc-50 p-3">
                      <span className="text-xs font-semibold text-zinc-600">Termin bezpłatnych zajęć próbnych:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {groupTrialDates.map((date) => {
                          const dateChosen = trialDates[group.id] === date;
                          return (
                            <button
                              type="button"
                              key={date}
                              onClick={() => setTrialDate(group.id, date)}
                              className={`rounded-lg border-2 px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                                dateChosen ? "border-brand-orange bg-white text-brand-orange" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                              }`}
                            >
                              {formatTrialDate(date)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {groups.length === 0 && <p className="text-sm text-zinc-400">Brak dostępnych grup — skontaktuj się z recepcją.</p>}
          </div>
          {groupIds.length > 0 &&
            (() => {
              const fee = feeForGroupCount(priceTiers, groupIds.length);
              return fee !== null ? (
                <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-700">
                  Cena: {fee} zł / miesiąc {groupIds.length > 1 ? `(${groupIds.length}×/tydz.)` : ""}
                </p>
              ) : null;
            })()}
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={form.hasExperience} onChange={(e) => set("hasExperience", e.target.checked)} className="h-4 w-4" />
          Dziecko trenowało już wcześniej (badminton lub inny sport rakietowy)
        </label>

        <div className="mt-1 flex flex-col gap-2 border-t border-zinc-100 pt-3">
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              required
              checked={form.rodoConsent}
              onChange={(e) => set("rodoConsent", e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            Wyrażam zgodę na przetwarzanie danych osobowych dziecka i rodzica/opiekuna w celu organizacji zajęć (RODO).
          </label>
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              required
              checked={form.termsConsent}
              onChange={(e) => set("termsConsent", e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            Akceptuję{" "}
            <a
              href="https://citysports.com.pl/regulamin/#badminton_dzieci"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-blue underline"
              onClick={(e) => e.stopPropagation()}
            >
              Regulamin zajęć
            </a>
            .
          </label>
        </div>

        <button type="submit" disabled={pending} className={PRIMARY_BTN}>
          {pending ? "Wysyłanie…" : "Zapisz dziecko"}
        </button>
      </form>
    </div>
  );
}

function formatTrialDate(dateKey: string): string {
  const d = new Date(dateKey + "T00:00:00");
  const weekday = d.toLocaleDateString("pl-PL", { weekday: "long" });
  const rest = d.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${rest}`;
}

function Logo() {
  return (
    <div className="flex flex-col items-center gap-2">
      <Image src="/logo.png" alt="City Sports" width={219} height={48} className="h-12 w-auto" priority />
      <p className="text-sm font-semibold text-zinc-500">Zajęcia Badmintona dla dzieci</p>
    </div>
  );
}
