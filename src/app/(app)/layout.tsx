import { redirect } from "next/navigation";
import Link from "next/link";
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
  ];
  if (employee.role === "admin") {
    navLinks.push({ href: "/admin", label: "Panel admina" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: employee.colorHex }}
            />
            <span className="font-semibold text-zinc-900">{employee.name}</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-1.5 font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                {link.label}
              </Link>
            ))}
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 font-medium text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
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
