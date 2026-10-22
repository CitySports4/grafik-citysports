// Logika narzędzia planowania marketingu (zadania, kalendarz treści,
// strategie i plany) — funkcje czyste, bez dostępu do bazy, analogicznie
// do kids-classes.ts. Warstwa zapytań/akcji żyje w app/(app)/marketing.

import { toDateKey } from "./schedule-month";

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

export type ContentPlatform = "instagram" | "facebook" | "tiktok" | "strona_www" | "email" | "inne";
export const PLATFORM_LABELS: Record<ContentPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  strona_www: "Strona WWW",
  email: "E-mail",
  inne: "Inne",
};

export type ContentStatus = "pomysl" | "w_przygotowaniu" | "gotowe" | "opublikowane";
export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  pomysl: "Pomysł",
  w_przygotowaniu: "W przygotowaniu",
  gotowe: "Gotowe",
  opublikowane: "Opublikowane",
};
export const CONTENT_STATUS_ORDER: ContentStatus[] = ["pomysl", "w_przygotowaniu", "gotowe", "opublikowane"];

export type PlanType = "strategia" | "plan";
export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  strategia: "Strategia",
  plan: "Plan",
};

// Dzień po dniu, od wybranego poniedziałku (7 dni) — do widoku tygodniowego
// kalendarza treści, ten sam wzorzec dat co treningi-personalne/page.tsx.
export function weekDatesFrom(mondayKey: string): string[] {
  const monday = new Date(mondayKey + "T00:00:00");
  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return toDateKey(d);
  });
}
