import { minutesToTime, type OccupancySegment } from "@/lib/personal-training";

// Pasek zajętości sali w czasie — jeden segment na pół godziny, kolor mówi
// od razu "wolno / częściowo / pełno", bez konieczności klikania "Nowy
// trening" i dopiero wtedy dostawania podpowiedzi. Statyczny (Server
// Component), tylko `title` na hover — na komórce i tak liczy się głównie
// sam kolor.
export function OccupancyBar({ segments, roomCapacity }: { segments: OccupancySegment[]; roomCapacity: number }) {
  if (segments.length === 0) return null;

  // Przerwa między oknami dostępności widoczna jako luka w pasku — dwa
  // sąsiadujące segmenty należą do różnych okien, gdy segment[i].end !==
  // segment[i+1].start.
  return (
    <div className="flex items-center gap-0.5">
      {segments.map((seg, i) => {
        const prevEnd = segments[i - 1]?.end;
        const gapBefore = prevEnd !== undefined && prevEnd !== seg.start;
        const colorClass =
          seg.count === 0
            ? "bg-emerald-200"
            : seg.count >= roomCapacity
              ? "bg-red-400"
              : "bg-amber-300";
        return (
          <span
            key={seg.start}
            title={`${minutesToTime(seg.start)}–${minutesToTime(seg.end)} · ${seg.count}/${roomCapacity}`}
            className={`h-3 flex-1 rounded-sm ${colorClass} ${gapBefore ? "ml-1.5" : ""}`}
          />
        );
      })}
    </div>
  );
}
