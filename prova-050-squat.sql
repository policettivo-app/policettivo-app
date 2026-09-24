-- prova-050-squat.sql — squat-v1
--   su postgres -c "psql -f prova-050-squat.sql"
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
create table public.patients (id uuid primary key default gen_random_uuid(),
  professional_id uuid references public.professionals(id) on delete cascade, nome text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('prova.uid', true), '')::uuid $$;
insert into public.professionals (id, user_id) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.patients (id, professional_id, nome) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Mario'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Bruno');
create table prova_esiti (n serial, nome text, ok boolean, extra text);
create or replace function v(p_nome text, p_ok boolean, p_extra text default null)
returns void language plpgsql as $$
begin insert into prova_esiti (nome, ok, extra) values (p_nome, coalesce(p_ok,false), p_extra); end $$;
\set QUIET off
\echo '── 050 lanciata SENZA la 047 (test_sessioni) ──'
\i db/migrations/050_squat_test.sql
\set QUIET on
do $$ declare n integer; begin
  select count(*) into n from pg_class where relname = 'squat_test' and relrowsecurity;
  perform v('⭐ senza la 047 la tabella si crea lo stesso, con la RLS', n = 1, n::text);
  select count(*) into n from pg_constraint where conname = 'squat_test_sessione_fk';
  perform v('   e senza aggancio alla sessione (la tabella non c''è)', n = 0, n::text);
end $$;
create table public.test_sessioni (id uuid primary key default gen_random_uuid(), professional_id uuid);
\set QUIET off
\echo '── 047 arrivata: 050 rilanciata due volte ──'
\i db/migrations/050_squat_test.sql
\i db/migrations/050_squat_test.sql
\set QUIET on
do $$ declare n integer; s uuid; begin
  select count(*) into n from pg_constraint where conname = 'squat_test_sessione_fk';
  perform v('⭐ rilanciata dopo la 047 si aggancia alla sessione', n = 1, n::text);
  select count(*) into n from pg_policies where tablename = 'squat_test';
  perform v('quattro policy, anche lanciata tre volte', n = 4, n::text);
  insert into public.test_sessioni (professional_id) values ('11111111-1111-1111-1111-111111111111') returning id into s;
  insert into public.squat_test (professional_id, patient_id, sessione_id, asse, momento, fondo, dettagli)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', s, 'rollio', 'pre', 2.2, '{"coerenza":4}');
  perform v('⭐ uno squat si salva', true);
  delete from public.test_sessioni where id = s;
  select count(*) into n from public.squat_test where sessione_id is null and asse = 'rollio';
  perform v('cancellando la sessione lo squat resta (sessione vuota)', n = 1, n::text);
  begin
    insert into public.squat_test (professional_id, asse) values ('11111111-1111-1111-1111-111111111111', 'diagonale');
    perform v('⛔ l''asse è solo beccheggio o rollio', false);
  exception when check_violation then perform v('⛔ l''asse è solo beccheggio o rollio', true); end;
  begin
    insert into public.squat_test (professional_id, asse, momento) values ('11111111-1111-1111-1111-111111111111', 'rollio', 'durante');
    perform v('⛔ il momento è solo pre o post', false);
  exception when check_violation then perform v('⛔ il momento è solo pre o post', true); end;
  insert into public.squat_test (professional_id, patient_id, asse) values ('22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'beccheggio');
end $$;

grant usage on schema public, auth to authenticated;
grant all on public.patients, public.professionals, public.test_sessioni to authenticated;
grant execute on function auth.uid() to authenticated;
set role authenticated;
select set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
create temp table _c as select (select count(*) from public.squat_test) as viste;
update public.squat_test set nota = 'rubato' where professional_id = '22222222-2222-2222-2222-222222222222';
do $$ begin
  begin
    insert into public.squat_test (professional_id, patient_id, asse) values ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'rollio');
    insert into _c values (-1);
  exception when others then null; end;
end $$;
insert into public.squat_test (professional_id, asse) values ('11111111-1111-1111-1111-111111111111', 'rollio');
reset role;
do $$ declare a integer; c integer; d integer; e integer; begin
  select viste into a from _c where viste >= 0;
  select count(*) into d from _c where viste = -1;
  select count(*) into c from public.squat_test where nota = 'rubato';
  select count(*) into e from public.squat_test where professional_id = '11111111-1111-1111-1111-111111111111' and patient_id is null;
  perform v('⭐ A vede solo i SUOI squat', a = 1, a::text);
  perform v('⛔ A non riscrive gli squat di B', c = 0, c::text);
  perform v('⛔ A non salva uno squat sul paziente di B', d = 0, d::text);
  perform v('⭐ A salva uno squat libero (senza paziente)', e = 1, e::text);
end $$;
do $$ declare n integer; begin
  delete from public.patients where id = '33333333-3333-3333-3333-333333333333';
  select count(*) into n from public.squat_test where patient_id = '33333333-3333-3333-3333-333333333333';
  perform v('cancellando il paziente se ne vanno i suoi squat', n = 0, n::text);
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
