// Strzałka sygnalizująca "cały wiersz jest klikalny" — inline SVG (bez
// zależności od zewnętrznej biblioteki ikon), podświetla się w kolorze
// marki przy najechaniu na wiersz (rodzic ma klasę `group`, patrz
// ClickableRow).
export function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block shrink-0 text-zinc-300 transition-colors group-hover:text-brand-orange"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
