"use client";

// Pierwszy modal w tej appce — reszta UI celowo trzyma się rozwijanych
// <details>/formularzy w miejscu, ale wąska komórka siatki kalendarza
// treści (patrz ContentCalendarSection) jest za ciasna na pełny formularz
// edycji rozwinięty w miejscu. Cień na panelu jest tu uzasadniony — to
// aktywnie wysunięty nad resztą stan, nie dekoracja elementu w spoczynku
// (patrz zasada w Card.tsx).
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-zinc-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
