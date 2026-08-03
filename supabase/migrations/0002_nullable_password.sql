-- Admin zakłada konto pracownika bez hasła — pracownik ustawia je sam przy
-- pierwszym logowaniu (telefon -> wykrycie braku hasła -> ustawienie hasła).
alter table employee alter column password_hash drop not null;
