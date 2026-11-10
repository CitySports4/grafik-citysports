-- Klasyfikacja operacji KW/KP wg ostatecznych reguł pkt 2a specyfikacji
-- (10.11.2026, zweryfikowane na prawdziwych eksportach): w eFitness KAŻDA
-- operacja kasowa dostaje numer KP (wpływ) albo KW (wypływ), także zwykła
-- sprzedaż — więc numeryczny "Type" z dokumentacji API (0-8) nie wystarcza
-- do klasyfikacji. Zamiast tego: kierunek z prefiksu numeru dokumentu
-- (zawsze zgodny ze znakiem Wartość) + tekst kolumny "Typ" (9 możliwych
-- wartości, nie liczba) — patrz classifyTransaction w lib/kasa.ts.
-- efitness_transactions ma 0 wierszy (test ręczny poza bazą), więc zamiast
-- migrować dane — po prostu zmieniamy kolumny.

alter table efitness_transactions drop column type;
alter table efitness_transactions add column type_label text not null default '';
alter table efitness_transactions add column tx_class text not null default 'unknown'
  check (tx_class in ('sale', 'manual_kp', 'kw_expense', 'kw_wallet', 'kw_correction', 'unknown'));
create index idx_efitness_transactions_tx_class on efitness_transactions(tx_class);

-- doc_type: dwie nowe automatyczne kategorie dla KW innych niż "wydatek"
-- (pkt 2a): "client_correction" (Zwrot/korekta klienta — Wypłata raty/z
-- baru/Inne jako KW) i "wallet_operation" (Operacja portfela klienta —
-- Uzupełnienie portfela jako KW, netto 0 w kasie jeśli sparowane ze
-- sprzedażą, ale parowania NIE dało się wiarygodnie potwierdzić na danych
-- testowych, więc zawsze status "todo"/do przeglądu, nigdy automatycznie
-- "complete").
alter table cash_doc_links drop constraint cash_doc_links_doc_type_check;
alter table cash_doc_links add constraint cash_doc_links_doc_type_check
  check (doc_type in ('receipt', 'ksef_invoice', 'foreign_invoice', 'awaiting_invoice', 'client_correction', 'wallet_operation', 'other'));
