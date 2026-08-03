const STYLES = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
} as const;

export function Banner({
  variant,
  children,
  className,
}: {
  variant: "success" | "error" | "info" | "warning";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${STYLES[variant]} ${className ?? ""}`}
    >
      <span>{children}</span>
    </div>
  );
}
