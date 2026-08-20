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
const UNASSIGNED_COLOR = "#a1a1aa";
// Tylko fallback, gdy wydarzenie nie ma uczestników (kolor pigułki normalnie
// bierze się z koloru osoby/osób, które je mają — patrz Pill niżej).
const EVENT_FALLBACK_COLORS: Record<string, string> = {
  liga_open: "#dc2626",
  liga_deblowa: "#b91c1c",
  sprzatanie: "#7c3aed",
  warsztaty: "#0891b2",
  custom: "#db2777",
};

// Średni kolor kilku barw — do doboru czytelnego koloru tekstu na pigułce
// podzielonej na pół (patrz Pill), gdzie jeden kolor tekstu musi pasować do
// obu połówek na raz.
function averageColor(colors: string[]): string {
  let r = 0,
    g = 0,
    b = 0;
  for (const c of colors) {
    const clean = c.replace("#", "");
    r += parseInt(clean.slice(0, 2), 16) || 0;
    g += parseInt(clean.slice(2, 4), 16) || 0;
    b += parseInt(clean.slice(4, 6), 16) || 0;
  }
  const n = colors.length || 1;
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// Pigułka — pełne kolorowe tło, wyśrodkowany pogrubiony tekst; ten sam
// kształt dla przypisanej osoby, "NIECZYNNE" i wydarzeń, żeby cała tabela
// czytała się jako jeden spójny system, nie mieszanka stylów. Wiele kolorów
// (np. sprzątanie dwuosobowe) dzieli pigułkę na równe pionowe pasy zamiast
// płynnego gradientu — ma być jasne, że to DWIE konkretne osoby, nie jedna
// zmieszana barwa.
function Pill({ colors, children }: { colors: string[]; children: React.ReactNode }) {
  const bg =
    colors.length <= 1
      ? colors[0] ?? UNASSIGNED_COLOR
      : `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${(i * 100) / colors.length}% ${((i + 1) * 100) / colors.length}%`).join(", ")})`;
  return (
    <span
      className="block w-full truncate rounded-full px-1.5 py-0.5 text-center font-bold uppercase leading-tight"
      style={{ background: bg, color: readableTextColor(colors.length <= 1 ? colors[0] ?? UNASSIGNED_COLOR : averageColor(colors)) }}
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
    supabase.from("employee").select("id, name, color_hex").eq("active", true).order("name"),
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

  // Legenda kolorów pod tabelą — tylko osoby, które faktycznie mają choć
  // jedną zmianę/wydarzenie w tym miesiącu (nie cała lista aktywnych, żeby
  // nie zaśmiecać legendy kimś, kto akurat nie pracuje).
  const usedEmployeeIds = new Set<string>();
  for (const day of days ?? []) {
    for (const s of day.schedule_shift ?? []) {
      if (s.employee_id) usedEmployeeIds.add(s.employee_id);
    }
    for (const ev of day.schedule_event ?? []) {
      for (const id of ev.participant_employee_ids ?? []) usedEmployeeIds.add(id);
    }
  }
  const legendEmployees = (employees ?? []).filter((e) => usedEmployeeIds.has(e.id));

  return (
    <main className="p-6 print:p-0">
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        #print-table table { table-layout: fixed; }
      `}</style>

      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-lg font-bold capitalize text-zinc-900">
          Grafik do druku — {monthLabel(month)} {year}
        </h1>
        <PrintButton />
      </div>

      {/* A4 W POZIOMIE: strona ma 210mm wysokości (nie 297mm — to szerokość
          w poziomie), minus 2×10mm marginesu = 190mm użytecznej wysokości.
          277mm to była wysokość strony PIONOWEJ minus marginesy — pomyłka,
          przez którą skalowanie zakładało dużo więcej miejsca niż naprawdę
          jest, więc pełny miesiąc (31 dni) nie mieścił się na jednej stronie. */}
      <PrintScaler tableId="print-table" pageHeightMm={190} />

      {/* id na WSPÓLNYM kontenerze (tabela + legenda), nie na samej tabeli —
          PrintScaler mierzy i skaluje ten element całościowo, więc legenda
          liczy się do "czy mieści się na stronie", zamiast doklejać się
          nieprzeskalowana pod już dopasowaną tabelą. */}
      <div id="print-table">
      <table className="w-full border-collapse text-[10px] leading-tight">
        <colgroup>
          <col style={{ width: 60 }} />
          <col style={{ width: 85 }} />
          {slotHeaders.map((_, i) => (
            <col key={i} style={{ width: 170 }} />
          ))}
          {/* Wydarzenia — świadomie ograniczona szerokość (patrz #print-table
              table-layout:fixed powyżej): długi tekst przycina się (Pill ma
              truncate) zamiast rozpychać całą tabelę poza jedną stronę A4.
              Węższa niż zmiany — tekstu tu zwykle mniej niż w 3 kolumnach zmian. */}
          <col style={{ width: 230 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="border border-zinc-400 bg-brand-navy px-1.5 py-1.5 text-left font-bold uppercase tracking-wide text-white">Data</th>
            <th className="border border-zinc-400 bg-brand-navy px-1.5 py-1.5 text-left font-bold uppercase tracking-wide text-white">Dzień</th>
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
          {(days ?? []).map((day, index) => {
            const shifts = day.schedule_shift ?? [];
            const shiftsBySlot = new Map(shifts.map((s) => [s.slot_index, s]));
            const overflowShifts = shifts.filter((s) => s.slot_index >= SLOT_COUNT);
            const events = day.schedule_event ?? [];
            const dateLabel = new Date(day.date + "T00:00:00").toLocaleDateString("pl-PL", {
              day: "numeric",
              month: "numeric",
            });
            const isWeekend = day.weekday === 0 || day.weekday === 6;
            // Gruba linia nad każdym poniedziałkiem (poza samą górą tabeli,
            // tam już jest nagłówek) — dzieli miesiąc na czytelne bloki
            // 7-dniowe, nie zmieniając nic poza samą kreską.
            const isWeekStart = index > 0 && day.weekday === 1;
            // Na <tr> border-top pod border-collapse bywa niespójnie
            // renderowany między przeglądarkami — dopisujemy go do KAŻDEJ
            // komórki z osobna, żeby na wydruku zawsze było widać.
            const weekStartBorder = isWeekStart ? " border-t-[3px] border-t-brand-navy" : "";
            return (
              <tr key={day.id} className={`break-inside-avoid ${isWeekend ? "bg-zinc-300" : ""}`}>
                <td className={`border border-zinc-400 px-1.5 py-1 align-middle font-bold text-zinc-700${weekStartBorder}`}>{dateLabel}</td>
                <td className={`border border-zinc-400 px-1.5 py-1 align-middle capitalize text-zinc-600${weekStartBorder}`}>{weekdayLabel(day.weekday)}</td>
                {Array.from({ length: SLOT_COUNT }, (_, i) => {
                  const shift = shiftsBySlot.get(i);
                  const emp = shift?.employee_id ? employeeById.get(shift.employee_id) : null;
                  const actualLabel = shift ? timeRange(shift.start_time, shift.end_time) : null;
                  const headerMatches = actualLabel === slotHeaders[i];
                  return (
                    <td key={i} className={`border border-zinc-400 p-0.5 align-middle${weekStartBorder}`}>
                      {!shift ? (
                        <span className="block px-1.5 text-center text-zinc-500">—</span>
                      ) : shift.is_closed ? (
                        <Pill colors={[CLOSED_COLOR]}>Nieczynne</Pill>
                      ) : emp ? (
                        <Pill colors={[emp.color_hex]}>
                          {emp.name}
                          {!headerMatches && (
                            <span className="ml-1 font-normal normal-case">
                              ({formatHm(shift.start_time)}–{formatHm(shift.end_time)})
                            </span>
                          )}
                        </Pill>
                      ) : (
                        <span className="block px-1.5 text-center normal-case text-zinc-500">— nieprzypisane —</span>
                      )}
                    </td>
                  );
                })}
                <td className={`border border-zinc-400 p-0.5 align-middle${weekStartBorder}`}>
                  <div className="flex flex-col gap-0.5">
                    {overflowShifts.map((shift) => {
                      const emp = shift.employee_id ? employeeById.get(shift.employee_id) : null;
                      const label = `${timeRange(shift.start_time, shift.end_time)} ${shift.is_closed ? "Nieczynne" : emp ? emp.name : "— nieprzypisane —"}`;
                      return (
                        <Pill key={shift.id} colors={[shift.is_closed ? CLOSED_COLOR : emp ? emp.color_hex : UNASSIGNED_COLOR]}>
                          {label}
                        </Pill>
                      );
                    })}
                    {events.map((ev) => {
                      // Skrócone etykiety — kolor pigułki (osoba/osoby, patrz
                      // Pill) już mówi KTO, więc nie powtarzamy tego w tekście
                      // i zostawiamy tylko godzinę startu, nie cały zakres.
                      const participantColors = (ev.participant_employee_ids ?? [])
                        .map((id: string) => employeeById.get(id)?.color_hex)
                        .filter((c: string | undefined): c is string => Boolean(c));
                      const colors = participantColors.length > 0 ? participantColors : [EVENT_FALLBACK_COLORS[ev.type] ?? EVENT_FALLBACK_COLORS.custom];
                      const time = ev.start_time ? formatHm(ev.start_time) : "";
                      const typeName = EVENT_TYPE_LABELS[ev.type] ?? ev.type;
                      const label = `${time} ${ev.type === "custom" && ev.label ? ev.label : typeName}`;
                      return (
                        <Pill key={ev.id} colors={colors}>
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

      {legendEmployees.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold text-zinc-700">
          {legendEmployees.map((e) => (
            <span key={e.id} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color_hex }} />
              {e.name}
            </span>
          ))}
        </div>
      )}
      </div>
    </main>
  );
}
