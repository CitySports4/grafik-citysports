"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { createSession } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";
import { validatePassword } from "@/lib/password";

export type PhoneStatus = "not_found" | "needs_password" | "has_password";

export async function checkEmployeePhoneStatus(phone: string): Promise<PhoneStatus> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("employee")
    .select("password_hash, active")
    .eq("phone", normalizePhone(phone))
    .eq("active", true)
    .maybeSingle();

  if (!data) return "not_found";
  return data.password_hash ? "has_password" : "needs_password";
}

export async function setInitialPassword(formData: FormData) {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  if (!phone) {
    throw new Error("Brak numeru telefonu.");
  }
  if (password !== passwordConfirm) {
    throw new Error("Podane hasła nie są takie same.");
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const supabase = createServerSupabaseClient();
  const password_hash = await bcrypt.hash(password, 10);

  const { data: employee, error } = await supabase
    .from("employee")
    .update({ password_hash })
    .eq("phone", phone)
    .eq("active", true)
    .is("password_hash", null)
    .select("id")
    .single();

  if (error || !employee) {
    throw new Error("Nie udało się ustawić hasła. Spróbuj ponownie.");
  }

  await createSession(employee.id);
  redirect("/grafik");
}

export async function loginEmployee(formData: FormData) {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!phone || !password) {
    throw new Error("Podaj numer telefonu i hasło.");
  }

  const supabase = createServerSupabaseClient();
  const { data: employee } = await supabase
    .from("employee")
    .select("id, password_hash, active")
    .eq("phone", phone)
    .single();

  if (
    !employee?.active ||
    !employee?.password_hash ||
    !(await bcrypt.compare(password, employee.password_hash))
  ) {
    throw new Error("Nieprawidłowy telefon lub hasło.");
  }

  await createSession(employee.id);
  redirect("/grafik");
}
