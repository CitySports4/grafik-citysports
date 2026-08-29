import Link from "next/link";
import { Fragment } from "react";
import { createServerSupabaseClient } from "@/lib/supabase";
import { Card } from "@/components/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ColorDot } from "@/components/ColorDot";
import { BackLink } from "@/components/BackLink";
import { freeMinutesOutsideWeekdayBlackout, WEEKDAY_CLEANING_BLACKOUT } from "@/lib/cleaning";
import {
  addZone,
  deleteZone,
  addTask,
  toggleTaskActive,
  deleteTask,
  addChecklistItem,
  deleteChecklistItem,
  setCycleStart,
  setEmployeeZones,
  addChecklistTemplate,
  deleteChecklistTemplate,
  addChecklistTemplateItem,
  deleteChecklistTemplateItem,
  setTimeBudget,
} from "./actions";

const INPUT = "w-full rounded-xl border-[1.5px] border-zinc-300 px-3 py-1.5 text-sm";
const LABEL = "text-xs font-semibold text-zinc-600";
const DANGER_BTN = "rounded-lg px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-50";

const FREQ_LABELS: Record<string, string> = {
  daily: "Codziennie",
  "3xweek": "3× w tygodniu",
  "2xweek": "2× w tygodniu",
  weekly: "Co tydzień",
  biweekly: "Co 2 tygodnie",
  monthly: "Co 4 tygodnie",
  quarterly: "Co kwartał",
};
const SLOT_LABELS: Record<string, string> = {
  otwarcie: "Otwarcie (1. zmiana)",
  srodek: "Środek (2. zmiana, jeśli jest)",
  zamkniecie: "Zamknięcie (ostatnia zmiana)",
  po_zamknieciu: "Po zamknięciu",
};
const DAY_CONSTRAINT_LABELS: Record<string, string> = {
  mon_fri: "Tylko pon–pt",
  not_weekend: "Nie w weekend",
};

