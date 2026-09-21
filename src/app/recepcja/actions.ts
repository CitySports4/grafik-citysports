"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { createKioskSession, clearKioskSession } from "@/lib/kiosk-session";

export async function verifyKioskPin(formData: FormData) {
  const pin = String(formData.get("pin") ?? "");
  if (!pin) throw new Error("Podaj PIN.");

  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from("kiosk_settings").select("pin_hash").eq("id", 1).single();

  if (!data?.pin_hash) {
    throw new Error("Admin nie ustawił jeszcze PIN-u dla recepcji (Panel admina → Ogólny podgląd).");
  }
  if (!(await bcrypt.compare(pin, data.pin_hash))) {
    throw new Error("Nieprawidłowy PIN.");
  }

  await createKioskSession();
  revalidatePath("/recepcja");
}

export async function kioskLogout() {
  await clearKioskSession();
  revalidatePath("/recepcja");
}
