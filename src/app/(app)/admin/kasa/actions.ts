"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

function revalidate() {
  revalidatePath("/admin/kasa");
  revalidatePath("/kasa");
}

export async function updateKasaSettings(formData: FormData) {
  await requireAdmin();
  const next_rd_number = Number(formData.get("next_rd_number"));
  const cashLimitRaw = String(formData.get("cash_limit") ?? "").trim();
  const cash_limit = cashLimitRaw ? Number(cashLimitRaw) : null;
  if (!Number.isFinite(next_rd_number) || next_rd_number < 1) throw new Error("Podaj poprawny numer startowy RD.");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("kasa_settings").update({ next_rd_number, cash_limit, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}

export async function addCategory(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Podaj nazwę kategorii.");
  const supabase = createServerSupabaseClient();
  const { count } = await supabase.from("kasa_category").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("kasa_category").insert({ name, sort_order: (count ?? 0) + 1 });
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}

export async function setCategoryActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("kasa_category").update({ active }).eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidate();
}
