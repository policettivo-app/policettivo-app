-- ═══════════════════════════════════════════════════════════════════════
-- Migration 046 — Oscillazione Policettiva [oscillazione-live-v1]
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE
--   1. `oscillazione_test`   — i test salvati (professionista, e paziente se c'e')
--   2. Tre colonne su `professionals` per la VISTA IN DIRETTA
--   3. `oscillazione_ospiti` — i codici usa e getta per far guardare a un altro
--   4. Quattro funzioni: apri canale, leggi canale, crea codice, risolvi codice
--
-- ⚠️ TUTTO ADDITIVO. Non cancella niente, non tocca nessuna colonna esistente,
--    non tocca `therapy_sessions` (che e' il diario sedute legato alla
--    contabilita': un test fatto senza paziente non ha nessuna riga li').
--    Si puo' rilanciare quante volte si vuole.
--
-- COME FUNZIONA LA DIRETTA, E PERCHE' COSI'
--   Il telefono che misura e il computer che guarda si trovano perche' sono lo
--   stesso professionista: nessun link da copiare, nessun codice da digitare.
--   Il nome del canale NON e' l'identita' del professionista (sarebbe un
--   segreto permanente che non si puo' cambiare) ma un `live_canale` casuale,
--   rigenerabile: si apre quando si accende la condivisione e si puo' buttare.
--   Il codice ospite punta a QUEL canale e scade da solo: chi ha guardato una
--   volta non guarda per sempre.
--
-- ⚠️ IL CANALE NON PORTA DATI DI PAZIENTE. Sul canale viaggiano solo angoli
--    di inclinazione della tavola. Nessun nome, nessun identificativo, niente
--    che permetta di risalire a una persona. E' una scelta, non un caso: un
--    canale che chiunque potrebbe ascoltare non deve poter dire chi c'e' sopra.
--
-- Ritorno indietro:
--   drop function if exists public.oscillazione_apri_canale();
--   drop function if exists public.oscillazione_canale();
--   drop function if exists public.oscillazione_codice_crea(integer);
--   drop function if exists public.oscillazione_risolvi(text);
--   drop table if exists public.oscillazione_ospiti;
--   drop table if exists public.oscillazione_test;
--   alter table public.professionals drop column if exists live_canale;
--   alter table public.professionals drop column if exists live_canale_at;
-- ═══════════════════════════════════════════════════════════════════════

-- Il «prima», come da REGOLE-non-si-rompe-niente.md. Qui e' tutto nuovo,
-- quindi non c'e' niente da salvare: il DO serve solo a non far fallire
-- l'intera migration se la 042 (salva_prima) non fosse stata lanciata.
do $$
begin
  perform public.salva_prima('oscillazione_canale', 'oscillazione-live-v1');
exception
  when undefined_function then
    raise notice 'salva_prima non esiste (042 non lanciata): niente da salvare, e'' tutto nuovo';
end
$$;


-- ─── A · I TEST SALVATI ────────────────────────────────────────────────
-- `patient_id` e' NULLABILE ed e' voluto: dalla home si fa un test a chiunque
-- senza aprire una scheda. Un test senza paziente resta del professionista.
create table if not exists public.oscillazione_test (
  id               uuid primary key default gen_random_uuid(),
  professional_id  uuid not null references public.professionals(id) on delete cascade,
  patient_id       uuid     references public.patients(id)          on delete cascade,
  quando           timestamptz not null default now(),

  evento           text not null,            -- beccheggio | rollio
  occhi            text,                     -- aperti | chiusi
  piedi            text,                     -- scalzo | con scarpe
  configurazione   text,
  nota             text,

  durata_s         integer,
  durata_reale_s   numeric(6,2),
  campioni         integer,
  hz_reale         numeric(6,2),

  -- il verso e lo zero USATI per questo test: senza, fra sei mesi non si sa
  -- piu' rispetto a cosa erano misurati i gradi
  verso_beta       smallint,
  verso_gamma      smallint,
  zero_beta        numeric(7,3),
  zero_gamma       numeric(7,3),
  tarato           boolean not null default false,

  carico_avanti    numeric(7,3),
  carico_destra    numeric(7,3),
  osc_ap           numeric(7,3),
  osc_ds           numeric(7,3),
  velocita         numeric(8,3),             -- ⭐ la misura piu' ripetibile (CV 13%)
  deriva           numeric(7,3),
  ellisse          numeric(9,3),
  raggio           numeric(7,3),
  percorso_lisc    numeric(9,3),
  cicli_ap         integer,
  cicli_ds         integer,
  freq_ap          numeric(5,2),
  freq_ds          numeric(5,2),
  soglia           numeric(5,2),

  -- ⚠️ TRACCIA DECIMATA A 10 Hz, non i 60 Hz veri. Le pagine dell'app fanno
  -- `select('*')`: con 1800 campioni per test ogni apertura di una scheda si
  -- tirerebbe dietro megabyte. A 10 Hz il disegno e' identico a vedersi.
  traccia          jsonb,
  traccia_hz       smallint not null default 10
);

create index if not exists idx_osc_test_prof    on public.oscillazione_test (professional_id, quando desc);
create index if not exists idx_osc_test_paziente on public.oscillazione_test (patient_id, quando desc);

alter table public.oscillazione_test enable row level security;

drop policy if exists "Professionista legge i suoi test" on public.oscillazione_test;
create policy "Professionista legge i suoi test"
on public.oscillazione_test
for select
using (
  professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid())
);

