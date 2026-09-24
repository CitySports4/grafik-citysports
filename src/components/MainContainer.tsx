"use client";

import { usePathname } from "next/navigation";

// Panel admina (tabele grafiku, dyspozycyjności itd.) jest zrobiony z myślą
// WYŁĄCZNIE o komputerze — ma być tam wygodnie i przestronnie, nie ściśnięty
// do tej samej szerokości co strony dla pracowników (te celowo wąskie,
// pod telefon). Stąd rozróżnienie tu, a nie sztywna szerokość w layoucie.
export function MainContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin") ?? false;

  return <main className={`mx-auto w-full flex-1 px-4 py-6 ${isAdmin ? "max-w-screen-2xl" : "max-w-5xl"}`}>{children}</main>;
}
