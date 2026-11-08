// Logika narzędzia planowania marketingu (zadania, kalendarz treści,
// strategie i plany) — funkcje czyste, bez dostępu do bazy, analogicznie
// do kids-classes.ts. Warstwa zapytań/akcji żyje w app/(app)/marketing.

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

// Projekt (Wigilia, Liga Deblowa, Półkolonie, ...) — zwykły tekst w bazie,
// NIE enum/check (patrz migracja 0062): dodanie nowego projektu to tylko
// dopisanie wartości tutaj, bez migracji. Pusty string ("") = brak
// przypisanego projektu, pokazywany w UI jako "Bez projektu".
export const PROJECT_OPTIONS = ["Wigilia", "Liga Deblowa", "Półkolonie", "Ogólne"] as const;
export const NO_PROJECT_LABEL = "Bez projektu";

export function projectLabel(project: string): string {
  return project.trim() || NO_PROJECT_LABEL;
}

// Kolejność sekcji przy grupowaniu po projekcie — najpierw znane opcje w tej
// kolejności, potem inne (niestandardowe) wartości alfabetycznie, na końcu
// zawsze "Bez projektu" (puste), bo to raczej zaległość do uzupełnienia niż
// właściwa kategoria.
export function projectSortKey(project: string): [number, string] {
  const trimmed = project.trim();
  if (!trimmed) return [1, ""];
  const knownIndex = PROJECT_OPTIONS.indexOf(trimmed as (typeof PROJECT_OPTIONS)[number]);
  return knownIndex === -1 ? [0.5, trimmed] : [0, String(knownIndex).padStart(4, "0")];
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
