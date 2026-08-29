// Zielony wariant "success" celowo na emerald, nie na (domyślny w Tailwind)
// green — cała reszta appki oznacza pozytywne stany emeraldem (opublikowany
// grafik, godziny w normie, zaakceptowana zamiana), więc zwykły green
// wyglądałby obok nich jak inny odcień tego samego koloru.
const STYLES = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
} as const;

export function Banner({
  variant,
  children,
  className,
  onDismiss,
}: {
  variant: "success" | "error" | "info" | "warning";
  children: React.ReactNode;
  className?: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-sm ${STYLES[variant]} ${className ?? ""}`}
    >
      <span>{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}
