-- Usuwa tymczasową strefę "Ogólne sprzątanie (sobota)" zasianą w migracji
-- 0009 jako pomost ze starego przełącznika can_clean. Teraz gdy istnieje 20
-- prawdziwych, granularnych stref (migracja 0012), ten worek-wszystko jest
-- zbędny — kompetencje przypisuje się już wyłącznie per realna strefa w
-- Konfiguracja sprzątania → Kompetencje. Nic w kodzie aplikacji nie
-- odwołuje się do tej strefy po nazwie ani do kolumny employee.can_clean.

delete from employee_cleaning_zone
where zone_id in (select id from cleaning_zone where name = 'Ogólne sprzątanie (sobota)');

delete from cleaning_zone where name = 'Ogólne sprzątanie (sobota)';
