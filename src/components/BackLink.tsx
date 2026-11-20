import Link from "next/link";

// Spójny "← Wróć" wszędzie tam, gdzie strona jest podstroną czegoś
// (szczegóły pracownika, sekcja panelu admina) — bez tego jedyną drogą
// powrotu bywał przycisk "wstecz" przeglądarki.
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center text-sm font-semibold text-zinc-500 hover:text-zinc-800">
      ← {label}
    </Link>
  );
}
