"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Project = { id: string; name: string; status: string };
type Note = { id: string; title: string; linkedIds: string[]; project_id: string | null };

type Node = { id: string; label: string; kind: "project" | "note"; x: number; y: number; vx: number; vy: number; fixed: boolean };
type Edge = { a: string; b: string };

const WIDTH = 800;
const HEIGHT = 480;

export function LinkMap({
  projects,
  projectLinks,
  notes,
  noteLinks,
}: {
  projects: Project[];
  projectLinks: { project_id_a: string; project_id_b: string }[];
  notes: Note[];
  noteLinks: { note_id_a: string; note_id_b: string }[];
}) {
  const router = useRouter();
  const [nodes, setNodes] = useState<Node[]>([]);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const draggingRef = useRef<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const linkedNoteIds = new Set(notes.filter((n) => n.linkedIds.length > 0).map((n) => n.id));
    const initial: Node[] = [
      ...projects.map((p, i) => ({
        id: `project:${p.id}`,
        label: p.name,
        kind: "project" as const,
        x: WIDTH / 2 + Math.cos(i) * 150,
        y: HEIGHT / 2 + Math.sin(i) * 150,
        vx: 0,
        vy: 0,
        fixed: false,
      })),
      ...notes
        .filter((n) => linkedNoteIds.has(n.id))
        .map((n, i) => ({
          id: `note:${n.id}`,
          label: n.title,
          kind: "note" as const,
          x: WIDTH / 2 + Math.cos(i + 1.5) * 250,
          y: HEIGHT / 2 + Math.sin(i + 1.5) * 250,
          vx: 0,
          vy: 0,
          fixed: false,
        })),
    ];

    const seen = new Set<string>();
    const edges: Edge[] = [];
    for (const l of projectLinks) {
      const key = [l.project_id_a, l.project_id_b].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: `project:${l.project_id_a}`, b: `project:${l.project_id_b}` });
    }
    const seenNote = new Set<string>();
    for (const l of noteLinks) {
      const key = [l.note_id_a, l.note_id_b].sort().join("|");
      if (seenNote.has(key)) continue;
      seenNote.add(key);
      edges.push({ a: `note:${l.note_id_a}`, b: `note:${l.note_id_b}` });
    }

    nodesRef.current = initial;
    edgesRef.current = edges;
    setNodes(initial);
  }, [projects, projectLinks, notes, noteLinks]);

  useEffect(() => {
    let raf: number;
    function tick() {
      const ns = nodesRef.current;
      const edges = edgesRef.current;
      for (let i = 0; i < ns.length; i++) {
        const a = ns[i];
        if (a.fixed) continue;
        let fx = 0;
        let fy = 0;
        // Odpychanie między wszystkimi węzłami.
        for (let j = 0; j < ns.length; j++) {
          if (i === j) continue;
          const b = ns[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = Math.max(dx * dx + dy * dy, 25);
          const force = 1800 / distSq;
          fx += (dx / Math.sqrt(distSq)) * force;
          fy += (dy / Math.sqrt(distSq)) * force;
        }
        // Przyciąganie do środka.
        fx += (WIDTH / 2 - a.x) * 0.002;
        fy += (HEIGHT / 2 - a.y) * 0.002;
        a.vx = (a.vx + fx) * 0.8;
        a.vy = (a.vy + fy) * 0.8;
      }
      // Przyciąganie wzdłuż krawędzi.
      for (const e of edges) {
        const a = ns.find((n) => n.id === e.a);
        const b = ns.find((n) => n.id === e.b);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 130;
        const force = (dist - target) * 0.02;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.fixed) {
          a.vx += fx;
          a.vy += fy;
        }
        if (!b.fixed) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }
      for (const n of ns) {
        if (n.fixed) continue;
        n.x = Math.min(WIDTH - 20, Math.max(20, n.x + n.vx));
        n.y = Math.min(HEIGHT - 20, Math.max(20, n.y + n.vy));
      }
      setNodes([...ns]);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  function toSvgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * WIDTH, y: ((clientY - rect.top) / rect.height) * HEIGHT };
  }

  function handlePointerDown(id: string) {
    draggingRef.current = id;
    const n = nodesRef.current.find((x) => x.id === id);
    if (n) n.fixed = true;
  }
  function handlePointerMove(e: React.PointerEvent) {
    const id = draggingRef.current;
    if (!id) return;
    const n = nodesRef.current.find((x) => x.id === id);
    if (!n) return;
    const p = toSvgPoint(e.clientX, e.clientY);
    n.x = p.x;
    n.y = p.y;
    n.vx = 0;
    n.vy = 0;
  }
  function handlePointerUp() {
    const id = draggingRef.current;
    if (id) {
      const n = nodesRef.current.find((x) => x.id === id);
      if (n) n.fixed = false;
    }
    draggingRef.current = null;
  }

  function handleClick(node: Node) {
    if (node.kind === "project") {
      router.push(`/notatnik/projekty/${node.id.replace("project:", "")}`);
    }
  }

  const edges = edgesRef.current;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  if (nodes.length === 0) {
    return <p className="text-sm text-zinc-400">Brak projektów ani powiązanych notatek do pokazania.</p>;
  }

  return (
    <div>
      <p className="mb-2 text-sm text-zinc-500">
        Węzły: projekty (pomarańczowe) i powiązane notatki (szare). Przeciągnij, żeby ułożyć wygodniej. Kliknij projekt, żeby go otworzyć.
      </p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[480px] w-full touch-none rounded-xl border border-zinc-200 bg-zinc-50"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {edges.map((e, i) => {
          const a = nodeById.get(e.a);
          const b = nodeById.get(e.b);
          if (!a || !b) return null;
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d4d4d8" strokeWidth={1.5} />;
        })}
        {nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x},${n.y})`} onPointerDown={() => handlePointerDown(n.id)} onClick={() => handleClick(n)} style={{ cursor: "pointer" }}>
            <circle r={n.kind === "project" ? 10 : 6} fill={n.kind === "project" ? "#E8572A" : "#a1a1aa"} stroke="#fff" strokeWidth={2} />
            <text x={n.kind === "project" ? 14 : 10} y={4} fontSize={11} fill="#3f3f46" fontWeight={n.kind === "project" ? 700 : 400}>
              {n.label.length > 24 ? `${n.label.slice(0, 24)}…` : n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
