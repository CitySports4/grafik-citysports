-- PIN dostępu do ogólnego podglądu (komputer recepcyjny) — jeden wspólny
-- sekret dla całej recepcji, NIE osobiste konto pracownika. Osoba, która go
-- zna, loguje się na współdzielonym stanowisku i widzi: grafik pracy (tylko
-- podgląd), zadania sprzątania (tylko podgląd) oraz pełny moduł treningów
-- personalnych (dodawanie, blokada sali, rozliczenia) — patrz
-- lib/kiosk-session.ts i app/recepcja/.
create table kiosk_settings (
  id integer primary key default 1 check (id = 1),
  pin_hash text
);
insert into kiosk_settings (id, pin_hash) values (1, null);
