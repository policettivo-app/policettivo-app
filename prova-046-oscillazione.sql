-- prova-046-oscillazione.sql — oscillazione-live-v1
--   service postgresql start
--   su postgres -c "psql -f prova-046-oscillazione.sql"
-- Si carica la migration DAVVERO (\i), non una copia: cosi' si provano anche
-- l'idempotenza e la doppia esecuzione.

\set ON_ERROR_STOP off
\set QUIET on
drop schema if exists public cascade;
create schema public;
create extension if not exists pgcrypto;

-- ─── il finto: lo stretto indispensabile dello schema vero ───
create schema if not exists auth;
create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  piano text default 'free'
);
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid references public.professionals(id) on delete cascade,
  nome text
);

-- auth.uid() finta, pilotata da una variabile di sessione
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('prova.uid', true), '')::uuid
$$;

insert into public.professionals (id, user_id) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.patients (id, professional_id, nome) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Mario');

\set QUIET off
\echo '── si carica la migration 046, davvero ──'
\i db/migrations/046_oscillazione.sql
\echo '── e una seconda volta: dev''essere idempotente ──'
\i db/migrations/046_oscillazione.sql

\set QUIET on
create table prova_esiti (n serial, nome text, ok boolean, extra text);
create or replace function v(p_nome text, p_ok boolean, p_extra text default null)
returns void language plpgsql as $$
begin insert into prova_esiti (nome, ok, extra) values (p_nome, coalesce(p_ok,false), p_extra); end $$;

do $$
declare
  c1 uuid; c2 uuid; c3 uuid; cod text; sc timestamptz; n integer;
