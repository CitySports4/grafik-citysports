# Grafik City Sports — pełny opis funkcjonalności

Stan na dziś. Dokument opisuje wszystko, co jest zbudowane i działa w systemie.

## 1. Role i logowanie

- Logowanie: numer telefonu + hasło.
- Przy pierwszym logowaniu pracownik sam ustawia hasło (admin zakłada konto bez hasła).
- Sesja: podpisane ciasteczko (HMAC), hasła hashowane (bcrypt).
- Role: `admin` (pełny dostęp do panelu admina), `employee` (tylko własny grafik/dyspozycyjność/zamiany), oraz role dodatkowe per moduł: `marketing`, `content_creator` (Kalendarz treści, patrz pkt 13), uprawnienia Kasy (patrz pkt 12).
- Autoryzacja w warstwie aplikacji — każda akcja sprawdza rolę/tożsamość w kodzie (`lib/session.ts`), niezależnie od RLS. Od listopada 2026 Row Level Security jest też włączone na WSZYSTKICH tabelach w schemacie `public` (bez polityk) — appka zawsze łączy się kluczem `service_role` (`lib/supabase.ts`, jedyny punkt tworzenia klienta Supabase), który RLS omija, więc to tylko domyka dostęp dla klucza anon/publishable (nieużywanego nigdzie w kodzie, zweryfikowane grepem i logami API).

## 2. Pracownicy (Admin → Pracownicy)

- CRUD: dodawanie, edycja, trwałe usuwanie (z potwierdzeniem).
- Pola pracownika: imię, telefon, rola, kolor (używany wszędzie w UI jako `ColorDot` przy jego imieniu), aktywność, czy jest instruktorem, czy może sprzątać, minimalna liczba godzin/mies., docelowa liczba godzin/mies.
- Reset hasła administracyjnie (pracownik ustawia nowe przy kolejnym logowaniu).
- **Zajęcia instruktora** (jeśli `is_instructor`): lista wpisów dzień tygodnia + godziny + notatka. Jeśli zmiana pokrywa się z zajęciami o >1h, przy generowaniu grafiku ta osoba trafia na tę zmianę w ostatniej kolejności (tylko gdy nie ma wyboru).
- **Cykliczne reguły dostępności** per pracownik: typ (`niedostępny` / `preferowany`), dzień tygodnia, opcjonalnie godziny od-do (brak godzin = cały dzień), notatka. `niedostępny` to twarde wykluczenie, `preferowany` to bonus w punktacji przy wyborze kandydata.

## 3. Konfiguracja zmian (Admin → Konfiguracja zmian)

- Szablon tygodniowy: dla każdego dnia tygodnia lista domyślnych zmian (godzina od-do, opcjonalna etykieta, aktywna/nieaktywna).
- Jednorazowy seed domyślnego szablonu (3 zmiany pon-pt, 1 sobota, 2 niedziela — edytowalne).
- Zmiany w szablonie nie wpływają wstecz na już wygenerowany miesiąc — do tego służy "Zresetuj dni do aktualnego szablonu zmian" w panelu grafiku (tylko dla miesięcy w statusie draft, nieodwracalne).

## 4. Dyspozycyjność pracownika (`/dyspozycyjnosc`)

- Kalendarz miesiąca — pracownik zaznacza **tylko to, czego NIE będzie** (cały dzień, albo pojedyncze zmiany). Reszta jest domyślnie dostępna.
- Widok responsywny: pełnoszerokościowa lista jednokolumnowa na telefonie (≤640px), siatka 7-kolumnowa z nagłówkiem dni tygodnia od tabletu wzwyż.
- **Preferowane dni wolne**: dni tygodnia zapisywane niezależnie od miesiąca — jeśli pracownik nie wypełni dyspozycyjności na nowy miesiąc, te preferencje są brane jako domyślne.
- Banner statusu zgłoszenia (data zgłoszenia, możliwość dalszej edycji do publikacji).

## 5. Generator grafiku (Admin → Grafik)

### 5.1 Struktura miesiąca
- "Generuj strukturę miesiąca" — tworzy dni i zmiany na podstawie aktualnego szablonu, automatycznie dodaje wydarzenie "Sprzątanie" w każdą sobotę (domyślnie 08:00-09:00, edytowalne).

