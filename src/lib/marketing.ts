// Logika narzędzia planowania marketingu (zadania, kalendarz treści,
// strategie i plany) — funkcje czyste, bez dostępu do bazy, analogicznie
// do kids-classes.ts. Warstwa zapytań/akcji żyje w app/(app)/marketing.

// Status projektu eventowego (Sprint D, D2) — osobny od MarketingTaskStatus
// i ContentStatus, bo opisuje cały projekt (np. "Wigilia"), nie pojedyncze
// zadanie czy treść. Żyje na marketing_project.status, tylko dla
// type="event" (patrz migracja 0065).
export type EventProjectStatus = "planowanie" | "w_toku" | "zamkniety";
export const EVENT_PROJECT_STATUS_LABELS: Record<EventProjectStatus, string> = {
  planowanie: "Planowanie",
  w_toku: "W toku",
  zamkniety: "Zamknięty",
};
export const EVENT_PROJECT_STATUS_ORDER: EventProjectStatus[] = ["planowanie", "w_toku", "zamkniety"];

export type MarketingTaskStatus = "todo" | "in_progress" | "done";
export const TASK_STATUS_LABELS: Record<MarketingTaskStatus, string> = {
  todo: "Do zrobienia",
  in_progress: "W trakcie",
  done: "Zrobione",
};
export const TASK_STATUS_ORDER: MarketingTaskStatus[] = ["todo", "in_progress", "done"];

export type MarketingTaskPriority = "low" | "normal" | "high";
export const TASK_PRIORITY_LABELS: Record<MarketingTaskPriority, string> = {
  low: "Niski",
  normal: "Normalny",
  high: "Wysoki",
};

// Pola nagraniowe (Sprint D, D1) — opcjonalny dodatek do zadania, pokazywany
// w formularzu gdy assignee = Oliwia (osoba nagrywająca) albo ręczny toggle
// "zadanie nagraniowe". Nie blokują zapisu — patrz migracja 0064.
export type RecordingFormat = "rolka" | "relacja" | "zdjecia";
export const RECORDING_FORMAT_LABELS: Record<RecordingFormat, string> = {
  rolka: "Rolka",
  relacja: "Relacja",
  zdjecia: "Zdjęcia",
};
export const RECORDING_FORMAT_ICONS: Record<RecordingFormat, string> = {
  rolka: "🎬",
  relacja: "⭕",
  zdjecia: "📷",
};

// Bez TikToka — klub tam nic nie publikuje (patrz migracja 0053). Facebook i
// Instagram NIE są rozdzielane — ten sam materiał zawsze idzie na oba naraz,
// więc liczą się jako jeden kanał (patrz migracja 0058), nie dwa osobne do
// wyboru.
export type ContentPlatform = "facebook_instagram" | "strona_www" | "email" | "inne";
export const PLATFORM_LABELS: Record<ContentPlatform, string> = {
  facebook_instagram: "Facebook / Instagram",
  strona_www: "Strona WWW",
  email: "E-mail",
  inne: "Inne",
};
// Ikona rozpoznawalna na pierwszy rzut oka w ciasnej komórce kalendarza —
// szybsza do wyłapania wzrokiem niż sam skrót tekstowy.
export const PLATFORM_ICONS: Record<ContentPlatform, string> = {
  facebook_instagram: "📲",
  strona_www: "🌐",
  email: "✉️",
  inne: "📌",
};

export type ContentStatus = "pomysl" | "w_przygotowaniu" | "gotowe" | "opublikowane";
export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  pomysl: "Pomysł",
  w_przygotowaniu: "W przygotowaniu",
  gotowe: "Gotowe",
  opublikowane: "Opublikowane",
};
export const CONTENT_STATUS_ORDER: ContentStatus[] = ["pomysl", "w_przygotowaniu", "gotowe", "opublikowane"];

