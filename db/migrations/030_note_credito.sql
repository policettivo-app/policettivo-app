-- 030_note_credito.sql
-- Blocco STORNO / NOTA DI CREDITO (agosto 2026)
-- Idempotente: si puo' rieseguire senza danni.
--
-- Cosa fa:
--   1) fatture.tipo_doc        'fattura' | 'nota_credito'
--   2) fatture.serie           'FT' | 'NC'  -> numerazione separata NC/2026/001
--   3) fatture.rif_fattura_id  fattura stornata dalla NC
--   4) UNIQUE numerazione: (professional_id, anno, progressivo)
--                       -> (professional_id, anno, serie, progressivo)
--   5) policy UPDATE su fatture (serve per marcare stato='stornata')
--   6) permette i movimenti NEGATIVI su patient_payments (rimborso al paziente),
--      togliendo un eventuale CHECK importo > 0 se e solo se esiste davvero.
--
-- NOTA: le fatture non si cancellano mai. Lo storno e' sempre un documento nuovo.

-- ─── 1-3) colonne ────────────────────────────────────────────────────
alter table public.fatture add column if not exists tipo_doc       text;
alter table public.fatture add column if not exists serie          text;
alter table public.fatture add column if not exists rif_fattura_id uuid;

update public.fatture set tipo_doc = 'fattura' where tipo_doc is null;
update public.fatture set serie = case when tipo_doc = 'nota_credito' then 'NC' else 'FT' end where serie is null;

alter table public.fatture alter column tipo_doc set default 'fattura';
alter table public.fatture alter column serie    set default 'FT';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fatture_tipo_doc_chk') then
    alter table public.fatture add constraint fatture_tipo_doc_chk
      check (tipo_doc in ('fattura','nota_credito'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fatture_serie_chk') then
    alter table public.fatture add constraint fatture_serie_chk
      check (serie in ('FT','NC'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fatture_rif_fattura_fk') then
    alter table public.fatture add constraint fatture_rif_fattura_fk
      foreign key (rif_fattura_id) references public.fatture(id) on delete set null;
  end if;
end $$;

create index if not exists idx_fatture_rif on public.fatture(rif_fattura_id);

-- ─── 4) numerazione: unique per SERIE ────────────────────────────────
-- Cerca il vecchio vincolo UNIQUE sulle 3 colonne e lo sostituisce.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'fatture' and con.contype = 'u'
      and pg_get_constraintdef(con.oid) ilike '%professional_id%anno%progressivo%'
      and pg_get_constraintdef(con.oid) not ilike '%serie%'
  loop
    execute format('alter table public.fatture drop constraint %I', c.conname);
    raise notice 'Rimosso vecchio vincolo di numerazione: %', c.conname;
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'fatture_num_serie_uniq') then
    alter table public.fatture add constraint fatture_num_serie_uniq
      unique (professional_id, anno, serie, progressivo);
  end if;
end $$;

-- ─── 5) policy UPDATE (marcare stato='stornata') ─────────────────────
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='fatture' and policyname='fatture_update_own'
  ) then
    create policy fatture_update_own on public.fatture
      for update using (professional_id = auth.uid()) with check (professional_id = auth.uid());
  end if;
end $$;

-- ─── 6) rimborsi: movimenti negativi su patient_payments ─────────────
-- Se (e solo se) esiste un CHECK che impone importo > 0, viene rimosso:
-- serve per registrare il rimborso al paziente come movimento negativo.
do $$
declare
  c record;
  trovato boolean := false;
begin
  for c in
    select con.conname, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'patient_payments' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%importo%'
      and (pg_get_constraintdef(con.oid) ilike '%> 0%' or pg_get_constraintdef(con.oid) ilike '%>= 0%')
  loop
    execute format('alter table public.patient_payments drop constraint %I', c.conname);
    raise notice 'Rimosso vincolo che impediva i rimborsi: % (%)', c.conname, c.def;
    trovato := true;
  end loop;
  if not trovato then
    raise notice 'Nessun vincolo su patient_payments.importo: i rimborsi negativi erano gia possibili.';
  end if;
end $$;

-- Traccia del rimborso: collega il movimento negativo alla nota di credito.
alter table public.patient_payments add column if not exists rimborso_nc_id uuid;

comment on column public.fatture.tipo_doc       is 'fattura | nota_credito';
comment on column public.fatture.serie          is 'FT = fatture, NC = note di credito (numerazioni separate)';
comment on column public.fatture.rif_fattura_id is 'Fattura stornata da questa nota di credito';
comment on column public.patient_payments.rimborso_nc_id is 'Se valorizzato, il movimento e un rimborso legato a quella nota di credito';