### 5.2 Generator propozycji (heurystyczny, automatyczny)
Wypełnia **tylko puste** zmiany i sobotnie sprzątanie — nigdy nie nadpisuje ręcznych przypisań. Zasady:

- **1 osoba = 1 zmiana dziennie, ale TYLKO pon-czw.** W piątek/sobotę/niedzielę ta sama osoba może wziąć więcej niż jedną zmianę (np. szef klubu 2x w niedzielę) — jedyne ograniczenie to realna dostępność.
- **Split-shift (pon-czw, tylko 2 osoby dostępne na cały dzień):** gdy normalnie są 3 zmiany, a dostępne są tylko 2 osoby, dzień jest dzielony matematycznie: jedna osoba robi zmianę "z przerwą" (otwarcie + domknięcie na koniec dnia), druga jedną ciągłą pośrodku — tak, żeby w oknie nakładania się standardowych zmian 2 i 3 (typowo 17:00-21:00) obie były na miejscu, a łączne godziny wyszły równe.
- **Kolejność przydziału zmian — algorytm "żalu" (regret-based greedy):** przy każdym kroku wybierana jest zmiana, dla której różnica punktacji między najlepszym a drugim kandydatem jest największa, i przypisywana od razu. Zapobiega to sytuacji, w której silna, jednoznaczna preferencja (np. "ta osoba = zawsze poranki") ginie w przetasowaniu przy przydzielaniu trudniejszych zmian.
- **Punktacja kandydata na daną zmianę** (im niżej, tym lepszy wybór):
  1. Konflikt z zajęciami instruktora >1h → duża kara (ostatni wybór).
  2. Zgodność z regułą "preferowany" dla tego dnia/godziny → bonus.
  3. Niedobór do WŁASNEGO minimum miesięcznego godzin → im większy niedobór, tym wyższy priorytet.
  4. Proporcja aktualnych godzin do WŁASNEGO celu miesięcznego (nie w godzinach absolutnych, żeby cel 160h i cel 80h były porównywalne).
  5. Liczba dni już przepracowanych w miesiącu (drobny czynnik wyrównujący).
  6. Rosnąca kara za każdy kolejny dzień pracy bez przerwy z rzędu (patrz niżej).
- **Twarde ograniczenia** (nie do przełamania, niezależnie od punktacji):
  - Niedostępność — cykliczna reguła "niedostępny" i/lub zgłoszona na dany miesiąc (cały dzień lub pojedyncza zmiana).
  - Max 7 dni z rzędu bez przerwy — z bezpiecznikiem: jeśli po odrzuceniu "zmęczonych" kandydatów nie zostaje nikt inny, reguła jest łamana jako ostatnia deska ratunku (to ma się zdarzać jak najrzadziej).
  - Min. 1 dzień wolny w tygodniu (liczony od poniedziałku) — liczy się też dla niepełnych tygodni na granicy miesiąca (np. gdy miesiąc zaczyna się we wtorek, dzień wolny jest wymuszany wśród widocznych dni tego tygodnia).
- **Sobotnie sprzątanie:** wybór 2 osób spośród tych, które mogą sprzątać (`can_clean`) i są dostępne, wg tej samej logiki niedoboru/celu godzin co zwykłe zmiany. Nie jest objęte regułą "dzień wolny w tygodniu" (to osobna, lekka 1h pula).

### 5.3 Ręczny edytor (tabela)
- Kompaktowa tabela: data, do 3 (lub więcej) kolumn zmian, kolumna wydarzeń.
- Lista rozwijana przypisania automatycznie **wyklucza** (nie tylko ostrzega): osoby niedostępne tego dnia/zmiany, oraz — tylko pon-czw — osoby już pracujące tego dnia gdzie indziej.
- Czerwone, pogrubione ostrzeżenie pod zmianą, jeśli ktoś na liście oryginalnie byłby niedostępny.
- Godziny i uczestnicy wydarzeń edytowalne bezpośrednio w wierszu (bez rozwijania), także w sobotę.
- Panel rozwijany "Więcej ⋯" per dzień: zamknięcie całego dnia, dodanie/usunięcie własnej zmiany z dowolnymi godzinami, dodanie wydarzenia, wybór wielu uczestników wydarzenia (filtrowany do `can_clean` dla typu sprzątanie).
- Panel "Suma godzin" — na żywo, per pracownik, z ostrzeżeniem gdy poniżej minimum/celu.
- Publikacja / cofnięcie publikacji miesiąca.

