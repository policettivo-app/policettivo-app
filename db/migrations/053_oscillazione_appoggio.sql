-- ═══════════════════════════════════════════════════════════════════════
-- Migration 053 — Appoggio della prova: su un piede, destro o sinistro [monopodalico-v1]
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE
--   `oscillazione_test.appoggio` — 'dx' (solo piede destro) oppure 'sx'
--   (solo piede sinistro). Vuoto = su due piedi, come tutte le prove di prima.
--
-- PERCHE'
--   Il test su un piede fa due prove di fila (destro, poi sinistro) e le
--   confronta. Senza questa colonna una prova su un piede finirebbe mescolata
--   con quelle su due piedi nel confronto nel tempo: non si mescola, si segna.
--   La pagina del test controlla che la colonna ci sia PRIMA di partire.
--
-- ⚠️ TUTTO ADDITIVO. Una colonna nuova, facoltativa. Non tocca niente di
--    esistente, non cambia le policy. Si può rilanciare quante volte si vuole.
--
-- Ritorno indietro:
--   alter table public.oscillazione_test drop column if exists appoggio;
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  perform public.salva_prima('oscillazione_appoggio', 'monopodalico-v1');
exception
  when undefined_function then
    raise notice 'salva_prima non esiste (042 non lanciata): niente da salvare, e'' tutto nuovo';
end
$$;

alter table public.oscillazione_test add column if not exists appoggio text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'oscillazione_test_appoggio_check') then
    alter table public.oscillazione_test
      add constraint oscillazione_test_appoggio_check check (appoggio is null or appoggio in ('dx','sx'));
  end if;
end
$$;
