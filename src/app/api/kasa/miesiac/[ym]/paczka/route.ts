import { loadMonthReport, buildMonthZip } from "@/lib/kasa-month";
import { parseYm, requireAdminForRoute, loadRkNumber, loadFontBytes } from "@/lib/kasa-month-route";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ ym: string }> }) {
  if (!(await requireAdminForRoute())) return new Response("Brak uprawnień.", { status: 403 });
  const parsed = parseYm((await params).ym);
  if (!parsed) return new Response("Nieprawidłowy miesiąc.", { status: 400 });

  const [report, rkNumber, fontBytes] = await Promise.all([
    loadMonthReport(parsed.year, parsed.month),
    loadRkNumber(parsed.year, parsed.month),
    loadFontBytes(req.url),
  ]);
  const zip = await buildMonthZip(report, rkNumber, fontBytes);
  const name = `paczka_KW-KP_${parsed.year}-${String(parsed.month).padStart(2, "0")}.zip`;
  return new Response(Buffer.from(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
