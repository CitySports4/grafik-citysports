import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ColorDot } from "@/components/ColorDot";
import { BackLink } from "@/components/BackLink";
import { WEEK_DISPLAY_ORDER, weekdayLabel } from "@/lib/weekdays";
import { formatHm } from "@/lib/time";
import { toDateKey } from "@/lib/schedule-month";
import { ROLE_LABELS } from "@/lib/session";
import {
  updateEmployee,
  clearEmployeePassword,
  deleteEmployee,
  addClassScheduleEntry,
  deleteClassScheduleEntry,
  addRecurringConstraint,
  deleteRecurringConstraint,
} from "../actions";
import { deletePlannedAbsence } from "../../../nieobecnosci/actions";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";
const LABEL = "text-sm font-semibold text-zinc-900";
const DANGER_BTN = "rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { data: employee } = await supabase
    .from("employee")
    .select("*, employee_role(role)")
    .eq("id", id)
    .single();
  if (!employee) notFound();
  const currentRoles = new Set((employee.employee_role ?? []).map((r: { role: string }) => r.role));

  const today = toDateKey(new Date());
  const [
    { data: classSchedule },
    { data: constraints },
    { data: plannedAbsences },
    { count: futureShiftCount },
    { count: zoneCount },
    { count: noteCount },
    { count: timeEntryCount },
    { count: absenceTotalCount },
  ] = await Promise.all([
    supabase
      .from("employee_class_schedule")
      .select("id, weekday, start_time, end_time, note")
      .eq("employee_id", id)
      .order("weekday"),
    supabase
      .from("weekly_recurring_constraint")
      .select("id, weekday, start_time, end_time, type, note")
      .eq("employee_id", id)
      .order("weekday"),
    supabase
      .from("planned_absence")
      .select("id, start_date, end_date, note")
      .eq("employee_id", id)
      .gte("end_date", today)
      .order("start_date"),
    // Poniższe TYLKO do policzenia realnego wpływu usunięcia (patrz sekcja
    // "Usuń pracownika" niżej) — admin ma widzieć konkretne liczby, nie
    // ogólnikowe ostrzeżenie, zanim skasuje konto na stałe.
    supabase
      .from("schedule_shift")
      .select("id, schedule_day!inner(date)", { count: "exact", head: true })
      .eq("employee_id", id)
      .gte("schedule_day.date", today),
    supabase.from("employee_cleaning_zone").select("employee_id", { count: "exact", head: true }).eq("employee_id", id),
    supabase.from("note").select("id", { count: "exact", head: true }).eq("author_employee_id", id),
    supabase.from("time_entry").select("id", { count: "exact", head: true }).eq("employee_id", id),
    supabase.from("planned_absence").select("id", { count: "exact", head: true }).eq("employee_id", id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin/pracownicy" label="Pracownicy" />

      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-zinc-900">
          <ColorDot color={employee.color_hex} className="h-3 w-3" />
          {employee.name}
        </h1>
        <p className="text-sm text-zinc-500">Edycja danych pracownika.</p>
      </div>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Dane podstawowe</h2>
        <form action={updateEmployee} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={employee.id} />
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Imię</label>
            <input name="name" defaultValue={employee.name} required className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Numer telefonu</label>
            <input name="phone" defaultValue={employee.phone} required className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={LABEL}>Role (można wybrać kilka)</label>
            <div className="flex flex-wrap gap-3 pt-1.5">
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-sm text-zinc-900">
                  <input type="checkbox" name="role" value={value} defaultChecked={currentRoles.has(value)} className="h-4 w-4" />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Kolor</label>
            <input
              type="color"
              name="color_hex"
              defaultValue={employee.color_hex}
              className="h-10 w-full rounded-xl border-[1.5px] border-zinc-300"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="is_instructor"
              name="is_instructor"
              defaultChecked={employee.is_instructor}
              className="h-4 w-4"
            />
            <label htmlFor="is_instructor" className="text-sm text-zinc-900">
              Jest instruktorem (ma zajęcia)
            </label>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" id="active" name="active" defaultChecked={employee.active} className="h-4 w-4" />
            <label htmlFor="active" className="text-sm text-zinc-900">
              Konto aktywne
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Minimalna liczba godzin / mies.</label>
            <input
              type="number"
              step="0.5"
              name="min_hours_month"
              defaultValue={employee.min_hours_month}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Docelowa liczba godzin / mies.</label>
            <input
              type="number"
              step="0.5"
              name="target_hours_month"
              defaultValue={employee.target_hours_month}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Stawka godzinowa (PLN/h)</label>
            <input
              type="number"
              step="0.01"
              name="hourly_rate"
              defaultValue={employee.hourly_rate}
              className={INPUT}
            />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
              Zapisz zmiany
            </SubmitButton>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-zinc-900">Hasło</h2>
        <p className="mb-3 text-sm text-zinc-500">
          {employee.password_hash
            ? "Pracownik ma już ustawione hasło."
            : "Pracownik jeszcze nie ustawił hasła — zrobi to sam przy pierwszym logowaniu."}
        </p>
        {employee.password_hash && (
          <form action={clearEmployeePassword}>
            <input type="hidden" name="id" value={employee.id} />
            <ConfirmButton
              confirmText="Wyczyścić hasło? Pracownik będzie musiał ustawić nowe przy następnym logowaniu."
              className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-900"
            >
              Wyczyść hasło (zapomniane)
            </ConfirmButton>
          </form>
        )}
      </Card>

      {employee.is_instructor && (
        <Card>
          <h2 className="mb-1 font-semibold text-zinc-900">Zajęcia instruktora</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Jeśli zmiana pokrywa się z zajęciami o więcej niż 1h, przy generowaniu grafiku ten
            pracownik jest przypisywany do niej w ostatniej kolejności.
          </p>
          <ul className="mb-3 flex flex-col gap-1.5">
            {classSchedule?.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium capitalize">{weekdayLabel(c.weekday)}</span>{" "}
                  {formatHm(c.start_time)}–{formatHm(c.end_time)} {c.note && <span className="text-zinc-500">({c.note})</span>}
                </span>
                <form action={deleteClassScheduleEntry}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="employee_id" value={employee.id} />
                  <ConfirmButton confirmText="Usunąć te zajęcia?" className={DANGER_BTN}>
                    Usuń
                  </ConfirmButton>
                </form>
              </li>
            ))}
            {classSchedule?.length === 0 && <li className="text-sm text-zinc-400">Brak zajęć.</li>}
          </ul>
          <form action={addClassScheduleEntry} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="employee_id" value={employee.id} />
            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>Dzień</label>
              <select name="weekday" className={INPUT} defaultValue={1}>
                {WEEK_DISPLAY_ORDER.map((idx) => (
                  <option key={idx} value={idx} className="capitalize">
                    {weekdayLabel(idx)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>Od</label>
              <input type="time" name="start_time" required className={INPUT} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>Do</label>
              <input type="time" name="end_time" required className={INPUT} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={LABEL}>Notatka (opcjonalnie)</label>
              <input name="note" className={INPUT} />
            </div>
            <SubmitButton className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
              Dodaj
            </SubmitButton>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="mb-1 font-semibold text-zinc-900">Cykliczne reguły dostępności</h2>
        <p className="mb-3 text-sm text-zinc-500">
          &quot;Niedostępny&quot; — nigdy nie przypisuj na tę zmianę. &quot;Preferowany&quot; —
          pierwszy wybór przy rozkładaniu grafiku, ale może zostać nadpisany dla sprawiedliwego
          rozkładu dni wolnych.
        </p>
        <ul className="mb-3 flex flex-col gap-1.5">
          {constraints?.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
              <span>
                <span
                  className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    c.type === "unavailable" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {c.type === "unavailable" ? "Niedostępny" : "Preferowany"}
                </span>
                <span className="font-medium capitalize">{weekdayLabel(c.weekday)}</span>{" "}
                {c.start_time && c.end_time ? `${formatHm(c.start_time)}–${formatHm(c.end_time)}` : "cały dzień"}{" "}
                {c.note && <span className="text-zinc-500">({c.note})</span>}
              </span>
              <form action={deleteRecurringConstraint}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="employee_id" value={employee.id} />
                <ConfirmButton confirmText="Usunąć tę regułę?" className={DANGER_BTN}>
                  Usuń
                </ConfirmButton>
              </form>
            </li>
          ))}
          {constraints?.length === 0 && <li className="text-sm text-zinc-400">Brak reguł.</li>}
        </ul>
        <form action={addRecurringConstraint} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="employee_id" value={employee.id} />
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Typ</label>
            <select name="type" className={INPUT} defaultValue="unavailable">
              <option value="unavailable">Niedostępny</option>
              <option value="preferred">Preferowany</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Dzień</label>
            <select name="weekday" className={INPUT} defaultValue={1}>
              {WEEK_DISPLAY_ORDER.map((idx) => (
                <option key={idx} value={idx} className="capitalize">
                  {weekdayLabel(idx)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Od (opcjonalnie)</label>
            <input type="time" name="start_time" className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Do (opcjonalnie)</label>
            <input type="time" name="end_time" className={INPUT} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={LABEL}>Notatka (opcjonalnie)</label>
            <input name="note" className={INPUT} />
          </div>
          <SubmitButton className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
            Dodaj regułę
          </SubmitButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-zinc-900">Sprzątanie</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Którymi strefami sprzątania może się zajmować — ustawiane w{" "}
          <Link href="/admin/sprzatanie" className="font-semibold text-brand-orange hover:underline">
            Konfiguracja sprzątania → Kompetencje
          </Link>
          , nie tutaj.
        </p>
        <form action={updateEmployee}>
          <input type="hidden" name="id" value={employee.id} />
          <input type="hidden" name="name" value={employee.name} />
          <input type="hidden" name="phone" value={employee.phone} />
          <input type="hidden" name="color_hex" value={employee.color_hex} />
          {employee.is_instructor && <input type="hidden" name="is_instructor" value="on" />}
          {employee.active && <input type="hidden" name="active" value="on" />}
          <input type="hidden" name="min_hours_month" value={employee.min_hours_month} />
          <input type="hidden" name="target_hours_month" value={employee.target_hours_month} />
          <input type="hidden" name="hourly_rate" value={employee.hourly_rate} />
          {[...currentRoles].map((r) => (
            <input key={String(r)} type="hidden" name="role" value={String(r)} />
          ))}
          <SubmitButton className="mt-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50">
            Zapisz
          </SubmitButton>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-zinc-900">Planowane nieobecności</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Zgłaszane samodzielnie przez pracownika (do 6 miesięcy wyprzedzenia) — traktowane jak
          &quot;cały dzień niedostępny&quot; przy układaniu grafiku.
        </p>
        <ul className="flex flex-col gap-1.5">
          {plannedAbsences?.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
              <span>
                {new Date(a.start_date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
                {" – "}
                {new Date(a.end_date + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" })}
                {a.note && <span className="text-zinc-500"> ({a.note})</span>}
              </span>
              <form action={deletePlannedAbsence}>
                <input type="hidden" name="id" value={a.id} />
                <ConfirmButton confirmText="Usunąć tę nieobecność?" className={DANGER_BTN}>
                  Usuń
                </ConfirmButton>
              </form>
            </li>
          ))}
          {plannedAbsences?.length === 0 && <li className="text-sm text-zinc-400">Brak zgłoszonych nieobecności.</li>}
        </ul>
      </Card>

      <Card className="border-red-200">
        <h2 className="mb-1 font-semibold text-zinc-900">Usuń pracownika</h2>
        <p className="mb-3 text-sm text-zinc-500">Usuwa konto na stałe. Tej operacji nie można cofnąć.</p>
        {(() => {
          // Konkretny, policzony wpływ usunięcia — zamiast ogólnikowego
          // ostrzeżenia, które i tak każdy klika bez czytania. Widoczne
          // TERAZ (na tej stronie) i w oknie potwierdzenia, żeby admin
          // wiedział dokładnie, co zniknie, zanim kliknie.
          const impacts: string[] = [];
          if (futureShiftCount) impacts.push(`${futureShiftCount} przyszłych zmian w grafiku wróci do "nieprzypisana"`);
          if (zoneCount) impacts.push(`${zoneCount} przypisanych stref sprzątania zostanie skasowanych`);
          if (timeEntryCount) impacts.push(`${timeEntryCount} zapisanych wpisów godzin pracy zostanie skasowanych`);
          if (absenceTotalCount) impacts.push(`${absenceTotalCount} zaplanowanych nieobecności zostanie skasowanych`);
          if (noteCount) impacts.push(`${noteCount} zadań autorstwa tej osoby zostanie skasowanych`);
          return (
            <>
              {impacts.length > 0 ? (
                <ul className="mb-3 list-disc space-y-0.5 pl-5 text-sm text-red-700">
                  {impacts.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-sm text-zinc-500">Brak powiązanych zmian, godzin, nieobecności ani notatek do skasowania.</p>
              )}
              <form action={deleteEmployee}>
                <input type="hidden" name="id" value={employee.id} />
                <ConfirmButton
                  confirmText={
                    impacts.length > 0
                      ? `Na pewno trwale usunąć pracownika "${employee.name}"?\n\nTo skasuje też:\n${impacts.map((l) => `• ${l}`).join("\n")}\n\nTej operacji nie można cofnąć.`
                      : `Na pewno trwale usunąć pracownika "${employee.name}"? Tej operacji nie można cofnąć.`
                  }
                  className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
                >
                  Usuń pracownika na stałe
                </ConfirmButton>
              </form>
            </>
          );
        })()}
      </Card>
    </div>
  );
}
