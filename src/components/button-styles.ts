// Współdzielone style przycisków — jedna paleta wariantów zamiast
// dowolnych, powtarzanych ad-hoc klas (dziś głównie "bg-zinc-800" wszędzie).
// Podawane jako className do <button>/<SubmitButton>/<ConfirmButton> (te
// komponenty i tak przyjmują className), więc nie wymaga zmiany ich API.
const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

// Główna akcja na widoku (max jedna naraz) — marka City Sports.
export const BTN_PRIMARY = `${BASE} bg-brand-orange text-white shadow-sm hover:bg-brand-orange-dark`;
// Domyślny przycisk — dla wszystkiego, co nie jest główną akcją.
export const BTN_SECONDARY = `${BASE} border-[1.5px] border-zinc-300 bg-white text-brand-navy hover:border-brand-blue-light hover:bg-zinc-50`;
// Destrukcyjne akcje (usuń, cofnij) — wyraźnie odróżnione od reszty.
export const BTN_DANGER = `${BASE} border-[1.5px] border-red-200 bg-white text-red-600 hover:bg-red-50`;
export const BTN_DANGER_SOLID = `${BASE} bg-red-600 text-white shadow-sm hover:bg-red-700`;
// Drobne akcje w liniach list/tabel — bez ramki i tła w spoczynku.
export const BTN_GHOST = "rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100";
export const BTN_GHOST_DANGER = "rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50";

// Kompaktowe warianty (rzędy list, paski narzędzi).
export const BTN_PRIMARY_SM = `${BTN_PRIMARY} !px-3 !py-1.5 !text-xs`;
export const BTN_SECONDARY_SM = `${BTN_SECONDARY} !px-3 !py-1.5 !text-xs`;
