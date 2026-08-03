import Link from "next/link";

const BASE =
  "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all duration-150";

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
      className={`${BASE} block hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md active:translate-y-0 ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}
