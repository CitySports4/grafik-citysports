"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/Card";
import { Banner } from "@/components/Banner";
import { BTN_PRIMARY, BTN_SECONDARY_SM } from "@/components/button-styles";
import { IMPORT_TEMPLATE } from "@/lib/marketing-import";
import { importMarketingFile } from "./actions";

export function ImportFromFile() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Wynik importu przeżywa window.location.reload() (patrz handleSubmit)
  // tylko dzięki sessionStorage — ten sam wzorzec co generator AI grafiku
  // (ScheduleTable.tsx), bo po przeładowaniu stan komponentu znika, a nowe
  // zadania/treści/plany trzeba pobrać świeżo z serwera.
  useEffect(() => {
    const stored = window.sessionStorage.getItem("marketing_import_message");
    if (stored) {
      setResultMessage(stored);
      window.sessionStorage.removeItem("marketing_import_message");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const formData = new FormData(e.currentTarget);
      const result = await importMarketingFile(formData);
      const parts = [
        result.tasksCount > 0 ? `${result.tasksCount} ${result.tasksCount === 1 ? "zadanie" : "zadań"}` : null,
        result.contentCount > 0 ? `${result.contentCount} ${result.contentCount === 1 ? "treść" : "treści"}` : null,
        result.plansCount > 0 ? `${result.plansCount} ${result.plansCount === 1 ? "dokument" : "dokumentów"}` : null,
      ].filter(Boolean);
      let message = parts.length > 0 ? `Zaimportowano: ${parts.join(", ")}.` : "Nie znaleziono niczego do zaimportowania w tym pliku.";
      if (result.contentSkipped > 0) {
        message += ` Pominięto ${result.contentSkipped} ${result.contentSkipped === 1 ? "wpis treści" : "wpisów treści"} bez poprawnej daty publikacji.`;
      }
      if (result.unmatchedNames.length > 0) {
        message += ` Nie rozpoznano osoby: ${result.unmatchedNames.join(", ")} — te wpisy zostały dodane bez przypisania.`;
      }
      window.sessionStorage.setItem("marketing_import_message", message);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
      setBusy(false);
    }
  }

  async function handleCopyTemplate() {
    try {
      await navigator.clipboard.writeText(IMPORT_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API może nie działać (np. brak uprawnień) — szablon jest
      // i tak widoczny w polu tekstowym poniżej, da się zaznaczyć ręcznie.
    }
  }

  return (
    <Card>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-brand-orange marker:content-none">
          📥 Importuj z pliku (.txt / .md)
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-zinc-600">
            Wklej poniższy szablon do rozmowy, w której ustalaliście treść/zadania/plany, poproś o wypełnienie go i
            zapisz wynik jako plik .txt albo .md. AI samo rozpozna zadania, wpisy do kalendarza i dokumenty — drobne
            odstępstwa od szablonu nie szkodzą.
          </p>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500">Szablon do skopiowania</span>
              <button type="button" onClick={handleCopyTemplate} className={BTN_SECONDARY_SM}>
                {copied ? "✓ Skopiowano" : "Kopiuj szablon"}
              </button>
            </div>
            <textarea
              readOnly
              rows={8}
              value={IMPORT_TEMPLATE}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-xl border-[1.5px] border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-600"
            />
          </div>

          {error && <Banner variant="error">{error}</Banner>}
          {resultMessage && <Banner variant="success" onDismiss={() => setResultMessage(null)}>{resultMessage}</Banner>}

          <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
            <input type="file" name="file" accept=".txt,.md,text/plain,text/markdown" required className="text-sm" />
            <button type="submit" disabled={busy} className={BTN_PRIMARY}>
              {busy ? "Importowanie…" : "Importuj"}
            </button>
          </form>
        </div>
      </details>
    </Card>
  );
}
