-- 036_ux_paziente_schema.sql
-- Blocco UX AREA PAZIENTE - Release 1 - fondamenta dei dati (agosto 2026)
-- Idempotente: si puo' rieseguire senza danni.
--
-- ATTENZIONE alla numerazione: esistono DUE migration numerate 030. Il numero
-- non racconta l'ordine reale, non fidarsi (nota gia' presente nella 032).
--
-- PERCHE' QUESTA MIGRATION VIENE PRIMA DELLA GRAFICA
-- La struttura dati e' la cosa piu' costosa da cambiare DOPO. Se si parte
-- dalla home ridisegnata e a meta' strada ci si accorge che serviva la
-- distinzione rapida/guidata, i dati raccolti nel frattempo non sono piu'
-- confrontabili con quelli di dopo. Schema prima, interfaccia dopo.
--
-- TRE SEZIONI, INDIPENDENTI FRA LORO
--   A - i campi della seduta (Allegato B) su diary_entries
--   B - la tabella degli eventi analytics (Allegato C)
--   C - il token del paziente: revocabile
--
-- COSA NON FA, DI PROPOSITO
--   Non cancella niente. Non cambia nessuna colonna esistente. Non tocca
--   nessuna RPC gia' in produzione: le pagine di oggi continuano a girare
--   identiche anche subito dopo aver eseguito questo file. Le RPC estese
--   arrivano nel file successivo, quando le colonne esistono gia'.


-- =====================================================================
-- SEZIONE A - I CAMPI DELLA SEDUTA (Allegato B)
-- =====================================================================
-- Le sedute del paziente a casa vivono gia' in diary_entries: patient_id,
-- patient_protocol_id, data, dolore, rigidita, equilibrio, energia, note,
-- completato. E' quella tabella che alimenta streak, aderenza e Pagella.
--
-- Si ESTENDE quella, non se ne crea una nuova. Motivo: la storia dei
-- pazienti attuali resta nella stessa tabella e resta confrontabile con
-- quella nuova. Una tabella nuova avrebbe spezzato la serie storica
-- esattamente nel punto in cui ci serve il "prima" da confrontare col
-- "dopo" - cioe' avrebbe buttato via la baseline che stiamo per misurare.
--
-- La stabilita' NON prende una colonna nuova: e' la colonna 'equilibrio'
-- che esiste gia'. Un dato = un solo magazzino (lezione #13).

alter table public.diary_entries add column if not exists modalita              text;
alter table public.diary_entries add column if not exists risposta_post         text;
alter table public.diary_entries add column if not exists interrotto_per_dolore boolean not null default false;
alter table public.diary_entries add column if not exists difficolta            text;
alter table public.diary_entries add column if not exists stelle                smallint;
alter table public.diary_entries add column if not exists protocol_version      integer;
alter table public.diary_entries add column if not exists iniziata_alle         timestamptz;
alter table public.diary_entries add column if not exists finita_alle           timestamptz;
alter table public.diary_entries add column if not exists esercizi_completati   jsonb;
alter table public.diary_entries add column if not exists video_visti           jsonb;
alter table public.diary_entries add column if not exists client_session_id     text;

comment on column public.diary_entries.modalita is
  'rapid | guided | manual. Senza questa colonna i numeri di aderenza mentono: '
  'una seduta segnata completata senza fare gli esercizi conta come una fatta.';
comment on column public.diary_entries.risposta_post is
  'better | same | worse - la risposta PERCEPITA alla seduta. Non e'' la stessa '
  'cosa delle stelle: le stelle sono soddisfazione dell''esperienza. Non mescolarle mai.';
comment on column public.diary_entries.stelle is
  'Soddisfazione 1-5, chiesta UNA VOLTA A SETTIMANA, non ogni giorno.';
comment on column public.diary_entries.client_session_id is
  'Chiave inventata dal browser a inizio seduta. Serve a far si'' che due tocchi '
  'sul pulsante, o un refresh a meta'' strada, restino UNA seduta sola.';

-- I valori ammessi. NOT VALID di proposito: il vincolo vale da adesso in
-- avanti e NON va a controllare le righe storiche, che hanno tutte NULL in
-- queste colonne e non devono far fallire la migration.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'diary_entries_modalita_ck') then
    alter table public.diary_entries
      add constraint diary_entries_modalita_ck
      check (modalita is null or modalita in ('rapid','guided','manual')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'diary_entries_risposta_post_ck') then
    alter table public.diary_entries
      add constraint diary_entries_risposta_post_ck
      check (risposta_post is null or risposta_post in ('better','same','worse')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'diary_entries_difficolta_ck') then
    alter table public.diary_entries
      add constraint diary_entries_difficolta_ck
      check (difficolta is null or difficolta in ('easy','normal','difficult')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'diary_entries_stelle_ck') then
    alter table public.diary_entries
      add constraint diary_entries_stelle_ck
      check (stelle is null or (stelle between 1 and 5)) not valid;
  end if;
