-- Banco di prova della migration 043 su PostgreSQL vero. [firma-prima-v1]
-- Non fa parte dell'applicazione: si lancia nel sandbox, non su Supabase.
\set ON_ERROR_STOP on
\pset pager off

create schema if not exists auth;
-- auth.uid() finto: legge chi sta "facendo la richiesta" da un setting
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('prova.uid', true), '')::uuid
$$;

drop table if exists public.consensi cascade;
create table public.consensi (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid,
  professional_id   uuid not null,
  documento_tipo    text not null,
  evento            text not null,
  firma_png         text,
  pdf_storage_path  text,
  pdf_hash          text,
  created_at        timestamptz not null default now()
);
-- come il vero: append-only, solo INSERT e SELECT, nessuna UPDATE
alter table public.consensi enable row level security;
create policy "consensi insert" on public.consensi for insert with check (professional_id = auth.uid());
create policy "consensi read"   on public.consensi for select using (professional_id = auth.uid());

drop table if exists public.esiti;
create table public.esiti (n text, atteso text, avuto text);

\set PROF '''11111111-1111-1111-1111-111111111111'''
\set ALTRO '''22222222-2222-2222-2222-222222222222'''

insert into public.consensi (id, professional_id, documento_tipo, evento, firma_png)
values ('aaaaaaaa-0000-0000-0000-000000000001', :PROF, 'consenso_informato', 'firma', 'data:image/png;base64,xxx'),
       ('aaaaaaaa-0000-0000-0000-000000000002', :PROF, 'consenso_foto_video', 'firma', 'data:image/png;base64,yyy'),
       ('aaaaaaaa-0000-0000-0000-000000000003', :ALTRO, 'consenso_informato', 'firma', 'data:image/png;base64,zzz');

-- ── carica la migration 043 VERA, senza copiarla: si prova quella ────────
\i db/migrations/043_consenso_allega_pdf.sql
-- e la si rilancia subito: dev'essere idempotente
\i db/migrations/043_consenso_allega_pdf.sql

create or replace function public.att(nome text, atteso text, avuto text) returns void
language sql as $$ insert into public.esiti values (nome, atteso, avuto) $$;

grant usage on schema public to finto_authenticated;
grant select, insert, update on public.consensi to finto_authenticated;
grant select, insert on public.esiti to finto_authenticated;

\o /dev/null
set prova.uid = '11111111-1111-1111-1111-111111111111';

-- 1) allega su una riga senza PDF, stesso professionista
select public.att('1 allega la prima volta', 'true',
  public.consenso_allega_pdf('aaaaaaaa-0000-0000-0000-000000000001','consensi/x/a.pdf','ab12')::text);
select public.att('1b il percorso e finito nella riga', 'consensi/x/a.pdf',
  (select pdf_storage_path from public.consensi where id='aaaaaaaa-0000-0000-0000-000000000001'));
select public.att('1c l hash e finito nella riga', 'ab12',
  (select pdf_hash from public.consensi where id='aaaaaaaa-0000-0000-0000-000000000001'));

-- 2) DOPPIA ESECUZIONE: non riscrive, e lo dice
select public.att('2 la seconda volta non allega', 'false',
  public.consenso_allega_pdf('aaaaaaaa-0000-0000-0000-000000000001','consensi/x/ALTRO.pdf','ffff')::text);
select public.att('2b il percorso e rimasto quello di prima', 'consensi/x/a.pdf',
  (select pdf_storage_path from public.consensi where id='aaaaaaaa-0000-0000-0000-000000000001'));
select public.att('2c l hash e rimasto quello di prima', 'ab12',
  (select pdf_hash from public.consensi where id='aaaaaaaa-0000-0000-0000-000000000001'));

-- 3) consenso di un ALTRO professionista: non si tocca
select public.att('3 non allega al consenso di un altro', 'false',
  public.consenso_allega_pdf('aaaaaaaa-0000-0000-0000-000000000003','consensi/x/rubato.pdf','dead')::text);
select public.att('3b la riga dell altro e ancora senza PDF', 'NULL',
  coalesce((select pdf_storage_path from public.consensi where id='aaaaaaaa-0000-0000-0000-000000000003'),'NULL'));

-- 4) id che non esiste
select public.att('4 id inesistente', 'false',
  public.consenso_allega_pdf('aaaaaaaa-0000-0000-0000-00000000ffff','consensi/x/b.pdf','cccc')::text);

-- 5) parametri al confine
select public.att('5 consenso_id null', 'false', public.consenso_allega_pdf(null,'consensi/x/b.pdf','cccc')::text);
select public.att('5b percorso null', 'false', public.consenso_allega_pdf('aaaaaaaa-0000-0000-0000-000000000002',null,'cccc')::text);
select public.att('5c percorso vuoto', 'false', public.consenso_allega_pdf('aaaaaaaa-0000-0000-0000-000000000002','   ','cccc')::text);
select public.att('5d dopo i casi limite la riga 2 e ancora vergine', 'NULL',
  coalesce((select pdf_storage_path from public.consensi where id='aaaaaaaa-0000-0000-0000-000000000002'),'NULL'));
select public.att('5e hash null e ammesso (il PDF c e, l impronta no)', 'true',
  public.consenso_allega_pdf('aaaaaaaa-0000-0000-0000-000000000002','consensi/x/c.pdf',null)::text);

-- 6) nessuna sessione (auth.uid() vuoto): non si tocca niente
set prova.uid = '';
select public.att('6 senza sessione non allega', 'false',
  public.consenso_allega_pdf('aaaaaaaa-0000-0000-0000-000000000003','consensi/x/no.pdf','0000')::text);
set prova.uid = '11111111-1111-1111-1111-111111111111';

-- 7) la tabella resta APPEND-ONLY: nessuna policy di UPDATE aggiunta
select public.att('7 policy di UPDATE su consensi', '0',
  (select count(*) from pg_policies where schemaname='public' and tablename='consensi' and cmd='UPDATE')::text);
select public.att('7b le policy sono ancora solo INSERT e SELECT', 'INSERT,SELECT',
  (select string_agg(distinct cmd, ',' order by cmd) from pg_policies where schemaname='public' and tablename='consensi'));

-- 8) i permessi: anon no, authenticated si
select public.att('8 anon NON puo eseguire', 'false',
  has_function_privilege('anon','public.consenso_allega_pdf(uuid,text,text)','execute')::text);
select public.att('8b authenticated puo eseguire', 'true',
  has_function_privilege('authenticated','public.consenso_allega_pdf(uuid,text,text)','execute')::text);
select public.att('8c la funzione e security definer', 'true',
  (select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='consenso_allega_pdf')::text);

-- 9) un utente normale NON puo aggiornare la tabella a mano (RLS)
set role finto_authenticated;
set prova.uid = '11111111-1111-1111-1111-111111111111';
do $$
declare n int;
begin
  update public.consensi set pdf_storage_path='consensi/x/a-mano.pdf'
   where id='aaaaaaaa-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  insert into public.esiti values ('9 update a mano bloccato da RLS', '0', n::text);
exception when insufficient_privilege then
  insert into public.esiti values ('9 update a mano bloccato da RLS', '0', '0');
end $$;
reset role;
\o

select n as controllo, atteso, avuto,
       case when atteso is not distinct from avuto then 'OK' else 'FALLITO' end as esito
  from public.esiti order by n;
