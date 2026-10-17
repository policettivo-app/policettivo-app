select public.salva_prima('get_scheda_paziente', 'scheda-npl-v1');
-- ═══════════════════════════════════════════════════════════════════════
-- Migration 061 — NPL / GPL nella scheda di allenamento [scheda-npl-v1]
-- ═══════════════════════════════════════════════════════════════════════
-- PERCHE': il protocollo ha la configurazione (configurazione_generale e
--   una per esercizio); la scheda della 059 no. Barchetta e Schema 6 la
--   richiamano nelle infografiche: il paziente deve sapere quale cuscino.
-- COSA AGGIUNGE
--   • scheda_allenamento.configurazione        → 'NPL' | 'GPL' | vuoto
--   • scheda_allenamento_righe.configurazione  → 'NPL' | 'GPL' | vuoto
--     (vuoto = quella della scheda; come in protocollo: riga → scheda)
--   • get_scheda_paziente: restituisce anche la configurazione della scheda
--     e, per ogni riga, quella che vale (riga, altrimenti scheda).
-- ⚠️ TUTTO ADDITIVO: due colonne nuove che possono restare vuote, nessun
--    dato toccato. La funzione è la stessa della 060 con due campi in più.
--    Si può rilanciare quante volte si vuole.
-- 🛟 TORNARE INDIETRO: la prima riga ha salvato la 060 in sql_backup;
--    le colonne vuote non disturbano nessuna pagina.
--    select definizione from public.sql_backup
--     where oggetto = 'get_scheda_paziente' and blocco = 'scheda-npl-v1'
--     order by salvato_il asc limit 1;   → la 060; si rilancia così com'è.
--    (asc: se la 061 è stata lanciata due volte, la seconda riga è già la 061)
-- ═══════════════════════════════════════════════════════════════════════

alter table public.scheda_allenamento       add column if not exists configurazione text;
alter table public.scheda_allenamento_righe add column if not exists configurazione text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'scheda_configurazione_ok') then
    alter table public.scheda_allenamento add constraint scheda_configurazione_ok
      check (configurazione is null or configurazione in ('NPL','GPL'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'riga_configurazione_ok') then
    alter table public.scheda_allenamento_righe add constraint riga_configurazione_ok
      check (configurazione is null or configurazione in ('NPL','GPL'));
  end if;
end $$;

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

  select s.id, s.ripeti_volte, s.ritmo_sec, s.configurazione into v_s
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
           'configurazione',  case when r.tipo = 'esercizio' then coalesce(r.configurazione, v_s.configurazione) end,
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
    'scheda', jsonb_build_object('id', v_s.id, 'ripeti_volte', v_s.ripeti_volte, 'ritmo_sec', v_s.ritmo_sec,
                                 'configurazione', v_s.configurazione),
    'righe',  v_righe
  );
end;
$$;

revoke all on function public.get_scheda_paziente(text) from public;
grant execute on function public.get_scheda_paziente(text) to anon, authenticated;

notify pgrst, 'reload schema';

select 'scheda-npl-v1: migration 061 eseguita' as esito;
