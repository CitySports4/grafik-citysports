"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";

export async function addShiftSlot(formData: FormData) {
  await requireAdmin();

  const weekday = Number(formData.get("weekday"));
  const default_start_time = String(formData.get("default_start_time") ?? "");
  const default_end_time = String(formData.get("default_end_time") ?? "");
  const label = String(formData.get("label") ?? "").trim() || null;

  if (!default_start_time || !default_end_time) {
    throw new Error("Podaj godziny rozpoczęcia i zakończenia zmiany.");
  }

  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("shift_template")
    .select("slot_index")
    .eq("weekday", weekday)
    .order("slot_index", { ascending: false })
    .limit(1);

  const nextSlotIndex = (existing?.[0]?.slot_index ?? -1) + 1;

  const { error } = await supabase.from("shift_template").insert({
    weekday,
    slot_index: nextSlotIndex,
    default_start_time,
    default_end_time,
    label,
  });

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/admin/zmiany");
}

export async function deleteShiftSlot(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("shift_template").delete().eq("id", id);

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/admin/zmiany");
}

export async function toggleShiftSlotActive(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("shift_template").update({ active: !active }).eq("id", id);

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/admin/zmiany");
}

// Wstawia typowy szablon (3 zmiany pon-pt, 1 zmiana sobota, 2 zmiany
// niedziela) zaobserwowany w dotychczasowym Excelu — tylko jeśli tabela
// jest pusta, żeby nie nadpisać ręcznych ustawień admina.
export async function seedDefaultShiftTemplate() {
  await requireAdmin();

  const supabase = createServerSupabaseClient();
  const { count } = await supabase.from("shift_template").select("id", { count: "exact", head: true });
  if (count && count > 0) {
    throw new Error("Szablon nie jest pusty — usuń istniejące zmiany, jeśli chcesz zacząć od nowa.");
  }

  const weekdayShifts = [
    { start: "08:00", end: "14:00" },
    { start: "14:00", end: "21:00" },
    { start: "17:00", end: "22:00" },
  ];

  const rows: {
    weekday: number;
    slot_index: number;
    default_start_time: string;
    default_end_time: string;
    label: string;
  }[] = [];

  for (const weekday of [1, 2, 3, 4, 5]) {
    weekdayShifts.forEach((s, idx) => {
      rows.push({
        weekday,
        slot_index: idx,
        default_start_time: s.start,
        default_end_time: s.end,
        label: `${s.start}–${s.end}`,
      });
    });
  }
  // Sobota — 1 zmiana (sprzątanie dodawane osobno jako wydarzenie).
  rows.push({
    weekday: 6,
    slot_index: 0,
    default_start_time: "08:00",
    default_end_time: "14:00",
    label: "08:00–14:00",
  });
  // Niedziela — zwykle 2 zmiany.
  rows.push(
    {
      weekday: 0,
      slot_index: 0,
      default_start_time: "08:00",
      default_end_time: "14:00",
      label: "08:00–14:00",
    },
    {
      weekday: 0,
      slot_index: 1,
      default_start_time: "14:00",
      default_end_time: "21:00",
      label: "14:00–21:00",
    }
  );

  const { error } = await supabase.from("shift_template").insert(rows);
  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/admin/zmiany");
}
