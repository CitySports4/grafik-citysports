import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { findScheduleMonth, currentMonth, monthLabel } from "@/lib/schedule-month";
import { formatHm } from "@/lib/time";
import { weekdayLabel } from "@/lib/weekdays";
import { EVENT_TYPE_LABELS } from "@/lib/event-types";
import { PrintButton } from "./PrintButton";
import { PrintScaler } from "./PrintScaler";

const SLOT_COUNT = 3;

// "08:00 - 14:00" — format 1:1 ze starego arkusza (spacja-myślnik-spacja,
// nie krótka kreska), żeby wydruk wyglądał jak dotychczasowy dokument.
function timeRange(start: string, end: string): string {
  return `${formatHm(start)} - ${formatHm(end)}`;
}

// Kolor tekstu pigułki dobrany do JASNOŚCI tła (YIQ) — kolor pracownika
// wybiera admin dowolnie z color pickera, więc nie możemy założyć, że biały
// tekst zawsze będzie czytelny (np. jasnożółty).
function readableTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#ffffff";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#1a1a1a" : "#ffffff";
}

const CLOSED_COLOR = "#3f3f46"; // zinc-700 — ta sama "waga" wizualna co pigułki pracowników, ale neutralna
const EVENT_COLORS: Record<string, string> = {
  liga_open: "#dc2626",
  liga_deblowa: "#b91c1c",
  sprzatanie: "#7c3aed",
  warsztaty: "#0891b2",
  custom: "#db2777",
};

// Pigułka — pełne kolorowe tło, wyśrodkowany pogrubiony tekst; ten sam
// kształt dla przypisanej osoby, "NIECZYNNE" i wydarzeń, żeby cała tabela
// czytała się jako jeden spójny system, nie mieszanka stylów.
function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="block w-full truncate rounded-full px-1.5 py-0.5 text-center font-bold uppercase leading-tight"
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {children}
    </span>
  );
}

