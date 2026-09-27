-- Rodzic wybiera w formularzu konkretny termin zajęć próbnych (spośród
-- najbliższych terminów danej grupy) zamiast tylko odhaczać "próbne" po
-- fakcie — patrz upcomingSessionDates w kids-classes.ts.
alter table kids_class_enrollment add column trial_date date;
