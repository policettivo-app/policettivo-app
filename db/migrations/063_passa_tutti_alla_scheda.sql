-- ═══════════════════════════════════════════════════════════════════════
-- 063_passa_tutti_alla_scheda.sql · scheda-ovunque-v2 · 27 ottobre 2026
-- Decisione di Giuliano: TUTTI i pazienti (di tutti gli studi) passano dal protocollo
-- alla scheda di allenamento, in automatico.
--
-- Per ogni paziente con un protocollo attivo e NESSUNA scheda (né visibile né in prova):
--   crea una scheda VISIBILE con gli stessi esercizi, nello stesso ordine e con le stesse
--   durate di «Copia dal protocollo» (js/scheda-pure.js → daProtocollo), cioè:
--   1) esercizi del protocollo (per ordine): nome dalla libreria, durata del protocollo,
--      se manca quella della libreria, se manca 90 s; NPL/GPL della riga solo se diversa;
--   2) cuscini elicoidali (per ordine): titolo dalla lista di js/elicoidali-exercises.js,
--      durata del protocollo, se manca 60 s;
--   3) video/foto personali del protocollo (per data): titolo, durata o 60 s, descrizione.
--   I video del protocollo senza paziente vengono collegati al paziente (altrimenti
--   get_scheda_paziente non li darebbe): SOLO quelli con patient_id vuoto.
--
-- ⚠️ IL PROTOCOLLO NON SI TOCCA. Il paziente entra sempre da protocollo.html: con la scheda
--    visibile vede «Inizia gli esercizi» della scheda (come i pazienti già passati).
-- ⚠️ Rieseguirla non crea doppioni: chi ha già una scheda viene saltato.
--
-- 🛟 TORNARE INDIETRO (tutti i pazienti rivedono il protocollo; le schede restano salvate):
--   update public.scheda_allenamento set visibile_paziente = false, stato = 'prova', aggiornato_il = now()
--    where id in (select scheda_id from public.passaggio_scheda_063);
--   update public.exercise_videos set patient_id = null
--    where id in (select video_id from public.passaggio_scheda_063_video);
-- ═══════════════════════════════════════════════════════════════════════

-- il registro di quello che fa questa SQL: serve per tornare indietro
create table if not exists public.passaggio_scheda_063 (
  scheda_id   uuid primary key,
  patient_id  uuid not null,
  protocol_id uuid not null,
  righe       integer not null,
  fatto_il    timestamptz not null default now()
);
create table if not exists public.passaggio_scheda_063_video (
  video_id    uuid primary key,
  patient_id  uuid not null,
  fatto_il    timestamptz not null default now()
);
alter table public.passaggio_scheda_063       enable row level security;
alter table public.passaggio_scheda_063_video enable row level security;
revoke all on public.passaggio_scheda_063, public.passaggio_scheda_063_video from anon, authenticated;

-- la durata come in js/scheda-pure.js: Math.round(Number(v)) fra 1 e 3600, altrimenti niente
create or replace function public._sec063(v text) returns integer language sql immutable as $f$
  select case when btrim(coalesce(v, '')) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$'
               and round(btrim(v)::numeric) between 1 and 3600
              then round(btrim(v)::numeric)::integer end
$f$;

