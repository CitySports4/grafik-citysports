-- Poprawka do 0037: zadania "niebieski mop" (carry rano ↔ wieczór) NIE mogą
-- być "do wyboru" po OBU stronach naraz — inaczej obie strony tego samego
-- dnia mogłyby zostać pominięte i NIC by tego nie wymusiło (to zadania
-- codzienne — computeOverdueTasks ich w ogóle nie pilnuje, patrz warunek
-- `frequency === "daily"` w cleaning.ts).
--
-- Zasada z ustaleń: "czego nie zrobisz wieczorem, to zrobi ktoś od rana" —
-- czyli WIECZÓR jest do wyboru (zostaje optional=true z 0037), a RANO musi
-- zostać obowiązkowe jako twarda siatka bezpieczeństwa: jeśli wczorajszy
-- wieczór nie został zrobiony, dzisiejsze rano NIE jest autoCovered (patrz
-- resolveCarryOverrides) i musi się pojawić jako zwykłe, wymagane zadanie —
-- nie jako jeszcze jedna opcja w puli, którą też można pominąć.
update cleaning_task
set optional = false
where frequency = 'daily' and carry_pair_task_id is not null and slot = 'otwarcie';