end $$;

-- ANTI DOPPIO-CLICK / ANTI REFRESH.
-- Indice UNIVOCO parziale: vale solo dove client_session_id non e' nullo,
-- quindi le righe storiche (tutte nulle) non vengono toccate e nessun dato
-- vecchio puo' far fallire la creazione dell'indice.
create unique index if not exists diary_entries_sessione_unica
  on public.diary_entries (patient_id, client_session_id)
  where client_session_id is not null;

-- Le letture della Pagella e della home sono sempre "questo paziente, per data".
create index if not exists diary_entries_paziente_data
  on public.diary_entries (patient_id, data desc);


-- =====================================================================
-- SEZIONE B - EVENTI ANALYTICS (Allegato C)
-- =====================================================================
-- Oggi non esiste UN SOLO numero su come viene usata l'area paziente:
-- quanti aprono, quanti iniziano, quanti finiscono, dove abbandonano.
-- Senza quei numeri, fra due mesi alla domanda "e' migliorato?" si puo'
-- rispondere solo con un'opinione.
--
-- NIENTE SERVIZI DI TERZE PARTI sulle pagine del paziente: sono dati
-- sanitari. Gli eventi si scrivono qui, in casa nostra.
--
-- ⚠️ REGOLA CHE NON SI TOCCA: il token del paziente non entra MAI in questa
-- tabella. La RPC lo riceve solo per capire di chi si tratta e poi lo butta.
-- Qui dentro resta il patient_id, che senza il database non dice niente.

create table if not exists public.patient_events (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  evento      text not null,
  modalita    text,
  meta        jsonb,
  creato_il   timestamptz not null default now()
);

comment on table public.patient_events is
  'Eventi d''uso dell''area paziente (Allegato C). Scritti SOLO dalla RPC '
  'log_patient_event. Mai il token del paziente qui dentro.';

create index if not exists patient_events_paziente_data
  on public.patient_events (patient_id, creato_il desc);
create index if not exists patient_events_evento_data
  on public.patient_events (evento, creato_il desc);

-- RLS accesa. Nessuna policy per anon: il paziente non legge e non scrive
-- MAI questa tabella direttamente, ci arriva solo attraverso la RPC.
alter table public.patient_events enable row level security;

