// Miękki limit ~2 zamian miesięcznie na osobę — nie blokuje, tylko ostrzega
// (podobnie jak tolerancja ±2h różnicy godzin). Liczone wg miesiąca
// złożenia prośby (requested_at), licząc obie strony zamiany.
export const SOFT_SWAP_LIMIT_PER_MONTH = 2;

export function countAcceptedSwapsThisMonth(
  requests: { status: string; requested_at: string; requester_employee_id: string; target_employee_id: string | null }[],
  employeeId: string,
  now = new Date()
): number {
  const year = now.getFullYear();
  const month = now.getMonth();
  return requests.filter((r) => {
    if (r.status !== "accepted") return false;
    if (r.requester_employee_id !== employeeId && r.target_employee_id !== employeeId) return false;
    const d = new Date(r.requested_at);
    return d.getFullYear() === year && d.getMonth() === month;
  }).length;
}
