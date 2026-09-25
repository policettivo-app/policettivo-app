-- prova-052-tv.sql — tv-codice-v1
--   su postgres -c "psql -f prova-052-tv.sql"
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
create table public.professionals (id uuid primary key default gen_random_uuid(), user_id uuid, live_canale uuid, live_canale_at timestamptz, schermo_canale uuid);
create table public.patients (id uuid primary key default gen_random_uuid(), professional_id uuid references public.professionals(id) on delete cascade, nome text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('prova.uid', true), '')::uuid $$;
insert into public.professionals (id, user_id, live_canale, live_canale_at) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999', now()),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, null);
insert into public.patients (id, professional_id, nome) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Mario'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Bruno');
-- RLS dei pazienti come nel vero: ognuno vede i suoi
alter table public.patients enable row level security;
create policy p on public.patients for select using (professional_id in (select id from public.professionals where user_id = auth.uid()));
create table prova_esiti (n serial, nome text, ok boolean, extra text);
create or replace function v(p_nome text, p_ok boolean, p_extra text default null)
returns void language plpgsql as $$ begin insert into prova_esiti (nome, ok, extra) values (p_nome, coalesce(p_ok,false), p_extra); end $$;
\set QUIET off
\echo '── 052 lanciata due volte ──'
\i db/migrations/052_tv_codice.sql
\i db/migrations/052_tv_codice.sql
\set QUIET on
grant usage on schema public, auth to anon, authenticated;
grant select on public.patients, public.professionals to authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant all on prova_esiti to anon, authenticated; grant usage on sequence prova_esiti_n_seq to anon, authenticated;
grant execute on function v(text, boolean, text) to anon, authenticated;
create table public._x (k text primary key, t text); grant all on public._x to anon, authenticated;
\set S1 '''segreto-della-tv-numero-uno-lungo-almeno-trentadue'''
\set S2 '''segreto-della-tv-numero-due-lungo-almeno-trentadue!'''
-- ── la TV (anon) chiede un codice
set role anon;
insert into public._x values ('cod1', public.tv_nuovo(:S1));
insert into public._x values ('corto', public.tv_nuovo('corto'));
insert into public._x values ('st0', public.tv_stato(:S1)::text);
do $$ begin
  begin perform 1 from public.tv_dispositivi; insert into public._x values ('anon_legge', 'si');
  exception when others then insert into public._x values ('anon_legge', 'no'); end;
  begin perform public.tv_conferma('ABCDEF'); insert into public._x values ('anon_conferma', 'si');
  exception when others then insert into public._x values ('anon_conferma', 'no'); end;
end $$;
reset role;
do $$ declare c text; begin
  select t into c from public._x where k = 'cod1';
  perform v('⭐ la TV riceve un codice di 6 lettere', c ~ '^[A-Z2-9]{6}$', c);
  perform v('⛔ senza lettere confondibili (0 O 1 I L)', c !~ '[01OIL]', c);
  perform v('⛔ un segreto corto non vale', (select t from public._x where k = 'corto') is null);
  perform v('⭐ prima della conferma la TV non è collegata', (select t from public._x where k = 'st0')::jsonb->>'collegata' = 'false');
  perform v('⛔ senza account non si leggono le TV', (select t from public._x where k = 'anon_legge') = 'no');
  perform v('⛔ senza account non si conferma un codice', (select t from public._x where k = 'anon_conferma') = 'no');
  perform v('⛔ il segreto non è salvato in chiaro', not exists (select 1 from public.tv_dispositivi where segreto_hash like '%segreto%'));
end $$;
-- ── il telefono di A conferma
set role authenticated;
select set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
insert into public._x values ('sbagliato', public.tv_conferma('ZZZZZZ')::text);
insert into public._x select 'conf', public.tv_conferma(lower((select t from public._x where k = 'cod1')))::text;
insert into public._x select 'conf2', public.tv_conferma((select t from public._x where k = 'cod1'))::text;
insert into public._x select 'elenco', count(*)::text from public.tv_elenco();
-- A mostra il SUO paziente; poi prova con quello di B
insert into public.tv_mostra (professional_id, patient_id, pacchetto) values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '{"pid":"33333333","nome":"Mario"}');
do $$ begin
  begin update public.tv_mostra set patient_id = '44444444-4444-4444-4444-444444444444' where professional_id = '11111111-1111-1111-1111-111111111111';
    insert into public._x values ('altrui', 'si'); exception when others then insert into public._x values ('altrui', 'no'); end;
  begin insert into public.tv_mostra (professional_id, patient_id) values ('22222222-2222-2222-2222-222222222222', null);
    insert into public._x values ('riga_b', 'si'); exception when others then insert into public._x values ('riga_b', 'no'); end;
