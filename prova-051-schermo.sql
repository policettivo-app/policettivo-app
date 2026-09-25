-- prova-051-schermo.sql — tv-v1
--   su postgres -c "psql -f prova-051-schermo.sql"
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
create table public.professionals (id uuid primary key default gen_random_uuid(), user_id uuid);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('prova.uid', true), '')::uuid $$;
insert into public.professionals (id, user_id) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
create table prova_esiti (n serial, nome text, ok boolean, extra text);
create or replace function v(p_nome text, p_ok boolean, p_extra text default null)
returns void language plpgsql as $$
begin insert into prova_esiti (nome, ok, extra) values (p_nome, coalesce(p_ok,false), p_extra); end $$;
\set QUIET off
\echo '── 051 lanciata due volte ──'
\i db/migrations/051_schermo_tv.sql
\i db/migrations/051_schermo_tv.sql
\set QUIET on
grant usage on schema public, auth to authenticated;
grant execute on function auth.uid() to authenticated;
create table public._r (chi text, c uuid);
grant all on public._r to authenticated;
set role authenticated;
select set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
insert into public._r select 'a1', public.schermo_canale();
insert into public._r select 'a2', public.schermo_canale();
select set_config('prova.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
insert into public._r select 'b', public.schermo_canale();
select set_config('prova.uid', 'cccccccc-cccc-cccc-cccc-cccccccccccc', false);
insert into public._r select 'x', public.schermo_canale();
reset role;
do $$ declare a1 uuid; a2 uuid; b uuid; x uuid; n integer; begin
  select c into a1 from public._r where chi = 'a1'; select c into a2 from public._r where chi = 'a2';
  select c into b from public._r where chi = 'b'; select c into x from public._r where chi = 'x';
  perform v('⭐ il professionista ha il suo canale', a1 is not null);
  perform v('⭐ ed è sempre lo stesso (telefono e TV lo trovano uguale)', a1 = a2);
  perform v('⛔ un altro professionista ne ha un altro', b is not null and b <> a1);
  perform v('⛔ chi non è professionista non ha niente', x is null);
  select count(*) into n from public.professionals where schermo_canale is not null;
  perform v('salvato sulla riga del professionista', n = 2, n::text);
  select count(*) into n from information_schema.routine_privileges where routine_name = 'schermo_canale' and grantee = 'anon';
  perform v('⛔ senza account (anon) non si chiama', n = 0, n::text);
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
