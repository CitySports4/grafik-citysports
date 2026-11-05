-- Archiwizacja zadań — odpowiedź na realny feedback z użycia: zadania z
-- datami z przeszłości (np. z importu historycznych ustaleń) wisiały jako
-- "zaległe" z czerwonym ostrzeżeniem na stałe. Ten sam wzorzec co
-- marketing_plan.archived — chowa zadanie z bieżącego widoku i z licznika
-- zaległych, bez usuwania.
alter table marketing_task add column archived boolean not null default false;
