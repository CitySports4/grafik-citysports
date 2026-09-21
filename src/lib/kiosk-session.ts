import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Sesja "kiosku" (komputer recepcyjny) — CAŁKOWICIE osobna od sesji
// pracownika (lib/session.ts): nie niesie żadnej tożsamości, tylko fakt "ktoś
// znał wspólny PIN recepcji na tym urządzeniu". Podpisane tym samym
// SESSION_SECRET, ale z innym payloadem i inną nazwą ciasteczka, żeby nie
// dało się pomylić/podstawić jednej sesji za drugą.
const COOKIE_NAME = "gc_kiosk";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dni — jak sesja pracownika, urządzenie stoi na stałe na recepcji
const PAYLOAD = "recepcja-kiosk";

function sign(): string {
  const secret = process.env.SESSION_SECRET!;
  return createHmac("sha256", secret).update(PAYLOAD).digest("hex");
}

export async function createKioskSession() {
  const store = await cookies();
  store.set(COOKIE_NAME, sign(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function hasKioskSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const expected = sign();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function clearKioskSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
