-- 041_daily_context.sql
-- Blocco daily-context-v1 — 2 settembre 2026
-- Idempotente: si puo' rieseguire senza danni.
--
-- MARKER: daily-context-v1
--
-- PERCHE' QUESTO FILE ESISTE
-- La 036 aveva messo le colonne della seduta. Restavano fuori quattro campi
-- (§36 del documento di Giuliano) e due cose che servono alla home per
-- «reagire a ieri» e per far vedere che il professionista c'e':
--   - quando il programma e' stato aggiornato l'ultima volta;
--   - un posto dove il professionista scrive un messaggio al paziente.
--
-- I quattro campi vanno decisi ADESSO anche se le Routine della giornata
-- arrivano dopo: i dati raccolti prima di averli non sarebbero confrontabili
-- con quelli di dopo. Costano quattro colonne vuote, non costano altro.
--
-- TRE SEZIONI, INDIPENDENTI FRA LORO
--   A - i quattro campi delle Routine su diary_entries
--   B - patient_protocols.updated_at: «programma aggiornato il ...»
--   C - patient_messages: il messaggio del professionista, a SENSO UNICO
--
-- COSA NON FA, DI PROPOSITO
--   Non cancella niente. Non cambia nessuna colonna esistente. Non tocca
--   nessuna RPC: le pagine di oggi continuano a girare identiche subito
--   dopo aver eseguito questo file. Le RPC arrivano da
--   rpc_patient_functions.sql, che va eseguito DOPO questo.


-- =====================================================================
-- SEZIONE A - I QUATTRO CAMPI DELLE ROUTINE (§36)
-- =====================================================================
-- Una riga di diary_entries oggi e' sempre «la seduta del protocollo».
-- Domani potra' essere anche «una routine breve per il collo». Senza
-- session_type i due numeri finiscono nella stessa colonna e l'aderenza
-- al protocollo diventa impossibile da calcolare: e' lo stesso errore del
-- 'manual' contato come seduta fatta.
--
-- ⚠️ DECISIONE DI GIULIANO, 2 settembre: la prima azione della home resta
-- SEMPRE quella prescritta nel protocollo (session_type = 'main'). Le
-- routine a scelta libera sono un servizio secondario e facoltativo, e
-- nei conti dell'aderenza NON sostituiscono mai la seduta principale.

alter table public.diary_entries add column if not exists session_type   text;
alter table public.diary_entries add column if not exists body_area      text;
alter table public.diary_entries add column if not exists activity_type  text;
alter table public.diary_entries add column if not exists with_cushions  boolean;

comment on column public.diary_entries.session_type is
  'main = la seduta prescritta dal professionista (il default, e'' la prima '
  'azione della home). routine = una routine breve scelta dal paziente, '
  'servizio secondario. NULL sulle righe storiche = main. '
  'L''aderenza al protocollo si conta SOLO su main.';
comment on column public.diary_entries.body_area is
  'Zona della routine (collo_spalle, lombare, ...). Vocabolario in un file '
  'js, non qui: aggiungerne una non deve richiedere una migration.';
comment on column public.diary_entries.activity_type is
  'Tipo di attivita'' della routine (pausa_attiva, risveglio, ...). '
  'Stesso ragionamento di body_area.';
comment on column public.diary_entries.with_cushions is
  'Variante con o senza cuscini. NULL = non pertinente (seduta main).';

-- I valori ammessi.
--   session_type e' una lista CHIUSA: sono due, e sono strutturali.
--   body_area e activity_type no: si controlla la FORMA, non l'elenco.
--   E' la stessa scelta di log_patient_event nella 036 - aggiungere una
--   zona non deve costare una migration, ma un browser non deve poter
--   scrivere spazzatura in una colonna clinica.
-- NOT VALID di proposito: il vincolo vale da adesso in avanti e non va a
-- controllare le righe storiche, che hanno tutte NULL.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'diary_entries_session_type_ck') then
    alter table public.diary_entries
      add constraint diary_entries_session_type_ck
      check (session_type is null or session_type in ('main','routine')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'diary_entries_body_area_ck') then
    alter table public.diary_entries
      add constraint diary_entries_body_area_ck
      check (body_area is null or body_area ~ '^[a-z][a-z0-9_]{1,39}$') not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'diary_entries_activity_type_ck') then
    alter table public.diary_entries
      add constraint diary_entries_activity_type_ck
      check (activity_type is null or activity_type ~ '^[a-z][a-z0-9_]{1,39}$') not valid;
  end if;