## 6. Wydarzenia (`schedule_event`)

- Typy: Liga open, Liga deblowa, Sprzątanie, Warsztaty, Inne.
- Dowolna liczba uczestników (wielokrotny wybór).
- "Przypisz do zmian" — szybkie masowe przypisanie uczestników ligi do otwartych zmian tego dnia, z ponowną weryfikacją dostępności każdego z nich.
- **Godziny KAŻDEGO wydarzenia (nie tylko sprzątania) liczą się do godzin pracownika automatycznie**, jeśli jest w liście uczestników i wydarzenie ma ustawioną godzinę końcową — działa to identycznie w generatorze, w panelu admina i w widoku pracownika.

## 7. Liczenie godzin

- `dailyEffectiveHours`: dla jednej osoby w jednym dniu scala nakładające się zmiany (bez podwójnego liczenia godzin nakładania), a następnie odejmuje nakładające się godziny zajęć instruktora.
- Widoczne w: panelu admina (Suma godzin), własnym widoku pracownika ("Twoje godziny w tym miesiącu").

## 8. Mój grafik (`/grafik`)

- Podgląd opublikowanego miesiąca (widok tylko-odczyt, tylko status `published`).
- Własne zmiany podświetlone kolorem marki, cudze zmiany pokazane z kropką koloru danej osoby.
- Nawigacja miesiąc wprzód/wstecz.

## 9. Zamiana zmian (`/zamiany`, `/admin/zamiany`)

- Pracownik wybiera swoją nadchodzącą zmianę + zmianę kolegi/koleżanki z opublikowanego grafiku, wysyła prośbę.
- Druga strona (albo admin, za obie strony) akceptuje lub odrzuca; wnioskodawca (albo admin) może anulować oczekującą prośbę.
- Po akceptacji zmiany zamieniają się przypisaniami w bazie.
- Ostrzeżenie (nie blokada) gdy różnica godzin między zmianami przekracza ±2h.
- Ostrzeżenie (nie blokada) gdy któraś ze stron ma już 2+ zaakceptowane zamiany w bieżącym miesiącu kalendarzowym (miękki limit).
- Panel admina widzi wszystkie prośby i może decydować za obie strony.

## 10. Eksport do druku / PDF (`/print/grafik`)

- Osobna strona bez nawigacji, dostęp tylko dla admina.
- Tabela całego miesiąca: data, dzień, zmiany (z przypisaną osobą), wydarzenia.
- `@page { size: A4 landscape; margin: 10mm }` — przycisk "Drukuj / zapisz jako PDF" korzysta z okna drukowania przeglądarki (zapis do PDF bez własnej biblioteki serwerowej).
- Link "Drukuj / PDF" w panelu układania grafiku, widoczny gdy miesiąc ma wygenerowaną strukturę.

## 11. Responsywność mobilna

- Kalendarz dyspozycyjności zoptymalizowany pod telefon (opisane w pkt 4).
- Pozostałe strony pracownika (mój grafik, zamiany, nagłówek nawigacji, logowanie) już elastyczne z natury (flex-wrap, `max-w-sm`, brak sztywnych szerokości) — bez dodatkowych zmian.

## 12. Kasa (`/kasa`, `/admin/kasa`, rola z dostępem do Kasy)

Moduł "Kasa v1" — pełne zastąpienie wcześniejszej, ręcznej wersji. Liczy się automatycznie z transakcji eFitness (import z Excela jako plan awaryjny, docelowo/domyślnie Data Lake API), nie z ręcznego wpisywania wpływów. Logika czysta w `src/lib/kasa.ts`, import/parsowanie w `src/lib/kasa-import.ts`, ekrany pod `src/app/(app)/kasa/` (dzień, recepcja) i `src/app/(app)/admin/kasa/` (import, docelowo też "Miesiąc" — patrz niżej). Schemat: migracje 0061–0073, 0076 (RLS).

