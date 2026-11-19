"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Banner } from "@/components/Banner";
import { ColorDot } from "@/components/ColorDot";
import { BTN_PRIMARY, BTN_GHOST_DANGER } from "@/components/button-styles";
import {
  PLATFORM_LABELS,
  CONTENT_STATUS_LABELS,
  CONTENT_PURPOSE_LABELS,
  CONTENT_PURPOSE_ICONS,
  CONTENT_FORMAT_LABELS,
  CONTENT_FORMAT_ICONS,
  isApprovalPending,
  approvalBadge,
  PROJECT_TYPE_ICONS,
  type ContentPlatform,
  type ContentStatus,
  type ContentPurpose,
  type ContentFormat,
  type ApprovalBadge,
} from "@/lib/marketing";
import { updateContent, deleteContent, reviewContent } from "./actions";
import { useMarketingProjects } from "./useMarketingProjects";
import { CopyField } from "./CopyField";
import { AccordionSection } from "./AccordionSection";

const INPUT =
  "w-full rounded-xl border-[1.5px] border-zinc-300 px-3.5 py-2 text-sm outline-none transition-colors focus:border-brand-blue focus:shadow-[0_0_0_3px_rgba(35,78,147,0.15)]";

type ContentItem = {
  id: string;
  title: string;
  platform: ContentPlatform;
  scheduled_date: string;
  status: ContentStatus;
  purpose: ContentPurpose;
  format: ContentFormat;
  needs_review: boolean;
  approved: boolean;
  review_note: string;
  reviewed_at: string | null;
  notes: string;
  assignee_employee_id: string | null;
  project: string;
  project_id: string | null;
  hook: string;
  content_fb: string;
  content_ig: string;
  screen_captions: string;
  what_to_record: string;
  hashtags: string;
  to_confirm: string;
  link_utm: string;
};
type Assignee = { id: string; name: string; color_hex: string };

const STATUS_PILL: Record<ContentStatus, string> = {
  pomysl: "bg-zinc-100 text-zinc-600",
  w_przygotowaniu: "bg-amber-100 text-amber-700",
  gotowe: "bg-sky-100 text-sky-700",
  opublikowane: "bg-emerald-100 text-emerald-700",
};

// Cztery stany akceptacji (propozycja Marketing -> Grafik, 18.11.2026, krok
// 3) — patrz approvalBadge w lib/marketing.ts, to czysto wizualna warstwa
// nad tą samą regułą publikacji co dotąd.
const BADGE_STYLE: Record<ApprovalBadge, string> = {
  approved: "border-emerald-200 bg-emerald-50",
  needs_changes: "border-red-200 bg-red-50",
  auto_approved: "border-sky-200 bg-sky-50",
  pending: "border-amber-200 bg-amber-50",
};
const BADGE_TEXT: Record<ApprovalBadge, (scheduledDate: string) => string> = {
  approved: () => "✅ Zatwierdzono — admin",
  needs_changes: () => "✏️ Wymaga poprawki — zobacz uwagę niżej. Wpis wrócił do „W przygotowaniu”.",
  auto_approved: () => "🕒 Zatwierdzono automatycznie — minął termin publikacji bez reakcji.",
  pending: (scheduledDate) => `⏳ Czeka na akceptację — automatycznie dopuszczona ${scheduledDate}, jeśli nikt wcześniej nie zareaguje.`,
};

// Pola tekstowe karty publikacji zapisywane częściowo (tylko zmienione).
const PARTIAL_CONTENT_KEYS = [
  "notes",
  "hook",
  "content_fb",
  "content_ig",
  "screen_captions",
  "what_to_record",
  "hashtags",
  "to_confirm",
  "link_utm",
] as const;