export default async function PrintGrafikPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const fallback = currentMonth();
  const year = Number(params.year) || fallback.year;
  const month = Number(params.month) || fallback.month;

  const scheduleMonth = await findScheduleMonth(year, month);

  if (!scheduleMonth) {
    return (
      <main className="p-8 text-sm text-zinc-500">
        Brak wygenerowanego grafiku dla {monthLabel(month)} {year}.
      </main>
    );
  }

  const supabase = createServerSupabaseClient();
  const [{ data: days }, { data: employees }, { data: templateSlots }] = await Promise.all([
    supabase
      .from("schedule_day")
      .select(
        "id, date, weekday, schedule_shift(id, slot_index, start_time, end_time, employee_id, is_closed), schedule_event(id, type, start_time, end_time, label, note, participant_employee_ids)"
      )
      .eq("schedule_month_id", scheduleMonth.id)
      .order("date"),
    supabase.from("employee").select("id, name, color_hex"),
    // Poniedziałek jako reprezentatywny dzień powszedni do nagłówków kolumn —
    // rzeczywiste godziny per dzień (jeśli nadpisane) i tak są pokazane w komórce.
    supabase
      .from("shift_template")
      .select("slot_index, default_start_time, default_end_time")
      .eq("weekday", 1)
      .order("slot_index"),
  ]);

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
  const templateBySlot = new Map((templateSlots ?? []).map((t) => [t.slot_index, t]));
  const slotHeaders = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const t = templateBySlot.get(i);
    return t ? timeRange(t.default_start_time, t.default_end_time) : `Zmiana ${i + 1}`;
  });

  return (
    <main className="p-6 print:p-0">
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-lg font-bold capitalize text-zinc-900">
          Grafik do druku — {monthLabel(month)} {year}
        </h1>
        <PrintButton />
      </div>

      <PrintScaler tableId="print-table" pageHeightMm={277} />

      <table id="print-table" className="w-full border-collapse text-[10px] leading-tight">
        <thead>
          <tr>
            <th className="w-[55px] border border-zinc-400 bg-brand-navy px-1.5 py-1.5 text-left font-bold uppercase tracking-wide text-white">
              Data
            </th>
            <th className="w-[75px] border border-zinc-400 bg-brand-navy px-1.5 py-1.5 text-left font-bold uppercase tracking-wide text-white">
              Dzień
            </th>
            {slotHeaders.map((label, i) => (
              <th key={i} className="border border-zinc-400 bg-brand-navy px-1.5 py-1.5 text-left font-bold uppercase tracking-wide text-white">
                {label}
              </th>
            ))}
            <th className="border border-zinc-400 bg-brand-navy px-1.5 py-1.5 text-left font-bold uppercase tracking-wide text-white">
              Wydarzenia
            </th>
          </tr>
        </thead>
        <tbody>
          {(days ?? []).map((day) => {
            const shifts = day.schedule_shift ?? [];
            const shiftsBySlot = new Map(shifts.map((s) => [s.slot_index, s]));
            const overflowShifts = shifts.filter((s) => s.slot_index >= SLOT_COUNT);
            const events = day.schedule_event ?? [];
            const dateLabel = new Date(day.date + "T00:00:00").toLocaleDateString("pl-PL", {
              day: "numeric",
              month: "numeric",
            });
            const isWeekend = day.weekday === 0 || day.weekday === 6;
            return (
              <tr key={day.id} className={`break-inside-avoid ${isWeekend ? "bg-zinc-100" : ""}`}>
                <td className="border border-zinc-300 px-1.5 py-1 align-middle font-bold text-zinc-700">{dateLabel}</td>
                <td className="border border-zinc-300 px-1.5 py-1 align-middle capitalize text-zinc-600">{weekdayLabel(day.weekday)}</td>
                {Array.from({ length: SLOT_COUNT }, (_, i) => {
                  const shift = shiftsBySlot.get(i);
                  const emp = shift?.employee_id ? employeeById.get(shift.employee_id) : null;
                  const actualLabel = shift ? timeRange(shift.start_time, shift.end_time) : null;
                  const headerMatches = actualLabel === slotHeaders[i];
                  return (
                    <td key={i} className="border border-zinc-300 p-0.5 align-middle">
                      {!shift ? (
                        <span className="block px-1.5 text-center text-zinc-300">—</span>
                      ) : shift.is_closed ? (
                        <Pill color={CLOSED_COLOR}>Nieczynne</Pill>
                      ) : emp ? (
                        <>
                          <Pill color={emp.color_hex}>{emp.name}</Pill>
                          {!headerMatches && <div className="mt-0.5 text-center text-[8px] font-normal normal-case text-zinc-500">{actualLabel}</div>}
                        </>
                      ) : (
                        <span className="block px-1.5 text-center normal-case text-zinc-400">— nieprzypisane —</span>
                      )}
                    </td>
                  );
                })}
                <td className="border border-zinc-300 p-0.5 align-middle">
                  <div className="flex flex-col gap-0.5">
                    {overflowShifts.map((shift) => {
                      const emp = shift.employee_id ? employeeById.get(shift.employee_id) : null;
                      const label = `${timeRange(shift.start_time, shift.end_time)} ${shift.is_closed ? "Nieczynne" : emp ? emp.name : "— nieprzypisane —"}`;
                      return (
                        <Pill key={shift.id} color={shift.is_closed ? CLOSED_COLOR : emp ? emp.color_hex : "#a1a1aa"}>
                          {label}
                        </Pill>
                      );
                    })}
                    {events.map((ev) => {
                      const participants = (ev.participant_employee_ids ?? [])
                        .map((id: string) => employeeById.get(id)?.name)
                        .filter(Boolean)
                        .join(", ");
                      const label = `${ev.start_time ? `${formatHm(ev.start_time)}${ev.end_time ? `-${formatHm(ev.end_time)}` : ""} ` : ""}${
                        EVENT_TYPE_LABELS[ev.type] ?? ev.type
                      }${ev.label && ev.label !== EVENT_TYPE_LABELS[ev.type] ? ` — ${ev.label}` : ""}${participants ? ` (${participants})` : ""}`;
                      return (
                        <Pill key={ev.id} color={EVENT_COLORS[ev.type] ?? EVENT_COLORS.custom}>
                          {label}
                        </Pill>
                      );
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
