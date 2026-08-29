import { DayTimeEntryEditor, type TimeEntryRow } from "./DayTimeEntryEditor";
import { addTimeEntry, updateTimeEntry, deleteTimeEntry } from "./actions";

type DayEntry = {
  dateKey: string;
  label: string;
  scheduled: string;
  // Zostaw undefined (panel admina), żeby wyłączyć wymóg notatki przy
  // rozbieżności — patrz komentarz w DayTimeEntryEditor.
  scheduledRaw?: { start_time: string; end_time: string }[];
  editable: boolean;
  entries: TimeEntryRow[];
};

// addAction/updateAction/deleteAction: domyślnie zapisują dla zalogowanego
// pracownika (godziny/actions.ts). Panel admina wstrzykuje własne akcje,
// które zapisują dla dowolnego pracownika i pomijają okno 7 dni.
export function TimeEntryList({
  days,
  addAction = addTimeEntry,
  updateAction = updateTimeEntry,
  deleteAction = deleteTimeEntry,
}: {
  days: DayEntry[];
  addAction?: (date: string, actualStart: string, actualEnd: string, note: string) => Promise<{ id: string }>;
  updateAction?: (id: string, actualStart: string, actualEnd: string, note: string) => Promise<void>;
  deleteAction?: (id: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-col divide-y divide-zinc-100">
      {days.map((day) => {
        if (!day.editable) {
          return (
            <div key={day.dateKey} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold capitalize text-zinc-900">{day.label}</div>
                {day.scheduled && <div className="text-xs text-zinc-500">Grafik: {day.scheduled}</div>}
              </div>
              <div className="text-sm text-zinc-600">
                {day.entries.length > 0 ? (
                  day.entries.map((e) => (
                    <div key={e.id}>
                      {e.actualStart}–{e.actualEnd}
                      {e.note && <span className="text-zinc-400"> · {e.note}</span>}
                    </div>
                  ))
                ) : (
                  <span className="text-zinc-400">brak wpisu — okno edycji minęło</span>
                )}
              </div>
            </div>
          );
        }
        return (
          <div key={day.dateKey} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-3">
            <div className="min-w-[120px]">
              <div className="text-sm font-semibold capitalize text-zinc-900">{day.label}</div>
              {day.scheduled && <div className="text-xs text-zinc-500">Grafik: {day.scheduled}</div>}
            </div>
            <div className="flex-1">
              <DayTimeEntryEditor
                dateKey={day.dateKey}
                initialEntries={day.entries}
                scheduled={day.scheduledRaw}
                addAction={addAction}
                updateAction={updateAction}
                deleteAction={deleteAction}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
