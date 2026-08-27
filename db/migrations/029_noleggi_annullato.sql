-- 029_noleggi_annullato.sql  (idempotente — si puo' rieseguire senza danni)
-- Aggiunge `annullato` a noleggi_addebiti.
--
-- PERCHE' NON SI CANCELLA E BASTA:
-- gli addebiti a canone mensile vengono RIGENERATI lato client a ogni apertura
-- della pagina Noleggi (niente cron, vincolo 12/12 serverless). Una riga
-- cancellata con DELETE tornerebbe da sola al giro dopo. Marcandola annullata
-- la riga resta come traccia, l'unique index (noleggio_id, periodo) impedisce
-- che se ne crei un'altra per lo stesso periodo, e i conti la ignorano.
-- Effetto per l'utente: il cestino "toglie" la riga e non torna piu'.
-- E' anche reversibile: si puo' ripristinare senza perdere niente.

alter table public.noleggi_addebiti
  add column if not exists annullato boolean not null default false;

create index if not exists idx_addebiti_attivi
  on public.noleggi_addebiti(professional_id, periodo)
  where annullato = false;

comment on column public.noleggi_addebiti.annullato is
  'true = riga tolta dai conti (non entra in Contabile, FIFO, fattura). Non si cancella per davvero perche'' i canoni si rigenerano lato client: la riga resta a bloccare il periodo. Reversibile.';