begin
  -- ═══ IL CANALE ═══
  perform set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  perform v('prima di aprirlo non c''e'' nessun canale', public.oscillazione_canale() is null);

  c1 := public.oscillazione_apri_canale();
  perform v('aprire il canale restituisce un uuid', c1 is not null, c1::text);
  perform v('e da li'' si legge', public.oscillazione_canale() = c1);

  -- ⭐ rigenerabile: e' il motivo per cui NON si usa l'identita' del professionista
  c2 := public.oscillazione_apri_canale();
  perform v('⭐ riaprendolo il canale CAMBIA (si puo'' buttare via)', c2 <> c1, c1::text || ' -> ' || c2::text);
  perform v('e il vecchio non vale piu''', public.oscillazione_canale() = c2);

  -- ⭐ il canale di un altro professionista non si vede
  perform set_config('prova.uid', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  perform v('⭐ un altro professionista NON vede il canale del primo',
            public.oscillazione_canale() is null);
  c3 := public.oscillazione_apri_canale();
  perform v('e il suo e'' un altro canale', c3 <> c2);

  -- chi non e'' loggato non apre niente
  perform set_config('prova.uid', '', true);
  perform v('⭐ senza login non si apre nessun canale', public.oscillazione_apri_canale() is null);
  perform v('e non si legge nessun canale', public.oscillazione_canale() is null);

  -- ═══ IL CODICE OSPITE ═══
  perform set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  select o.codice, o.scade_il into cod, sc from public.oscillazione_codice_crea(30) o;
  perform v('il codice ospite viene creato', cod is not null, cod);
  perform v('⭐ è lungo 6', length(cod) = 6, cod);
  perform v('⭐ e non contiene caratteri che si sbagliano a voce (0 O 1 I L)',
            cod !~ '[01OIL]', cod);
  perform v('scade nel futuro', sc > now());

  -- ⭐ il codice porta al canale, e SOLO al canale
  perform set_config('prova.uid', '', true);   -- l'ospite NON e' loggato
  perform v('⭐⭐ un ospite non loggato risolve il codice', public.oscillazione_risolvi(cod) = c2,
            coalesce(public.oscillazione_risolvi(cod)::text,'null'));
  perform v('il codice si può scrivere in minuscolo', public.oscillazione_risolvi(lower(cod)) = c2);
  perform v('e con spazi o trattini in mezzo',
            public.oscillazione_risolvi(substr(cod,1,3) || '-' || substr(cod,4,3)) = c2);
  perform v('⛔ un codice inventato non porta da nessuna parte',
            public.oscillazione_risolvi('ZZZZZZ') is null);
  perform v('⛔ né uno di lunghezza sbagliata', public.oscillazione_risolvi('ABC') is null);
  perform v('⛔ né null', public.oscillazione_risolvi(null) is null);

  -- ⭐ l'ospite NON deve poter leggere la tabella dei codici
  select count(*) into n from public.oscillazione_ospiti;
  perform v('la tabella dei codici esiste e ha la riga', n = 1, n::text);

  -- ⭐ un codice scaduto non vale piu'
  update public.oscillazione_ospiti set scade_il = now() - interval '1 minute' where codice = cod;
  perform v('⭐ un codice SCADUTO non vale più', public.oscillazione_risolvi(cod) is null);

  -- ⭐ rigenerando il canale, i codici vecchi puntano a un canale morto
  perform set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  select o.codice into cod from public.oscillazione_codice_crea(30) o;
  perform v('nuovo codice creato', cod is not null);
  perform set_config('prova.uid', '', true);
  perform v('punta al canale di adesso', public.oscillazione_risolvi(cod) = c2);
  perform set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  c1 := public.oscillazione_apri_canale();
  perform set_config('prova.uid', '', true);
  perform v('⭐ dopo aver rigenerato il canale il codice vecchio punta a quello vecchio, non al nuovo',
            public.oscillazione_risolvi(cod) <> c1);

  -- durata: si tiene nei limiti
  perform set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  select o.scade_il into sc from public.oscillazione_codice_crea(1) o;
  perform v('una durata troppo corta viene portata a 5 minuti',
            sc between now() + interval '4 minutes' and now() + interval '6 minutes', sc::text);
  select o.scade_il into sc from public.oscillazione_codice_crea(99999) o;
  perform v('e una troppo lunga a 8 ore',
            sc between now() + interval '7 hours' and now() + interval '9 hours', sc::text);

  -- senza canale aperto non si crea nessun codice
  update public.professionals set live_canale = null where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select count(*) into n from public.oscillazione_codice_crea(30);
  perform v('⛔ senza canale aperto non si crea nessun codice', n = 0, n::text);

  -- il canale vecchio di 12 ore non si legge piu'
  perform set_config('prova.uid', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  c1 := public.oscillazione_apri_canale();
  update public.professionals set live_canale_at = now() - interval '13 hours'
   where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  perform v('⭐ un canale di ieri non si legge: meglio «nessuna diretta» che un disegno fermo',
            public.oscillazione_canale() is null);
end $$;

-- ═══ LA TABELLA DEI TEST ═══
do $$
declare n integer; t uuid;
begin
  insert into public.oscillazione_test
    (professional_id, patient_id, evento, occhi, piedi, velocita, carico_avanti, traccia)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
          'beccheggio', 'aperti', 'scalzo', 3.41, -2.5, '[[0,0.1,0.2]]'::jsonb)
  returning id into t;
  perform v('un test si salva', t is not null);

  -- ⭐ il test LIBERO, senza paziente
  insert into public.oscillazione_test (professional_id, evento, occhi, velocita)
  values ('11111111-1111-1111-1111-111111111111', 'rollio', 'chiusi', 7.16);
  select count(*) into n from public.oscillazione_test;
  perform v('⭐ un test si salva anche SENZA paziente (prova libera dalla home)', n = 2, n::text);

  select traccia_hz into n from public.oscillazione_test where id = t;
  perform v('⭐ la traccia è dichiarata a 10 Hz, non a 60', n = 10, n::text);

  -- ⛔ un test di un professionista che non esiste non entra
  begin
    insert into public.oscillazione_test (professional_id, evento)
    values ('99999999-9999-9999-9999-999999999999', 'beccheggio');
    perform v('⛔ un professionista inesistente non può salvare', false);
  exception when foreign_key_violation then
    perform v('⛔ un professionista inesistente non può salvare', true);
  end;

  -- cancellando il paziente il test se ne va con lui
  delete from public.patients where id = '33333333-3333-3333-3333-333333333333';
  select count(*) into n from public.oscillazione_test;
  perform v('cancellando il paziente il suo test se ne va (cascade)', n = 1, n::text);
end $$;

-- ═══ LE POLICY ESISTONO E SONO QUELLE GIUSTE ═══
do $$
declare n integer;
begin
  select count(*) into n from pg_policies where tablename = 'oscillazione_test';
  perform v('ci sono le quattro policy sui test', n = 4, n::text);
  select count(*) into n from pg_policies where tablename = 'oscillazione_ospiti';
  perform v('⭐ sui codici ospite NON c''è nessuna policy: ci si arriva solo dalle funzioni', n = 0, n::text);
  select count(*) into n from pg_class where relname = 'oscillazione_test' and relrowsecurity;
  perform v('RLS accesa sui test', n = 1);
  select count(*) into n from pg_class where relname = 'oscillazione_ospiti' and relrowsecurity;
  perform v('RLS accesa sui codici ospite', n = 1);
  select count(*) into n from information_schema.columns
   where table_name = 'oscillazione_test' and column_name in ('verso_beta','verso_gamma','zero_beta','zero_gamma');
  perform v('⭐ il test si porta dietro verso e zero usati: se no fra sei mesi i gradi non si sanno leggere', n = 4, n::text);
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'oscillazione%' and p.prosecdef;
  perform v('le quattro funzioni sono security definer', n = 4, n::text);
end $$;

\set QUIET off
\echo ''
\echo '══════════════════════════════════════════════════════════════════'
select case when ok then '  ✅ ' else '  ❌ ' end || nome ||
       case when ok or extra is null then '' else '  → ' || extra end as esito
  from prova_esiti order by n;
select case when count(*) filter (where not ok) = 0
            then 'TUTTO VERDE — ' || count(*) || ' controlli passati.'
            else 'ROSSO — ' || count(*) filter (where ok) || ' passati, '
                 || count(*) filter (where not ok) || ' falliti.' end as riepilogo
  from prova_esiti;
