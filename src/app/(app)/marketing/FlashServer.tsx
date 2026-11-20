import { cookies } from "next/headers";
import { FlashBanner } from "./FlashBanner";

export async function MarketingFlash() {
  const raw = (await cookies()).get("marketing_flash")?.value;
  if (!raw) return null;
  let parsed: { kind: "ok" | "warn"; text: string } | null = null;
  try {
    parsed = JSON.parse(decodeURIComponent(raw)) as { kind: "ok" | "warn"; text: string };
  } catch {
    parsed = null;
  }
  if (!parsed) return null;
  return <FlashBanner key={raw} kind={parsed.kind} text={parsed.text} />;
}
