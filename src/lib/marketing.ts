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

// Bez TikToka — klub tam nic nie publikuje (patrz migracja 0053).
export type ContentPlatform = "instagram" | "facebook" | "strona_www" | "email" | "inne";
export const PLATFORM_LABELS: Record<ContentPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  strona_www: "Strona WWW",
  email: "E-mail",
  inne: "Inne",
};
// Ikona rozpoznawalna na pierwszy rzut oka w ciasnej komórce kalendarza —
// szybsza do wyłapania wzrokiem niż sam skrót tekstowy.
export const PLATFORM_ICONS: Record<ContentPlatform, string> = {
  instagram: "📸",
  facebook: "👍",
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
