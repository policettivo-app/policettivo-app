-- ═══════════════════════════════════════════════════════════════════════
-- Migration 057 — La descrizione del PRIMA e del DOPO [momento-nota-v1]
-- ═══════════════════════════════════════════════════════════════════════
-- COSA AGGIUNGE
--   `momento_nota` (testo, facoltativo) nelle quattro tabelle dei test:
--   oscillazione_test, squat_test, atr_test, stepping_test.
--   Dice CHE COSA è il prima («neutro, mai provato cuscini») e che cosa si è
--   fatto prima del dopo («schema 2», «3 Respiri»…). La colonna `momento`
--   ('pre' | 'post') c'è già (048, 050, 054, 055).
-- ⚠️ TUTTO ADDITIVO: una colonna nuova e facoltativa per tabella. Non tocca
--    dati, funzioni, policy. Si può rilanciare quante volte si vuole.
--    Una tabella che non esiste viene saltata.
-- Ritorno indietro:
--   alter table public.oscillazione_test drop column if exists momento_nota;
--   (uguale per squat_test, atr_test, stepping_test)
-- ═══════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['oscillazione_test','squat_test','atr_test','stepping_test'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists momento_nota text', t);
      if not exists (select 1 from pg_constraint where conname = t || '_momento_nota_len') then
        execute format('alter table public.%I add constraint %I check (momento_nota is null or char_length(momento_nota) <= 200)', t, t || '_momento_nota_len');
      end if;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