end $$;

-- La home legge «cosa e' successo ieri» e «quante sedute questa settimana»:
-- sempre questo paziente, per data, spesso solo le main.
create index if not exists diary_entries_paziente_tipo_data
  on public.diary_entries (patient_id, session_type, data desc);


-- =====================================================================
-- SEZIONE B - «PROGRAMMA AGGIORNATO IL ...»
-- =====================================================================
-- E' la card che, da sola, vale piu' di meta' delle animazioni: dice al
-- paziente che qualcuno ha guardato. Oggi il dato non esiste:
-- patient_protocols ha created_at, cioe' quando il protocollo e' NATO.
-- Se il professionista lo modifica il 28 agosto, il paziente continua a
-- leggere la data di maggio. Una data sbagliata e' peggio di nessuna data.

alter table public.patient_protocols add column if not exists updated_at timestamptz;
alter table public.patient_protocols add column if not exists versione   integer not null default 1;

comment on column public.patient_protocols.updated_at is
  'Ultima modifica del protocollo, scritta dal trigger. Alimenta la card '
  '«programma aggiornato il ...» nella home del paziente. NULL sulle righe '
  'mai piu'' toccate dopo la 041: in quel caso si mostra created_at.';
comment on column public.patient_protocols.versione is
  'Sale di 1 a ogni modifica. La 036 aveva previsto diary_entries.protocol_version '
  'ma non esisteva nessun numero da scriverci: senza questo, confrontare due '
  'sedute non avrebbe detto se in mezzo il programma era cambiato.';

create or replace function public.trg_patient_protocols_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- La versione la decide il DATABASE. Se la scrivesse il browser, due
  -- schede aperte scriverebbero lo stesso numero su due contenuti diversi.
  if tg_op = 'INSERT' then
    new.versione := 1;
  else
    new.versione := coalesce(old.versione, 1) + 1;
  end if;
  return new;
end;
$$;

-- ANCHE SULL'INSERIMENTO, non solo sulla modifica. Con il trigger sul solo
-- update, un protocollo nuovo nasceva con updated_at vuoto e la card diceva
-- «programma aggiornato il --». Un protocollo appena assegnato E' appena
-- aggiornato: e' il momento in cui la card conta di piu'.
drop trigger if exists patient_protocols_updated_at on public.patient_protocols;
create trigger patient_protocols_updated_at
  before insert or update on public.patient_protocols
  for each row execute function public.trg_patient_protocols_updated_at();

-- Le righe di oggi non hanno mai avuto un updated_at: si parte da created_at,
-- che e' la cosa piu' vera che si sappia. Solo dove e' ancora nullo, cosi'
-- rieseguire il file non riscrive niente.
update public.patient_protocols
   set updated_at = created_at
 where updated_at is null;


-- =====================================================================
-- SEZIONE C - IL MESSAGGIO DEL PROFESSIONISTA (a senso unico)
-- =====================================================================
-- ⚠️ QUESTA NON E' UNA CHAT, ED E' UNA SCELTA, NON UNA MANCANZA.
-- Il paziente non ha un login: l'unica chiave e' il token nell'indirizzo,
-- quindi CHIUNQUE ABBIA IL LINK E' IL PAZIENTE. Finche' l'app gli MOSTRA
-- cose sue, va bene. Nel momento in cui accetta che LUI scriva, un
-- messaggio non autenticato finirebbe nella cartella clinica come se
-- l'avesse scritto lui. Qui scrive solo il professionista, che una
-- sessione ce l'ha (vedi PIANO-comunicazione-paziente.md).
--
-- Di conseguenza: nessuna colonna «risposta», nessun mittente paziente.
-- Non e' un dettaglio da aggiungere dopo: e' il confine della tabella.

create table if not exists public.patient_messages (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  professional_id uuid not null references public.professionals(id),
  testo           text,
  audio_url       text,
  autore          text,
  creato_il       timestamptz not null default now(),
  letto_il        timestamptz,
  archiviato      boolean not null default false
);

