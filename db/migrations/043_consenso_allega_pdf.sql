-- ═══════════════════════════════════════════════════════════════════════
-- Migration 043 — consenso_allega_pdf: il PDF si allega DOPO [firma-prima-v1]
-- ═══════════════════════════════════════════════════════════════════════
--
-- PERCHE' ESISTE
--   Il 3 settembre 2026 una firma vera di un paziente vero e' andata persa.
--   L'ordine era: PDF -> upload -> riga in `consensi`. Se il PDF non partiva,
--   il flusso si fermava PRIMA della riga: il paziente aveva firmato e in
--   cartella non restava niente.
--   Il dato che vale e' la firma con data, versione, paziente e
--   professionista. Il PDF e' una STAMPA di quel dato, non il dato.
--   Da qui in poi l'ordine e': firma -> riga (pdf a null) -> PDF -> upload ->
--   questa funzione, che allega il PDF alla riga gia' scritta.
--
-- PERCHE' UNA FUNZIONE E NON UNA POLICY DI UPDATE
--   Misurato il 3 settembre: su `consensi` esistono solo policy INSERT e
--   SELECT. La tabella e' append-only, e VA TENUTA COSI': un consenso
--   registrato non dev'essere alterabile. Una policy di UPDATE generica
--   aprirebbe la modifica di qualunque campo, compresa la firma.
--   Questa funzione invece tocca due soli campi, e solo se sono ancora NULL:
--   si allega UNA VOLTA SOLA e non si riscrive mai. Chi non ha raccolto la
--   firma non tocca niente (professional_id = auth.uid(), come le policy).
--
-- Idempotente: si puo' rilanciare quante volte si vuole.
-- Ritorno indietro:  drop function if exists public.consenso_allega_pdf(uuid, text, text);
--                    (e la riga del consenso resta com'e': non si perde niente)
-- ═══════════════════════════════════════════════════════════════════════

-- Il «prima», come da REGOLE-non-si-rompe-niente.md. La funzione e' nuova,
-- quindi non c'e' niente da salvare: il DO serve solo a non far fallire
-- tutta la migration se la 042 (salva_prima) non e' stata lanciata.
do $$
begin
  perform public.salva_prima('consenso_allega_pdf', 'firma-prima-v1');
exception
  when undefined_function then
    raise notice 'salva_prima non esiste (migration 042 non lanciata): niente da salvare, la funzione e'' nuova';
end
$$;

create or replace function public.consenso_allega_pdf(
  p_consenso_id uuid,
  p_path        text,
  p_hash        text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_righe int;
begin
  if p_consenso_id is null then return false; end if;
  if p_path is null or length(trim(p_path)) = 0 then return false; end if;

  update public.consensi
     set pdf_storage_path = p_path,
         pdf_hash         = p_hash
   where id                = p_consenso_id
     and professional_id   = auth.uid()   -- solo chi ha raccolto la firma
     and pdf_storage_path is null;        -- una volta sola: mai riscrivere

  get diagnostics v_righe = row_count;
  return v_righe = 1;
end;
$function$;

comment on function public.consenso_allega_pdf(uuid, text, text) is
  'Allega il PDF a un consenso gia'' firmato. Riempie pdf_storage_path e '
  'pdf_hash SOLO se sono ancora NULL e solo per chi ha raccolto la firma: '
  '`consensi` resta append-only. Torna true se ha allegato, false se non '
  'c''era niente da allegare. Vedi STATO-firma-consenso.md.';

revoke all     on function public.consenso_allega_pdf(uuid, text, text) from public, anon;
grant  execute on function public.consenso_allega_pdf(uuid, text, text) to authenticated;
