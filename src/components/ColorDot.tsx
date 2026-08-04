export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className ?? ""}`}
      style={{ backgroundColor: color }}
    />
  );
}