// Po co powstaje dany materiał — Oliwia (kwestionariusz, październik 2026)
// potrzebowała dokładnie TEGO jednego rozróżnienia, żeby wiedzieć po co
// nagrywa: reklama konkretnej usługi/trenera, czy zwykła relacja z życia
// klubu.
export type ContentPurpose = "promocja" | "relacja";
export const CONTENT_PURPOSE_LABELS: Record<ContentPurpose, string> = {
  promocja: "Promocja",
  relacja: "Relacja",
};
export const CONTENT_PURPOSE_ICONS: Record<ContentPurpose, string> = {
  promocja: "📣",
  relacja: "🎥",
};

// Format materiału — osobny wymiar od celu (promocja/relacja): dwa posty o
// tym samym celu mogą mieć zupełnie inny format pracy (nagranie rolki to co
// innego niż tekst na stronę). Wartość "story" nazwana inaczej niż
// CONTENT_PURPOSE "relacja", mimo że po polsku Instagram/Facebook nazywają tę
// funkcję też "Relacja" — to są dwa różne znaczenia tego samego słowa, w
// kodzie muszą mieć różne nazwy, żeby się nie gryzły.
export type ContentFormat = "rolka" | "post" | "story" | "aktualnosc" | "inne";
export const CONTENT_FORMAT_LABELS: Record<ContentFormat, string> = {
  rolka: "Rolka",
  post: "Post",
  story: "Relacja (Story)",
  aktualnosc: "Aktualność na stronie",
  inne: "Inne",
};
export const CONTENT_FORMAT_ICONS: Record<ContentFormat, string> = {
  rolka: "🎬",
  post: "🖼️",
  story: "⭕",
  aktualnosc: "📰",
  inne: "📌",
};

// Czy blokada akceptacji (needs_review && !approved) wciąż obowiązuje — NIE
// blokuje bezterminowo: Krzysztof (kwestionariusz) ma czas do dnia samej
// publikacji (scheduled_date) na przeczytanie i ewentualną uwagę; jeśli nikt
// nie zareaguje do tego dnia, treść i tak idzie dalej bez akceptacji — ustalone
// świadomie, bo bezterminowe czekanie na akceptację realnie blokowało pracę.
export function isApprovalPending(
  item: { needs_review: boolean; approved: boolean; scheduled_date: string },
  today: string
): boolean {
  return item.needs_review && !item.approved && item.scheduled_date > today;
}

export type PlanType = "strategia" | "plan";
export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  strategia: "Strategia",
  plan: "Plan",
};

// Projekt (Wigilia, Liga Deblowa, Półkolonie, ...) — zwykły tekst w
// marketing_task.project/marketing_content.project (patrz migracja 0062),
// NIE klucz obcy do marketing_project (patrz migracja 0063) — lista
// dostępnych projektów żyje w tamtej tabeli i w UI dociągana jest stamtąd
// (patrz useMarketingProjects, getActiveMarketingProjects), nie na sztywno
// tutaj. Pusty string ("") = brak przypisanego projektu, pokazywany w UI
// jako "Bez projektu".
export const NO_PROJECT_LABEL = "Bez projektu";

export function projectLabel(project: string): string {
  return project.trim() || NO_PROJECT_LABEL;
}

// Kolejność sekcji przy grupowaniu po projekcie — alfabetycznie, "Bez
// projektu" (puste) zawsze na końcu, bo to raczej zaległość do uzupełnienia
// niż właściwa kategoria. Bez odniesienia do konkretnej listy projektów —
// ta żyje teraz w bazie (marketing_project), nie w kodzie.
export function projectSortKey(project: string): [number, string] {
  const trimmed = project.trim();
  return trimmed ? [0, trimmed.toLowerCase()] : [1, ""];
}

export function groupByProject<T>(items: T[], getProject: (item: T) => string): { project: string; label: string; items: T[] }[] {
  const byProject = new Map<string, T[]>();
  for (const item of items) {
    const project = getProject(item).trim();
    if (!byProject.has(project)) byProject.set(project, []);
    byProject.get(project)!.push(item);
  }
  return Array.from(byProject.entries())
    .map(([project, items]) => ({ project, label: projectLabel(project), items }))
    .sort((a, b) => {
      const [ra, sa] = projectSortKey(a.project);
      const [rb, sb] = projectSortKey(b.project);
      return ra !== rb ? ra - rb : sa.localeCompare(sb);
    });
}
