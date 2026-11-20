# Marketing — kroki 4–7 (specyfikacja robocza)

Źródło: wiadomość z 20.11.2026 (sesja Claude Code), doprecyzowana w tej samej rozmowie.
Kroki 4 (TV w klubie) i 7 (wyniki przy wpisie) — pełna treść poniżej (od 20.11.2026, NIE wdrażane).

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

## Krok 4 — platforma „TV w klubie”

Baza: platform CHECK + `tv_klub`; format CHECK + `plansza_tv` (JPG/PNG), `animacja_tv` (MP4 bez dźwięku).
Nowe kolumny `marketing_content`: `end_date date null` (CHECK end_date is null or end_date >= scheduled_date) — „zdjąć z ekranu”;
`file_url text not null default ''` — link do pliku (Canva/Drive).

UI: po wyborze „TV w klubie” formaty tylko `plansza_tv` / `animacja_tv`. Pola: Na ekranie od (scheduled_date),
Zdjąć z ekranu (end_date, wymagane), Plik (file_url + „Otwórz”), Treść planszy (screen_captions + „Kopiuj”), notatki.
Ukryte: Treść FB/IG, Hashtagi, Link z UTM, Co nagrać.
Podpowiedź: „Nagłówek maks. ~6 słów + 1 linijka szczegółu + co dalej (np. Zapisz się w recepcji)”.

Kalendarz: pasek od scheduled_date do end_date (albo kropka w dniu startu), osobny kolor.
Pasek nad kanbanem: „Teraz na TV: N”, „Do zdjęcia z TV: N” (end_date dziś lub w ostatnich 7 dniach).
Akceptacja jak przy innych wpisach (Krzysztof). Wpisy TV nie liczą się do rytmu tygodnia.

## Krok 7 — link do posta i wyniki przy wpisie

Baza: `marketing_content.post_url text not null default ''`; `meta_media_id text null`;
`meta_source text null` CHECK in (`ig_media`, `ig_story`, `fb_post`).
Jeśli wpis ma mieć IG i FB jednocześnie — osobne pola (`meta_ig_id`, `meta_fb_id`) zamiast jednego.

Dane (tylko po stronie serwera):
- `meta_ig_media`: reach, views, likes, comments, saved, shares, media_product_type (REELS / FEED), permalink, created_at;
  dla rolek: skip_rate, avg_watch_time_ms, total_watch_time_ms,
- `meta_ig_stories`: views, reach, replies, shares, taps_forward, taps_back, exits, swipes_forward, created_at,
- `meta_fb_posts`: reach, reactions, comments, shares, clicks, permalink, created_at.
Każda tabela ma `synced_at`.

Powiązanie:
1. Ręcznie przez „Link do posta” — dopasowanie po permalink (bez `?…` i końcowego `/`).
2. Podpowiedź, gdy wpis jest „opublikowane” i brak powiązania: kandydaci z created_at (Europe/Warsaw)
   = scheduled_date ±1 dzień wg formatu (rolka → REELS, post/karuzela → FEED, story → stories, plus meta_fb_posts),
   z miniopisem i przyciskiem „To ten”. Nigdy automatycznie.

Wyniki (sekcja „Wyniki” po powiązaniu):
- rolka: wyświetlenia, zasięg, przewinięcia w 3 s (%), średni czas oglądania (s), zapisy, udostępnienia;
- post/karuzela IG: zasięg, zapisy, polubienia, komentarze;
- story: wyświetlenia, zasięg, odpowiedzi, wyjścia, przejścia dalej;
- FB: zasięg, reakcje, komentarze, udostępnienia, kliknięcia.
Przy każdej liczbie „powyżej / poniżej mediany” tego samego formatu z 90 dni + „dane z …” (synced_at).
Na karcie wpisu w kalendarzu jedna główna liczba: rolka — wyświetlenia, post — zasięg, story — wyświetlenia.
