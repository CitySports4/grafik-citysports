-- Auto-promocja z listy oczekujących (przy rezygnacji, patrz
-- changeEnrollmentStatus) dzieje się cicho w bazie — nikt z recepcji/admina
-- nie wie, że trzeba zadzwonić do rodzica. Flaga czyszczona ręcznie po
-- kontakcie (patrz markContacted w actions.ts).
alter table kids_class_enrollment add column needs_parent_contact boolean not null default false;
