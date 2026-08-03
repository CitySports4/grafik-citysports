import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase";

const COOKIE_NAME = "gc_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dni

function sign(employeeId: string): string {
  const secret = process.env.SESSION_SECRET!;
  const hmac = createHmac("sha256", secret).update(employeeId).digest("hex");
  return `${employeeId}.${hmac}`;
}

function verify(token: string): string | null {
  const secret = process.env.SESSION_SECRET!;
  const [employeeId, hmac] = token.split(".");
  if (!employeeId || !hmac) return null;
  const expected = createHmac("sha256", secret).update(employeeId).digest("hex");
  const a = Buffer.from(hmac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return employeeId;
}

export async function createSession(employeeId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, sign(employeeId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSessionEmployeeId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verify(token);
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type EmployeeRole = "admin" | "employee";
export type SessionEmployee = {
  id: string;
  name: string;
  role: EmployeeRole;
  colorHex: string;
};

export async function getSessionEmployee(): Promise<SessionEmployee | null> {
  const employeeId = await getSessionEmployeeId();
  if (!employeeId) return null;

  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("employee")
    .select("id, name, role, color_hex, active")
    .eq("id", employeeId)
    .single();

  if (!data || !data.active) return null;
  return {
    id: data.id,
    name: data.name,
    role: data.role as EmployeeRole,
    colorHex: data.color_hex,
  };
}

export async function requireEmployee(): Promise<SessionEmployee> {
  const employee = await getSessionEmployee();
  if (!employee) {
    throw new Error("Musisz być zalogowany.");
  }
  return employee;
}

export async function requireAdmin(): Promise<SessionEmployee> {
  const employee = await requireEmployee();
  if (employee.role !== "admin") {
    throw new Error("Brak uprawnień — ta akcja jest dostępna tylko dla administratora.");
  }
  return employee;
}
