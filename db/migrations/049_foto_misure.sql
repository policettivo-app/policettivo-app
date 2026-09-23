-- ═══════════════════════════════════════════════════════════════════════
-- Migration 049 — I gradi sulle foto posturali [gradi-foto-v1]
-- ═══════════════════════════════════════════════════════════════════════
--
-- COSA AGGIUNGE
--   `foto_misure` — per ogni FOTO: i punti confermati dal professionista
--   (filo a piombo, orecchio, spalla, anca…) e i gradi che ne escono.
--
-- PERCHE' LA CHIAVE E' storage_path (come foto_allineamenti, migration 038)
--   La stessa foto è condivisa fra più righe di visit_photos, e le foto della
--   scheda paziente una riga non ce l'hanno. La misura è una proprietà del FILE.
--
-- COSA C'E' DENTRO
--   punti: { "filo_alto": {"x":0.5,"y":0.06}, "orecchio": {...}, ... } normalizzati 0-1
--   gradi: [ { "k":"testa", "nome":"...", "gradi":12.4, "valore":12.4, "parola":"in avanti" }, ... ]
--   I gradi si salvano (per leggerli senza ricalcolare) ma si possono sempre
--   RIFARE dai punti: la matematica sta in js/misure-foto.js, con la versione.
--
-- ⚠️ TUTTO ADDITIVO. Una tabella nuova. Non tocca niente di esistente.
--    Si può rilanciare quante volte si vuole.
--
-- Ritorno indietro:
--   drop table if exists public.foto_misure;
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  perform public.salva_prima('foto_misure', 'gradi-foto-v1');
exception
  when undefined_function then
    raise notice 'salva_prima non esiste (042 non lanciata): niente da salvare, e'' tutto nuovo';
end
$$;

CREATE TABLE IF NOT EXISTS public.foto_misure (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  vista         text NOT NULL CHECK (vista IN ('sagittale','frontale','posteriore')),
  verso         smallint NOT NULL DEFAULT 1 CHECK (verso IN (-1, 1)),
  punti         jsonb NOT NULL,
  gradi         jsonb NOT NULL DEFAULT '[]'::jsonb,
  larghezza     integer CHECK (larghezza IS NULL OR larghezza > 0),
  altezza       integer CHECK (altezza IS NULL OR altezza > 0),
  origine       text,                 -- 'mediapipe' (proposti e confermati) | 'mano'
  versione      text NOT NULL DEFAULT 'gradi-foto-v1',
  creato_il     timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_foto_misure_path ON public.foto_misure(storage_path);
CREATE INDEX IF NOT EXISTS idx_foto_misure_paziente ON public.foto_misure(patient_id);

-- ============================================================
-- RLS: stesso schema di foto_allineamenti (patients -> professionals -> auth.uid())
-- ============================================================

ALTER TABLE public.foto_misure ENABLE ROW LEVEL SECURITY;

-- Supabase concede da solo i permessi sulle tabelle nuove del public schema,
-- ma se cosi non fosse l errore sarebbe "permission denied for table" e non
-- si capirebbe dalla pagina: meglio scriverlo qui. Ripetibile senza danno.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foto_misure TO authenticated;

DROP POLICY IF EXISTS "Professionista vede le proprie misure"
  ON public.foto_misure;
CREATE POLICY "Professionista vede le proprie misure"
  ON public.foto_misure
  FOR SELECT
  TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Professionista inserisce le proprie misure"
  ON public.foto_misure;
CREATE POLICY "Professionista inserisce le proprie misure"
  ON public.foto_misure
  FOR INSERT
  TO authenticated
  WITH CHECK (
    patient_id IN (
      SELECT p.id FROM public.patients p
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Professionista aggiorna le proprie misure"
  ON public.foto_misure;
CREATE POLICY "Professionista aggiorna le proprie misure"
  ON public.foto_misure
  FOR UPDATE
  TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    patient_id IN (
      SELECT p.id FROM public.patients p
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Professionista cancella le proprie misure"
  ON public.foto_misure;
CREATE POLICY "Professionista cancella le proprie misure"
  ON public.foto_misure
  FOR DELETE
  TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p
      JOIN public.professionals pr ON pr.id = p.professional_id
      WHERE pr.user_id = auth.uid()
    )
  );
