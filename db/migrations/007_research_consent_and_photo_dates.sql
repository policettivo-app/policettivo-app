-- Migration 007: Consenso ricerca scientifica + data scatto foto posturale
-- Run in Supabase SQL editor

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS consenso_ricerca      boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS consenso_ricerca_data timestamptz;

ALTER TABLE visit_photos
  ADD COLUMN IF NOT EXISTS data_scatto timestamptz DEFAULT now();
