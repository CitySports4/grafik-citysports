import { loadMonthReport, buildRkPdf } from "@/lib/kasa-month";
import { parseYm, requireAdminForRoute, loadRkNumber, loadFontBytes } from "@/lib/kasa-month-route";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ ym: string }> }) {
  if (!(await requireAdminForRoute())) return new Response("Brak uprawnień.", { status: 403 });
  const parsed = parseYm((await params).ym);
  if (!parsed) return new Response("Nieprawidłowy miesiąc.", { status: 400 });

  const [report, rkNumber, fontBytes] = await Promise.all([
    loadMonthReport(parsed.year, parsed.month),
    loadRkNumber(parsed.year, parsed.month),
    loadFontBytes(req.url),
  ]);
  const pdf = await buildRkPdf(report, rkNumber, fontBytes);
  const name = `RK_${parsed.year}-${String(parsed.month).padStart(2, "0")}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
