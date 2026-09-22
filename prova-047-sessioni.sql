-- prova-047-sessioni.sql — test-sessioni-v1
--   su postgres -c "psql -f prova-047-sessioni.sql"
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
\echo '── 046 (già lanciata in produzione) e poi 047, due volte ──'
\i db/migrations/046_oscillazione.sql
\i db/migrations/047_test_sessioni.sql
\i db/migrations/047_test_sessioni.sql
\set QUIET on
create table prova_esiti (n serial, nome text, ok boolean, extra text);
create or replace function v(p_nome text, p_ok boolean, p_extra text default null)
returns void language plpgsql as $$
begin insert into prova_esiti (nome, ok, extra) values (p_nome, coalesce(p_ok,false), p_extra); end $$;

do $$
declare s1 uuid; s2 uuid; t uuid; n integer;
begin
  insert into public.test_sessioni (professional_id, patient_id)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333') returning id into s1;
  perform v('una sessione col paziente si crea', s1 is not null);

  insert into public.test_sessioni (professional_id, nome, eta, peso_kg)
  values ('11111111-1111-1111-1111-111111111111', 'Anna', 42, 61.5) returning id into s2;
  perform v('⭐ una sessione LIBERA con nome, età e peso', s2 is not null);
  insert into public.test_sessioni (professional_id) values ('11111111-1111-1111-1111-111111111111');
  perform v('⭐ e anche senza niente: sono facoltativi', true);

  begin
    insert into public.test_sessioni (professional_id, eta) values ('11111111-1111-1111-1111-111111111111', 300);
    perform v('⛔ un''età di 300 anni non entra', false);
  exception when check_violation then perform v('⛔ un''età di 300 anni non entra', true); end;
  begin
    insert into public.test_sessioni (professional_id, peso_kg) values ('11111111-1111-1111-1111-111111111111', 0);
    perform v('⛔ un peso di 0 kg non entra', false);
  exception when check_violation then perform v('⛔ un peso di 0 kg non entra', true); end;

  insert into public.oscillazione_test (professional_id, patient_id, evento, velocita, sessione_id)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'beccheggio', 3.1, s1)
  returning id into t;
  perform v('⭐ la prova si salva DENTRO la sessione', (select sessione_id from public.oscillazione_test where id = t) = s1);

  insert into public.oscillazione_test (professional_id, evento, velocita)
  values ('11111111-1111-1111-1111-111111111111', 'rollio', 4.0);
  perform v('⭐ le prove di prima, senza sessione, entrano ancora', true);

  delete from public.test_sessioni where id = s1;
  select count(*) into n from public.oscillazione_test where id = t;
  perform v('⭐ cancellando la sessione la prova RESTA (le misure sono il dato)', n = 1, n::text);
  perform v('   e resta senza sessione', (select sessione_id from public.oscillazione_test where id = t) is null);

  insert into public.test_sessioni (professional_id, patient_id)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333');
  delete from public.patients where id = '33333333-3333-3333-3333-333333333333';
  select count(*) into n from public.test_sessioni where patient_id is not null;
  perform v('cancellando il paziente le sue sessioni se ne vanno', n = 0, n::text);
end $$;

do $$
declare n integer;
begin
  select count(*) into n from pg_policies where tablename = 'test_sessioni';
  perform v('quattro policy sulle sessioni', n = 4, n::text);
  select count(*) into n from pg_class where relname = 'test_sessioni' and relrowsecurity;
  perform v('⭐ RLS accesa sulle sessioni', n = 1);
  select count(*) into n from pg_policies where tablename = 'oscillazione_test';
  perform v('le policy dei test sono ancora quattro (047 non le tocca)', n = 4, n::text);
end $$;

-- ⭐ la RLS vera, da utente vero (non da superuser)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
grant usage on schema public, auth to authenticated;
grant all on public.test_sessioni, public.professionals to authenticated;
grant execute on function auth.uid() to authenticated;
insert into public.test_sessioni (professional_id, nome) values ('22222222-2222-2222-2222-222222222222', 'Segreto');
set role authenticated;
select set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
create temp table _conta as select
  (select count(*) from public.test_sessioni where nome = 'Segreto') as altrui,
  (select count(*) from public.test_sessioni) as mie;
reset role;
do $$ declare a integer; m integer; begin
  select altrui, mie into a, m from _conta;
  perform v('⛔ un professionista NON vede le sessioni di un altro', a = 0, a::text);
  perform v('   e vede le sue', m >= 2, m::text);
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
