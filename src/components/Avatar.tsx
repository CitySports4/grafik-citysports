// Okrągły awatar z inicjałami zamiast suchej kropki koloru — ta sama barwa
// pracownika, tylko lekko podbarwione tło + pełny kolor na literach, więc
// kontrast jest zagwarantowany niezależnie od wybranego koloru.
export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, backgroundColor: `${color}24`, color, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </span>
  );
}
