-- ═══════════════════════════════════════════════════════════════════════
-- Migration 051 — Lo schermo TV col telecomando [tv-v1]
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE
--   `professionals.schermo_canale` — il nome segreto del canale su cui il
--   telefono (telecomando) dice alla TV cosa mostrare.
--   `schermo_canale()` — lo restituisce, e lo crea la prima volta.
--
-- PERCHE' UN CANALE A PARTE (e non quello della diretta dell'Oscillazione)
--   Quello della diretta si può dare a un ospite con un codice (046): va bene,
--   ci passano solo angoli. Sul canale della TV passano i comandi di «Prima e
--   dopo» (quale paziente, quale giorno): lo conosce SOLO chi entra col tuo
--   account. Le foto non ci passano mai: la TV le legge dal database, con le
--   regole di sempre (RLS).
--
-- ⚠️ TUTTO ADDITIVO. Una colonna nuova e una funzione. Non tocca niente di
--    esistente. Si può rilanciare quante volte si vuole.
--
-- Ritorno indietro:
--   drop function if exists public.schermo_canale();
--   alter table public.professionals drop column if exists schermo_canale;
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  perform public.salva_prima('schermo_canale', 'tv-v1');
exception
  when undefined_function then
    raise notice 'salva_prima non esiste (042 non lanciata): niente da salvare, e'' tutto nuovo';
end
$$;

alter table public.professionals add column if not exists schermo_canale uuid;

create or replace function public.schermo_canale()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof uuid;
  v_can  uuid;
begin
  select pr.id, pr.schermo_canale into v_prof, v_can
    from public.professionals pr where pr.user_id = auth.uid() limit 1;
  if v_prof is null then return null; end if;
  if v_can is null then
    v_can := gen_random_uuid();
    update public.professionals set schermo_canale = v_can where id = v_prof;
  end if;
  return v_can;
end;
$$;

revoke all on function public.schermo_canale() from public;
grant execute on function public.schermo_canale() to authenticated;
