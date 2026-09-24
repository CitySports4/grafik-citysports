-- Socjalne: "Blat" (co tydzień) rozszerzone o suszarkę i ekspres do kawy —
-- ta sama cotygodniowa czynność obejmuje teraz też te dwa sprzęty.
update cleaning_task
set name = 'Blat, suszarka, ekspres', time_minutes = 15
where name = 'Blat'
  and zone_id = (select id from cleaning_zone where name = 'Socjalne');

-- Socjalne: "Lodówka, zmywarka, szafki" (co kwartał) — dochodzi mikrofala.
update cleaning_task
set name = 'Lodówka, zmywarka, szafki, mikrofala', time_minutes = 35
where name = 'Lodówka, zmywarka, szafki'
  and zone_id = (select id from cleaning_zone where name = 'Socjalne');

-- Między kortami: "Sprzątanie za kanapą" i "Odkurzanie pod kanapami" (oba co
-- kwartał, ta sama pora dnia) łączone w jedno zadanie — to samo miejsce, nie
-- ma sensu robić ich osobno. Zostaje pierwsze zadanie pod nową nazwą i
-- czasem, drugie usuwane (cascade skasuje jego ewentualną historię wykonań).
update cleaning_task
set name = 'Sprzątanie za i pod kanapami/pufami', time_minutes = 30
where name = 'Sprzątanie za kanapą'
  and zone_id = (select id from cleaning_zone where name = 'Między kortami');

delete from cleaning_task
where name = 'Odkurzanie pod kanapami'
  and zone_id = (select id from cleaning_zone where name = 'Między kortami');