**Klasyfikacja transakcji** (`classifyTransaction`) — w eFitness KAŻDA operacja kasowa (także zwykła sprzedaż) ma numer KP (wpływ) lub KW (wypływ); kierunek to prefiks numeru, rodzaj to tekst kolumny "Typ". System niczego nie zgaduje: nieznany Typ albo brak prefiksu KW/KP trafia zawsze do ręcznego przeglądu (`tx_class = "unknown"`), nigdy nie jest cicho wliczany do żadnej sumy.

- `sale` — zwykła sprzedaż (KP + Typ ≠ "Wpłata do kasy") — jedyna klasa niewymagająca dokumentu.
- `manual_kp` — ręczny wpływ gotówki do kasy (rzadkie, np. zasilenie z banku).
- `kw_expense` — prawdziwy wydatek ("Wypłata z kasy") — zawsze zmniejsza fizyczną gotówkę, zawsze wymaga dokumentu.
- `kw_wallet` / `kw_correction` — operacja portfela klienta / zwrot-korekta — domyślnie NIE liczą się jako realny wydatek (netto 0 w kasie), ALE recepcja może ręcznie przełączyć typ dokumentu na "prawdziwy wydatek", co wtedy zmienia stan oczekiwanej gotówki (`kwReducesCash`) — odkryte na realnych danych, że ten sam eFitness "Typ" bywa raz jednym, raz drugim.

**Liczenie stanu kasy** (3 liczenia dziennie: otwarcie/zmiana/zamknięcie, `cash_counts`): oczekiwana gotówka = saldo otwarcia + gotówka fiskalna + kaucje gotówką + KP ręczne − KW. Kaucje za butelki (zawsze forma "Niefiskalna" w eFitness, bez rozróżnienia karta/gotówka) dzielone są automatycznie z kwoty wpisanej z terminala: kaucje_kartą = suma_terminala − karta_eFitness, reszta to kaucje_gotówką (z ostrzeżeniem "rozbieżność terminala", gdy wynik wychodzi poza sensowny zakres). Liczenia się nie przeliczają wstecz — jeśli dane z eFitness dotrą później, UI tylko to sygnalizuje, nie nadpisuje zapisanej różnicy.

**Bilans otwarcia** — jeden wiersz konfiguracji (`kasa_settings`: `start_date`, `opening_balance`, pierwszy numer RD, liczba dni przypomnienia). Bilans otwarcia każdego dnia liczony jest w locie wstecz od tego punktu (`resolveOpeningBalance`). Istnieje też (napisana, ale jeszcze nigdzie niepodłączona do UI) metoda odwrotna — `openingBalanceFromKnownPoint`: licząc wstecz od znanego, fizycznie zweryfikowanego salda w późniejszym dniu, odejmując sumę ruchów gotówkowych do dnia startu. Tego dokładnie użyto przy starcie systemu (test na danych 31.10–09.11.2026, `start_date` ustawione na 10.11.2026) — ale bez ekranu/akcji, które by to powtórzyły bez ręcznego SQL.

**Dokumenty KW/KP** (`cash_doc_links`, 1:1 z transakcją, status `todo`/`complete`/`waiting`) — ekran uzupełniania pojedynczego dokumentu pod `/kasa/dokument/[id]`: rodzaj dokumentu (paragon / faktura KSeF / faktura spoza KSeF / czekamy na fakturę / zwrot-korekta klienta / operacja portfela / inne), numer dokumentu (opcjonalny, podpowiadany automatycznie wyciągnięty z opisu transakcji), notatka, skan/zdjęcie (wymagany dla paragonu i faktury spoza KSeF) w prywatnym buckecie Supabase Storage (`kasa-dokumenty`). Status wynika automatycznie z wybranego rodzaju dokumentu. **Hurtowe uzupełnianie wielu dokumentów naraz nie jest jeszcze zbudowane** — UX (zaznaczanie checkboxami / cały dzień / cały miesiąc, co dokładnie ustawia się hurtowo) wymaga decyzji przed implementacją.

**Dzień kasowy** (`cash_days`, numer RD nadawany ciągle przy zamknięciu) — ekran "Kasa – dziś" pod `/kasa`, mobile-first dla recepcji: 3 liczenia, lista transakcji dnia z klasyfikacją, lista dokumentów KW/KP do uzupełnienia, automatyczne odświeżenie z Data Lake przy każdym otwarciu (throttling 2 min, plus cron raz dziennie jako zabezpieczenie na wypadek ciszy po stronie przeglądarki — plan Vercel Hobby pozwala tylko na cron dzienny).

