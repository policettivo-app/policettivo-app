-- 032_statistiche_master.sql
-- Blocco STATISTICHE / cruscotto direzionale (agosto 2026)
-- Idempotente: si puo' rieseguire senza danni.
--
-- ATTENZIONE alla numerazione: esistono DUE migration numerate 030
-- (030_provenienza_paziente.sql e 030_note_credito.sql), entrambe gia'
-- eseguite. Il numero non racconta l'ordine reale: non fidarsi.
--
-- Cosa fa: UNA funzione, nient'altro. Non tocca nessuna tabella, nessuna
-- policy, nessun dato. Il rischio e' zero.
--
--   is_master() -> true se CHI STA CHIAMANDO ha ruolo 'master'.
--
-- Serve perche' la pagina statistiche.html contiene il fatturato dello studio
-- e va riservata al titolare. La risposta arriva dal DATABASE, non da un
-- campo che vive nel browser.
--
-- Nota onesta su cosa questa funzione NON fa: non e' un lucchetto sui dati.
-- Il lucchetto vero sul fatturato esiste gia' ed e' la RLS della tabella
-- fatture (professional_id = auth.uid() DIRETTO): chi non e' il titolare non
-- vede quelle righe nemmeno interrogando il database a mano. Sedute e
-- pagamenti, invece, la segreteria li vede gia' oggi dentro Contabile: la
-- pagina statistiche non apre nessuna porta nuova, li mette solo in fila.

create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.professionals
    where user_id = auth.uid() and ruolo = 'master'
  );
$$;

revoke all on function public.is_master() from public;
revoke all on function public.is_master() from anon;
grant execute on function public.is_master() to authenticated;

comment on function public.is_master() is
  'true se l''utente autenticato ha ruolo master. Usata dal gate di statistiche.html.';