end $$;
-- B non vede né scollega le TV di A (l'id gliel'abbiamo dato noi: non lo potrebbe sapere)
reset role;
insert into public._x select 'id_a', id::text from public.tv_dispositivi where professional_id is not null limit 1;
set role authenticated;
select set_config('prova.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
insert into public._x select 'elenco_b', count(*)::text from public.tv_elenco();
insert into public._x select 'scollega_b', public.tv_scollega((select t from public._x where k = 'id_a')::uuid)::text;
reset role;
-- ── la TV adesso
set role anon;
insert into public._x values ('st1', public.tv_stato(:S1)::text);
insert into public._x values ('pk1', public.tv_pacchetto(:S1)::text);
insert into public._x values ('pk_altro', coalesce(public.tv_pacchetto(:S2)::text, 'NULL'));
reset role;
do $$ declare s jsonb; begin
  perform v('⛔ un codice sbagliato non collega niente', (select t from public._x where k = 'sbagliato') = 'false');
  perform v('⭐ il codice giusto (anche scritto in minuscolo) collega la TV', (select t from public._x where k = 'conf') = 'true');
  perform v('⛔ lo stesso codice non si usa due volte', (select t from public._x where k = 'conf2') = 'false');
  perform v('⭐ il telefono vede la sua TV nell''elenco', (select t from public._x where k = 'elenco') = '1');
  s := (select t from public._x where k = 'st1')::jsonb;
  perform v('⭐⭐ la TV è collegata e ha i suoi canali (schermo + test)', s->>'collegata' = 'true' and s->>'schermo' is not null and s->>'oscillazione' = '99999999-9999-9999-9999-999999999999', s::text);
  perform v('⭐⭐ la TV legge il pacchetto del paziente mostrato', (select t from public._x where k = 'pk1')::jsonb->>'nome' = 'Mario');
  perform v('⛔ un''altra TV (non collegata) non legge niente', (select t from public._x where k = 'pk_altro') = 'NULL');
  perform v('⛔ A non può mettere sulla TV un paziente di B', (select t from public._x where k = 'altrui') = 'no'
    and (select patient_id from public.tv_mostra where professional_id = '11111111-1111-1111-1111-111111111111') = '33333333-3333-3333-3333-333333333333');
  perform v('⛔ A non scrive la riga di B', (select t from public._x where k = 'riga_b') = 'no');
  perform v('⛔ B non vede le TV di A', (select t from public._x where k = 'elenco_b') = '0');
  perform v('⛔ B non scollega le TV di A', (select t from public._x where k = 'scollega_b') = 'false' and exists (select 1 from public.tv_dispositivi where professional_id is not null));
end $$;
-- ── dopo 3 ore il pacchetto non si legge più; A scollega → la TV perde tutto
update public.tv_mostra set aggiornato_il = now() - interval '4 hours';
set role anon;
insert into public._x values ('pk_vecchio', coalesce(public.tv_pacchetto(:S1)::text, 'NULL'));
reset role;
update public.tv_mostra set aggiornato_il = now();
set role authenticated;
select set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);
insert into public._x select 'scollega', public.tv_scollega((select id from public.tv_elenco() limit 1))::text;
reset role;
set role anon;
insert into public._x values ('st2', public.tv_stato(:S1)::text);
insert into public._x values ('pk2', coalesce(public.tv_pacchetto(:S1)::text, 'NULL'));
reset role;
do $$ begin
  perform v('⭐ mostrato più di 3 ore fa: la TV non lo legge più', (select t from public._x where k = 'pk_vecchio') = 'NULL');
  perform v('⭐ «Scollega» dal telefono', (select t from public._x where k = 'scollega') = 'true');
  perform v('⭐⭐ e la TV perde subito il permesso: niente canali, niente pacchetto', (select t from public._x where k = 'st2')::jsonb->>'collegata' = 'false'
    and (select t from public._x where k = 'pk2') = 'NULL');
end $$;
\set QUIET off
\echo ''
select case when ok then '  ✅ ' else '  ❌ ' end || nome || case when ok or extra is null then '' else '  → ' || extra end as esito from prova_esiti order by n;
select case when count(*) filter (where not ok) = 0 then 'TUTTO VERDE — ' || count(*) || ' controlli passati.'
  else 'ROSSO — ' || count(*) filter (where ok) || ' passati, ' || count(*) filter (where not ok) || ' falliti.' end as riepilogo from prova_esiti;
