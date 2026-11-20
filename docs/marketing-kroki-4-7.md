# Marketing — kroki 4–7 (specyfikacja robocza)

Źródło: wiadomość z 20.11.2026 (sesja Claude Code), doprecyzowana w tej samej rozmowie.
Kroki 4 (TV w klubie) i 7 (wyniki przy wpisie) wymagają pełnej treści — do uzupełnienia.

## Synchronizacja statusu: wpis ↔ zadania

Wpis kalendarza (`marketing_content.status`) i zadania (`marketing_task`) są powiązane przez
`content_id`. Rodzaj zadania (`marketing_task.kind`) mówi, czy zadanie jest zadaniem publikacji.

Rodzaje:
- `nagrac`, `zmontowac`, `przygotowac` — przygotowanie, **nie** zmieniają statusu wpisu,
- `opublikowac` (rolka: „Opublikować”), `nagrac_opublikowac` (story: „Nagrać i opublikować”) —
  zadania publikacji.

Reguły:
1. Wpis → `opublikowane`: wszystkie otwarte (nie `done`, nie zarchiwizowane) zadania wpisu → `done`.
2. Zadanie publikacji → `done`: wpis → `opublikowane` (i punkt 1).
3. Cofnięcie zadania publikacji: wpis wraca **zawsze** do `gotowe`.
4. Cofnięcie wpisu z `opublikowane`: zadania publikacji wracają do `todo`, pozostałe bez zmian.
5. Nagrać / Zmontować / Przygotować nie zmieniają statusu wpisu (widać je w kropce przy wpisie).
6. Synchronizacja idzie w jednej transakcji po stronie bazy (`marketing_set_content_status_sync`).

Akceptacja przy synchronizacji (ta sama reguła co zwykła publikacja, z auto-zatwierdzeniem):
- Blokada, gdy wpis ma **„wymaga poprawki”** (`needs_review` i nie `approved`, z `reviewed_at`) —
  bez względu na datę,
- Blokada, gdy dziś < `scheduled_date` i wpis czeka na akceptację (`isApprovalPending`),
- Brak reakcji Krzysztofa do dnia publikacji = zatwierdzone automatycznie.
- Przy blokadzie **nic się nie zmienia** (ani zadanie, ani wpis), pokazywany jest komunikat:
  „Treść czeka na akceptację Krzysztofa” albo „Treść wymaga poprawki”.
- Administrator pomija blokadę tak jak dotąd.

Dane:
- `marketing_task.kind` wypełniany przez „➕ Dodaj zadania”; dla istniejących zadań uzupełniony
  po tytule (podgląd: nagrac 7, nagrac_opublikowac 6, opublikowac 9).
- `marketing_task.created_by_employee_id` — `ON DELETE SET NULL` (usunięcie pracownika nie kasuje zadań).

Do zrobienia (ustalone, ale jeszcze nie w pełni w UI):
- komunikat „Zaznaczono też: …” po zmianie statusu.
