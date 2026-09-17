import { minutesToTime, type OccupancySegment } from "@/lib/personal-training";

type Block = OccupancySegment & { closed?: boolean };

// Pasek zajętości sali w czasie — kolor mówi od razu "wolno / częściowo /
// pełno", bez klikania "Nowy trening" i czekania na podpowiedź. Dwie rzeczy,
// bez których pierwsza wersja była nieczytelna:
// - liczby godzin NAD paskiem (nie tylko `title` na hover — na komórce hover
//   w ogóle nie działa, bez liczb kolorowe klocki nic nie mówiły);
// - przerwa w godzinach sali (np. lunch) jako WYRAŹNIE inny, kreskowany
//   segment o szerokości proporcjonalnej do realnego czasu przerwy — wcześniej
//   to był ledwo widoczny odstęp, cały dzień wyglądał na ciągle dostępny.
// Segmenty mają szerokość proporcjonalną do realnego czasu trwania
// (flexGrow = liczba minut), więc godzinna przerwa jest wyraźnie szersza niż
// 20-minutowa.
export function OccupancyBar({ segments, roomCapacity }: { segments: OccupancySegment[]; roomCapacity: number }) {
  if (segments.length === 0) return null;

  const blocks: Block[] = [];
  segments.forEach((seg, i) => {
    const prevEnd = segments[i - 1]?.end;
    if (prevEnd !== undefined && prevEnd !== seg.start) {
      blocks.push({ start: prevEnd, end: seg.start, count: 0, closed: true });
    }
    blocks.push(seg);
  });

  return (
    <div className="flex items-end gap-px">
      {blocks.map((seg) => {
        const onTheHour = seg.start % 60 === 0;
        const colorClass = seg.closed
          ? "bg-zinc-100"
          : seg.count === 0
            ? "bg-emerald-200"
            : seg.count >= roomCapacity
              ? "bg-red-400"
              : "bg-amber-300";
        return (
          <div key={seg.start} className="relative flex flex-col items-center" style={{ flexGrow: seg.end - seg.start, flexBasis: 0 }}>
            {onTheHour && (
              <span className="mb-0.5 text-[9px] leading-none text-zinc-400">{Math.floor(seg.start / 60)}</span>
            )}
            <span
              title={seg.closed ? "Sala niedostępna" : `${minutesToTime(seg.start)}–${minutesToTime(seg.end)} · ${seg.count}/${roomCapacity}`}
              style={
                seg.closed
                  ? { backgroundImage: "repeating-linear-gradient(45deg, #d4d4d8 0, #d4d4d8 3px, transparent 3px, transparent 6px)" }
                  : undefined
              }
              className={`h-3 w-full rounded-sm ${colorClass}`}
            />
          </div>
        );
      })}
    </div>
  );
}
