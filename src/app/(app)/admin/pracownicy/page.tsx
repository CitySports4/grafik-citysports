import { createServerSupabaseClient } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { Avatar } from "@/components/Avatar";
import { ClickableRow } from "@/components/ClickableRow";
import { ChevronRight } from "@/components/ChevronRight";
import { BackLink } from "@/components/BackLink";
import { BTN_PRIMARY } from "@/components/button-styles";
import { createEmployee } from "./actions";
import { ROLE_LABELS, type EmployeeRole } from "@/lib/session";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";

export default async function EmployeesPage() {
  const supabase = createServerSupabaseClient();
  const [{ data: employees }, { data: cleaningZoneRows }] = await Promise.all([
    supabase
      .from("employee")
      .select(
        "id, name, phone, color_hex, is_instructor, min_hours_month, target_hours_month, active, password_hash, employee_role(role)"
      )
      .order("name"),
    supabase.from("employee_cleaning_zone").select("employee_id"),
  ]);
  const canCleanIds = new Set((cleaningZoneRows ?? []).map((r) => r.employee_id));

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin" label="Panel admina" />

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
            <label className={LABEL}>Role (można wybrać kilka)</label>
            <div className="flex flex-wrap gap-3 pt-1.5">
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-sm text-zinc-900">
                  <input type="checkbox" name="role" value={value} defaultChecked={value === "recepcja"} className="h-4 w-4" />
                  {label}
                </label>
              ))}
            </div>
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
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" id="allow_remote_work" name="allow_remote_work" className="h-4 w-4" />
            <label htmlFor="allow_remote_work" className="text-sm text-zinc-900">
              Pozwalaj pracować zdalnie (godziny bez zmiany w grafiku, bez notatki)
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
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Stawka godzinowa (PLN/h)</label>
            <input type="number" step="0.01" name="hourly_rate" defaultValue={0} className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton className={BTN_PRIMARY}>Dodaj pracownika</SubmitButton>
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
              <th className="px-4 py-2.5" title="Ustawiane w Konfiguracja sprzątania → Kompetencje">
                Sprząta
              </th>
              <th className="px-4 py-2.5">Min / Cel h</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Hasło</th>
              <th className="px-2 py-2.5" aria-hidden="true"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {employees?.map((e) => (
              <ClickableRow key={e.id} href={`/admin/pracownicy/${e.id}`}>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2.5 font-medium text-zinc-900">
                    <Avatar name={e.name} color={e.color_hex} size={30} />
                    {e.name}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-600">{e.phone}</td>
                <td className="px-4 py-2.5 text-zinc-600">
                  {(e.employee_role ?? [])
                    .map((r) => ROLE_LABELS[r.role as EmployeeRole] ?? r.role)
                    .join(", ") || "—"}
                </td>
                <td className="px-4 py-2.5 text-zinc-600">{e.is_instructor ? "Tak" : "—"}</td>
                <td className="px-4 py-2.5 text-zinc-600">{canCleanIds.has(e.id) ? "Tak" : "—"}</td>
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
                <td className="px-2 py-2.5 text-right">
                  <ChevronRight />
                </td>
              </ClickableRow>
            ))}
            {employees?.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-zinc-400">
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
