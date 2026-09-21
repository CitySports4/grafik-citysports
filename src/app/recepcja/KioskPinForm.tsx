"use client";

import { useState } from "react";
import Image from "next/image";
import { friendlyActionError } from "@/lib/client-error";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-3 text-center text-lg tracking-widest outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

// Bramka PIN-em do wspólnego stanowiska recepcyjnego — nie logowanie na
// osobiste konto (to zostaje na telefonach pracowników), tylko jeden prosty
// sekret znany całej recepcji, patrz lib/kiosk-session.ts.
export function KioskPinForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("pin", pin);
      await action(fd);
    } catch (err) {
      setError(friendlyActionError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <Image src="/logo.png" alt="City Sports" width={160} height={35} className="h-9 w-auto" priority />
      <div className="text-center">
        <h1 className="text-base font-bold text-zinc-900">Ogólny podgląd — recepcja</h1>
        <p className="mt-1 text-xs text-zinc-500">Podaj wspólny PIN stanowiska.</p>
      </div>
      <input
        type="password"
        inputMode="numeric"
        autoFocus
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        className={INPUT}
        placeholder="PIN"
      />
      {error && <p className="text-center text-xs font-semibold text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending || !pin}
        className="w-full rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50"
      >
        {pending ? "Sprawdzanie…" : "Wejdź"}
      </button>
    </form>
  );
}
