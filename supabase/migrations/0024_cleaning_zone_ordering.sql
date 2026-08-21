-- Kolejność wyświetlania stref sprzątania ma odzwierciedlać RZECZYWISTĄ
-- bliskość fizyczną w klubie, żeby osoba sprzątająca robiła zadania w
-- sąsiadujących miejscach po kolei, zamiast skakać między odległymi
-- strefami. group_code (dawniej bezsensowne litery A-D z prototypu) teraz
-- niesie czytelną nazwę klastra — "Szatnie" grupuje wizualnie 2 osobne
-- strefy (damska/męska), bez scalania ich z powrotem w jedną (patrz 0023).

alter table cleaning_zone add column if not exists sort_order integer not null default 0;

-- Klaster "Parter/wejście": Recepcja, Dolny relax, Socjalne.
update cleaning_zone set group_code = 'Parter', sort_order = 10 where name = 'Recepcja';
update cleaning_zone set group_code = 'Parter', sort_order = 11 where name = 'Dolny relax';
update cleaning_zone set group_code = 'Parter', sort_order = 12 where name = 'Socjalne';

-- Klaster "Piętro": Relax góra sąsiaduje z szatniami, ale "Szatnie" to
-- osobna, nazwana podkategoria (2 strefy: damska + męska) w jej obrębie.
update cleaning_zone set group_code = 'Piętro', sort_order = 20 where name = 'Relax góra';
update cleaning_zone set group_code = 'Szatnie', sort_order = 21 where name = 'Szatnia damska';
update cleaning_zone set group_code = 'Szatnie', sort_order = 22 where name = 'Szatnia męska';

-- Klaster "Korty": Badminton, Między kortami, Squash.
update cleaning_zone set group_code = 'Korty', sort_order = 30 where name = 'Badminton';
update cleaning_zone set group_code = 'Korty', sort_order = 31 where name = 'Między kortami';
update cleaning_zone set group_code = 'Korty', sort_order = 32 where name = 'Squash';

-- Reszta stref (Cały klub, Klimatyzacja, Sala fitness góra, Sala fitness
-- dół, Relax dół + Relax góra, Szatnie × 2 [usunięte w 0023]) — bez
-- deklarowanej fizycznej bliskości od użytkownika, więc czyścimy stare,
-- mylące litery A-D z prototypu (grupa != realna bliskość) i wsadzamy na
-- koniec kolejności, żeby nie wchodziły w drogę jasno ułożonym klastrom
-- powyżej. Do ewentualnego dogrupowania później.
update cleaning_zone set group_code = null, sort_order = 90
where name not in ('Recepcja', 'Dolny relax', 'Socjalne', 'Relax góra', 'Szatnia damska', 'Szatnia męska', 'Badminton', 'Między kortami', 'Squash');
