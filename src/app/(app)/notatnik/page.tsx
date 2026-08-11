import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { Card } from "@/components/Card";
import { NotesBoard } from "./NotesBoard";

export default async function NotatnikPage() {
  const employee = await requireEmployee();
  const supabase = createServerSupabaseClient();

  const [{ data: notes }, { data: employees }, { data: links }] = await Promise.all([
    supabase
      .from("note")
      .select("id, author_employee_id, title, body, is_task, status, assignee_employee_id, created_at, updated_at")
      .order("created_at", { ascending: false }),
    supabase.from("employee").select("id, name, color_hex").eq("active", true).order("name"),
    supabase.from("note_link").select("note_id_a, note_id_b"),
  ]);

  const linksByNote = new Map<string, string[]>();
  for (const l of links ?? []) {
    if (!linksByNote.has(l.note_id_a)) linksByNote.set(l.note_id_a, []);
    linksByNote.get(l.note_id_a)!.push(l.note_id_b);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Notatnik</h1>
        <p className="text-sm text-zinc-500">
          Wspólne notatki i pomysły zespołu — każda notatka może zostać przekształcona w zadanie.
        </p>
      </div>

      <Card>
        <NotesBoard
          currentEmployeeId={employee.id}
          isAdmin={employee.role === "admin"}
          employees={employees ?? []}
          notes={(notes ?? []).map((n) => ({
            ...n,
            linkedIds: linksByNote.get(n.id) ?? [],
          }))}
        />
      </Card>
    </div>
  );
}
