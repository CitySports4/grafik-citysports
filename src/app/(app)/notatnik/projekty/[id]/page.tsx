import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { requireEmployee } from "@/lib/session";
import { Card } from "@/components/Card";
import { NotesBoard } from "../../NotesBoard";
import { ProjectHeader } from "./ProjectHeader";
import { PowiazaniaToggle } from "./PowiazaniaToggle";
import { LinkMap } from "../../LinkMap";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const employee = await requireEmployee();
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const [{ data: project }, { data: notes }, { data: employees }, { data: links }, { data: comments }, { data: allProjects }, { data: projectLinks }] =
    await Promise.all([
      supabase.from("project").select("id, name, description, status, created_at").eq("id", id).maybeSingle(),
      supabase
        .from("note")
        .select(
          "id, author_employee_id, title, body, is_task, status, assignee_employee_id, created_at, updated_at, project_id, category, priority, due_date, is_long_term, source"
        )
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("employee").select("id, name, color_hex").eq("active", true).order("name"),
      supabase.from("note_link").select("note_id_a, note_id_b"),
      supabase.from("note_comment").select("id, note_id, author_employee_id, body, created_at").order("created_at"),
      supabase.from("project").select("id, name").neq("id", id).order("name"),
      supabase.from("project_link").select("project_id_a, project_id_b").eq("project_id_a", id),
    ]);

  if (!project) notFound();

  const linkedProjectIdsForMap = (projectLinks ?? []).map((l) => l.project_id_b);
  const { data: linkedProjectRows } =
    linkedProjectIdsForMap.length > 0
      ? await supabase.from("project").select("id, name, status").in("id", linkedProjectIdsForMap)
      : { data: [] };
  const mapProjects = [{ id: project.id, name: project.name, status: project.status }, ...(linkedProjectRows ?? [])];
  const projectNoteIds = new Set((notes ?? []).map((n) => n.id));
  const noteLinksInProject = (links ?? []).filter((l) => projectNoteIds.has(l.note_id_a) && projectNoteIds.has(l.note_id_b));

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
  const deadlines = fullNotes.filter((n) => n.due_date).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  const linkedProjectIds = new Set((projectLinks ?? []).map((l) => l.project_id_b));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/notatnik?tab=projekty" className="text-sm font-semibold text-zinc-500 hover:text-zinc-800">
        ← Wszystkie projekty
      </Link>

      <ProjectHeader
        project={project}
        allProjects={allProjects ?? []}
        linkedProjectIds={linkedProjectIds}
      />

      {deadlines.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold text-zinc-900">Terminy</h2>
          <ul className="flex flex-col gap-1.5">
            {deadlines.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700">{d.title}</span>
                <span className="text-xs font-semibold text-zinc-500">
                  {new Date(d.due_date! + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold text-zinc-900">Zadania i uwagi</h2>
        <NotesBoard
          mode="projekt"
          scopedProjectId={id}
          currentEmployeeId={employee.id}
          isAdmin={employee.roles.includes("admin")}
          employees={employees ?? []}
          notes={fullNotes}
          projects={[]}
        />
      </Card>

      <Card>
        <PowiazaniaToggle>
          <LinkMap projects={mapProjects} projectLinks={projectLinks ?? []} notes={fullNotes} noteLinks={noteLinksInProject} />
        </PowiazaniaToggle>
      </Card>
    </div>
  );
}