**Miesiąc kasowy** (`cash_months`: numer RK, bilans otwarcia/zamknięcia, ścieżka PDF raportu kasowego, ścieżka paczki ZIP) — **ekran admina "Miesiąc" nie jest jeszcze zbudowany** (dziś `/admin/kasa` to tylko ekran importu danych z eFitness). Docelowo ma generować numerowany Raport Kasowy (RK, PDF) z danych miesiąca (dni/liczenia/dokumenty) i paczkę ZIP (RK + skany KW/KP + raporty fiskalne dobowe/miesięczne + paragon terminala, wnioskowane z typów załączników w schemacie) — dokładny układ RK PDF nie jest jeszcze ustalony.

## 13. Marketing (`/marketing`)

Narzędzie planowania marketingu — zadania, kalendarz treści, wydarzenia i kampanie, strategie i plany. Logika czysta w `src/lib/marketing.ts`, akcje w `src/app/(app)/marketing/actions.ts` (+ `wydarzenia/actions.ts`), tabele `marketing_task`/`marketing_content`/`marketing_project`/`marketing_plan`. Dostęp: rola `marketing`/`admin` (pełny widok) albo `content_creator` (widok uproszczony, patrz niżej).

- **Zadania** (Kanban + widoki Dzień/Tydzień/Miesiąc/"Mój tydzień") — priorytet, termin, osoba, projekt, opcjonalne pola nagraniowe (format/czego szukać/nastrój), szybkie przesunięcie terminu o tydzień/miesiąc, archiwizacja bez usuwania.
- **Kalendarz treści** (widok miesięczny) — wpis ma platformę, cel (promocja/relacja), format (rolka/post/story/aktualność/karuzela/wydarzenie FB/inne), status (pomysł/w przygotowaniu/gotowe/opublikowane), osobę, projekt. Gotowe pola treści z przyciskiem "Kopiuj" do wklejenia przy publikacji: haczyk, treść FB, treść IG, hashtagi, link z UTM, napisy na ekran, co nagrać, do potwierdzenia, notatki — pogrupowane w 3 rozwijane sekcje w karcie edycji ("Po co" / "Tekst do publikacji" / "Nagranie"), domyślnie otwarte wg wypełnienia i formatu. Zapis aktualizuje tylko pola faktycznie zmienione (nie nadpisuje pustym stringiem pól nietkniętych w danej edycji).
- **Akceptacja treści** — wpis oznaczony "wymaga akceptacji" blokuje publikację do decyzji admina (akceptacja / uwaga do poprawki, cofa na "w przygotowaniu"), ale blokada sama wygasa w dniu zaplanowanej publikacji, jeśli nikt nie zareagował wcześniej. Cztery stany widoczne w UI: zatwierdzono / wymaga poprawki / zatwierdzono automatycznie / czeka na akceptację, plus licznik dla admina ile treści realnie czeka na jego pierwsze spojrzenie.
- **Wydarzenia i kampanie** (`/marketing?tab=wydarzenia`) — projekty trzech typów: Ogólne (worek bez terminu), Wydarzenie (data, oś komunikacji: zapowiedź -14d / plansza TV -7d / przypomnienie -3d / relacja +1d), Kampania (zakres dat, oś: start / połowa / ostatni tydzień). Oś komunikacji to tylko checklist wyliczany z dat projektu i porównywany z istniejącymi wpisami kalendarza w oknie ±2 dni — nigdy nie tworzy treści automatycznie. Cel liczbowy (np. liczba zapisów) z paskiem postępu. Zadania i treści łączą się z projektem przez `project_id` (klucz obcy).
- **Widok content_creator** (`CreatorView.tsx`) — osoba z samą rolą content_creator (bez marketing/admin) widzi tylko swoje: zakładka "Moje zadania" (pogrupowane zaległe/tydzień/miesiąc/później), zakładka "Treści" (wpisy kalendarza przypisane do niej wprost — pola nagraniowe, gotowy tekst do skopiowania, status akceptacji, przyciski Gotowe/Opublikowane), zakładka "Kalendarz". Jedyne dozwolone akcje: oznaczyć jako gotowe/opublikowane (własne rzeczy), żadnej edycji/dodawania/usuwania.
- **Strategie i plany** — proste notatki typu strategia/plan z archiwizacją.
- **Import z pliku** — jednorazowe wrzucenie zadań/treści/planów z tekstu, z dopasowaniem osoby po imieniu i nazwisku (bez trafienia wpis zostaje nieprzypisany).

