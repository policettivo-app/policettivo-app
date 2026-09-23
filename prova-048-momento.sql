-- prova-048-momento.sql — schermo-paziente-v1
--   su postgres -c "psql -f prova-048-momento.sql"
\set ON_ERROR_STOP off
\set QUIET on
drop schema if exists public cascade;
create schema public;
create extension if not exists pgcrypto;
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create table public.professionals (id uuid primary key default gen_random_uuid(), user_id uuid, piano text default 'free');
create table public.patients (id uuid primary key default gen_random_uuid(),
  professional_id uuid references public.professionals(id) on delete cascade, nome text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('prova.uid', true), '')::uuid $$;
insert into public.professionals (id, user_id) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.patients (id, professional_id, nome) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Mario');
\set QUIET off
\echo '── 046, 047 (già lanciate in produzione), poi 048 due volte ──'
\i db/migrations/046_oscillazione.sql
\i db/migrations/047_test_sessioni.sql
\i db/migrations/048_oscillazione_momento.sql
\i db/migrations/048_oscillazione_momento.sql
\set QUIET on
create table prova_esiti (n serial, nome text, ok boolean, extra text);
create or replace function v(p_nome text, p_ok boolean, p_extra text default null)
returns void language plpgsql as $$
begin insert into prova_esiti (nome, ok, extra) values (p_nome, coalesce(p_ok,false), p_extra); end $$;

do $$
declare t uuid; n integer;
begin
  select count(*) into n from information_schema.columns where table_name = 'oscillazione_test' and column_name = 'momento';
  perform v('⭐ la colonna momento esiste', n = 1, n::text);
  select count(*) into n from pg_constraint where conname = 'oscillazione_test_momento_check';
  perform v('   con un solo vincolo, anche lanciata due volte', n = 1, n::text);

  insert into public.oscillazione_test (professional_id, patient_id, evento, velocita, momento)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'beccheggio', 3.1, 'pre') returning id into t;
  perform v('⭐ una prova PRIMA dei 3 Respiri si salva', t is not null);
  insert into public.oscillazione_test (professional_id, patient_id, evento, velocita, momento)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'beccheggio', 2.4, 'post');
  perform v('⭐ una prova DOPO i 3 Respiri si salva', true);
  insert into public.oscillazione_test (professional_id, evento, velocita)
  values ('11111111-1111-1111-1111-111111111111', 'rollio', 4.0);
  perform v('⭐ una prova senza momento (come tutte quelle di prima) entra ancora', true);
  begin
    insert into public.oscillazione_test (professional_id, evento, velocita, momento)
    values ('11111111-1111-1111-1111-111111111111', 'rollio', 4.0, 'dopo');
    perform v('⛔ un momento che non è pre/post non entra', false);
  exception when check_violation then perform v('⛔ un momento che non è pre/post non entra', true); end;
  update public.oscillazione_test set momento = 'post' where id = t;
  perform v('una prova già salvata si può ri-segnare', (select momento from public.oscillazione_test where id = t) = 'post');
  update public.oscillazione_test set momento = null where id = t;
  perform v('   e si può togliere il segno', (select momento from public.oscillazione_test where id = t) is null);
  select count(*) into n from pg_policies where tablename = 'oscillazione_test';
  perform v('le policy dei test restano quattro (048 non le tocca)', n = 4, n::text);
end $$;

-- ⭐ la RLS vera: B non può ri-segnare le prove di A
grant usage on schema public, auth to authenticated;
grant all on public.oscillazione_test, public.professionals to authenticated;
grant execute on function auth.uid() to authenticated;
set role authenticated;
select set_config('prova.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
update public.oscillazione_test set momento = 'pre' where momento = 'post';
select set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
create temp table _conta as select (select count(*) from public.oscillazione_test where momento = 'post') as post_a;
reset role;
do $$ declare n integer; begin
  select post_a into n from _conta;
  perform v('⛔ un altro professionista NON può ri-segnare le prove di A', n = 1, n::text);
end $$;

\set QUIET off
\echo ''
select case when ok then '  ✅ ' else '  ❌ ' end || nome ||
       case when ok or extra is null then '' else '  → ' || extra end as esito
  from prova_esiti order by n;
select case when count(*) filter (where not ok) = 0
            then 'TUTTO VERDE — ' || count(*) || ' controlli passati.'
            else 'ROSSO — ' || count(*) filter (where ok) || ' passati, '
                 || count(*) filter (where not ok) || ' falliti.' end as riepilogo
  from prova_esiti;
