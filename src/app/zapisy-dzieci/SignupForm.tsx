"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { submitRegistration, type SignupInput } from "./actions";
import { groupLabel, feeForGroupCount, type KidsClassGroup, type PriceTier } from "@/lib/kids-classes";
import { Banner } from "@/components/Banner";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";
const PRIMARY_BTN =
  "mt-1.5 rounded-xl bg-brand-orange px-4 py-3 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50";

type GroupOption = { group: KidsClassGroup; freeSpots: number };
type FormState = Omit<SignupInput, "groupIds">;

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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ label: string; waitlisted: boolean }[] | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
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
    setPending(true);
    try {
      const res = await submitRegistration({ ...form, groupIds });
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
            {groups.map(({ group, freeSpots }) => {
              const full = freeSpots <= 0;
              const selected = groupIds.includes(group.id);
              return (
                <button
                  type="button"
                  key={group.id}
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

function Logo() {
  return (
    <div className="flex flex-col items-center gap-2">
      <Image src="/logo.png" alt="City Sports" width={219} height={48} className="h-12 w-auto" priority />
      <p className="text-sm font-semibold text-zinc-500">Zajęcia Badmintona dla dzieci</p>
    </div>
  );
}