const TABS = [
  { key: "strefy", label: "Strefy i zadania" },
  { key: "szablony", label: "Szablony checklist" },
  { key: "kompetencje", label: "Kompetencje" },
  { key: "budzety", label: "Budżety czasowe" },
  { key: "ustawienia", label: "Ustawienia" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function CleaningConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === params.tab)?.key ?? "strefy") as TabKey;

  const supabase = createServerSupabaseClient();

  const [
    { data: settings },
    { data: zones },
    { data: tasks },
    { data: checklistItems },
    { data: employees },
    { data: employeeZones },
    { data: templates },
    { data: templateItems },
    { data: timeBudgets },
    { data: mondayShiftTemplates },
  ] = await Promise.all([
    supabase.from("cleaning_settings").select("cycle_start").eq("id", true).maybeSingle(),
    supabase.from("cleaning_zone").select("id, name, group_code, sort_order").order("sort_order").order("name"),
    supabase
      .from("cleaning_task")
      .select(
        "id, zone_id, name, time_minutes, frequency, slot, active, day_constraint, note, carry_pair_task_id, skip_with_task_id, checklist_template_id"
      )
      .order("sort_order"),
    supabase.from("cleaning_checklist_item").select("id, task_id, label, sort_order").order("sort_order"),
    supabase.from("employee").select("id, name, color_hex").eq("active", true).order("name"),
    supabase.from("employee_cleaning_zone").select("employee_id, zone_id"),
    supabase.from("cleaning_checklist_template").select("id, name").order("name"),
    supabase.from("cleaning_checklist_template_item").select("id, template_id, label, sort_order").order("sort_order"),
    supabase.from("cleaning_time_budget").select("employee_id, slot, budget_minutes"),
    // Poniedziałek jako reprezentatywny dzień powszedni (ten sam uproszczony
    // wzorzec co w /print/grafik) — do ostrzeżenia o blokadzie 16:30-21:10
    // pon-pt w budżetach czasowych niżej.
    supabase.from("shift_template").select("slot_index, default_start_time, default_end_time").eq("weekday", 1),
  ]);

  const tasksByZone = new Map<string, typeof tasks>();
  for (const t of tasks ?? []) {
    if (!tasksByZone.has(t.zone_id)) tasksByZone.set(t.zone_id, []);
    tasksByZone.get(t.zone_id)!.push(t);
  }
  const checklistByTask = new Map<string, typeof checklistItems>();
  for (const c of checklistItems ?? []) {
    if (!checklistByTask.has(c.task_id)) checklistByTask.set(c.task_id, []);
    checklistByTask.get(c.task_id)!.push(c);
  }
  const zoneIdsByEmployee = new Map<string, Set<string>>();
  for (const ez of employeeZones ?? []) {
    if (!zoneIdsByEmployee.has(ez.employee_id)) zoneIdsByEmployee.set(ez.employee_id, new Set());
    zoneIdsByEmployee.get(ez.employee_id)!.add(ez.zone_id);
  }
  const taskById = new Map((tasks ?? []).map((t) => [t.id, t]));
  const templateItemsByTemplate = new Map<string, typeof templateItems>();
  for (const it of templateItems ?? []) {
    if (!templateItemsByTemplate.has(it.template_id)) templateItemsByTemplate.set(it.template_id, []);
    templateItemsByTemplate.get(it.template_id)!.push(it);
  }
  const budgetByEmpSlot = new Map((timeBudgets ?? []).map((b) => [`${b.employee_id}|${b.slot}`, b.budget_minutes]));

  // Realny wolny czas per slot pon-pt, poza blokadą 16:30-21:10 — liczony z
  // poniedziałkowego szablonu zmian, posortowanego wg godziny startu (ta sama
  // kolejność co resolveDaySlots: pierwsza = otwarcie, ostatnia = zamknięcie/
  // po zamknięciu, środkowa = środek, jeśli jest).
  const sortedMondayShifts = [...(mondayShiftTemplates ?? [])].sort((a, b) => a.default_start_time.localeCompare(b.default_start_time));
  const freeMinutesBySlot: Partial<Record<string, number>> = {};
  if (sortedMondayShifts.length > 0) {
    const first = sortedMondayShifts[0];
    const last = sortedMondayShifts[sortedMondayShifts.length - 1];
    freeMinutesBySlot.otwarcie = freeMinutesOutsideWeekdayBlackout(first.default_start_time, first.default_end_time, 1);
    freeMinutesBySlot.zamkniecie = freeMinutesOutsideWeekdayBlackout(last.default_start_time, last.default_end_time, 1);
    freeMinutesBySlot.po_zamknieciu = freeMinutesBySlot.zamkniecie;
    if (sortedMondayShifts.length >= 3) {
      const middle = sortedMondayShifts[Math.floor(sortedMondayShifts.length / 2)];
      freeMinutesBySlot.srodek = freeMinutesOutsideWeekdayBlackout(middle.default_start_time, middle.default_end_time, 1);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin" label="Panel admina" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Konfiguracja sprzątania</h1>
          <p className="text-sm text-zinc-500">
            Strefy, zadania, checklisty i kto może sprzątać co. Przydział zadań na dany dzień zależy
            od tego, kto ma tego dnia zmianę (otwarcie/środek/zamknięcie/po zamknięciu) — patrz{" "}
            <span className="font-semibold">/sprzatanie</span>. Zadania nie-codzienne (co tydzień i
            rzadziej) nie mają ustalonego dnia tygodnia — system sam wybiera dzień w danym okresie, w
            którym kompetentna osoba faktycznie pracuje; zmiana w grafiku sama zmienia ten wybór.
          </p>
        </div>
        <Link href="/admin/sprzatanie/podglad" className="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-900">
          Podgląd miesiąca →
        </Link>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "strefy" ? "/admin/sprzatanie" : `/admin/sprzatanie?tab=${t.key}`}
            className={`px-3 py-2 text-sm font-semibold ${
              tab === t.key ? "border-b-2 border-brand-orange text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
            {t.key === "strefy" && ` (${(zones ?? []).length})`}
          </Link>
        ))}
      </div>

      {tab === "strefy" && (
        <>
          <Card>
            <h2 className="mb-2 font-semibold text-zinc-900">Dodaj strefę</h2>
            <form action={addZone} className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className={LABEL}>Nazwa</label>
                <input name="name" required className={INPUT} placeholder="np. Szatnia damska" />
              </div>
              <div className="flex flex-col gap-1">
                <label className={LABEL}>Grupa (opcjonalnie)</label>
                <input name="group_code" className={`${INPUT} max-w-[100px]`} placeholder="np. B" />
              </div>
              <SubmitButton className="rounded-xl bg-zinc-800 px-3 py-1.5 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
                Dodaj strefę
              </SubmitButton>
            </form>
          </Card>

          {/* Każda strefa domyślnie zwinięta (<details>) — przy 20 strefach
              rozwinięcie wszystkich naraz (jak było wcześniej) oznaczało 20
              pełnych formularzy "dodaj zadanie" (9 pól każdy) widocznych
              jednocześnie. Bez JS, czysto po stronie serwera. */}
          <div className="flex flex-col gap-3">
            {(zones ?? []).map((zone, i) => {
              const zoneTasks = tasksByZone.get(zone.id) ?? [];
              // Nagłówek klastra tylko przy pierwszej strefie nowej grupy —
              // strefy są posortowane wg sort_order, więc te same group_code
              // (fizycznie bliskie miejsca w klubie) są już obok siebie.
              const prevGroup = i > 0 ? (zones ?? [])[i - 1].group_code : undefined;
              const showGroupHeader = zone.group_code && zone.group_code !== prevGroup;
              return (
                <div key={zone.id} className="flex flex-col gap-3">
                  {showGroupHeader && (
                    <h3 className="mt-1 text-xs font-bold uppercase tracking-wide text-zinc-400">{zone.group_code}</h3>
                  )}
                  <Card className="!p-0">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 marker:content-none">
                      <span className="font-semibold text-zinc-900">
                        {zone.name}{" "}
                        <span className="text-xs font-normal text-zinc-400">
                          ({zoneTasks.length} {zoneTasks.length === 1 ? "zadanie" : "zadań"})
                        </span>
                      </span>
                      <span className="text-xs text-zinc-400 group-open:hidden">rozwiń ▸</span>
                      <span className="hidden text-xs text-zinc-400 group-open:inline">zwiń ▾</span>
                    </summary>

                    <div className="border-t border-zinc-100 p-4 pt-3">
                      <div className="mb-2 flex justify-end">
                        <form action={deleteZone}>
                          <input type="hidden" name="id" value={zone.id} />
                          <ConfirmButton confirmText={`Usunąć strefę "${zone.name}" wraz z jej zadaniami?`} className={DANGER_BTN}>
                            Usuń strefę
                          </ConfirmButton>
                        </form>
                      </div>

                      <ul className="mb-3 flex flex-col gap-2">
                        {zoneTasks.map((task) => {
                          const items = checklistByTask.get(task.id) ?? [];
                          const carryPair = task.carry_pair_task_id ? taskById.get(task.carry_pair_task_id) : null;
                          const skipWith = task.skip_with_task_id ? taskById.get(task.skip_with_task_id) : null;
                          return (
                            <li key={task.id} className={`rounded-lg border p-2.5 ${task.active ? "border-zinc-200 bg-zinc-50" : "border-zinc-100 bg-zinc-100 opacity-60"}`}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm">
                                  <span className="font-semibold text-zinc-900">{task.name}</span>{" "}
                                  <span className="text-xs text-zinc-500">
                                    · {task.time_minutes} min · {FREQ_LABELS[task.frequency] ?? task.frequency} ·{" "}
                                    {SLOT_LABELS[task.slot]}
                                    {task.day_constraint ? ` · ${DAY_CONSTRAINT_LABELS[task.day_constraint]}` : ""}
                                  </span>
                                  {task.note && <div className="text-xs italic text-zinc-500">{task.note}</div>}
                                  {(carryPair || skipWith) && (
                                    <div className="text-xs text-zinc-400">
                                      {carryPair && <>Powiązane (carry): {carryPair.name}. </>}
                                      {skipWith && <>Zastępowane przez: {skipWith.name}.</>}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <form action={toggleTaskActive}>
                                    <input type="hidden" name="id" value={task.id} />
                                    <input type="hidden" name="active" value={String(task.active)} />
                                    <button type="submit" className="rounded-lg px-2 py-0.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200">
                                      {task.active ? "Wyłącz" : "Włącz"}
                                    </button>
                                  </form>
                                  <form action={deleteTask}>
                                    <input type="hidden" name="id" value={task.id} />
                                    <ConfirmButton confirmText="Usunąć to zadanie?" className={DANGER_BTN}>
                                      Usuń
                                    </ConfirmButton>
                                  </form>
                                </div>
                              </div>

                              {task.checklist_template_id && (
                                <p className="mt-1.5 text-xs text-zinc-500">
                                  Checklista z szablonu: {templates?.find((t) => t.id === task.checklist_template_id)?.name}
                                </p>
                              )}
                              {!task.checklist_template_id && items.length > 0 && (
                                <ul className="mt-2 flex flex-col gap-1 border-t border-zinc-200 pt-2">
                                  {items.map((item) => (
                                    <li key={item.id} className="flex items-center justify-between text-xs text-zinc-600">
                                      <span>◦ {item.label}</span>
                                      <form action={deleteChecklistItem}>
                                        <input type="hidden" name="id" value={item.id} />
                                        <button type="submit" className="text-red-500 hover:underline">
                                          ✕
                                        </button>
                                      </form>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {!task.checklist_template_id && (
                                <form action={addChecklistItem} className="mt-2 flex items-center gap-1.5">
                                  <input type="hidden" name="task_id" value={task.id} />
                                  <input name="label" placeholder="Dodaj punkt checklisty (własnej)" className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
                                  <button type="submit" className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold hover:bg-zinc-100">
                                    +
                                  </button>
                                </form>
                              )}
                            </li>
                          );
                        })}
                        {zoneTasks.length === 0 && <li className="text-sm text-zinc-400">Brak zadań w tej strefie.</li>}
                      </ul>

                      <details className="rounded-lg border border-dashed border-zinc-200 p-2.5">
                        <summary className="cursor-pointer text-sm font-semibold text-zinc-600 marker:content-none">+ Dodaj zadanie</summary>
                        <form action={addTask} className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3">
                          <input type="hidden" name="zone_id" value={zone.id} />
                          <div className="flex flex-col gap-1">
                            <label className={LABEL}>Nazwa zadania</label>
                            <input name="name" required className={`${INPUT} min-w-[160px]`} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={LABEL}>Czas (min)</label>
                            <input type="number" name="time_minutes" defaultValue={10} className={`${INPUT} w-[80px]`} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={LABEL}>Częstotliwość</label>
                            <select name="frequency" className={INPUT} defaultValue="daily">
                              {Object.entries(FREQ_LABELS).map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={LABEL}>Zmiana</label>
                            <select name="slot" className={INPUT} defaultValue="otwarcie">
                              {Object.entries(SLOT_LABELS).map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={LABEL}>Ograniczenie dnia</label>
                            <select name="day_constraint" className={INPUT} defaultValue="">
                              <option value="">—</option>
                              {Object.entries(DAY_CONSTRAINT_LABELS).map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={LABEL}>Sparowane (carry)</label>
                            <select name="carry_pair_task_id" className={INPUT} defaultValue="">
                              <option value="">—</option>
                              {(tasks ?? []).map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={LABEL}>Zastępowane przez</label>
                            <select name="skip_with_task_id" className={INPUT} defaultValue="">
                              <option value="">—</option>
                              {(tasks ?? []).map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={LABEL}>Checklista z szablonu</label>
                            <select name="checklist_template_id" className={INPUT} defaultValue="">
                              <option value="">— własna —</option>
                              {(templates ?? []).map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={LABEL}>Notatka (opcjonalnie)</label>
                            <input name="note" className={`${INPUT} min-w-[160px]`} placeholder="np. Przed pierwszymi zajęciami" />
                          </div>
                          <SubmitButton className="rounded-xl bg-brand-orange px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
                            Dodaj zadanie
                          </SubmitButton>
                        </form>
                      </details>
                    </div>
                  </details>
                  </Card>
                </div>
              );
            })}
            {(zones ?? []).length === 0 && (
              <Card>
                <p className="text-sm text-zinc-400">Brak stref — dodaj pierwszą powyżej.</p>
              </Card>
            )}
          </div>
        </>
      )}

      {tab === "szablony" && (
        <Card>
          <h2 className="mb-1 font-semibold text-zinc-900">Szablony checklist</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Współdzielone między zadaniami (np. sanitariaty w kilku szatniach naraz) — wybierz przy
            dodawaniu zadania zamiast własnej checklisty.
          </p>
          <div className="flex flex-col gap-3">
            {(templates ?? []).map((tpl) => (
              <div key={tpl.id} className="rounded-lg border border-zinc-200 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-900">{tpl.name}</span>
                  <form action={deleteChecklistTemplate}>
                    <input type="hidden" name="id" value={tpl.id} />
                    <ConfirmButton confirmText={`Usunąć szablon "${tpl.name}"?`} className={DANGER_BTN}>
                      Usuń
                    </ConfirmButton>
                  </form>
                </div>
                <ul className="mb-2 flex flex-col gap-1">
                  {(templateItemsByTemplate.get(tpl.id) ?? []).map((item) => (
                    <li key={item.id} className="flex items-center justify-between text-xs text-zinc-600">
                      <span>◦ {item.label}</span>
                      <form action={deleteChecklistTemplateItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <button type="submit" className="text-red-500 hover:underline">
                          ✕
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                <form action={addChecklistTemplateItem} className="flex items-center gap-1.5">
                  <input type="hidden" name="template_id" value={tpl.id} />
                  <input name="label" placeholder="Dodaj punkt" className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
                  <button type="submit" className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold hover:bg-zinc-100">
                    +
                  </button>
                </form>
              </div>
            ))}
            {(templates ?? []).length === 0 && <p className="text-sm text-zinc-400">Brak szablonów.</p>}
          </div>
          <form action={addChecklistTemplate} className="mt-3 flex items-end gap-2 border-t border-zinc-100 pt-3">
            <div className="flex flex-col gap-1">
              <label className={LABEL}>Nowy szablon</label>
              <input name="name" required className={INPUT} placeholder="np. Sanitariaty — szatnia" />
            </div>
            <SubmitButton className="rounded-xl bg-zinc-800 px-3 py-1.5 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-50">
              Dodaj szablon
            </SubmitButton>
          </form>
        </Card>
      )}

      {tab === "kompetencje" && (
        <Card>
          <h2 className="mb-1 font-semibold text-zinc-900">Kompetencje sprzątania</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Które strefy dana osoba może sprzątać — granularnie, nie jednym przełącznikiem. Niezdolność
            do pracy na drabinie ustawia się w edycji danego pracownika.
          </p>
          <div className="flex flex-col gap-3">
            {(employees ?? []).map((emp) => (
              <form key={emp.id} action={setEmployeeZones} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-2.5">
                <input type="hidden" name="employee_id" value={emp.id} />
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
                    <ColorDot color={emp.color_hex} />
                    {emp.name}
                  </span>
                  <SubmitButton className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50">
                    Zapisz
                  </SubmitButton>
                </div>
                {/* Siatka zamiast płaskiej listy zawijanej flex-wrap — 14 stref
                    naraz w jednym ciągu było za dużo do ogarnięcia jednym
                    spojrzeniem. Grupowanie po piętrze (te same group_code co w
                    zakładce "Strefy i zadania") dzieli to na mniejsze, sensowne
                    kawałki, a stałe kolumny siatki wyrównują checkboxy zamiast
                    dowolnego zawijania zależnego od długości nazwy. */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                  {(zones ?? []).map((zone, i) => {
                    const prevGroup = i > 0 ? (zones ?? [])[i - 1].group_code : undefined;
                    const showGroupHeader = zone.group_code && zone.group_code !== prevGroup;
                    return (
                      <Fragment key={zone.id}>
                        {showGroupHeader && (
                          <h4 className="col-span-full mt-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400 first:mt-0">
                            {zone.group_code}
                          </h4>
                        )}
                        <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                          <input
                            type="checkbox"
                            name="zone_ids"
                            value={zone.id}
                            defaultChecked={zoneIdsByEmployee.get(emp.id)?.has(zone.id) ?? false}
                            className="h-3.5 w-3.5 shrink-0"
                          />
                          <span className="truncate">{zone.name}</span>
                        </label>
                      </Fragment>
                    );
                  })}
                </div>
              </form>
            ))}
          </div>
        </Card>
      )}

      {tab === "budzety" && (
        <Card>
          <h2 className="mb-1 font-semibold text-zinc-900">Budżety czasowe</h2>
          <p className="mb-1.5 text-sm text-zinc-500">
            Ile minut sprzątania na daną porę dnia jest &quot;normą&quot; dla danej osoby — używane do
            auto-wyrównywania obciążenia w dni, gdy w tym samym slocie pracuje więcej niż jedna osoba.
          </p>
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span className="font-bold">Twarda zasada:</span> pon–pt sprzątanie nie może się odbywać między{" "}
            {WEEKDAY_CLEANING_BLACKOUT.start} a {WEEKDAY_CLEANING_BLACKOUT.end} (klub zbyt zajęty). Budżet
            wyższy niż realnie wolny czas zmiany tego dnia (patrz ostrzeżenia przy polach niżej) i tak nie
            da się zrealizować.
          </p>
          <div className="flex flex-col gap-3">
            {(employees ?? []).map((emp) => (
              <div key={emp.id} className="rounded-lg border border-zinc-200 p-2.5">
                <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
                  <ColorDot color={emp.color_hex} />
                  {emp.name}
                </span>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SLOT_LABELS).map(([slot, label]) => {
                    const value = budgetByEmpSlot.get(`${emp.id}|${slot}`) ?? 60;
                    const freeMinutes = freeMinutesBySlot[slot];
                    const exceeds = freeMinutes !== undefined && value > freeMinutes;
                    return (
                      <form key={slot} action={setTimeBudget} className="flex items-center gap-1.5">
                        <input type="hidden" name="employee_id" value={emp.id} />
                        <input type="hidden" name="slot" value={slot} />
                        <label className="text-xs text-zinc-500" title={freeMinutes !== undefined ? `Realnie wolne (pon): ${freeMinutes} min` : undefined}>
                          {label}
                          {exceeds && <span className="ml-1 text-red-500">⚠ &gt;{freeMinutes} min wolnego</span>}
                        </label>
                        <input
                          type="number"
                          name="budget_minutes"
                          defaultValue={value}
                          className={`w-[64px] rounded-lg border px-2 py-1 text-xs ${exceeds ? "border-red-300" : "border-zinc-300"}`}
                        />
                        <button type="submit" className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold hover:bg-zinc-100">
                          ✓
                        </button>
                      </form>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "ustawienia" && (
        <Card>
          <h2 className="mb-2 font-semibold text-zinc-900">Start cykli (co 2/4 tyg., kwartalnie)</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Od tej daty (poniedziałek dowolnego tygodnia) liczą się zadania rzadsze niż tygodniowe.
            {settings?.cycle_start ? (
              <span className="ml-1 font-semibold text-emerald-600">Ustawiono: {settings.cycle_start}</span>
            ) : (
              <span className="ml-1 font-semibold text-amber-600">Nie ustawiono — takie zadania się nie pojawią.</span>
            )}
          </p>
          <form action={setCycleStart} className="flex items-end gap-2">
            <input type="date" name="cycle_start" required defaultValue={settings?.cycle_start ?? ""} className={`${INPUT} max-w-[200px]`} />
            <SubmitButton className="rounded-xl bg-brand-orange px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-orange-dark disabled:opacity-50">
              Ustaw
            </SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}
