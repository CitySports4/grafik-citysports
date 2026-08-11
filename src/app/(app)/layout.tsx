import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSessionEmployee } from "@/lib/session";
import { logout } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const employee = await getSessionEmployee();
  if (!employee) {
    redirect("/login");
  }

  const navLinks = [
    { href: "/grafik", label: "Mój grafik" },
    { href: "/dyspozycyjnosc", label: "Dyspozycyjność" },
    { href: "/zamiany", label: "Zamiany" },
    { href: "/godziny", label: "Godziny pracy" },
    { href: "/nieobecnosci", label: "Nieobecności" },
    { href: "/sprzatanie", label: "Sprzątanie" },
    { href: "/notatnik", label: "Notatnik" },
    { href: "/asystent", label: "Asystent" },
  ];
  if (employee.role === "admin") {
    navLinks.push({ href: "/admin", label: "Panel admina" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-brand-navy">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="City Sports" width={146} height={32} className="h-8 w-auto" priority />
            <span className="hidden h-6 w-px bg-white/20 sm:block" />
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: employee.colorHex }}
              />
              <span className="font-semibold text-white">{employee.name}</span>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-1.5 font-medium text-white/80 hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 font-medium text-white/70 hover:bg-white/10 hover:text-brand-orange"
              >
                Wyloguj
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
