"use client";

import { useState } from "react";
import Image from "next/image";
import { checkEmployeePhoneStatus, setInitialPassword, loginEmployee } from "./actions";
import { validatePassword, PASSWORD_HINT } from "@/lib/password";
import { Banner } from "@/components/Banner";

type Step = "phone" | "set_password" | "login";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const PRIMARY_BTN =
  "mt-1.5 rounded-xl bg-brand-orange px-4 py-3 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50";

export function LoginForm() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const status = await checkEmployeePhoneStatus(phone);
      if (status === "not_found") {
        setError("Nie znaleziono konta z tym numerem telefonu. Poproś administratora o dodanie Cię.");
      } else if (status === "needs_password") {
        setStep("set_password");
      } else {
        setStep("login");
      }
    } finally {
      setPending(false);
    }
  }

  async function handleAction(action: (formData: FormData) => Promise<void>, formData: FormData) {
    setError(null);

    const password = String(formData.get("password") ?? "");
    const passwordConfirm = formData.get("password_confirm");
    if (passwordConfirm !== null) {
      if (password !== String(passwordConfirm)) {
        setError("Podane hasła nie są takie same.");
        return;
      }
      const passwordError = validatePassword(password);
      if (passwordError) {
        setError(passwordError);
        return;
      }
    }

    setPending(true);
    try {
      await action(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col items-center gap-2">
        <Image src="/logo.png" alt="City Sports" width={219} height={48} className="h-12 w-auto" priority />
        <p className="text-sm font-semibold text-zinc-500">Grafik pracy</p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        {error && <Banner variant="error">{error}</Banner>}

        {step === "phone" && (
          <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-zinc-900">Numer telefonu</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="np. 600 123 456"
                className={INPUT}
              />
            </div>
            <button type="submit" disabled={pending} className={PRIMARY_BTN}>
              {pending ? "Sprawdzanie…" : "Dalej"}
            </button>
          </form>
        )}

        {step === "set_password" && (
          <form action={(fd) => handleAction(setInitialPassword, fd)} className="flex flex-col gap-3">
            <p className="text-sm text-zinc-500">To Twoje pierwsze logowanie — ustaw hasło.</p>
            <input type="hidden" name="phone" value={phone} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-zinc-900">Nowe hasło</label>
              <input type="password" name="password" required minLength={6} className={INPUT} />
              <p className="text-xs text-zinc-500">{PASSWORD_HINT}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-zinc-900">Powtórz nowe hasło</label>
              <input type="password" name="password_confirm" required minLength={6} className={INPUT} />
            </div>
            <button type="submit" disabled={pending} className={PRIMARY_BTN}>
              {pending ? "Zapisywanie…" : "Ustaw hasło i zaloguj"}
            </button>
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="text-sm text-zinc-500 hover:text-brand-orange hover:underline"
            >
              ← wróć
            </button>
          </form>
        )}

        {step === "login" && (
          <form action={(fd) => handleAction(loginEmployee, fd)} className="flex flex-col gap-3">
            <input type="hidden" name="phone" value={phone} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-zinc-900">Hasło</label>
              <input type="password" name="password" required className={INPUT} />
            </div>
            <button type="submit" disabled={pending} className={PRIMARY_BTN}>
              {pending ? "Logowanie…" : "Zaloguj"}
            </button>
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="text-sm text-zinc-500 hover:text-brand-orange hover:underline"
            >
              ← wróć
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
