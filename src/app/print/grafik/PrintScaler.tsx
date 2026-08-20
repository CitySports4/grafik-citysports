"use client";

import { useEffect } from "react";

// Zapewnia, że cała tabela grafiku zmieści się na JEDNEJ stronie A4 poziomo,
// niezależnie od tego, ile linii (zmian/wydarzeń) ma dany miesiąc. Tuż przed
// drukiem mierzymy naturalną wysokość tabeli i — jeśli nie mieści się w
// dostępnej wysokości strony — proporcjonalnie zmniejszamy (CSS `zoom`, bo w
// przeciwieństwie do `transform: scale` poprawnie przelicza układ/szerokość).
// Widok na ekranie zostaje bez zmian — skalowanie działa tylko wokół druku.
export function PrintScaler({ tableId, pageHeightMm }: { tableId: string; pageHeightMm: number }) {
  useEffect(() => {
    const MM_TO_PX = 96 / 25.4;
    const pageHeightPx = pageHeightMm * MM_TO_PX;
    // Bez dolnej granicy: "zawsze mieści się na A4" jest tu ważniejsze niż
    // nie-za-małe litery na wydruku pełnego (31-dniowego) miesiąca.
    const MIN_ZOOM = 0.3;

    function fitToPage() {
      const table = document.getElementById(tableId) as HTMLElement | null;
      if (!table) return;
      table.style.zoom = "1";
      const naturalHeight = table.scrollHeight;
      if (naturalHeight > pageHeightPx) {
        const factor = Math.max(MIN_ZOOM, pageHeightPx / naturalHeight);
        table.style.zoom = String(factor);
      }
    }

    function resetZoom() {
      const table = document.getElementById(tableId) as HTMLElement | null;
      if (table) table.style.zoom = "1";
    }

    window.addEventListener("beforeprint", fitToPage);
    window.addEventListener("afterprint", resetZoom);
    return () => {
      window.removeEventListener("beforeprint", fitToPage);
      window.removeEventListener("afterprint", resetZoom);
    };
  }, [tableId, pageHeightMm]);

  return null;
}
