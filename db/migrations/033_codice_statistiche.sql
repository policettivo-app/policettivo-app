-- 033_codice_statistiche.sql
-- Codice riservato sulle Statistiche + funzione per leggere il proprio ruolo.
-- Idempotente: si puo' rieseguire senza danni.
--
-- ⚠️ NUMERAZIONE: esistono due migration numerate 030 (provenienza e note di
-- credito). Il numero non racconta l'ordine reale. La prossima parte da 034.
--
-- COSA FA
--   1) colonna professionals.stat_pin_hash  -> IMPRONTA del codice, mai il codice
--   2) stat_pin_attivo()      -> il codice e' impostato? (per chi chiama)
--   3) stat_pin_set(nuovo)    -> imposta o toglie il proprio codice
--   4) stat_pin_check(pw)     -> il codice e' giusto? (confronto NEL DATABASE)
--   5) mio_ruolo()            -> il ruolo di chi chiama, dal database
--
-- COSA NON FA — da dire chiaro a chi legge
--   Questo NON e' un lucchetto sui dati: e' una tenda davanti a una pagina.
--   Serve contro lo scenario reale (qualcuno si siede al computer dello studio
--   dove il titolare e' gia' loggato). NON protegge da una persona esperta che
--   possiede credenziali valide e sa aggirare la pagina: in un'app che gira nel
--   browser l'unico lucchetto vero e' la RLS. Il fatturato quello ce l'ha gia':
--   fatture.professional_id = auth.uid() DIRETTO.
--   La soluzione vera resta un account separato per ogni persona.
--
-- PERCHE' E' MEGLIO DELLA PASSWORD DI controllo.html
--   Quella sta IN CHIARO nella tabella app_config e il confronto avviene nel
--   browser. Qui: si salva solo l'impronta bcrypt, il codice in chiaro non
--   esiste da nessuna parte, e il confronto lo fa Postgres. Bcrypt e' lento
--   apposta, il che rende scomodo provare codici a raffica.

-- ─── 1) pgcrypto + colonna ───────────────────────────────────────────
create extension if not exists pgcrypto with schema extensions;

alter table public.professionals add column if not exists stat_pin_hash text;

comment on column public.professionals.stat_pin_hash is
  'Impronta bcrypt del codice riservato per statistiche.html. Mai il codice in chiaro.';

-- ─── 2) c''e' un codice impostato? ───────────────────────────────────
create or replace function public.stat_pin_attivo()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce((
    select stat_pin_hash is not null and stat_pin_hash <> ''
    from public.professionals
    where user_id = auth.uid()
  ), false);
$$;

-- ─── 3) imposta / toglie il proprio codice ───────────────────────────
-- Passare NULL o stringa vuota = togliere il codice.
create or replace function public.stat_pin_set(nuovo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  n int;
  pulito text;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;

  pulito := btrim(coalesce(nuovo, ''));

  if pulito = '' then
    update public.professionals set stat_pin_hash = null where user_id = auth.uid();
  else
    if length(pulito) < 5 then
      raise exception 'Il codice deve avere almeno 5 caratteri';
    end if;
    update public.professionals
       set stat_pin_hash = crypt(pulito, gen_salt('bf'))
     where user_id = auth.uid();
  end if;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- ─── 4) verifica del codice, NEL database ────────────────────────────
create or replace function public.stat_pin_check(pw text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce((
    select stat_pin_hash is not null
       and stat_pin_hash <> ''
       and stat_pin_hash = crypt(coalesce(pw, ''), stat_pin_hash)
    from public.professionals
    where user_id = auth.uid()
  ), false);
$$;

-- ─── 5) il mio ruolo, secondo il database ────────────────────────────
create or replace function public.mio_ruolo()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select ruolo from public.professionals where user_id = auth.uid();
$$;

-- ─── permessi ────────────────────────────────────────────────────────
revoke all on function public.stat_pin_attivo()      from public, anon;
revoke all on function public.stat_pin_set(text)     from public, anon;
revoke all on function public.stat_pin_check(text)   from public, anon;
revoke all on function public.mio_ruolo()            from public, anon;

grant execute on function public.stat_pin_attivo()    to authenticated;
grant execute on function public.stat_pin_set(text)   to authenticated;
grant execute on function public.stat_pin_check(text) to authenticated;
grant execute on function public.mio_ruolo()          to authenticated;
