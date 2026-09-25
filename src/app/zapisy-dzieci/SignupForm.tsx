"use client";

import { useState } from "react";
import Image from "next/image";
import { submitRegistration, type SignupInput } from "./actions";
import { GROUP_LABELS, type KidsClassGroup } from "@/lib/kids-classes";
import { Banner } from "@/components/Banner";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";
const PRIMARY_BTN =
  "mt-1.5 rounded-xl bg-brand-orange px-4 py-3 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50";

const EMPTY: SignupInput = {
  childName: "",
  birthDate: "",
  parentName: "",
  phone: "",
  email: "",
  whatsappContact: false,
  groupChoice: "poniedzialek",
  hasExperience: false,
  rodoConsent: false,
  termsConsent: false,
};

export function SignupForm() {
  const [form, setForm] = useState<SignupInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ waitlisted: boolean } | null>(null);

  function set<K extends keyof SignupInput>(key: K, value: SignupInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await submitRegistration(form);
      if (res.ok) {
        setResult({ waitlisted: res.waitlisted });
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
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <Logo />
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-7 text-center shadow-sm">
          <span className="text-3xl">🏸</span>
          <h1 className="text-lg font-bold text-zinc-900">Zgłoszenie wysłane!</h1>
          {result.waitlisted ? (
            <p className="text-sm text-zinc-600">
              Grupa na ten miesiąc jest już pełna — dziecko zostało zapisane na listę oczekujących. Możliwy jest
              start od kolejnego miesiąca, ale nie gwarantujemy miejsca — zależy to od liczby chętnych i
              dostępności kortów. Skontaktujemy się z decyzją, a na pierwsze bezpłatne zajęcia można dołączyć
              wcześniej — zapytaj recepcję.
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
        <div className="flex flex-col gap-1.5">
          <label className={LABEL}>E-mail (opcjonalnie)</label>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={INPUT} />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={form.whatsappContact} onChange={(e) => set("whatsappContact", e.target.checked)} className="h-4 w-4" />
          Można kontaktować się przez WhatsApp na podany numer
        </label>

        <div className="flex flex-col gap-1.5">
          <label className={LABEL}>Grupa</label>
          <div className="flex flex-col gap-1.5">
            {(Object.entries(GROUP_LABELS) as [KidsClassGroup, string][]).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="radio"
                  name="group"
                  checked={form.groupChoice === value}
                  onChange={() => set("groupChoice", value)}
                  className="h-4 w-4"
                />
                {label}
              </label>
            ))}
          </div>
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
            Akceptuję Regulamin zajęć.
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
