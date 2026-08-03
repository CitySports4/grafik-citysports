import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { createEmployee } from "./actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";

export default async function EmployeesPage() {
  const supabase = createServerSupabaseClient();
  const { data: employees } = await supabase
    .from("employee")
    .select("id, name, phone, role, color_hex, is_instructor, min_hours_month, target_hours_month, active, password_hash")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Pracownicy</h1>
        <p className="text-sm text-zinc-500">Zarządzaj kontami, kolorami i limitami godzin.</p>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Dodaj pracownika</h2>
        <form action={createEmployee} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Imię</label>
            <input name="name" required className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Numer telefonu</label>
            <input name="phone" required className={INPUT} />
            <p className="text-xs text-zinc-500">
              Hasło ustawi pracownik sam przy pierwszym logowaniu tym numerem.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Rola</label>
            <select name="role" className={INPUT} defaultValue="employee">
              <option value="employee">Pracownik</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Kolor</label>
            <input type="color" name="color_hex" defaultValue="#3b82f6" className="h-10 w-full rounded-xl border-[1.5px] border-zinc-300" />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" id="is_instructor" name="is_instructor" className="h-4 w-4" />
            <label htmlFor="is_instructor" className="text-sm text-zinc-900">
              Jest instruktorem (ma zajęcia)
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Minimalna liczba godzin / mies.</label>
            <input type="number" step="0.5" name="min_hours_month" defaultValue={0} className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Docelowa liczba godzin / mies.</label>
            <input type="number" step="0.5" name="target_hours_month" defaultValue={0} className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
              Dodaj pracownika
            </SubmitButton>
          </div>
        </form>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2.5">Pracownik</th>
              <th className="px-4 py-2.5">Telefon</th>
              <th className="px-4 py-2.5">Rola</th>
              <th className="px-4 py-2.5">Instruktor</th>
              <th className="px-4 py-2.5">Min / Cel h</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Hasło</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {employees?.map((e) => (
              <tr key={e.id} className="hover:bg-zinc-50">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/pracownicy/${e.id}`} className="flex items-center gap-2 font-medium text-zinc-900 hover:underline">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color_hex }} />
                    {e.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-zinc-600">{e.phone}</td>
                <td className="px-4 py-2.5 text-zinc-600">{e.role === "admin" ? "Administrator" : "Pracownik"}</td>
                <td className="px-4 py-2.5 text-zinc-600">{e.is_instructor ? "Tak" : "—"}</td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {e.min_hours_month} / {e.target_hours_month}
                </td>
                <td className="px-4 py-2.5">
                  {e.active ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Aktywny</span>
                  ) : (
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-600">Nieaktywny</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {e.password_hash ? (
                    <span className="text-xs text-zinc-400">ustawione</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      oczekuje
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {employees?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-zinc-400">
                  Brak pracowników.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
