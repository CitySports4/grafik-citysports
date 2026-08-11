"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { dbErrorMessage } from "@/lib/db-error";
import { hoursBetween } from "@/lib/time";
import { buildAvailabilityMap, applyPlannedAbsences, isHardUnavailable, type HardConstraint } from "@/lib/unavailability";

export type SwapSuggestion = {
  employeeId: string;
  employeeName: string;
  colorHex: string;
  theirShiftId: string;
  theirDate: string;
  theirStartTime: string;
  theirEndTime: string;
};

// Dla jednej z MOICH zmian: kogo mogę poprosić o zamianę. Kandydat musi (a)
// nie pracować już tego dnia co moja zmiana, (b) nie być twardo niedostępny
// w porze mojej zmiany. Każda z JEGO zmian w tym samym miesiącu, którą mógłbym
// wziąć w zamian, musi analogicznie pasować mnie (nie pracuję już wtedy, nie
// jestem niedostępny w tamtej porze) — inaczej sugestia byłaby bez sensu.
export async function getSwapSuggestions(myShiftId: string): Promise<SwapSuggestion[]> {
  const me = await requireEmployee();
  const supabase = createServerSupabaseClient();

  const { data: myShift } = await supabase
    .from("schedule_shift")
    .select("id, slot_index, start_time, end_time, employee_id, schedule_day!inner(date, weekday, schedule_month_id, schedule_month!inner(status))")
    .eq("id", myShiftId)
    .single();

  type ShiftJoin = {
    id: string;
    slot_index: number;
    start_time: string;
    end_time: string;
    employee_id: string | null;
    schedule_day: { date: string; weekday: number; schedule_month_id: string; schedule_month: { status: string } };
  };
  const shift = myShift as unknown as ShiftJoin | null;
  if (!shift || shift.employee_id !== me.id) {
    throw new Error("To nie jest Twoja zmiana.");
  }
  if (shift.schedule_day.schedule_month.status !== "published") {
    throw new Error("Grafik na ten miesiąc nie jest opublikowany.");
  }
  const monthId = shift.schedule_day.schedule_month_id;
  const myDate = shift.schedule_day.date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [
    { data: employees },
    { data: constraints },
    { data: submissions },
    { data: absences },
    { data: sameDayShifts },
    { data: myMonthShifts },
  ] = await Promise.all([
    supabase.from("employee").select("id, name, color_hex").eq("active", true).neq("id", me.id),
    supabase.from("weekly_recurring_constraint").select("employee_id, weekday, start_time, end_time, type"),
    supabase.from("availability_submission").select("id, employee_id").eq("schedule_month_id", monthId),
    supabase.from("planned_absence").select("employee_id, start_date, end_date"),
    supabase.from("schedule_shift").select("employee_id, schedule_day!inner(date)").eq("schedule_day.date", myDate).not("employee_id", "is", null),
    supabase
      .from("schedule_shift")
      .select("id, slot_index, start_time, end_time, schedule_day!inner(date, weekday, schedule_month_id)")
      .eq("employee_id", me.id)
      .eq("schedule_day.schedule_month_id", monthId),
  ]);

  const submissionIds = (submissions ?? []).map((s) => s.id);
  const employeeIdBySubmission = new Map((submissions ?? []).map((s) => [s.id, s.employee_id]));
  const { data: entries } =
    submissionIds.length > 0
      ? await supabase.from("availability_entry").select("availability_submission_id, date, whole_day, slot_index").in("availability_submission_id", submissionIds)
      : { data: [] };

  const availability = buildAvailabilityMap(entries ?? [], employeeIdBySubmission);
  applyPlannedAbsences(availability, absences ?? []);

  const hardConstraintsByEmployee = new Map<string, HardConstraint[]>();
  for (const c of constraints ?? []) {
    if (c.type !== "unavailable") continue;
    if (!hardConstraintsByEmployee.has(c.employee_id)) hardConstraintsByEmployee.set(c.employee_id, []);
    hardConstraintsByEmployee.get(c.employee_id)!.push({ weekday: c.weekday, start_time: c.start_time, end_time: c.end_time });
  }

  const workingSameDay = new Set((sameDayShifts ?? []).map((s) => s.employee_id).filter(Boolean));

  type MyShiftRow = { id: string; slot_index: number; start_time: string; end_time: string; schedule_day: { date: string; weekday: number } };
  const myOtherShifts = ((myMonthShifts ?? []) as unknown as MyShiftRow[]).filter((s) => s.id !== myShiftId && s.schedule_day.date >= todayKey);
  const myDatesWorked = new Set(myOtherShifts.map((s) => s.schedule_day.date));

  const suggestions: SwapSuggestion[] = [];

  for (const candidate of employees ?? []) {
    if (workingSameDay.has(candidate.id)) continue; // już pracuje tego dnia — zamiana by go podwójnie obciążyła
    if (isHardUnavailable(candidate.id, myDate, shift.schedule_day.weekday, shift.slot_index, shift.start_time, shift.end_time, availability, hardConstraintsByEmployee)) {
      continue;
    }

    const { data: theirShiftsRaw } = await supabase
      .from("schedule_shift")
      .select("id, slot_index, start_time, end_time, schedule_day!inner(date, weekday, schedule_month_id)")
      .eq("employee_id", candidate.id)
      .eq("schedule_day.schedule_month_id", monthId)
      .gte("schedule_day.date", todayKey);

    for (const s of (theirShiftsRaw ?? []) as unknown as MyShiftRow[]) {
      if (myDatesWorked.has(s.schedule_day.date)) continue; // ja już pracuję tego dnia
      if (isHardUnavailable(me.id, s.schedule_day.date, s.schedule_day.weekday, s.slot_index, s.start_time, s.end_time, availability, hardConstraintsByEmployee)) {
        continue;
      }
      suggestions.push({
        employeeId: candidate.id,
        employeeName: candidate.name,
        colorHex: candidate.color_hex,
        theirShiftId: s.id,
        theirDate: s.schedule_day.date,
        theirStartTime: s.start_time,
        theirEndTime: s.end_time,
      });
    }
  }

  suggestions.sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.theirDate.localeCompare(b.theirDate));
  return suggestions.slice(0, 30);
}

