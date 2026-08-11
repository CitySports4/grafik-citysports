import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { Card } from "@/components/Card";
import { NotesBoard, type NotesBoardMode } from "./NotesBoard";
import { ProjectList } from "./ProjectList";

const TABS: { key: string; label: string }[] = [
  { key: "wszystko", label: "Wszystko" },
  { key: "zadania", label: "Zadania" },
  { key: "pomysly", label: "Pomysły" },
  { key: "plany", label: "Plany" },
  { key: "projekty", label: "Projekty" },
];

export default async function NotatnikPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const employee = await requireEmployee();
  const params = await searchParams;
  const tab = TABS.some((t) => t.key === params.tab) ? params.tab! : "wszystko";

  const supabase = createServerSupabaseClient();

  const [{ data: notes }, { data: employees }, { data: links }, { data: comments }, { data: projects }] = await Promise.all([
    supabase
      .from("note")
      .select(
        "id, author_employee_id, title, body, is_task, status, assignee_employee_id, created_at, updated_at, project_id, category, priority, due_date, is_long_term, source"
      )
      .order("created_at", { ascending: false }),
    supabase.from("employee").select("id, name, color_hex").eq("active", true).order("name"),
    supabase.from("note_link").select("note_id_a, note_id_b"),
    supabase.from("note_comment").select("id, note_id, author_employee_id, body, created_at").order("created_at"),
    supabase.from("project").select("id, name, description, status, created_at").order("created_at", { ascending: false }),
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

  const fullNotes = (notes ?? []).map((n) => ({
    ...n,
    linkedIds: linksByNote.get(n.id) ?? [],
    comments: commentsByNote.get(n.id) ?? [],
  }));
  const projectRefs = (projects ?? []).map((p) => ({ id: p.id, name: p.name }));

  const openTaskCountByProject = new Map<string, number>();
  for (const n of fullNotes) {
    if (n.is_task && n.status !== "done" && n.project_id) {
      openTaskCountByProject.set(n.project_id, (openTaskCountByProject.get(n.project_id) ?? 0) + 1);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Notatnik</h1>
        <p className="text-sm text-zinc-500">Wspólna tablica zespołu — notatki, zadania, pomysły, plany, projekty.</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/notatnik?tab=${t.key}`}
            className={`px-3 py-2 text-sm font-semibold ${
              tab === t.key ? "border-b-2 border-brand-orange text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "projekty" ? (
        <ProjectList projects={projects ?? []} openTaskCountByProject={openTaskCountByProject} />
      ) : (
        <Card>
          <NotesBoard
            mode={tab as NotesBoardMode}
            currentEmployeeId={employee.id}
            isAdmin={employee.roles.includes("admin")}
            employees={employees ?? []}
            notes={fullNotes}
            projects={projectRefs}
          />
        </Card>
      )}
    </div>
  );
}
