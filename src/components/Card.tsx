import Link from "next/link";

// Karty oddzielają się od tła STOPNIEM TONU (strona jest #f7f8fa, karta
// biała), nie ramką/cieniem w spoczynku — ramka+shadow-sm na każdej karcie
// w całej appce to dekoracja, nie informacja. Cień zostaje tylko jako
// chwilowa, ruchowa odpowiedź na hover u CardLink (sygnalizuje "to jest
// klikalne"), nigdy w stanie spoczynku.
const BASE = "rounded-2xl bg-white p-4 transition-all duration-150";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`${BASE} ${className ?? ""}`}>{children}</div>;
}

export function CardLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`${BASE} block hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}
