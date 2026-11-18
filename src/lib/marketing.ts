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

// "gotowe"/"opublikowane" zastąpiły dawne jednorazowe "done" (patrz migracja
// 0067) — materiał/post może być przygotowany ("gotowe", czeka na
// publikację) zanim faktycznie wyjdzie na Facebooku/Instagramie
// ("opublikowane"). Te same nazwy co ContentStatus celowo — to ten sam
// koncept, tylko na poziomie zadania zamiast wpisu w kalendarzu treści (bo
// większość zadań, zwłaszcza Oliwii, nie ma linkowanej treści).
export type MarketingTaskStatus = "todo" | "in_progress" | "gotowe" | "opublikowane";
export const TASK_STATUS_LABELS: Record<MarketingTaskStatus, string> = {
  todo: "Do zrobienia",
  in_progress: "W trakcie",
  gotowe: "Gotowe — czeka na publikację",
  opublikowane: "Opublikowane",
};
export const TASK_STATUS_ORDER: MarketingTaskStatus[] = ["todo", "in_progress", "gotowe", "opublikowane"];

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
export type ContentFormat = "rolka" | "post" | "story" | "aktualnosc" | "karuzela" | "wydarzenie_fb" | "inne";
export const CONTENT_FORMAT_LABELS: Record<ContentFormat, string> = {
  rolka: "Rolka",
  post: "Post",
  story: "Relacja (Story)",
  aktualnosc: "Aktualność na stronie",
  karuzela: "Karuzela",
  wydarzenie_fb: "Wydarzenie na Facebooku",
  inne: "Inne",
};
export const CONTENT_FORMAT_ICONS: Record<ContentFormat, string> = {
  rolka: "🎬",
  post: "🖼️",
  story: "⭕",
  aktualnosc: "📰",
  karuzela: "🖼️🖼️",
  wydarzenie_fb: "📅",
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

// Trzy stany akceptacji do pokazania w UI (propozycja Marketing -> Grafik,
// 18.11.2026, krok 3) — czysto opisowe, NIE zmieniają reguły publikacji
// (patrz isApprovalPending/assertCanPublish w actions.ts, które zostają bez
// zmian: nawet po "needs_changes" blokada i tak sama znika w dniu
// scheduled_date, to świadomie ta sama zastawka co dotąd). Rozróżnienie
// "needs_changes" od "pending" po reviewed_at: Krzysztof już raz spojrzał i
// zostawił uwagę (approved=false, reviewed_at ustawione), w przeciwieństwie
// do "jeszcze nikt nie patrzył" (reviewed_at puste). Wołane tylko gdy
// needs_review jest true — wywołujący sam to sprawdza.
export type ApprovalBadge = "approved" | "needs_changes" | "auto_approved" | "pending";

export function approvalBadge(
  item: { approved: boolean; reviewed_at: string | null; scheduled_date: string },
  today: string
): ApprovalBadge {
  if (item.approved) return "approved";
  if (item.reviewed_at) return "needs_changes";
  if (item.scheduled_date <= today) return "auto_approved";
  return "pending";
}

// Typ projektu (migracja 0075) — "marketing" to "Ogólne" (bez dat/osi
// komunikacji, zwykły worek na zadania/treści bez przypisanego wydarzenia czy
// kampanii), "event" to jednodniowe/krótkie wydarzenie (Wigilia, Liga
// Deblowa), "kampania" to coś z zakresem dat (Półkolonie, Styczeń 2027).
export type ProjectType = "marketing" | "event" | "kampania";
export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  marketing: "Ogólne",
  event: "Wydarzenie",
  kampania: "Kampania",
};
export const PROJECT_TYPE_ICONS: Record<ProjectType, string> = {
  marketing: "📁",
  event: "🎉",
  kampania: "📣",
};

// Oś komunikacji (zgłoszenie 18.11.2026) — kroki wyliczone z dat projektu,
// NIE zapisane w bazie: liczą się na nowo przy każdym renderze, żeby zmiana
// daty wydarzenia/kampanii od razu przeliczyła checklistę, bez migracji
// danych. "Ogólne" nie ma osi w ogóle (puste daty, brak sensu dla worka bez
// terminu).
export type TimelineStep = { key: string; label: string; date: string };

function addDays(dateKey: string, days: number): string {
  const d = new Date(dateKey + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function midpointDate(startKey: string, endKey: string): string {
  const start = new Date(startKey + "T00:00:00").getTime();
  const end = new Date(endKey + "T00:00:00").getTime();
  return new Date(start + (end - start) / 2).toISOString().slice(0, 10);
}

export function buildProjectTimeline(project: { type: ProjectType; event_date: string | null; end_date: string | null }): TimelineStep[] {
  if (project.type === "event" && project.event_date) {
    return [
      { key: "zapowiedz", label: "Zapowiedź", date: addDays(project.event_date, -14) },
      { key: "tv", label: "Plansza TV", date: addDays(project.event_date, -7) },
      { key: "przypomnienie", label: "Przypomnienie", date: addDays(project.event_date, -3) },
      { key: "relacja", label: "Relacja z wydarzenia", date: addDays(project.event_date, 1) },
    ];
  }
  if (project.type === "kampania" && project.event_date && project.end_date) {
    return [
      { key: "start", label: "Start kampanii", date: project.event_date },
      { key: "polowa", label: "Połowa kampanii", date: midpointDate(project.event_date, project.end_date) },
      { key: "ostatni_tydzien", label: "Ostatni tydzień", date: addDays(project.end_date, -7) },
    ];
  }
  return [];
}

// Dopasowanie treści z kalendarza do kroku osi — okno ±2 dni, krok "Plansza
// TV" dodatkowo wymaga tytułu zaczynającego się od "TV —" (nie ma osobnej
// platformy TV w ContentPlatform, tytuł jest jedynym odróżnieniem od
// zwykłego posta w tym samym okienku dat).
export function matchTimelineStep(step: TimelineStep, content: { scheduled_date: string; title: string }[]): boolean {
  const WINDOW_DAYS = 2;
  const stepTime = new Date(step.date + "T00:00:00").getTime();
  return content.some((c) => {
    const diffDays = Math.abs(new Date(c.scheduled_date + "T00:00:00").getTime() - stepTime) / 86400000;
    if (diffDays > WINDOW_DAYS) return false;
    return step.key === "tv" ? c.title.startsWith("TV —") : true;
  });
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
