-- ═══════════════════════════════════════════════════════════════════════
-- Migration 048 — Momento della prova: prima o dopo i 3 Respiri [schermo-paziente-v1]
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE
--   `oscillazione_test.momento` — 'pre' (prima dei 3 Respiri) oppure 'post'
--   (dopo i 3 Respiri). Vuoto = non indicato, come tutte le prove di prima.
--
-- PERCHE'
--   Lo schermo per il paziente mette a confronto l'equilibrio PRIMA e DOPO
--   i 3 Respiri nella stessa seduta. Senza questa colonna l'app dovrebbe
--   indovinare quali prove stanno prima e quali dopo: non si indovina, si segna.
--
-- ⚠️ TUTTO ADDITIVO. Una colonna nuova, facoltativa. Non tocca niente di
--    esistente, non cambia le policy (l'UPDATE del professionista sui suoi
--    test esiste già dalla 046). Si può rilanciare quante volte si vuole.
--
-- Ritorno indietro:
--   alter table public.oscillazione_test drop column if exists momento;
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  perform public.salva_prima('oscillazione_momento', 'schermo-paziente-v1');
exception
  when undefined_function then
    raise notice 'salva_prima non esiste (042 non lanciata): niente da salvare, e'' tutto nuovo';
end
$$;

alter table public.oscillazione_test add column if not exists momento text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'oscillazione_test_momento_check') then
    alter table public.oscillazione_test
      add constraint oscillazione_test_momento_check check (momento is null or momento in ('pre','post'));
  end if;
end
$$;

create index if not exists idx_osc_test_momento
  on public.oscillazione_test (patient_id, quando desc) where momento is not null;