-- «vero» come in JavaScript: non null, non 0, non stringa vuota
create or replace function public._vero063(v jsonb) returns boolean language sql immutable as $f$
  select case when v is null then false
              else case jsonb_typeof(v) when 'number'  then (v::text)::numeric <> 0
                                        when 'string'  then (v #>> '{}') <> ''
                                        when 'boolean' then v = 'true'::jsonb
                                        when 'null'    then false
                                        else true end end
$f$;

do $$
declare
  v_prot  record;
  v_gen   text;
  v_sid   uuid;
  v_n     integer;
begin
  create temp table _eli(id text primary key, title text) on commit drop;
  insert into _eli values
      ('1E-NLP', '1E-NLP — Riorganizzazione tonico-posturale dinamica'),
      ('2E-NLP', '2E-NLP — Controllo posturale progressivo'),
      ('3E-NLP', '3E-NLP — Passo avanti-indietro propriocettivo'),
      ('4E-NLP', '4E-NLP — Mobilità rotatoria anca-piede'),
      ('5E-NLP', '5E-NLP — Attivazione circolatoria e reattività'),
      ('6E-NLP', '6E-NLP — Equilibrio monopodalico base'),
      ('6.1E-NLP', '6.1E-NLP — Equilibrio monopodalico sulla croce'),
      ('6.2E-NLP', '6.2E-NLP — Equilibrio monopodalico laterale'),
      ('7E-NLP', '7E-NLP — Slancio laterale monopodalico'),
      ('7.1E-NLP', '7.1E-NLP — Slancio laterale avanzato'),
      ('7.2E-NLP', '7.2E-NLP — Stabilità laterale dinamica'),
      ('8E-NLP', '8E-NLP — Alzata frontale monopodalica'),
      ('9E-NLP', '9E-NLP — Slancio posteriore controllato'),
      ('10E-NLP', '10E-NLP — Coordinazione ginocchio-braccio'),
      ('11E-NLP', '11E-NLP — Affondo laterale propriocettivo'),
      ('21E-NLP', '21E-NLP — Equilibrio sulle punte'),
      ('22E-NLP', '22E-NLP — Equilibrio sui talloni'),
      ('23E-NLP', '23E-NLP — Rotazioni del busto con estensione braccia'),
      ('24E-NLP', '24E-NLP — Equilibrio monopodalico con circonduzione braccia'),
      ('25E-NLP', '25E-NLP — Equilibrio monopodalico a occhi chiusi'),
      ('26E-NLP', '26E-NLP — Flessione laterale del busto'),
      ('27E-NLP', '27E-NLP — Flessione laterale con manubri'),
      ('28E-NLP', '28E-NLP — Pendolo laterale monopodalico'),
      ('29E-NLP', '29E-NLP — Pendolo con manubrio e stabilità spalla'),
      ('30E-NLP', '30E-NLP — Squat con manubrio frontale'),
      ('31E-NLP', '31E-NLP — Saltelli laterali dinamici'),
      ('32E-NLP', '32E-NLP — Ondeggio laterale controllato'),
      ('36E-NLP', '36E-NLP — Equilibrio monopodalico ginocchio al petto'),
      ('37E-NLP', '37E-NLP — Posizione dell''albero yoga'),
      ('38E-NLP', '38E-NLP — Gioco con pallina da tennis'),
      ('39E-NLP', '39E-NLP — Lancio palla medica monopodalico'),
      ('40E-NLP', '40E-NLP — Torsioni del tronco con manubri'),
      ('41E-NLP', '41E-NLP — Torsioni con sguardo fisso'),
      ('42E-NLP', '42E-NLP — Plank su cuscini elicoidali'),
      ('43E-NLP', '43E-NLP — Equilibrio con piegamento ginocchio'),
      ('44E-NLP', '44E-NLP — Movimento fluido stile Tai Chi'),
      ('45E-NLP', '45E-NLP — Flessione ed estensione cervicale'),
      ('46E-NLP', '46E-NLP — Inclinazione laterale del collo'),
      ('47E-NLP', '47E-NLP — Flessione cervicale controllata'),
      ('48E-NLP', '48E-NLP — Dondolio alternato delle braccia'),
      ('49E-NLP', '49E-NLP — Elevazione e rilascio delle spalle'),
      ('50E-NLP', '50E-NLP — Mobilità dinamica del tronco'),
      ('51E-NLP', '51E-NLP — Inclinazioni controllate e reazioni d''equilibrio'),
      ('52E-NLP', '52E-NLP — Stretching monopodalico del quadricipite'),
      ('53E-NLP', '53E-NLP — Ponte glutei propriocettivo');

  for v_prot in
    select distinct on (pp.patient_id) pp.*
      from public.patient_protocols pp
     where pp.stato = 'attivo'
       and not exists (select 1 from public.scheda_allenamento s
                        where s.patient_id = pp.patient_id and s.stato <> 'archiviata')
     order by pp.patient_id, pp.created_at desc
  loop
    v_gen := case when upper(coalesce(v_prot.configurazione_generale, '')) in ('NPL','GPL')
                  then upper(v_prot.configurazione_generale) end;

    -- le righe, come daProtocollo
    create temp table if not exists _r(n serial, nome text, exercise_id uuid, video_id uuid, elicoidale_id text,
                                       secondi integer, testo text, configurazione text) on commit drop;
    truncate _r restart identity;

    insert into _r(nome, exercise_id, secondi, configurazione)
    select coalesce(nullif(e.nome, ''), 'Esercizio'), x.exercise_id,
           coalesce(case when public._vero063(to_jsonb(x) -> 'durata')               -- come «e.durata || ex.durata_default»
                         then public._sec063(to_jsonb(x) ->> 'durata')
                         else public._sec063(to_jsonb(e) ->> 'durata_default') end, 90),
           case when upper(coalesce(x.configurazione, '')) in ('NPL','GPL')
                 and upper(x.configurazione) is distinct from v_gen then upper(x.configurazione) end
      from public.patient_protocol_exercises x
      left join public.exercises e on e.id = x.exercise_id
     where x.patient_protocol_id = v_prot.id
     order by coalesce(x.ordine, 0);

    insert into _r(nome, elicoidale_id, secondi)
    select coalesce(nullif(l.title, ''), nullif(x.elicoidale_id, ''), 'Esercizio'), x.elicoidale_id,
           coalesce(public._sec063(to_jsonb(x) ->> 'durata'), 60)
      from public.patient_protocol_elicoidali x
      left join _eli l on l.id = x.elicoidale_id
     where x.patient_protocol_id = v_prot.id
     order by coalesce(x.ordine, 0);

    insert into _r(nome, video_id, secondi, testo)
    select coalesce(nullif(v.titolo, ''), 'Contenuto personalizzato'), v.id,
           coalesce(public._sec063(to_jsonb(v) ->> 'durata'), 60), nullif(btrim(coalesce(v.descrizione, '')), '')
      from public.exercise_videos v
     where v.protocol_id = v_prot.id
     order by v.created_at;

    select count(*) into v_n from _r;
    continue when v_n = 0;                        -- protocollo senza esercizi: si salta

    insert into public.scheda_allenamento(patient_id, nome, stato, visibile_paziente, ripeti_volte, configurazione, volte_giorno)
    values (v_prot.patient_id, 'Dal protocollo · ' || coalesce(nullif(v_prot.nome_personalizzato, ''), 'Protocollo'),
            'attiva', true, 1, v_gen, 1)
    returning id into v_sid;

    insert into public.scheda_allenamento_righe(scheda_id, ordine, tipo, exercise_id, video_id, elicoidale_id, nome,
                                                misura, secondi, ripetizioni, serie, quando, testo, configurazione)
    select v_sid, n, 'esercizio', exercise_id, video_id, elicoidale_id, nome, 'tempo', secondi, null, 1, 'sempre', testo, configurazione
      from _r order by n;

    insert into public.passaggio_scheda_063(scheda_id, patient_id, protocol_id, righe) values (v_sid, v_prot.patient_id, v_prot.id, v_n);

    with fatti as (
      update public.exercise_videos v set patient_id = v_prot.patient_id
       where v.protocol_id = v_prot.id and v.patient_id is null
       returning v.id)
    insert into public.passaggio_scheda_063_video(video_id, patient_id)
    select id, v_prot.patient_id from fatti on conflict do nothing;
  end loop;
end $$;

drop function if exists public._sec063(text);
drop function if exists public._vero063(jsonb);

select 'scheda-ovunque-v2: migration 063 eseguita' as esito,
       (select count(*) from public.passaggio_scheda_063) as passati,
       (select count(*) from public.passaggio_scheda_063_video) as video_collegati;
