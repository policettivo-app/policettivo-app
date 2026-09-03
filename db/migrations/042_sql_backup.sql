-- ═══════════════════════════════════════════════════════════════════════
-- Migration 042 — sql_backup: il PRIMA delle funzioni, prima di cambiarle
-- [sicurezza-ritorno-v1]
-- ═══════════════════════════════════════════════════════════════════════
--
-- PERCHE' ESISTE
--   Per il codice si torna indietro sempre: c'e' il tag pre-<blocco> in git
--   e l'Instant Rollback di Vercel. Per il DATABASE non c'era niente.
--   Un `DROP FUNCTION` + `CREATE FUNCTION` cancella il testo di prima e non
--   lo scrive da nessuna parte: se la versione nuova e' sbagliata, quella
--   vecchia non esiste piu' e va riscritta a mano.
--   Il 3 settembre e' andata bene per caso: la funzione stava anche nel
--   repo. Ma `get_professional_contact` NON sta in nessun .sql del repo, e
--   se un giorno qualcuno la ricrea sbagliata, quella di prima e' persa.
--
-- COSA FA
--   Una riga per ogni volta che una funzione sta per cambiare, con dentro
--   il suo testo esatto di quel momento. Tornare indietro = rileggere la
--   riga e rilanciarla.
--
-- ⚠️ QUI NON ENTRANO DATI DI PAZIENTI. Solo definizioni di funzioni.
--    RLS accesa e NESSUNA policy: non la legge nessuno attraverso l'API,
--    ne' anon ne' un professionista. Si guarda solo dal SQL Editor.
--
-- Idempotente: si puo' rilanciare quante volte si vuole.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.sql_backup (
  id          bigserial primary key,
  oggetto     text        not null,
  definizione text        not null,
  blocco      text,
  salvato_il  timestamptz not null default now()
);

comment on table public.sql_backup is
  'Il testo delle funzioni PRIMA di cambiarle. Serve a tornare indietro. '
  'Nessun dato di paziente qui dentro. Vedi METODO-lavoro.md.';
comment on column public.sql_backup.definizione is
  'Output di pg_get_functiondef() al momento del salvataggio: si rilancia '
  'cosi'' com''e'' per ripristinare la versione precedente.';

create index if not exists sql_backup_oggetto_data
  on public.sql_backup (oggetto, salvato_il desc);

alter table public.sql_backup enable row level security;

-- Nessuna policy, di proposito: RLS accesa senza policy = nessuno legge
-- e nessuno scrive attraverso PostgREST. Il service_role e il SQL Editor
-- passano lo stesso, ed e' esattamente quello che serve.
revoke all on public.sql_backup from anon, authenticated;

-- ── LA FUNZIONE CHE SALVA ──────────────────────────────────────────────
-- Si chiama PRIMA di ogni CREATE/REPLACE. Se la funzione non esiste
-- ancora (prima volta) non salva niente e non fallisce: e' giusto cosi',
-- non c'e' nessun «prima» da conservare.
create or replace function public.salva_prima(p_nome text, p_blocco text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_nome
   limit 1;

  if v_def is null then
    return 'niente da salvare: ' || p_nome || ' non esiste ancora';
  end if;

  insert into public.sql_backup (oggetto, definizione, blocco)
  values (p_nome, v_def, p_blocco);

  return 'salvato il PRIMA di ' || p_nome || ' (' || length(v_def) || ' caratteri)';
end;
$$;

revoke all on function public.salva_prima(text, text) from public, anon, authenticated;

-- ── CONTROLLO FINALE ───────────────────────────────────────────────────
select 'tabella sql_backup',
       case when to_regclass('public.sql_backup') is not null then 'OK' else 'MANCA' end
union all
select 'RLS accesa (e nessuna policy: giusto cosi)',
       case when coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.sql_backup')), false)
            then 'OK' else 'MANCA' end
union all
select 'policy su sql_backup (devono essere 0): ' ||
       (select count(*)::text from pg_policy where polrelid = to_regclass('public.sql_backup')),
       case when (select count(*) from pg_policy where polrelid = to_regclass('public.sql_backup')) = 0
            then 'OK' else 'GUARDA' end
union all
select 'funzione salva_prima',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname='public' and p.proname='salva_prima')
            then 'OK' else 'MANCA' end
order by 1;