## 14. Stos technologiczny

- Next.js (App Router, Turbopack) + React 19 + TypeScript + Tailwind CSS 4.
- Supabase/Postgres jako baza, bez ORM. Row Level Security włączone na wszystkich tabelach w `public` (bez polityk) — patrz pkt 1; autoryzacja realna zostaje w warstwie aplikacji.
- Sesje: HMAC-signed cookie własnej roboty, hasła przez bcryptjs.
- Hosting: Vercel (bez własnej domeny — link ma być docelowo linkowany/osadzony z WordPressa klubu).
- Osobne repo GitHub i osobny projekt Supabase — całkowicie oddzielone od projektu BestRacket.
- Styl i logo dopasowane do citysports.com.pl.

## 15. Znane ograniczenia (świadome uproszczenia, generator grafiku)

- Generator to heurystyka (greedy z priorytetami), nie pełny solver optymalizacyjny — w rzadkich przypadkach może dać lokalnie niedoskonały wynik przy bardzo dużej liczbie sprzecznych ograniczeń. Admin powinien zawsze przejrzeć wynik przed publikacją.
- Reguła "1 dzień wolny w tygodniu" liczy tygodnie osobno — teoretycznie ktoś może mieć dzień wolny na samej granicy dwóch tygodni i tak przepracować do 12-13 dni z rzędu w skrajnym przypadku (limit "max 7 dni z rzędu" łagodzi to niezależnie, ale nie jest z powyższym w 100% zintegrowany).
- "Max 7 dni z rzędu" i "dzień wolny w tygodniu" liczone są tylko w obrębie danych widocznych w bieżącym miesiącu — brak wglądu w poprzedni miesiąc (streak może się zresetować na granicy miesięcy, mimo że w rzeczywistości ktoś pracował bez przerwy).
- Sobotnie sprzątanie nie sprawdza, czy wybrana osoba w ogóle pracuje tej soboty (może dostać sprzątanie jako osobny "przyjazd", niezależnie od zmiany).
- Brak testów automatycznych — cała logika generatora weryfikowana ręcznie, na żywo.
- Próg konfliktu z zajęciami instruktora (>1h nakładania = ostatni wybór) jest globalny, nie konfigurowalny per osoba.

## 16. Świadomie odłożone / poza zakresem

### Kasa — do ustalenia przed dalszą pracą
- **Hurtowe uzupełnianie dokumentów KW/KP**: sposób zaznaczania (checkboxy na liście dnia / cały dzień / cały miesiąc) i co dokładnie ustawia się hurtowo (sam rodzaj dokumentu dla wielu naraz, bez numeru/notatki per-dokument?).
- **Ekran "Miesiąc" (RK PDF + paczka ZIP)**: dokładny układ raportu kasowego (kolumny, strona-na-dzień czy tabela zbiorcza, nagłówek/stopka) nie jest jeszcze zarysowany nawet w makiecie.
- **Test startowy bilansu otwarcia**: mechanizm (`openingBalanceFromKnownPoint`) jest już użyty raz ręcznie (wartości w `kasa_settings` są ustawione, dane od 01.11.2026 w bazie) — brakuje ekranu/akcji, żeby powtórzyć to bez SQL, i potwierdzenia czy temat jest zamknięty.

- Powiadomienia SMS/WhatsApp o terminach dyspozycyjności — odłożone całkowicie, do ponownego rozważenia później.
- Sprzątanie w dni robocze (pon-pt) — w trakcie zbierania wymagań, nie zbudowane.
- Integracja z Taskade (synchronizacja zadań/przypomnień + docelowo AI Agent czerpiący wiedzę z zsynchronizowanego projektu) — zaplanowana koncepcyjnie, czeka na Personal Access Token i ID projektu od użytkownika.