comment on table public.patient_messages is
  'Messaggi del professionista al paziente. A SENSO UNICO: il paziente non '
  'ha un login, quindi non scrive qui. Nessuna colonna risposta, di proposito.';
comment on column public.patient_messages.autore is
  'Nome scritto per esteso al momento dell''invio (es. «Dott. Baron»). '
  'Denormalizzato di proposito: chi ha scritto quel messaggio QUEL giorno '
  'non deve cambiare se domani cambia un profilo.';
comment on column public.patient_messages.letto_il is
  'Quando il paziente lo ha aperto. Serve al professionista per sapere se '
  'e'' arrivato. Lo scrive la RPC segna_messaggio_letto.';

-- Almeno una delle due forme: un messaggio vuoto non e' un messaggio.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patient_messages_contenuto_ck') then
    alter table public.patient_messages
      add constraint patient_messages_contenuto_ck
      check (
        coalesce(length(trim(testo)), 0) > 0
        or coalesce(length(trim(audio_url)), 0) > 0
      );
  end if;
end $$;

-- La home chiede sempre «l'ultimo messaggio non archiviato di questo paziente».
create index if not exists patient_messages_paziente_data
  on public.patient_messages (patient_id, creato_il desc);

alter table public.patient_messages enable row level security;

-- Il paziente NON legge questa tabella direttamente: ci arriva solo
-- attraverso get_daily_context, che e' SECURITY DEFINER. Nessuna policy
-- per anon, esattamente come patient_events nella 036.
--
-- Chiave: professionals.id via patients.professional_id, NON auth.uid()
-- diretto (lezione #17: sbagliare chiave qui vuol dire una tabella vuota
-- per tutti oppure aperta a tutti).

drop policy if exists "Professionista legge i messaggi dei suoi pazienti" on public.patient_messages;
create policy "Professionista legge i messaggi dei suoi pazienti"
on public.patient_messages
for select
using (
  patient_id in (
    select pat.id from public.patients pat
     where pat.professional_id in (
       select pr.id from public.professionals pr where pr.user_id = auth.uid()
     )
  )
);

drop policy if exists "Professionista scrive ai suoi pazienti" on public.patient_messages;
create policy "Professionista scrive ai suoi pazienti"
on public.patient_messages
for insert
with check (
  patient_id in (
    select pat.id from public.patients pat
     where pat.professional_id in (
       select pr.id from public.professionals pr where pr.user_id = auth.uid()
     )
  )
  and professional_id in (
    select pr.id from public.professionals pr where pr.user_id = auth.uid()
  )
);

-- Archiviare si', riscrivere il testo no: un messaggio gia' letto dal
-- paziente che cambia parole dopo e' documentazione che si riscrive da
-- sola. Si puo' solo toglierlo di mezzo.
drop policy if exists "Professionista archivia i suoi messaggi" on public.patient_messages;
create policy "Professionista archivia i suoi messaggi"
on public.patient_messages
for update
using (
  professional_id in (
    select pr.id from public.professionals pr where pr.user_id = auth.uid()
  )
)
with check (
  professional_id in (
    select pr.id from public.professionals pr where pr.user_id = auth.uid()
  )
);


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
  from (values ('session_type'),('body_area'),('activity_type'),('with_cushions')) as c(nome)

union all
select 'colonna patient_protocols.' || c.nome,
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'patient_protocols'
            and column_name = c.nome
       ) then 'OK' else 'MANCA' end
  from (values ('updated_at'),('versione')) as c(nome)

union all
select 'trigger patient_protocols_updated_at',
       case when exists (
         select 1 from pg_trigger
          where tgname = 'patient_protocols_updated_at' and not tgisinternal
       ) then 'OK' else 'MANCA' end

union all
select 'tabella patient_messages',
       case when to_regclass('public.patient_messages') is not null then 'OK' else 'MANCA' end

union all
select 'RLS accesa su patient_messages',
       case when coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.patient_messages')), false)
            then 'OK' else 'MANCA' end

union all
select 'policy su patient_messages: ' || p.polname,
       'OK'
  from pg_policy p
 where p.polrelid = to_regclass('public.patient_messages')

union all
select 'protocolli senza updated_at (deve essere 0): ' || count(*)::text,
       case when count(*) = 0 then 'OK' else 'GUARDA' end
  from public.patient_protocols
 where updated_at is null

order by 1;