// Chip w siatce kalendarza otwiera pełną edycję jako PŁYWAJĄCE OKNO (Modal),
// zamiast rozwijać się w miejscu — kolumna dnia w siatce jest za wąska, żeby
// pomieścić cały formularz czytelnie (patrz zgłoszenie usera: pola i tekst
// ścieśnione w komórce 1/7 szerokości).
export function ContentItemChip({
  item,
  assignees,
  hasLinkedTask,
  isAdmin,
  today,
}: {
  item: ContentItem;
  assignees: Assignee[];
  hasLinkedTask: boolean;
  isAdmin: boolean;
  // Dzisiejsza data (z serwera, nie z zegara przeglądarki) — potrzebna do
  // isApprovalPending, żeby pokazać dokładnie to samo, co i tak wymusza
  // serwer przy próbie publikacji.
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewNoteDraft, setReviewNoteDraft] = useState(item.review_note);
  const { projects } = useMarketingProjects();
  const assignee = item.assignee_employee_id ? assignees.find((a) => a.id === item.assignee_employee_id) : null;
  const published = item.status === "opublikowane";
  const pendingApproval = isApprovalPending(item, today);
  const badge = approvalBadge(item, today);

  // Karta publikacji w 3 rozwijanych sekcjach (zgłoszenie 18.11.2026,
  // doprecyzowane po przeglądzie) — wypełniona sekcja startuje otwarta,
  // pusta zwinięta. "Po co" zawsze otwarta — "do potwierdzenia" musi być
  // widoczne od razu, łatwo je przeoczyć w zwiniętej sekcji. Hook przeniesiony
  // do "Tekst do publikacji" — to część samej treści (pierwsza linijka), nie
  // powód publikacji. Dla pustych "Tekst do publikacji"/"Nagranie" o
  // domyślnym otwarciu decyduje format: rolka ma zawsze i opis, i nagranie,
  // więc otwiera OBIE; samo story tylko nagranie. Post/wydarzenie_fb to
  // głównie pisanie. "Tekst do publikacji" otwiera się też zawsze, gdy wpis
  // czeka na akceptację Krzysztofa (pendingApproval) — musi od razu widzieć
  // tekst, niezależnie od formatu.
  const poCoFilled = [item.notes, item.to_confirm].filter((v) => v.trim()).length;
  const tekstFilled = [item.hook, item.content_fb, item.content_ig, item.hashtags, item.link_utm].filter((v) => v.trim()).length;
  const nagranieFilled = [item.screen_captions, item.what_to_record].filter((v) => v.trim()).length;
  const tekstOpen = tekstFilled > 0 || item.format === "post" || item.format === "wydarzenie_fb" || item.format === "rolka" || pendingApproval;
  const nagranieOpen = nagranieFilled > 0 || item.format === "story" || item.format === "rolka";

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Wysyłamy tylko pola treści, które ktoś faktycznie zmienił — pole bez
      // zmian nie nadpisuje bazy (patrz updateContent: brak pola = "nie
      // ruszaj"). Chroni też przed starym oknem nadpisującym treść wpisaną
      // w międzyczasie bezpośrednio w bazie.
      const fd = new FormData(e.currentTarget);
      for (const key of PARTIAL_CONTENT_KEYS) {
        const sent = fd.get(key);
        if (sent !== null && String(sent).trim() === (item[key] ?? "").trim()) fd.delete(key);
      }
      await updateContent(fd);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Usunąć "${item.title}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("id", item.id);
      await deleteContent(fd);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
      setBusy(false);
    }
  }

  async function handleReview(approved: boolean) {
    if (!approved && !reviewNoteDraft.trim()) {
      setError("Napisz, co poprawić.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("id", item.id);
      fd.set("approved", String(approved));
      fd.set("review_note", reviewNoteDraft);
      await reviewContent(fd);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coś poszło nie tak.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Jedna ikona + tytuł — ikona FORMATU (rolka/post/story/...), nie
          platformy: odkąd FB i IG to jeden kanał (patrz migracja 0058),
          platforma prawie zawsze ma tę samą wartość, więc jako jedyna ikona
          w ciasnym czipie niczego by już nie odróżniała. Cel materiału i
          oczekiwanie na akceptację widać w pełnej edycji (patrz niżej), nie
          trzeba ich stłaczać obok siebie w tej samej, wąskiej etykiecie.
          Oczekiwanie na akceptację sygnalizuje się kolorem obwódki, nie
          kolejną ikoną. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={pendingApproval ? "Czeka na akceptację" : undefined}
        className={`w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-medium ${STATUS_PILL[item.status]} ${published ? "line-through opacity-70" : ""} ${pendingApproval ? "ring-1 ring-inset ring-amber-400" : ""}`}
      >
        {CONTENT_FORMAT_ICONS[item.format]} {item.title}
        {hasLinkedTask && <span title="Ma powiązane zadanie w Zadaniach"> 📋</span>}
      </button>

      {open && (
        <Modal title="Edytuj treść" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_PILL[item.status]}`}>{CONTENT_STATUS_LABELS[item.status]}</p>
              <p className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">
                {CONTENT_PURPOSE_ICONS[item.purpose]} {CONTENT_PURPOSE_LABELS[item.purpose]}
              </p>
              <p className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">
                {CONTENT_FORMAT_ICONS[item.format]} {CONTENT_FORMAT_LABELS[item.format]}
              </p>
              {item.project &&
                (() => {
                  const color = projects.find((p) => p.id === item.project_id)?.color ?? "#7c3aed";
                  return (
                    <p className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: `${color}1a`, color }}>
                      {item.project}
                    </p>
                  );
                })()}
            </div>
            {assignee && (
              <span className="flex items-center gap-1.5 text-sm text-zinc-600">
                <ColorDot color={assignee.color_hex} />
                {assignee.name}
              </span>
            )}
            {hasLinkedTask && <p className="text-xs text-zinc-500">📋 Ma powiązane zadanie w zakładce Zadania.</p>}

            {/* Akceptacja — tylko dla treści oznaczonych needs_review. Cztery
                stany (propozycja Marketing -> Grafik, 18.11.2026, krok 3) —
                nie blokuje bezterminowo: patrz isApprovalPending, blokada
                sama znika w dniu publikacji niezależnie od stanu poniżej. */}
            {item.needs_review && (
              <div className={`rounded-xl border p-2.5 text-xs ${BADGE_STYLE[badge]}`}>
                <p className="font-semibold text-zinc-800">{BADGE_TEXT[badge](item.scheduled_date)}</p>
                {item.review_note && <p className="mt-1 whitespace-pre-wrap text-zinc-600">💬 {item.review_note}</p>}
                {isAdmin && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <textarea
                      value={reviewNoteDraft}
                      onChange={(e) => setReviewNoteDraft(e.target.value)}
                      rows={2}
                      placeholder="Uwaga do autora (opcjonalnie)"
                      className={`${INPUT} !py-1.5 text-xs`}
                    />
                    <div className="flex gap-1.5">
                      <button type="button" disabled={busy} onClick={() => handleReview(true)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                        ✅ Zaakceptuj
                      </button>
                      <button type="button" disabled={busy} onClick={() => handleReview(false)} className="rounded-lg bg-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-300 disabled:opacity-50">
                        Zostaw uwagę
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && <Banner variant="error">{error}</Banner>}

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={item.id} />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-900">Tytuł</label>
                <input name="title" defaultValue={item.title} required className={INPUT} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-zinc-900">Platforma</label>
                  <select name="platform" defaultValue={item.platform} className={INPUT}>
                    {(Object.entries(PLATFORM_LABELS) as [ContentPlatform, string][]).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-zinc-900">Status</label>
                  <select name="status" defaultValue={item.status} className={INPUT}>
                    {(Object.entries(CONTENT_STATUS_LABELS) as [ContentStatus, string][]).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-zinc-900">Cel materiału</label>
                  <select name="purpose" defaultValue={item.purpose} className={INPUT}>
                    {(Object.entries(CONTENT_PURPOSE_LABELS) as [ContentPurpose, string][]).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-zinc-900">Format</label>
                  <select name="format" defaultValue={item.format} className={INPUT}>
                    {(Object.entries(CONTENT_FORMAT_LABELS) as [ContentFormat, string][]).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-900">Data publikacji</label>
                <input type="date" name="scheduled_date" defaultValue={item.scheduled_date} required className={INPUT} />
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" name="needs_review" defaultChecked={item.needs_review} className="h-4 w-4" />
                Treść pisana — wymaga akceptacji Krzysztofa przed publikacją
              </label>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-900">Przypisane do</label>
                <select name="assignee_employee_id" defaultValue={item.assignee_employee_id ?? ""} className={INPUT}>
                  <option value="">— nieprzypisane —</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-zinc-900">Projekt</label>
                <select name="project_id" defaultValue={item.project_id ?? ""} className={INPUT}>
                  <option value="">— bez projektu —</option>
                  {/* Projekt wpisu mógł zostać zarchiwizowany od ostatniej edycji —
                      dokładamy go jako dodatkową opcję, żeby select pokazywał
                      faktyczną wartość zamiast po cichu ją gubić. */}
                  {item.project_id && !projects.some((p) => p.id === item.project_id) && (
                    <option value={item.project_id}>{item.project} (zarchiwizowany)</option>
                  )}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {PROJECT_TYPE_ICONS[p.type]} {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* Karta publikacji w 3 rozwijanych sekcjach zamiast płaskiej
                  listy (zgłoszenie 18.11.2026) — patrz obliczenia wyżej. */}
              <AccordionSection title="Po co" filledCount={poCoFilled} totalCount={2} defaultOpen>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-zinc-900">Notatki</label>
                  <textarea name="notes" defaultValue={item.notes} rows={3} className={INPUT} />
                </div>
                <CopyField name="to_confirm" label="Do potwierdzenia" defaultValue={item.to_confirm} rows={2} />
              </AccordionSection>

              <AccordionSection title="Tekst do publikacji" filledCount={tekstFilled} totalCount={5} defaultOpen={tekstOpen}>
                <CopyField name="hook" label="Haczyk" defaultValue={item.hook} />
                <CopyField name="content_fb" label="Treść FB" defaultValue={item.content_fb} rows={4} />
                <CopyField name="content_ig" label="Treść IG" defaultValue={item.content_ig} rows={4} />
                <CopyField name="hashtags" label="Hashtagi" defaultValue={item.hashtags} rows={1} />
                <CopyField name="link_utm" label="Link (z UTM)" defaultValue={item.link_utm} rows={1} />
              </AccordionSection>

              <AccordionSection title="Nagranie" filledCount={nagranieFilled} totalCount={2} defaultOpen={nagranieOpen}>
                <CopyField name="screen_captions" label="Napisy na ekran" defaultValue={item.screen_captions} rows={3} />
                <CopyField name="what_to_record" label="Co nagrać" defaultValue={item.what_to_record} />
              </AccordionSection>

              <div className="flex items-center gap-2">
                <button type="submit" disabled={busy} className={BTN_PRIMARY}>
                  {busy ? "Zapisywanie…" : "Zapisz"}
                </button>
                <button type="button" onClick={handleDelete} disabled={busy} className={BTN_GHOST_DANGER}>
                  Usuń
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
