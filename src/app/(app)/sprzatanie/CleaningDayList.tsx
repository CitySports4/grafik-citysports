"use client";

import { useState, useTransition } from "react";
import { toggleChecklistItem, toggleTaskDone } from "./actions";
import { ColorDot } from "@/components/ColorDot";

type ChecklistItem = { id: string; label: string; done: boolean };
type Item = {
  taskId: string;
  name: string;
  timeMinutes: number;
  slot: "otwarcie" | "srodek" | "zamkniecie";
  assignee: { name: string; color_hex: string } | null;
  checklist: ChecklistItem[];
  done: boolean;
};

const SLOT_LABELS: Record<Item["slot"], string> = {
  otwarcie: "Otwarcie",
  srodek: "Środek dnia",
  zamkniecie: "Zamknięcie",
};
const SLOT_ORDER: Item["slot"][] = ["otwarcie", "srodek", "zamkniecie"];

export function CleaningDayList({ date, items }: { date: string; items: Item[] }) {
  const [state, setState] = useState(items);
  const [, startTransition] = useTransition();

  function handleToggleDone(taskId: string) {
    setState((prev) => prev.map((it) => (it.taskId === taskId ? { ...it, done: !it.done } : it)));
    startTransition(() => {
      toggleTaskDone(taskId, date);
    });
  }

  function handleToggleChecklist(taskId: string, itemId: string) {
    setState((prev) =>
      prev.map((it) => {
        if (it.taskId !== taskId) return it;
        const checklist = it.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c));
        return { ...it, checklist, done: checklist.length > 0 && checklist.every((c) => c.done) };
      })
    );
    const item = state.find((it) => it.taskId === taskId);
    const allItemIds = (item?.checklist ?? []).map((c) => c.id);
    startTransition(() => {
      toggleChecklistItem(taskId, date, itemId, allItemIds);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {SLOT_ORDER.map((slot) => {
        const slotItems = state.filter((it) => it.slot === slot);
        if (slotItems.length === 0) return null;
        return (
          <div key={slot}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">{SLOT_LABELS[slot]}</h3>
            <div className="flex flex-col gap-2">
              {slotItems.map((it) => (
                <div key={it.taskId} className={`rounded-xl border p-3 ${it.done ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {it.checklist.length === 0 && (
                        <button
                          type="button"
                          onClick={() => handleToggleDone(it.taskId)}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                            it.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300"
                          }`}
                        >
                          {it.done ? "✓" : ""}
                        </button>
                      )}
                      <span className={`text-sm font-semibold ${it.done ? "text-emerald-700 line-through" : "text-zinc-900"}`}>{it.name}</span>
                      <span className="text-xs text-zinc-400">{it.timeMinutes} min</span>
                    </div>
                    {it.assignee ? (
                      <span className="flex items-center gap-1 text-xs text-zinc-600">
                        <ColorDot color={it.assignee.color_hex} />
                        {it.assignee.name}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-red-500">⚠ brak przypisania</span>
                    )}
                  </div>
                  {it.checklist.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 border-t border-zinc-100 pt-2">
                      {it.checklist.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => handleToggleChecklist(it.taskId, c.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-xs hover:bg-zinc-50"
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
                                c.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300"
                              }`}
                            >
                              {c.done ? "✓" : ""}
                            </span>
                            <span className={c.done ? "text-zinc-400 line-through" : "text-zinc-700"}>{c.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
