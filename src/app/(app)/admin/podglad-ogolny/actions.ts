"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

// PIN recepcji ma być SZYBKI do wpisania na współdzielonym stanowisku — nie
// te same wymogi co osobiste hasło pracownika (wielka/mała litera, cyfra).
// Wystarczy, że nie jest banalnie krótki.
function validateKioskPin(pin: string): string | null {
  if (pin.length < 4) return "PIN musi mieć co najmniej 4 znaki.";
  return null;
}

export async function setKioskPin(formData: FormData) {
  await requireAdmin();

  const pin = String(formData.get("pin") ?? "");
  const pinConfirm = String(formData.get("pin_confirm") ?? "");
  if (pin !== pinConfirm) throw new Error("Podane PIN-y nie są takie same.");
  const pinError = validateKioskPin(pin);
  if (pinError) throw new Error(pinError);

  const supabase = createServerSupabaseClient();
  const pin_hash = await bcrypt.hash(pin, 10);
  const { error } = await supabase.from("kiosk_settings").update({ pin_hash }).eq("id", 1);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/podglad-ogolny");
}

export async function clearKioskPin(formData: FormData) {
  void formData;
  await requireAdmin();

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("kiosk_settings").update({ pin_hash: null }).eq("id", 1);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/admin/podglad-ogolny");
}
