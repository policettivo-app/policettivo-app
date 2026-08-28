-- 031_fix_indice_numerazione.sql
-- Correzione della 030 (28 agosto 2026). Idempotente.
--
-- PERCHE' ESISTE:
-- la 030 cercava il vecchio vincolo di numerazione solo tra i CONSTRAINT
-- (pg_constraint). Ma su `fatture` la numerazione era protetta da un
-- UNIQUE INDEX creato a parte, `fatture_prog_uq`, che nei constraint non
-- compare: e' rimasto vivo e ha bloccato la prima nota di credito
-- (NC/2026/001 ha progressivo 1 e sbatteva contro la fattura 2026/001)
--   duplicate key value violates unique constraint "fatture_prog_uq"
--
-- LEZIONE: un vincolo puo' essere un CONSTRAINT oppure un INDEX. Per essere
-- sicuri di averli visti tutti si guarda pg_indexes, non solo pg_constraint.

do $$
declare i record; c record;
begin
  for i in
    select indexname, indexdef from pg_indexes
    where schemaname='public' and tablename='fatture'
      and indexdef ilike '%unique%'
      and indexdef ilike '%professional_id%' and indexdef ilike '%anno%' and indexdef ilike '%progressivo%'
      and indexdef not ilike '%serie%'
  loop
    select conname into c from pg_constraint where conname = i.indexname;
    if found then
      execute format('alter table public.fatture drop constraint %I', i.indexname);
      raise notice 'Rimosso constraint %', i.indexname;
    else
      execute format('drop index public.%I', i.indexname);
      raise notice 'Rimosso indice %', i.indexname;
    end if;
  end loop;
end $$;

-- La numerazione buona e' quella per SERIE, gia' creata dalla 030 come
-- constraint `fatture_num_serie_uniq`. Questa riga la ricrea solo se manca.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fatture_num_serie_uniq')
     and not exists (select 1 from pg_indexes where schemaname='public' and indexname='fatture_num_serie_uniq') then
    alter table public.fatture add constraint fatture_num_serie_uniq
      unique (professional_id, anno, serie, progressivo);
  end if;
end $$;

-- Indice doppione creato durante la correzione a caldo del 28 ago: si toglie.
drop index if exists public.fatture_prog_serie_uq;

-- Controllo finale: devono restare solo fatture_pkey (id),
-- fatture_professional_id_numero_key (professional_id, numero)
-- e fatture_num_serie_uniq (professional_id, anno, serie, progressivo).
-- select indexname, indexdef from pg_indexes where schemaname='public' and tablename='fatture' and indexdef ilike '%unique%';
