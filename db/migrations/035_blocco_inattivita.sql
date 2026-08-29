-- 035_blocco_inattivita.sql
-- Blocco schermo per inattività, con PIN a 4 cifre (29 agosto 2026).
-- Idempotente: si puo' rieseguire senza danni.
--
-- PERCHE'
--   L'app tratta dati sanitari. Il rischio concreto in uno studio non e'
--   l'hacker: e' il computer o il tablet lasciato acceso e sbloccato tra un
--   paziente e l'altro. Un secondo fattore chiesto «ogni tot ore» non copre
--   quel caso e interrompe chi sta lavorando; un blocco per INATTIVITA' copre
--   esattamente quel caso e non interrompe mai chi sta lavorando, perche' chi
--   lavora tocca lo schermo.
--
-- COSA FA
--   1) professionals.sess_pin_hash  -> impronta bcrypt del PIN (mai il PIN)
--   2) professionals.sess_lock_min  -> dopo quanti minuti di inattivita'
--   3) sess_lock_stato()            -> {attivo, minuti} per chi chiama
--   4) sess_pin_set(nuovo, attuale, minuti) -> imposta/cambia/toglie
--   5) sess_pin_check(pw)           -> confronto NEL database
--
-- PIN SEPARATO da quello delle Statistiche, ed e' voluto: questo si digita di
-- corsa piu' volte al giorno (4 cifre), quello protegge il fatturato e si
-- digita una volta al mese (5+ caratteri). Mischiarli avrebbe voluto dire
-- abbassare il secondo al livello del primo.
--
-- COSA NON E'
--   Un velo sullo schermo, non una cassaforte: una persona esperta con una
--   sessione valida puo' aggirarlo. Serve contro chi passa davanti a un
--   computer incustodito, ed e' esattamente il buco piu' probabile in uno
--   studio. La protezione forte resta un account per persona + il logout.
--
-- SE IL PIN SI DIMENTICA
--   Basta uscire e rifare il login: il blocco non impedisce il logout. Oppure
--   Supabase -> SQL Editor:
--     update public.professionals set sess_pin_hash = null
--      where user_id = (select id from auth.users where email = 'LA-TUA-MAIL');

create extension if not exists pgcrypto with schema extensions;

alter table public.professionals add column if not exists sess_pin_hash text;
alter table public.professionals add column if not exists sess_lock_min  integer;

comment on column public.professionals.sess_pin_hash is
  'Impronta bcrypt del PIN a 4 cifre per lo sblocco schermo. Mai il PIN in chiaro.';
comment on column public.professionals.sess_lock_min is
  'Minuti di inattività prima del blocco schermo. NULL = valore predefinito (15).';

-- ─── stato: c''e' un PIN? dopo quanti minuti? ────────────────────────
create or replace function public.sess_lock_stato()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce((
    select jsonb_build_object(
      'attivo', (sess_pin_hash is not null and sess_pin_hash <> ''),
      'minuti', coalesce(sess_lock_min, 15)
    )
    from public.professionals
    where user_id = auth.uid()
  ), jsonb_build_object('attivo', false, 'minuti', 15));
$$;

-- ─── imposta / cambia / toglie ───────────────────────────────────────
-- Come per il codice delle Statistiche: se un PIN c''e' gia', per toccarlo
-- bisogna saperlo. Altrimenti chi trova l''account aperto lo toglie e basta.
create or replace function public.sess_pin_set(nuovo text, attuale text, minuti integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  h      text;
  pulito text;
  m      integer;
  n      int;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;

  select sess_pin_hash into h from public.professionals where user_id = auth.uid();

  if h is not null and h <> '' then
    if attuale is null or btrim(attuale) = '' or h <> crypt(attuale, h) then
      raise exception 'PIN attuale sbagliato';
    end if;
  end if;

  m := coalesce(minuti, 15);
  if m < 1 then m := 1; end if;
  if m > 240 then m := 240; end if;

  pulito := btrim(coalesce(nuovo, ''));

  if pulito = '' then
    update public.professionals
       set sess_pin_hash = null, sess_lock_min = m
     where user_id = auth.uid();
  else
    if pulito !~ '^[0-9]{4}$' then
      raise exception 'Il PIN deve essere di 4 cifre';
    end if;
    update public.professionals
       set sess_pin_hash = crypt(pulito, gen_salt('bf')), sess_lock_min = m
     where user_id = auth.uid();
  end if;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- ─── verifica ────────────────────────────────────────────────────────
create or replace function public.sess_pin_check(pw text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce((
    select sess_pin_hash is not null
       and sess_pin_hash <> ''
       and sess_pin_hash = crypt(coalesce(pw, ''), sess_pin_hash)
    from public.professionals
    where user_id = auth.uid()
  ), false);
$$;

-- ─── permessi ────────────────────────────────────────────────────────
revoke all on function public.sess_lock_stato()                     from public, anon;
revoke all on function public.sess_pin_set(text, text, integer)     from public, anon;
revoke all on function public.sess_pin_check(text)                  from public, anon;

grant execute on function public.sess_lock_stato()                  to authenticated;
grant execute on function public.sess_pin_set(text, text, integer)  to authenticated;
grant execute on function public.sess_pin_check(text)               to authenticated;
