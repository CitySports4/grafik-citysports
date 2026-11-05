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

// Zespół w tytułach treści zwyczajowo dopisuje prefiks kanału ("[FB/IG] ...")
// — to tylko tekst, nie osobne pole, więc nic nie pilnuje, żeby się zgadzał z
// platform. Odkąd FB i IG scaliły się w jeden kanał (migracja 0058), stary
// "[FB]" albo "[IG]" samo w sobie jest już nieaktualne — to tylko podpowiedź
// (nie blokuje zapisu), żeby ktoś świadomie poprawił albo zostawił jak jest.
export function hasStaleChannelPrefix(title: string): boolean {
  return /\[(FB|IG)\]/i.test(title) && !/\[FB\/IG\]/i.test(title);
}

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
