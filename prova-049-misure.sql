-- prova-049-misure.sql — gradi-foto-v1
--   su postgres -c "psql -f prova-049-misure.sql"
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
insert into public.patients (id, professional_id, nome) values
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Bruno');
\set QUIET off
\echo '── 049 lanciata due volte ──'
\i db/migrations/049_foto_misure.sql
\i db/migrations/049_foto_misure.sql
\set QUIET on
create table prova_esiti (n serial, nome text, ok boolean, extra text);
create or replace function v(p_nome text, p_ok boolean, p_extra text default null)
returns void language plpgsql as $$
begin insert into prova_esiti (nome, ok, extra) values (p_nome, coalesce(p_ok,false), p_extra); end $$;

do $$
declare n integer;
begin
  select count(*) into n from pg_class where relname = 'foto_misure' and relrowsecurity;
  perform v('⭐ la tabella c''è, con la RLS accesa', n = 1, n::text);
  select count(*) into n from pg_policies where tablename = 'foto_misure';
  perform v('quattro policy, anche lanciata due volte', n = 4, n::text);
  insert into public.foto_misure (patient_id, storage_path, vista, verso, punti, gradi, larghezza, altezza, origine)
  values ('33333333-3333-3333-3333-333333333333', 'visits/v1/sag.jpg', 'sagittale', 1,
          '{"orecchio":{"x":0.5,"y":0.1}}', '[{"k":"testa","gradi":12.4}]', 600, 900, 'mediapipe');
  perform v('⭐ una misura si salva', true);
  begin
    insert into public.foto_misure (patient_id, storage_path, vista, punti) values ('33333333-3333-3333-3333-333333333333', 'visits/v1/sag.jpg', 'sagittale', '{}');
    perform v('⛔ una foto, una misura: il doppione non entra', false);
  exception when unique_violation then perform v('⛔ una foto, una misura: il doppione non entra', true); end;
  insert into public.foto_misure (patient_id, storage_path, vista, punti) values ('33333333-3333-3333-3333-333333333333', 'visits/v1/sag.jpg', 'sagittale', '{"x":1}')
    on conflict (storage_path) do update set punti = excluded.punti, aggiornato_il = now();
  perform v('⭐ l''upsert su storage_path ri-misura la stessa foto', (select punti->>'x' from public.foto_misure where storage_path = 'visits/v1/sag.jpg') = '1');
  begin
    insert into public.foto_misure (patient_id, storage_path, vista, punti) values ('33333333-3333-3333-3333-333333333333', 'x.jpg', 'podoscopio', '{}');
    perform v('⛔ una vista che non si misura non entra', false);
  exception when check_violation then perform v('⛔ una vista che non si misura non entra', true); end;
  begin
    insert into public.foto_misure (patient_id, storage_path, vista, verso, punti) values ('33333333-3333-3333-3333-333333333333', 'y.jpg', 'sagittale', 2, '{}');
    perform v('⛔ il verso è solo +1 o −1', false);
  exception when check_violation then perform v('⛔ il verso è solo +1 o −1', true); end;
  insert into public.foto_misure (patient_id, storage_path, vista, punti) values ('44444444-4444-4444-4444-444444444444', 'visits/altro/b.jpg', 'frontale', '{}');
end $$;

grant usage on schema public, auth to authenticated;
grant all on public.patients, public.professionals to authenticated;
grant execute on function auth.uid() to authenticated;
set role authenticated;
select set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
create temp table _c as select
  (select count(*) from public.foto_misure) as viste,
  (select count(*) from public.foto_misure where storage_path = 'visits/altro/b.jpg') as altrui;
update public.foto_misure set punti = '{"rubato":1}' where storage_path = 'visits/altro/b.jpg';
select set_config('prova.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
create temp table _c2 as select (select count(*) from public.foto_misure where punti ? 'rubato') as rubate,
  (select count(*) from public.foto_misure) as viste_b;
reset role;
do $$ declare a integer; b integer; c integer; d integer; begin
  select viste, altrui into a, b from _c; select rubate, viste_b into c, d from _c2;
  perform v('⭐ A vede solo le misure dei SUOI pazienti', a = 1 and b = 0, a || '/' || b);
  perform v('⛔ A non può riscrivere le misure dei pazienti di B', c = 0, c::text);
  perform v('   e B vede la sua', d = 1, d::text);
end $$;
do $$ declare n integer; begin
  delete from public.patients where id = '33333333-3333-3333-3333-333333333333';
  select count(*) into n from public.foto_misure where patient_id = '33333333-3333-3333-3333-333333333333';
  perform v('cancellando il paziente se ne vanno le sue misure', n = 0, n::text);
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
