"use client";

import { useRouter } from "next/navigation";

// Robi cały <tr> klikalny (nie tylko jedną komórkę) — zachowuje semantykę
// tabeli (prawdziwy <tr>, nie zagnieżdżony <Link>, co i tak jest niepoprawne
// HTML), a zachowuje się jak link: klik gdziekolwiek w wierszu, Enter po
// nawigacji klawiaturą, hover z podświetleniem.
export function ClickableRow({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
      role="link"
      tabIndex={0}
      className={`group cursor-pointer transition-colors hover:bg-brand-orange/5 focus-visible:bg-brand-orange/5 focus-visible:outline-none ${className ?? ""}`}
    >
      {children}
    </tr>
  );
}
