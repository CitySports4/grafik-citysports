import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { toDateKey } from "@/lib/schedule-month";
import { weekdayLabel } from "@/lib/weekdays";
import { getCleaningDayItems } from "@/lib/cleaning-day";
import { Card } from "@/components/Card";
import { CleaningDayList } from "../sprzatanie/CleaningDayList";
import { NotesBoard } from "../notatnik/NotesBoard";

// Jedna strona "Zadania" — dwie sekcje jednej listy: to co trzeba dziś
// zrobić przy sprzątaniu (zależne od grafiku) i wszystko inne (zadania z
// notatnika). Wcześniej "Zadania" w nawigacji było grupą dwóch osobnych
// stron (godziny pracy + sprzątanie), co myliło — godziny pracy to grafik,
// nie zadanie do zrobienia.
export default async function ZadaniaPage() {
  const employee = await requireEmployee();
  const today = toDateKey(new Date());
  const weekday = new Date(today + "T00:00:00").getDay();

  const supabase = createServerSupabaseClient();
  const [{ items: cleaningItems }, { data: notes }, { data: employees }, { data: links }, { data: comments }, { data: projects }] =
    await Promise.all([
      getCleaningDayItems(today),
      supabase
        .from("note")
        .select(
          "id, author_employee_id, title, body, is_task, status, assignee_employee_id, created_at, updated_at, project_id, category, priority, due_date, is_long_term, source"
        )
        .eq("is_task", true)
        .order("created_at", { ascending: false }),
      supabase.from("employee").select("id, name, color_hex").eq("active", true).order("name"),
      supabase.from("note_link").select("note_id_a, note_id_b"),
      supabase.from("note_comment").select("id, note_id, author_employee_id, body, created_at").order("created_at"),
      supabase.from("project").select("id, name").order("name"),
    ]);

  const linksByNote = new Map<string, string[]>();
  for (const l of links ?? []) {
    if (!linksByNote.has(l.note_id_a)) linksByNote.set(l.note_id_a, []);
    linksByNote.get(l.note_id_a)!.push(l.note_id_b);
  }
  const commentsByNote = new Map<string, typeof comments>();
  for (const c of comments ?? []) {
    if (!commentsByNote.has(c.note_id)) commentsByNote.set(c.note_id, []);
    commentsByNote.get(c.note_id)!.push(c);
  }
  const otherTasks = (notes ?? []).map((n) => ({
    ...n,
    linkedIds: linksByNote.get(n.id) ?? [],
    comments: commentsByNote.get(n.id) ?? [],
  }));
  const projectRefs = (projects ?? []).map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Zadania</h1>
        <p className="text-sm text-zinc-500">Co jest do zrobienia — sprzątanie na dziś i wszystko inne.</p>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-zinc-900">
            Zadania na sprzątanie — {weekdayLabel(weekday)}, {new Date(today + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}
          </h2>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/sprzatanie" className="font-semibold text-zinc-500 hover:text-zinc-800">
              inny dzień →
            </Link>
            <Link href="/sprzatanie/pula" className="font-semibold text-zinc-500 hover:text-zinc-800">
              pula zadań →
            </Link>
          </div>
        </div>
        {cleaningItems.length === 0 ? (
          <p className="text-sm text-zinc-400">Brak zadań sprzątania na dziś.</p>
        ) : (
          <CleaningDayList date={today} items={cleaningItems} />
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Inne</h2>
        <NotesBoard
          mode="zadania"
          currentEmployeeId={employee.id}
          isAdmin={employee.roles.includes("admin")}
          employees={employees ?? []}
          notes={otherTasks}
          projects={projectRefs}
        />
      </Card>
    </div>
  );
}