drop policy if exists "Professionista legge gli eventi dei suoi pazienti" on public.patient_events;
create policy "Professionista legge gli eventi dei suoi pazienti"
on public.patient_events
for select
using (
  patient_id in (
    select pat.id from public.patients pat
     where pat.professional_id in (
       select pr.id from public.professionals pr where pr.user_id = auth.uid()
     )
  )
);
-- Nota sulla chiave: qui vale professionals.id (via patients.professional_id),
-- NON auth.uid() diretto. Nelle fatture e in fic_connections e' il contrario.
-- Sbagliare chiave qui avrebbe voluto dire una tabella vuota per tutti,
-- oppure aperta a tutti (lezione #17).


-- ---------------------------------------------------------------------
-- RPC: log_patient_event
-- ---------------------------------------------------------------------
-- La chiamano le pagine del paziente, che non hanno nessuna sessione
-- Supabase: hanno solo il token. Stesso schema di tutte le altre RPC del
-- portale paziente - token dentro, niente di sensibile fuori.
--
-- Non solleva MAI un errore: un evento analytics che fa fallire una seduta
-- sarebbe un pessimo affare. Se qualcosa non va, restituisce false e basta.

create or replace function public.log_patient_event(
  p_token   text,
  p_evento  text,
  p_meta    jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token      uuid;
  v_patient_id uuid;
  v_evento     text;
  v_modalita   text;
  v_meta       jsonb;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return false;
  end if;

  begin
    v_token := p_token::uuid;
  exception when others then
    return false;
  end;

  select pat.id into v_patient_id
    from patients pat
   where pat.access_token = v_token
   limit 1;

  if not found then
    return false;
  end if;

  -- Nome evento: solo lettere minuscole e underscore, lunghezza sensata.
  -- Non e' una lista chiusa di proposito (aggiungerne uno non deve
  -- richiedere una migration), ma la forma e' obbligata: cosi' un browser
  -- non puo' riempire la tabella di spazzatura.
  v_evento := lower(trim(coalesce(p_evento, '')));
  if v_evento !~ '^[a-z][a-z0-9_]{2,39}$' then
    return false;
  end if;

  v_modalita := nullif(lower(trim(coalesce(p_meta->>'modalita', ''))), '');
  if v_modalita is not null and v_modalita not in ('rapid','guided','manual') then
    v_modalita := null;
  end if;

  -- Tetto alla dimensione del meta: nessun payload bombing.
  v_meta := p_meta;
  if v_meta is not null and length(v_meta::text) > 1000 then
    v_meta := null;
  end if;

  insert into patient_events (patient_id, evento, modalita, meta)
  values (v_patient_id, v_evento, v_modalita, v_meta);

  return true;
exception when others then
  -- Qualunque cosa succeda, la seduta del paziente non si ferma.
  return false;
end;
$$;

revoke all on function public.log_patient_event(text, text, jsonb) from public;
grant  execute on function public.log_patient_event(text, text, jsonb) to anon;
grant  execute on function public.log_patient_event(text, text, jsonb) to authenticated;


-- =====================================================================
-- SEZIONE C - IL TOKEN DEL PAZIENTE: REVOCABILE
-- =====================================================================
-- Il token e' l'UNICA chiave dell'area paziente e vive nell'indirizzo:
-- finisce nella cronologia del browser e in ogni link condiviso. La sua
-- lunghezza va bene (e' un uuid, casuale a sufficienza). Quello che manca
-- e' il modo di CHIUDERLO: oggi, se un link finisce dove non deve, non
-- esiste nessuna leva per revocarlo.
--
-- Qui si aggiunge la leva. Il pulsante nella scheda paziente arriva dopo.

alter table public.patients add column if not exists token_ruotato_il timestamptz;

comment on column public.patients.token_ruotato_il is
  'Quando il link del paziente e'' stato rigenerato l''ultima volta. '
  'Rigenerare INVALIDA il link vecchio: va poi rimandato al paziente.';

create or replace function public.ruota_token_paziente(p_patient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuovo uuid;
begin
  if p_patient_id is null then
    raise exception 'Operazione non autorizzata';
  end if;

  -- Il permesso lo decide il DATABASE, non il browser: si puo' rigenerare
  -- solo il token di un paziente che appartiene a chi sta chiamando.
  -- Guardia scritta per INCLUSIONE (chi PUO'), non per esclusione: e' la
  -- lezione #50, quella che aveva tagliato fuori proprio l'unico utente
  -- che doveva passare.
  if not exists (
    select 1
      from patients pat
      join professionals pr on pr.id = pat.professional_id
     where pat.id = p_patient_id
       and pr.user_id = auth.uid()
  ) then
    raise exception 'Operazione non autorizzata';
  end if;

  v_nuovo := gen_random_uuid();

  update patients
     set access_token     = v_nuovo,
         token_ruotato_il = now()
   where id = p_patient_id;

  return v_nuovo;
end;
$$;

revoke all on function public.ruota_token_paziente(uuid) from public;
revoke all on function public.ruota_token_paziente(uuid) from anon;
grant  execute on function public.ruota_token_paziente(uuid) to authenticated;


-- =====================================================================
-- CONTROLLO FINALE - stampa cosa e' stato creato davvero
-- =====================================================================
-- Non fidarsi del fatto che non siano usciti errori: guardare le righe.
-- Devono essere tutte OK.

select 'colonna diary_entries.' || c.nome as oggetto,
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'diary_entries'
            and column_name = c.nome
       ) then 'OK' else 'MANCA' end as esito
  from (values ('modalita'),('risposta_post'),('interrotto_per_dolore'),
               ('difficolta'),('stelle'),('protocol_version'),
               ('iniziata_alle'),('finita_alle'),('esercizi_completati'),
               ('video_visti'),('client_session_id')) as c(nome)

union all
select 'tabella patient_events',
       case when to_regclass('public.patient_events') is not null then 'OK' else 'MANCA' end

union all
select 'RLS accesa su patient_events',
       case when coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.patient_events')), false)
            then 'OK' else 'MANCA' end

union all
select 'colonna patients.token_ruotato_il',
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'patients'
            and column_name = 'token_ruotato_il'
       ) then 'OK' else 'MANCA' end

union all
select 'funzione ' || f.nome,
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = f.nome
       ) then 'OK' else 'MANCA' end
  from (values ('log_patient_event'),('ruota_token_paziente')) as f(nome)

order by 1;
