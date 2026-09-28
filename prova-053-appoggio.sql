-- prova-053-appoggio.sql — monopodalico-v1
--   su postgres -c "psql -f prova-053-appoggio.sql"
\set ON_ERROR_STOP off
\set QUIET on
drop schema if exists public cascade;
create schema public;
create extension if not exists pgcrypto;
create table public.oscillazione_test (id uuid primary key default gen_random_uuid(), evento text not null,
  occhi text, momento text, velocita numeric);
insert into public.oscillazione_test (evento, occhi, velocita) values ('beccheggio', 'aperti', 1.2), ('rollio', 'chiusi', 2.0);
create table prova_esiti (n serial, nome text, ok boolean, extra text);
create or replace function v(p_nome text, p_ok boolean, p_extra text default null)
returns void language plpgsql as $$
begin insert into prova_esiti (nome, ok, extra) values (p_nome, coalesce(p_ok,false), p_extra); end $$;
\set QUIET off
\echo '── 053 lanciata due volte (senza la 042: niente salva_prima) ──'
\i db/migrations/053_oscillazione_appoggio.sql
\i db/migrations/053_oscillazione_appoggio.sql
\set QUIET on
do $$ declare n integer; begin
  select count(*) into n from information_schema.columns where table_name = 'oscillazione_test' and column_name = 'appoggio';
  perform v('⭐ c''è la colonna appoggio', n = 1, n::text);
  select count(*) into n from pg_constraint where conname = 'oscillazione_test_appoggio_check';
  perform v('⭐ rilanciata due volte: un vincolo solo', n = 1, n::text);
  select count(*) into n from public.oscillazione_test where appoggio is null;
  perform v('⭐ le prove di prima restano su due piedi (vuoto)', n = 2, n::text);
  select count(*) into n from public.oscillazione_test;
  perform v('⭐ non tocca le righe esistenti', n = 2, n::text);
end $$;
do $$ begin
  insert into public.oscillazione_test (evento, appoggio) values ('beccheggio', 'dx'), ('beccheggio', 'sx');
  perform v('⭐ accetta dx e sx', true);
exception when others then perform v('⭐ accetta dx e sx', false, sqlerrm); end $$;
do $$ begin
  insert into public.oscillazione_test (evento, appoggio) values ('beccheggio', 'destro');
  perform v('⛔ rifiuta un valore diverso da dx/sx', false);
exception when check_violation then perform v('⛔ rifiuta un valore diverso da dx/sx', true); end $$;
\echo '── ritorno indietro ──'
alter table public.oscillazione_test drop column if exists appoggio;
do $$ declare n integer; begin
  select count(*) into n from information_schema.columns where table_name = 'oscillazione_test' and column_name = 'appoggio';
  perform v('⭐ il ritorno indietro toglie la colonna', n = 0, n::text);
  select count(*) into n from public.oscillazione_test;
  perform v('⭐ e le prove restano tutte', n = 4, n::text);
end $$;
\echo '════════════════════════════════════════'
select (case when ok then '  ✅ ' else '  ❌ ' end) || nome || coalesce('  → ' || extra, '') as esito from prova_esiti order by n;
select case when bool_and(ok) then 'TUTTO VERDE — ' || count(*) || ' controlli' else 'ROSSO — ' || count(*) filter (where not ok) || ' falliti' end from prova_esiti;
