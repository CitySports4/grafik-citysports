-- Przyjęcie dziecka z listy oczekujących (patrz assignTrialDate w
-- app/(app)/zajecia-dzieci/actions.ts) to świadoma decyzja administracyjna
-- "to miejsce jest teraz zajęte" — w odróżnieniu od zwykłego, samodzielnego
-- zgłoszenia na próbne przez rodzica (które celowo NIE blokuje całego
-- miesiąca, patrz hasTrialDateCapacity/computeCommittedOccupancy), zapis
-- przyjęty z listy oczekujących ma liczyć się do obłożenia grupy od razu,
-- nawet mając jeszcze status "Nowe" z terminem próbnych.
alter table kids_class_enrollment add column from_waitlist boolean not null default false;