export async function createSwapRequest(requesterShiftId: string, targetShiftId: string) {
  const employee = await requireEmployee();

  if (!requesterShiftId || !targetShiftId) {
    throw new Error("Wybierz obie zmiany do zamiany.");
  }
  if (requesterShiftId === targetShiftId) {
    throw new Error("Nie można zamienić zmiany z samą sobą.");
  }

  const supabase = createServerSupabaseClient();

  const [{ data: mine }, { data: theirs }] = await Promise.all([
    supabase.from("schedule_shift").select("id, employee_id, start_time, end_time").eq("id", requesterShiftId).single(),
    supabase.from("schedule_shift").select("id, employee_id, start_time, end_time").eq("id", targetShiftId).single(),
  ]);

  if (!mine || mine.employee_id !== employee.id) {
    throw new Error("To nie jest Twoja zmiana.");
  }
  if (!theirs || !theirs.employee_id) {
    throw new Error("Wybrana zmiana docelowa jest nieprzypisana.");
  }

  const hour_delta = hoursBetween(theirs.start_time, theirs.end_time) - hoursBetween(mine.start_time, mine.end_time);

  const { error } = await supabase.from("shift_swap_request").insert({
    requester_employee_id: employee.id,
    requester_shift_id: requesterShiftId,
    target_employee_id: theirs.employee_id,
    target_shift_id: targetShiftId,
    hour_delta,
  });

  if (error) {
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/grafik");
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

  revalidatePath("/admin/zamiany");
  revalidatePath("/grafik");
}
