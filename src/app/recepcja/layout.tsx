import Link from "next/link";
import Image from "next/image";
import { hasKioskSession } from "@/lib/kiosk-session";
import { verifyKioskPin, kioskLogout } from "./actions";
import { KioskPinForm } from "./KioskPinForm";
import { RecepcjaTabs } from "./RecepcjaTabs";

// Bramka PIN-em + wspólny nagłówek/zakładki dla całego /recepcja (trzy
// osobne podstrony, nie jedna długa) — patrz lib/kiosk-session.ts. Realne
// zabezpieczenie jest i tak w każdej Server Action osobno
// (requireRecepcjaOrKiosk w treningi-personalne/actions.ts) — to tu to tylko
// bramka widoku, żeby nieautoryzowany nie zobaczył treści stron.
export default async function RecepcjaLayout({ children }: { children: React.ReactNode }) {
  const authorized = await hasKioskSession();

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <KioskPinForm action={verifyKioskPin} />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-brand-navy">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/recepcja">
              <Image src="/logo.png" alt="City Sports" width={146} height={32} className="h-8 w-auto" priority />
            </Link>
            <span className="hidden h-6 w-px bg-white/20 sm:block" />
            <span className="font-semibold text-white">Recepcja</span>
          </div>
          <form action={kioskLogout}>
            <button type="submit" className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-brand-orange">
              Wyloguj to stanowisko
            </button>
          </form>
        </div>
        <RecepcjaTabs />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
