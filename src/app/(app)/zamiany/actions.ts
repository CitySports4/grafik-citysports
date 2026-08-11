"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { hoursBetween } from "@/lib/time";

export async function createSwapRequest(formData: FormData) {
  const employee = await requireEmployee();
  const requester_shift_id = String(formData.get("requester_shift_id") ?? "");
  const target_shift_id = String(formData.get("target_shift_id") ?? "");

  if (!requester_shift_id || !target_shift_id) {
    throw new Error("Wybierz obie zmiany do zamiany.");
  }
  if (requester_shift_id === target_shift_id) {
    throw new Error("Nie można zamienić zmiany z samą sobą.");
  }

  const supabase = createServerSupabaseClient();

  const [{ data: mine }, { data: theirs }] = await Promise.all([
    supabase.from("schedule_shift").select("id, employee_id, start_time, end_time").eq("id", requester_shift_id).single(),
    supabase.from("schedule_shift").select("id, employee_id, start_time, end_time").eq("id", target_shift_id).single(),
  ]);

  if (!mine || mine.employee_id !== employee.id) {
    throw new Error("To nie jest Twoja zmiana.");
  }
  if (!theirs || !theirs.employee_id) {
    throw new Error("Wybrana zmiana docelowa jest nieprzypisana.");
  }

  const hour_delta =
    hoursBetween(theirs.start_time, theirs.end_time) - hoursBetween(mine.start_time, mine.end_time);

  const { error } = await supabase.from("shift_swap_request").insert({
    requester_employee_id: employee.id,
    requester_shift_id,
    target_employee_id: theirs.employee_id,
    target_shift_id,
    hour_delta,
  });

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/zamiany");
  revalidatePath("/admin/zamiany");
}

export async function respondSwapRequest(formData: FormData) {
  const employee = await requireEmployee();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? ""); // "accept" | "reject"

  const supabase = createServerSupabaseClient();
  const { data: request } = await supabase
    .from("shift_swap_request")
    .select("id, status, target_employee_id, requester_shift_id, target_shift_id")
    .eq("id", id)
    .single();

  if (!request || request.status !== "pending") {
    throw new Error("Ta prośba nie jest już aktywna.");
  }
  const canDecide = employee.roles.includes("admin") || employee.id === request.target_employee_id;
  if (!canDecide) {
    throw new Error("Nie możesz zdecydować o tej prośbie.");
  }

  if (decision === "accept") {
    const [{ data: reqShift }, { data: targetShift }] = await Promise.all([
      supabase.from("schedule_shift").select("employee_id").eq("id", request.requester_shift_id).single(),
      supabase.from("schedule_shift").select("employee_id").eq("id", request.target_shift_id).single(),
    ]);
    if (!reqShift || !targetShift) {
      throw new Error("Nie znaleziono zmian do zamiany.");
    }

    await supabase.from("schedule_shift").update({ employee_id: targetShift.employee_id }).eq("id", request.requester_shift_id);
    await supabase.from("schedule_shift").update({ employee_id: reqShift.employee_id }).eq("id", request.target_shift_id);

    const { error } = await supabase
      .from("shift_swap_request")
      .update({ status: "accepted", decided_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(dbErrorMessage(error));
  } else {
    const { error } = await supabase
      .from("shift_swap_request")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/zamiany");
  revalidatePath("/admin/zamiany");
  revalidatePath("/grafik");
  revalidatePath("/admin/grafik");
}

export async function cancelSwapRequest(formData: FormData) {
  const employee = await requireEmployee();
  const id = String(formData.get("id") ?? "");

  const supabase = createServerSupabaseClient();
  const { data: request } = await supabase
    .from("shift_swap_request")
    .select("id, status, requester_employee_id")
    .eq("id", id)
    .single();

  if (!request || (request.requester_employee_id !== employee.id && !employee.roles.includes("admin"))) {
    throw new Error("Nie możesz anulować tej prośby.");
  }
  if (request.status !== "pending") {
    throw new Error("Ta prośba nie jest już aktywna.");
  }

  const { error } = await supabase
    .from("shift_swap_request")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));

  revalidatePath("/zamiany");
  revalidatePath("/admin/zamiany");
}