drop policy if exists "Professionista salva i suoi test" on public.oscillazione_test;
create policy "Professionista salva i suoi test"
on public.oscillazione_test
for insert
with check (
  professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid())
);

-- Si puo' correggere la nota e agganciare un paziente a un test fatto libero,
-- ma NON si riscrivono le misure: quelle sono il dato.
drop policy if exists "Professionista annota i suoi test" on public.oscillazione_test;
create policy "Professionista annota i suoi test"
on public.oscillazione_test
for update
using (
  professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid())
)
with check (
  professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid())
);

drop policy if exists "Professionista cancella i suoi test" on public.oscillazione_test;
create policy "Professionista cancella i suoi test"
on public.oscillazione_test
for delete
using (
  professional_id in (select pr.id from public.professionals pr where pr.user_id = auth.uid())
);


-- ─── B · IL CANALE DELLA DIRETTA ───────────────────────────────────────
alter table public.professionals add column if not exists live_canale    uuid;
alter table public.professionals add column if not exists live_canale_at timestamptz;


-- ─── C · I CODICI OSPITE ───────────────────────────────────────────────
-- Sei caratteri, niente 0/O/1/I/L per non farli sbagliare a voce.
create table if not exists public.oscillazione_ospiti (
  codice          text primary key,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  canale          uuid not null,
  creato_il       timestamptz not null default now(),
  scade_il        timestamptz not null,
  usato_il        timestamptz
);
create index if not exists idx_osc_ospiti_scade on public.oscillazione_ospiti (scade_il);

alter table public.oscillazione_ospiti enable row level security;
-- Nessuna policy: ci si arriva SOLO dalle funzioni qui sotto.
-- Un ospite non deve poter leggere la tabella e scoprire gli altri codici.


-- ─── D · LE FUNZIONI ───────────────────────────────────────────────────

-- Apre (o rigenera) il canale del professionista che sta chiamando.
create or replace function public.oscillazione_apri_canale()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof uuid;
  v_can  uuid;
begin
  select pr.id into v_prof from public.professionals pr where pr.user_id = auth.uid() limit 1;
  if v_prof is null then return null; end if;

  v_can := gen_random_uuid();
  update public.professionals
     set live_canale = v_can, live_canale_at = now()
   where id = v_prof;
  return v_can;
end;
$$;

-- Legge il canale aperto. Dopo 12 ore si considera vecchio e non si restituisce:
-- meglio che il computer dica «nessuna diretta» piuttosto che restare in ascolto
-- di un canale di ieri, facendo credere che il paziente non si stia muovendo.
create or replace function public.oscillazione_canale()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_can uuid; v_at timestamptz;
begin
  select pr.live_canale, pr.live_canale_at into v_can, v_at
    from public.professionals pr where pr.user_id = auth.uid() limit 1;
  if v_can is null or v_at is null or v_at < now() - interval '12 hours' then
    return null;
  end if;
  return v_can;
end;
$$;

-- Crea un codice usa e getta per il canale aperto adesso.
create or replace function public.oscillazione_codice_crea(p_minuti integer default 30)
returns table (codice text, scade_il timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof uuid; v_can uuid; v_at timestamptz;
  v_cod text; v_alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_i integer; v_try integer := 0;
begin
  select pr.id, pr.live_canale, pr.live_canale_at into v_prof, v_can, v_at
    from public.professionals pr where pr.user_id = auth.uid() limit 1;
  if v_prof is null or v_can is null then return; end if;
  if v_at is null or v_at < now() - interval '12 hours' then return; end if;

  -- durata sensata: fra 5 minuti e 8 ore, comunque scritta nella riga
  if p_minuti is null or p_minuti < 5 then p_minuti := 5; end if;
  if p_minuti > 480 then p_minuti := 480; end if;

  loop
    v_cod := '';
    for v_i in 1..6 loop
      v_cod := v_cod || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from public.oscillazione_ospiti o where o.codice = v_cod);
    v_try := v_try + 1;
    if v_try > 20 then return; end if;
  end loop;

  insert into public.oscillazione_ospiti (codice, professional_id, canale, scade_il)
  values (v_cod, v_prof, v_can, now() + make_interval(mins => p_minuti));

  return query select v_cod, now() + make_interval(mins => p_minuti);
end;
$$;

-- Risolve un codice: lo puo' chiamare anche chi NON e' loggato, perche'
-- l'ospite e' per definizione qualcuno che non ha un account.
-- ⚠️ Restituisce SOLO il canale. Mai chi lo ha creato, mai un nome.
create or replace function public.oscillazione_risolvi(p_codice text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_can uuid;
begin
  if p_codice is null then return null; end if;
  p_codice := upper(regexp_replace(p_codice, '[^A-Za-z0-9]', '', 'g'));
  if length(p_codice) <> 6 then return null; end if;

  select o.canale into v_can
    from public.oscillazione_ospiti o
   where o.codice = p_codice and o.scade_il > now()
   limit 1;

  if v_can is null then return null; end if;

  update public.oscillazione_ospiti
     set usato_il = coalesce(usato_il, now())
   where codice = p_codice;
  return v_can;
end;
$$;

grant execute on function public.oscillazione_apri_canale()          to authenticated;
grant execute on function public.oscillazione_canale()               to authenticated;
grant execute on function public.oscillazione_codice_crea(integer)   to authenticated;
grant execute on function public.oscillazione_risolvi(text)          to anon, authenticated;
