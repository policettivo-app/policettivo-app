-- 034_codice_serve_il_vecchio.sql
-- Chiude un buco trovato da Giuliano il 29 ago 2026, poche ore dopo la 033.
-- Idempotente: si puo' rieseguire senza danni.
--
-- IL BUCO
--   stat_pin_set(nuovo) cambiava o toglieva il codice SENZA chiedere quello
--   attuale. Quindi chi si sedeva all'account gia' loggato poteva
--   semplicemente togliere il codice dal profilo e poi entrare: la tenda
--   c'era, ma la corda per tirarla stava dalla parte sbagliata.
--
-- LA CHIUSURA
--   La funzione a UN argomento viene ELIMINATA (non basta affiancarne una
--   nuova: finche' la vecchia esiste, resta chiamabile e il buco resta
--   aperto). Al suo posto stat_pin_set(nuovo, attuale): se un codice e' gia'
--   impostato, per cambiarlo o toglierlo bisogna sapere quello vecchio.
--
-- SE IL CODICE SI DIMENTICA — questa e' la via di uscita, va conosciuta
--   Supabase -> SQL Editor:
--     update public.professionals set stat_pin_hash = null
--      where user_id = (select id from auth.users where email = 'LA-TUA-MAIL');
--   Poi si rimette un codice nuovo dal profilo. Serve l'accesso a Supabase,
--   che ha solo il titolare: e' una via di uscita, non una scorciatoia.
--
-- COSA RESTA VERO
--   Questo alza il muro, non lo rende invalicabile. Chi possiede credenziali
--   valide puo' sempre leggere i dati aggirando la pagina: l'unico lucchetto
--   vero e' la RLS. La protezione seria resta un account separato per ogni
--   persona (studio.html -> Invita un membro).

-- ─── via la versione insicura ────────────────────────────────────────
drop function if exists public.stat_pin_set(text);

-- ─── nuova versione: serve il codice attuale ─────────────────────────
create or replace function public.stat_pin_set(nuovo text, attuale text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  h      text;
  pulito text;
  n      int;
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;

  select stat_pin_hash into h
    from public.professionals
   where user_id = auth.uid();

  -- Se un codice c'e' gia', per toccarlo bisogna saperlo.
  if h is not null and h <> '' then
    if attuale is null or btrim(attuale) = '' or h <> crypt(attuale, h) then
      raise exception 'Codice attuale sbagliato';
    end if;
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

revoke all on function public.stat_pin_set(text, text) from public, anon;
grant execute on function public.stat_pin_set(text, text) to authenticated;

comment on function public.stat_pin_set(text, text) is
  'Imposta/cambia/toglie il codice riservato. Se un codice esiste gia'', richiede quello attuale.';
