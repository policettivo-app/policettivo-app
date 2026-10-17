-- ═══════════════════════════════════════════════════════════════════════
-- Migration 060 — La scheda di allenamento ARRIVA AL PAZIENTE [scheda-collega-v1]
-- ═══════════════════════════════════════════════════════════════════════
-- COSA AGGIUNGE (piano: claude/PIANO-scheda-allenamento.md, passo 5)
--   • get_scheda_paziente(p_token) → la scheda del paziente, SOLO se il
--     professionista l'ha resa visibile (visibile_paziente = true) e non è
--     archiviata. Altrimenti NULL: il paziente vede l'app come prima.
--     Restituisce le righe in ordine con quello che serve alla pagina:
--     nome, misura, serie, quando, frase; per le immagini e la voce lo slug
--     e la descrizione della libreria; il video (libreria o del paziente).
-- 🔒 Stessa porta delle altre funzioni del paziente: il token (access_token),
--    UUID controllato, token sbagliato = NULL e nessun errore. Il video del
--    paziente si legge solo se è DI QUEL paziente.
--    I campi della libreria si leggono con to_jsonb(...)->>'campo': se una
--    colonna non c'è, il campo arriva vuoto invece di rompere la funzione.
-- ⚠️ TUTTO ADDITIVO: una funzione NUOVA. Nessuna tabella, colonna, funzione
--    o policy esistente viene toccata. Si può rilanciare quante volte si vuole.
-- 🛟 TORNARE INDIETRO, in ordine di forza:
--    1. per un paziente: nell'editor «Nascondi al paziente» → vede l'app di prima;
--    2. per tutti: drop function if exists public.get_scheda_paziente(text);
--       protocollo.html se ne accorge e mostra il protocollo come prima.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.get_scheda_paziente(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token  uuid;
  v_pid    uuid;
  v_s      record;
  v_righe  jsonb;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return null;
  end if;
  begin
    v_token := p_token::uuid;
  exception when others then
    return null;
  end;

  select pat.id into v_pid
    from patients pat
   where pat.access_token = v_token
   limit 1;
  if not found then
    return null;
  end if;

  select s.id, s.ripeti_volte, s.ritmo_sec into v_s
    from scheda_allenamento s
   where s.patient_id = v_pid
     and s.visibile_paziente
     and s.stato <> 'archiviata'
   order by s.aggiornato_il desc
   limit 1;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',              r.id,
           'ordine',          r.ordine,
           'tipo',            r.tipo,
           'nome',            r.nome,
           'misura',          r.misura,
           'secondi',         r.secondi,
           'ripetizioni',     r.ripetizioni,
           'serie',           r.serie,
           'quando',          r.quando,
           'testo',           r.testo,
           'exercise_id',     r.exercise_id,
           'video_id',        case when v.id is not null then r.video_id end,
           'elicoidale_id',   r.elicoidale_id,
           'ex_slug',         to_jsonb(e) ->> 'slug',
           'ex_video_url',    to_jsonb(e) ->> 'video_url',
           'ex_descrizione',  to_jsonb(e) ->> 'descrizione_paziente',
           'vid_url',         to_jsonb(v) ->> 'url',
           'vid_tipo',        to_jsonb(v) ->> 'tipo',
           'vid_descrizione', to_jsonb(v) ->> 'descrizione'
         ) order by r.ordine), '[]'::jsonb)
    into v_righe
    from scheda_allenamento_righe r
    left join exercises e       on e.id = r.exercise_id
    left join exercise_videos v on v.id = r.video_id and v.patient_id = v_pid
   where r.scheda_id = v_s.id;

  return jsonb_build_object(
    'scheda', jsonb_build_object('id', v_s.id, 'ripeti_volte', v_s.ripeti_volte, 'ritmo_sec', v_s.ritmo_sec),
    'righe',  v_righe
  );
end;
$$;

revoke all on function public.get_scheda_paziente(text) from public;
grant execute on function public.get_scheda_paziente(text) to anon, authenticated;

notify pgrst, 'reload schema';

select 'scheda-collega-v1: migration 060 eseguita' as esito;
