"use client";

import { useEffect, useState } from "react";
import { getActiveMarketingProjects, type MarketingProjectOption } from "./actions";

// Jedno zapytanie dzielone między WSZYSTKIE instancje hooka na stronie —
// siatka kalendarza renderuje AddContentButton/ContentItemChip osobno dla
// każdego dnia/wpisu (nawet kilkadziesiąt naraz), więc bez tej pamięci
// podręcznej każdy z nich odpalałby ten sam Server Action osobno. Żyje w
// zmiennej modułu, więc resetuje się przy pełnym przeładowaniu strony — to
// wystarczy, projekty i tak nie zmieniają się co chwilę.
let cachedPromise: Promise<MarketingProjectOption[]> | null = null;
function fetchProjectsOnce(): Promise<MarketingProjectOption[]> {
  if (!cachedPromise) {
    cachedPromise = getActiveMarketingProjects().catch((err) => {
      cachedPromise = null; // pozwól spróbować ponownie przy kolejnym mouncie
      throw err;
    });
  }
  return cachedPromise;
}

// Projekty aktywne (marketing_project, is_active = true) do dropdownów w
// komponentach klienckich (AddContentButton, ContentItemChip) — przez Server
// Action, nie bezpośrednie zapytanie do Supabase z przeglądarki (patrz
// komentarz przy getActiveMarketingProjects). Komponenty serwerowe
// (TasksSection, ContentCalendarSection) NIE mogą użyć hooka — tam to samo
// zapytanie leci wprost, bo i tak już są Server Components.
export function useMarketingProjects(): { projects: MarketingProjectOption[]; loading: boolean } {
  const [projects, setProjects] = useState<MarketingProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchProjectsOnce()
      .then((data) => {
        if (!cancelled) setProjects(data);
      })
      .catch(() => {
        // Cichy fallback na pustą listę — formularz wciąż działa (po prostu
        // bez wyboru projektu), zamiast wywalać cały komponent.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { projects, loading };
}
