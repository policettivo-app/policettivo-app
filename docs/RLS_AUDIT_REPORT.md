# RLS AUDIT REPORT — Policettivo®
Data: 2026-05-16  
Versione: 1.0  
Stato RLS attuale: **DISABILITATO** (tutte le tabelle)

---

## 0. Riepilogo Esecutivo

L'app Policettivo usa Supabase con **RLS completamente disabilitato**. Tutta la
sicurezza dipende da filtri manuali lato client (`professional_id`, `patient_id`).
Sono stati identificati **10 RED FLAG** di cui **4 CRITICI** che, senza RLS,
espongono dati cross-tenant in produzione.

**Due modelli di accesso coesistono:**

| Attore | Meccanismo | Stato sicurezza |
|---|---|---|
| Professionista (auth) | Query client-side dirette | Dipende da filtri manuali — RLS assente |
| Paziente (anonimo) | RPC SECURITY DEFINER + token | ✅ Già sicuro |
| Admin (email hardcoded) | Query globali su admin.html | ⚠️ Nessun check di ruolo |
| Webhook WooCommerce | API server-side con SERVICE_KEY | ✅ Corretto |

---

## 1. Helper Functions Necessarie

Prima di creare qualsiasi policy, installare questi helper in Supabase SQL Editor:

```sql
-- Converte auth.uid() → professionals.id
-- Usata come shortcut in tutte le policy
CREATE OR REPLACE FUNCTION auth.uid_to_prof_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id FROM public.professionals WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Verifica che un patient appartiene al professionista corrente
CREATE OR REPLACE FUNCTION auth.owns_patient(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = p_patient_id
      AND professional_id = auth.uid_to_prof_id()
  );
$$;

-- Verifica che una visit appartiene al professionista corrente
CREATE OR REPLACE FUNCTION auth.owns_visit(p_visit_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.visits v
    JOIN public.patients p ON p.id = v.patient_id
    WHERE v.id = p_visit_id
      AND p.professional_id = auth.uid_to_prof_id()
  );
$$;

-- Controlla se l'utente corrente è l'admin di sistema
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT email = 'appuntamentimft@gmail.com'
  FROM auth.users
  WHERE id = auth.uid();
$$;
```

---

## 2. Tabella per Tabella

---

### 2.1 `patients`

**Uso:** ✅ Attivamente usata — tabella centrale dell'app  
**File che la usano:** paziente.html, dashboard.html, admin.html, disegno.html,
diario-sedute.html, diario-sedute-v2.html, diario.html, monitoraggio.html,
valutazione-posturale.html, video-esercizio.html, visite.html,
assegna-protocollo.html, comparazione.html, scheda-pdf.html, console-nav.js,
api/admin-delete-user.js

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | paziente.html:1319 | `eq id` |
| SELECT | dashboard.html:885 | `eq professional_id, eq stato='attivo'` |
| SELECT | admin.html:231 | **NESSUNO** ← RED FLAG |
| SELECT | admin.html:232 | **NESSUNO** ← RED FLAG |
| SELECT | console-nav.js:234 | **NESSUNO** ← RED FLAG |
| SELECT | disegno.html:174 | `eq id` |
| SELECT | valutazione-posturale.html:633 | `eq id` |
| INSERT | dashboard.html:1086 | — |
| UPDATE | paziente.html:1433 | `eq id` |
| UPDATE | paziente.html:1569 | `eq id` (foto_url) |
| UPDATE | paziente.html:1692 | `eq id` (note_cliniche) |
| DELETE | paziente.html:1449 | `eq id` |

**Accesso pubblico:** ❌ No — pazienti accedono via RPC `get_patient_by_token`
(esclude campi sensibili: access_token, professional_id, email, telefono)

**Policy raccomandate:**

```sql
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Professionista vede solo i propri pazienti
CREATE POLICY "prof_own_patients_select"
  ON public.patients FOR SELECT
  TO authenticated
  USING (professional_id = auth.uid_to_prof_id());

-- Professionista inserisce solo per sé stesso
CREATE POLICY "prof_own_patients_insert"
  ON public.patients FOR INSERT
  TO authenticated
  WITH CHECK (professional_id = auth.uid_to_prof_id());

-- Professionista aggiorna solo i propri pazienti
CREATE POLICY "prof_own_patients_update"
  ON public.patients FOR UPDATE
  TO authenticated
  USING (professional_id = auth.uid_to_prof_id())
  WITH CHECK (professional_id = auth.uid_to_prof_id());

-- Professionista cancella solo i propri pazienti
CREATE POLICY "prof_own_patients_delete"
  ON public.patients FOR DELETE
  TO authenticated
  USING (professional_id = auth.uid_to_prof_id());

-- Admin: accesso globale
CREATE POLICY "admin_all_patients"
  ON public.patients FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

**Rischi se policy sbagliata:**
- Policy troppo permissiva → leak di tutti i pazienti cross-tenant (GDPR violation)
- Policy troppo restrittiva → `dashboard.html` non carica la lista pazienti
- `console-nav.js:234` query globale si rompe → blocca la nav bar per tutti

**Livello rischio:** 🔴 HIGH

---

### 2.2 `visits`

**Uso:** ✅ Attivamente usata  
**File che la usano:** visita.html, paziente.html, valutazione-posturale.html,
admin.html, visite.html, api/admin-delete-user.js

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | visita.html:1278 | `eq id` (per URL ?id=) |
| SELECT | visita.html:2535 | `eq patient_id` |
| SELECT | paziente.html:1114 | `eq patient_id` |
| SELECT | valutazione-posturale.html:628 | `eq id` |
| SELECT | admin.html:576 | `in patient_id` (lista calcolata) |
| INSERT | visita.html:1437 | — |
| UPDATE | visita.html:1437 | `eq id` |
| UPDATE | valutazione-posturale.html:1229 | `eq id` |
| DELETE | paziente.html:1228 | `eq id` |

**Accesso pubblico:** ❌ No — dati visita NON esposti via RPC

**Policy raccomandate:**

```sql
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

-- Legge visite tramite patient (che appartiene al proprio professionista)
CREATE POLICY "prof_own_visits_select"
  ON public.visits FOR SELECT
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_visits_insert"
  ON public.visits FOR INSERT
  TO authenticated
  WITH CHECK (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_visits_update"
  ON public.visits FOR UPDATE
  TO authenticated
  USING (auth.owns_patient(patient_id))
  WITH CHECK (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_visits_delete"
  ON public.visits FOR DELETE
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "admin_all_visits"
  ON public.visits FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

**Rischi se policy sbagliata:**
- Senza RLS: `visita.html?id=<uuid>` permette di leggere visite altrui se si conosce l'UUID
- Policy corretta: blocca automaticamente accesso cross-tenant anche per URL diretti

**Livello rischio:** 🔴 HIGH

---

### 2.3 `visit_photos`

**Uso:** ✅ Attivamente usata  
**File che la usano:** visita.html, valutazione-posturale.html, paziente.html

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | visita.html:2135 | `eq visit_id` |
| SELECT | valutazione-posturale.html:665 | `eq visit_id` |
| INSERT | visita.html:2201 | `visit_id` nel payload |
| UPDATE | valutazione-posturale.html:777 | `eq id` |
| DELETE | visita.html:2191 | `eq id` |
| DELETE | paziente.html:1227 | `eq visit_id` |

**Accesso pubblico:** ❌ No

**Policy raccomandate:**

```sql
ALTER TABLE public.visit_photos ENABLE ROW LEVEL SECURITY;

-- Accesso tramite visits → patients → professional_id
CREATE POLICY "prof_own_visit_photos_select"
  ON public.visit_photos FOR SELECT
  TO authenticated
  USING (auth.owns_visit(visit_id));

CREATE POLICY "prof_own_visit_photos_insert"
  ON public.visit_photos FOR INSERT
  TO authenticated
  WITH CHECK (auth.owns_visit(visit_id));

CREATE POLICY "prof_own_visit_photos_update"
  ON public.visit_photos FOR UPDATE
  TO authenticated
  USING (auth.owns_visit(visit_id));

CREATE POLICY "prof_own_visit_photos_delete"
  ON public.visit_photos FOR DELETE
  TO authenticated
  USING (auth.owns_visit(visit_id));
```

**Rischi se policy sbagliata:**
- Cancellazione foto altrui tramite ID diretto
- Foto cliniche (dati sensibili) esposte cross-tenant

**Livello rischio:** 🟠 HIGH (dati sanitari)

---

### 2.4 `professionals`

**Uso:** ✅ Attivamente usata  
**File che la usano:** admin.html, dashboard.html, paziente.html, visite.html,
valutazione-posturale.html, utils-premium.js, console-nav.js, diario-sedute.html,
diario-sedute-v2.html, diario.html, registrazione.html, assegna-protocollo.html,
api/_check-ai-access.js, api/webhook-woocommerce.js, api/admin-delete-user.js,
api/admin-update-piano.js

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | utils-premium.js:5 | `eq user_id` (auth.uid) |
| SELECT | admin.html:231 | **NESSUNO** ← RED FLAG |
| SELECT | admin.html:548 | **NESSUNO** ← RED FLAG |
| SELECT | admin.html:721 | **NESSUNO** ← RED FLAG |
| SELECT | console-nav.js:268 | **NESSUNO** ← RED FLAG |
| SELECT | dashboard.html:741 | `limit 1` (senza filtro user) |
| SELECT | paziente.html:1865 | `eq user_id` |
| UPDATE | admin.html:476 | `eq id` (SERVICE_KEY) |
| UPDATE | api/_check-ai-access.js:30 | `eq id` (SERVICE_KEY) |
| INSERT | registrazione.html:169 | — |
| DELETE | admin.html:512 | `eq id` (SERVICE_KEY) |

**Accesso pubblico:** ❌ No — solo professionisti autenticati

**Policy raccomandate:**

```sql
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

-- Ogni professionista vede solo se stesso
CREATE POLICY "prof_own_record_select"
  ON public.professionals FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Aggiornamento solo del proprio record
CREATE POLICY "prof_own_record_update"
  ON public.professionals FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Insert solo al momento della registrazione
CREATE POLICY "prof_insert_own"
  ON public.professionals FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin: accesso globale
CREATE POLICY "admin_all_professionals"
  ON public.professionals FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

**⚠️ Attenzione:** `dashboard.html:741` fa `.from('professionals').select('id').limit(1)`
**senza** filtro `user_id`. Con RLS attivo si risolve automaticamente — restituisce
solo il professionista corrente (row unica dopo RLS filtering).

**Rischi se policy sbagliata:**
- Admin.html smette di funzionare (usi legittimi globali)
- `console-nav.js` non carica il nome professionista

**Livello rischio:** 🔴 HIGH

---

### 2.5 `profiles`

**Uso:** ✅ Usata (dati anagrafici professionista)  
**File che la usano:** admin.html, registrazione.html, api/admin-update-profile.js,
api/admin-delete-user.js

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | admin.html:231 | JOIN da professionals (NESSUNO) |
| INSERT | registrazione.html:166 | `id = auth.uid()` |
| UPDATE | api/admin-update-profile.js:13 | `eq id` (SERVICE_KEY) |
| DELETE | api/admin-delete-user.js:32 | `eq id` (SERVICE_KEY) |

**Policy raccomandate:**

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_profile_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "own_profile_insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "own_profile_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "admin_all_profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

**Livello rischio:** 🟡 MEDIUM

---

### 2.6 `patient_protocols`

**Uso:** ✅ Attivamente usata  
**File che la usano:** monitoraggio.html, diario-sedute.html, diario-sedute-v2.html,
diario.html, dashboard.html, paziente.html, assegna-protocollo.html,
api/admin-delete-user.js

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | paziente.html:1255 | `eq patient_id` |
| SELECT | dashboard.html:1017 | `eq professional_id` |
| SELECT | assegna-protocollo.html:288 | `eq patient_id` |
| INSERT | assegna-protocollo.html:449 | — |
| UPDATE | assegna-protocollo.html:427 | `eq patient_id` |
| DELETE | dashboard.html:1095 | `eq patient_id` |

**Policy raccomandate:**

```sql
ALTER TABLE public.patient_protocols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prof_own_protocols_select"
  ON public.patient_protocols FOR SELECT
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_protocols_insert"
  ON public.patient_protocols FOR INSERT
  TO authenticated
  WITH CHECK (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_protocols_update"
  ON public.patient_protocols FOR UPDATE
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_protocols_delete"
  ON public.patient_protocols FOR DELETE
  TO authenticated
  USING (auth.owns_patient(patient_id));
```

**Livello rischio:** 🟡 MEDIUM

---

### 2.7 `patient_protocol_exercises`

**Uso:** ✅ Attivamente usata  
**File che la usano:** admin.html, dashboard.html, paziente.html, assegna-protocollo.html,
api/admin-delete-user.js

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | paziente.html:1272 | `eq patient_protocol_id` |
| SELECT | assegna-protocollo.html:310 | `eq patient_protocol_id` |
| INSERT | assegna-protocollo.html:440 | — |
| DELETE | admin.html:504 | `eq patient_protocol_id` |
| DELETE | assegna-protocollo.html:435 | `eq patient_protocol_id` |

**Policy raccomandate:**

```sql
ALTER TABLE public.patient_protocol_exercises ENABLE ROW LEVEL SECURITY;

-- Accesso tramite join patient_protocols → patient_id → professional_id
CREATE POLICY "prof_own_protocol_exercises_select"
  ON public.patient_protocol_exercises FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patient_protocols pp
      WHERE pp.id = patient_protocol_id
        AND auth.owns_patient(pp.patient_id)
    )
  );

CREATE POLICY "prof_own_protocol_exercises_insert"
  ON public.patient_protocol_exercises FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patient_protocols pp
      WHERE pp.id = patient_protocol_id
        AND auth.owns_patient(pp.patient_id)
    )
  );

CREATE POLICY "prof_own_protocol_exercises_delete"
  ON public.patient_protocol_exercises FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patient_protocols pp
      WHERE pp.id = patient_protocol_id
        AND auth.owns_patient(pp.patient_id)
    )
  );
```

**Livello rischio:** 🟡 MEDIUM

---

### 2.8 `exercises`

**Uso:** ✅ Usata (catalogo esercizi)  
**File che la usano:** assegna-protocollo.html

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | assegna-protocollo.html:192 | `eq active=true, eq fonte='policettivo'` |

**Natura:** Dati di sistema condivisi — read-only per tutti i professionisti autenticati

**Policy raccomandate:**

```sql
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- Tutti gli autenticati leggono il catalogo
CREATE POLICY "authenticated_read_exercises"
  ON public.exercises FOR SELECT
  TO authenticated
  USING (true);

-- Solo admin gestisce il catalogo
CREATE POLICY "admin_manage_exercises"
  ON public.exercises FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

**Livello rischio:** 🟢 LOW

---

### 2.9 `exercise_videos`

**Uso:** ✅ Attivamente usata  
**File che la usano:** video-esercizio.html, assegna-protocollo.html,
api/admin-delete-user.js

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | video-esercizio.html:381 | `eq patient_id` |
| SELECT | assegna-protocollo.html:210 | `eq patient_id` |
| INSERT | video-esercizio.html:363 | — |
| UPDATE | assegna-protocollo.html:442 | `eq protocol_id` |
| DELETE | video-esercizio.html:419 | `eq id` (senza verifica ownership) |

**Policy raccomandate:**

```sql
ALTER TABLE public.exercise_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prof_own_exercise_videos_select"
  ON public.exercise_videos FOR SELECT
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_exercise_videos_insert"
  ON public.exercise_videos FOR INSERT
  TO authenticated
  WITH CHECK (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_exercise_videos_update"
  ON public.exercise_videos FOR UPDATE
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_exercise_videos_delete"
  ON public.exercise_videos FOR DELETE
  TO authenticated
  USING (auth.owns_patient(patient_id));
```

**Livello rischio:** 🟡 MEDIUM

---

### 2.10 `exercise_steps`

**Uso:** ❌ Non utilizzata — nessuna query trovata nel codebase  
**Accesso pubblico:** N/A

**Policy raccomandate:**

```sql
ALTER TABLE public.exercise_steps ENABLE ROW LEVEL SECURITY;

-- Blocca tutto per ora (tabella non in uso)
-- Se usata in futuro: read-only come exercises
CREATE POLICY "authenticated_read_exercise_steps"
  ON public.exercise_steps FOR SELECT
  TO authenticated
  USING (true);
```

**Livello rischio:** 🟢 LOW (tabella inattiva)

---

### 2.11 `therapy_sessions`

**Uso:** ✅ Attivamente usata  
**File che la usano:** diario-sedute.html, diario-sedute-v2.html, diario.html,
console-nav.js, paziente.html, rpc_patient_functions.sql

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | diario-sedute.html:205 | `eq patient_id` |
| SELECT | console-nav.js:275 | `eq patient_id` |
| SELECT (RPC) | rpc_patient_functions.sql | token validation |
| INSERT | diario.html:396 | — |
| UPDATE | diario.html:482 | `eq patient_id` |
| DELETE | diario-sedute.html:252 | `eq id` |

**Accesso pubblico:** ✅ Sì, tramite RPC `get_patient_sessions` e `save_therapy_session`

**Policy raccomandate:**

```sql
ALTER TABLE public.therapy_sessions ENABLE ROW LEVEL SECURITY;

-- Professionista: tramite patient ownership
CREATE POLICY "prof_own_therapy_sessions_select"
  ON public.therapy_sessions FOR SELECT
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_therapy_sessions_insert"
  ON public.therapy_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_therapy_sessions_update"
  ON public.therapy_sessions FOR UPDATE
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_therapy_sessions_delete"
  ON public.therapy_sessions FOR DELETE
  TO authenticated
  USING (auth.owns_patient(patient_id));

-- RPC functions usano SECURITY DEFINER → bypass RLS automatico (già corretto)
```

**Livello rischio:** 🟡 MEDIUM

---

### 2.12 `diary_entries`

**Uso:** ✅ Attivamente usata  
**File che la usano:** monitoraggio.html, admin.html, dashboard.html, paziente.html,
rpc_patient_functions.sql, api/admin-delete-user.js

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | monitoraggio.html:131 | `eq patient_id` |
| SELECT | admin.html:234 | **NESSUNO** ← RED FLAG |
| SELECT | admin.html:577 | `in patient_id` |
| SELECT | **dashboard.html:886** | **`eq completato=true` SENZA professional_id** ← RED FLAG CRITICO |
| SELECT (RPC) | rpc_patient_functions.sql | token validation |
| DELETE | dashboard.html:1094 | `eq patient_id` |
| DELETE | paziente.html:1447 | `eq patient_id` |

**Accesso pubblico:** ✅ Sì, tramite RPC `get_diary_entries` e `save_diary_entry`

**Policy raccomandate:**

```sql
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prof_own_diary_entries_select"
  ON public.diary_entries FOR SELECT
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_diary_entries_insert"
  ON public.diary_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_diary_entries_update"
  ON public.diary_entries FOR UPDATE
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_diary_entries_delete"
  ON public.diary_entries FOR DELETE
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "admin_all_diary_entries"
  ON public.diary_entries FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

**⚠️ Impatto diretto su dashboard.html:886:** Con RLS attivo, la query globale
restituirà solo le entry dei pazienti del professionista corrente — comportamento
corretto automaticamente, senza modificare il codice frontend.

**Livello rischio:** 🔴 HIGH

---

### 2.13 `clinical_notes`

**Uso:** ✅ Attivamente usata  
**File che la usano:** paziente.html

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | paziente.html:2691 | `eq patient_id` |
| SELECT | paziente.html:2820 | `eq patient_id` |
| INSERT | paziente.html:2664 | — |
| UPDATE | paziente.html:2992 | `eq patient_id` |
| DELETE | paziente.html:3000 | `eq patient_id` |

**Policy raccomandate:**

```sql
ALTER TABLE public.clinical_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prof_own_clinical_notes_select"
  ON public.clinical_notes FOR SELECT
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_clinical_notes_insert"
  ON public.clinical_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_clinical_notes_update"
  ON public.clinical_notes FOR UPDATE
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_clinical_notes_delete"
  ON public.clinical_notes FOR DELETE
  TO authenticated
  USING (auth.owns_patient(patient_id));
```

**Livello rischio:** 🔴 HIGH (note cliniche = dati sanitari sensibili)

---

### 2.14 `clinical_documents`

**Uso:** ✅ Usata (upload documenti paziente)  
**File che la usano:** paziente.html

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | paziente.html:1886 | `eq patient_id` |
| INSERT | paziente.html:1866 | — |
| DELETE | paziente.html:1926 | `eq id` (senza verifica ownership) ← attenzione |

**Policy raccomandate:**

```sql
ALTER TABLE public.clinical_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prof_own_clinical_documents_select"
  ON public.clinical_documents FOR SELECT
  TO authenticated
  USING (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_clinical_documents_insert"
  ON public.clinical_documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.owns_patient(patient_id));

CREATE POLICY "prof_own_clinical_documents_delete"
  ON public.clinical_documents FOR DELETE
  TO authenticated
  USING (auth.owns_patient(patient_id));
```

**Livello rischio:** 🟠 HIGH (documenti sanitari)

---

### 2.15 `invites`

**Uso:** ✅ Usata (inviti registrazione)  
**File che la usano:** admin.html, registrazione.html

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | admin.html:233 | `eq usato=false` |
| SELECT | registrazione.html:108 | `eq token, eq usato=false` |
| INSERT | admin.html:448 | — |
| UPDATE | registrazione.html:173 | `eq token` |
| DELETE | admin.html:470 | `eq id` |

**Accesso pubblico:** ✅ Sì — `registrazione.html` legge inviti per validare token

**Policy raccomandate:**

```sql
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Chiunque (anche non autenticato) può validare un token di invito
CREATE POLICY "anon_validate_invite"
  ON public.invites FOR SELECT
  TO anon, authenticated
  USING (usato = false);

-- Chiunque in fase di registrazione può marcare l'invito come usato
CREATE POLICY "anon_use_invite"
  ON public.invites FOR UPDATE
  TO anon, authenticated
  USING (usato = false)
  WITH CHECK (usato = true);

-- Solo admin gestisce gli inviti
CREATE POLICY "admin_manage_invites"
  ON public.invites FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

**Livello rischio:** 🟡 MEDIUM

---

### 2.16 `session_logs`

**Uso:** ✅ Usata (log sessioni giornaliere)  
**File che la usano:** dashboard.html

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| SELECT | **dashboard.html:1018** | **`gte started_at=today` SENZA professional_id** ← RED FLAG |

**Policy raccomandate:**

```sql
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

-- Ogni professionista vede solo i propri log
CREATE POLICY "prof_own_session_logs_select"
  ON public.session_logs FOR SELECT
  TO authenticated
  USING (professional_id = auth.uid_to_prof_id());

CREATE POLICY "prof_own_session_logs_insert"
  ON public.session_logs FOR INSERT
  TO authenticated
  WITH CHECK (professional_id = auth.uid_to_prof_id());

CREATE POLICY "admin_all_session_logs"
  ON public.session_logs FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

**Livello rischio:** 🟡 MEDIUM

---

### 2.17 `subscriptions`

**Uso:** ✅ Usata (solo webhook)  
**File che la usano:** api/webhook-woocommerce.js (SERVICE_KEY)

**Pattern di accesso:**

| Operazione | File:Riga | Filtri usati |
|---|---|---|
| INSERT | api/webhook-woocommerce.js:59 | — (SERVICE_KEY, server-side) |

**Note:** Nessun accesso client-side. SERVICE_KEY lato server bypassa RLS comunque.

**Policy raccomandate:**

```sql
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Nessun accesso diretto lato client
-- Il webhook usa SERVICE_KEY che bypassa RLS
-- Policy placeholder per bloccare tutto:
CREATE POLICY "admin_only_subscriptions"
  ON public.subscriptions FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

**Livello rischio:** 🟢 LOW (accesso solo via SERVICE_KEY server-side)

---

### 2.18 `protocol_templates`

**Uso:** ❌ Non utilizzata — nessuna query trovata  

**Policy raccomandate:**

```sql
ALTER TABLE public.protocol_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_templates"
  ON public.protocol_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_manage_templates"
  ON public.protocol_templates FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

**Livello rischio:** 🟢 LOW (tabella inattiva)

---

### 2.19 `protocol_template_exercises`

**Uso:** ❌ Non utilizzata — nessuna query trovata  

**Policy raccomandate:**

```sql
ALTER TABLE public.protocol_template_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_template_exercises"
  ON public.protocol_template_exercises FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_manage_template_exercises"
  ON public.protocol_template_exercises FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

**Livello rischio:** 🟢 LOW (tabella inattiva)

---

## 3. Casi Speciali

### 3.1 Token Paziente Anonimo

I pazienti accedono al portale tramite link univoco con `access_token` (UUID v4).
Il flusso è implementato in `rpc_patient_functions.sql` con 7 RPC functions.

**Analisi sicurezza RPC:**

| Funzione | Operazione | Sicurezza |
|---|---|---|
| `get_patient_by_token` | SELECT patients | ✅ Valida token, esclude campi sensibili |
| `get_protocol_data` | SELECT protocols+exercises | ✅ Valida token |
| `get_patient_sessions` | SELECT therapy_sessions | ✅ Valida token |
| `get_diary_entries` | SELECT diary_entries | ✅ Valida token |
| `save_diary_entry` | INSERT/UPDATE diary_entries | ✅ Valida token |
| `save_therapy_session` | INSERT therapy_sessions | ✅ Valida token |
| `update_session_feedback` | UPDATE therapy_sessions | ✅ Valida token |

**Tutte le funzioni:**
- Usano `SECURITY DEFINER` → bypassa RLS (corretto per accesso anonimo controllato)
- Iniziano con `REVOKE ALL ON FUNCTION ... FROM PUBLIC` poi `GRANT EXECUTE TO anon`
- Validano il formato token prima di qualsiasi query
- Non espongono: `access_token`, `professional_id`, `email`, `telefono`, `note_cliniche`

**Campi esclusi da `get_patient_by_token`:**
```
access_token, professional_id, email, telefono, codice_fiscale,
foto_url, foto_annotazioni, note_cliniche, configurazione_default
```

**Raccomandazione:** ✅ Nessuna modifica necessaria — il modello RPC è già corretto.

---

### 3.2 Admin di Sistema

**Identificazione:** `email = 'appuntamentimft@gmail.com'` (hardcoded in più file)

**File con controllo admin:**
- `admin.html` — non ha verifica role all'avvio
- `paziente.html:1449` — `_myEmail !== 'appuntamentimft@gmail.com'` per bypass delete
- `api/_check-admin-auth.js` — verifica email per API admin

**Problema:** `admin.html` è accessibile a qualsiasi professionista autenticato.
Non c'è `router.push('/dashboard')` se l'utente non è admin.

**Raccomandazione:**

```sql
-- Alternativa: aggiungi colonna is_admin a professionals
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Oppure usa la helper function che controlla l'email:
-- auth.is_admin() → già definita nella sezione Helper Functions
```

In `admin.html` aggiungere all'inizio della funzione `init()`:
```javascript
if (session.user.email !== 'appuntamentimft@gmail.com') {
  window.location.replace('dashboard.html')
  return
}
```

---

### 3.3 Webhook WooCommerce

**File:** `api/webhook-woocommerce.js`

**Flusso:**
1. WooCommerce invia POST con payload ordine
2. Webhook verifica `WEBHOOK_SECRET` (env var)
3. Usa `SERVICE_KEY` per lookup professionista via email
4. Aggiorna `professionals.piano` e crea record in `subscriptions`

**Tabelle toccate:**
- `professionals` — UPDATE piano, premium_scadenza (SERVICE_KEY)
- `subscriptions` — INSERT record (SERVICE_KEY)

**Sicurezza:**
- ✅ `SERVICE_KEY` in variabile d'ambiente server-side (`process.env.SUPABASE_SERVICE_KEY`)
- ✅ Verifica `WEBHOOK_SECRET` prima di qualsiasi operazione
- ✅ SERVICE_KEY bypassa RLS → non influenzato dall'attivazione delle policy

**Raccomandazione:** ✅ Nessuna modifica necessaria per RLS FASE 2.

---

## 4. Ordine di Attivazione Consigliato

Attivare RLS progressivamente, dalla tabella meno rischiosa alla più critica.
Testare ogni step prima di procedere.

| Step | Tabella | Motivo ordine |
|---|---|---|
| 1 | `exercise_steps` | Tabella inattiva — zero impatto |
| 2 | `protocol_templates` | Tabella inattiva — zero impatto |
| 3 | `protocol_template_exercises` | Tabella inattiva — zero impatto |
| 4 | `subscriptions` | Solo webhook SERVICE_KEY — zero impatto frontend |
| 5 | `exercises` | Read-only globale — policy permissiva, basso rischio |
| 6 | `invites` | Flusso circoscritto (registrazione) — facile testare |
| 7 | `profiles` | Pochi accessi, accesso tramite id |
| 8 | `session_logs` | Usata solo in dashboard:1018 — 1 file da testare |
| 9 | `exercise_videos` | Scope limitato a 2 file |
| 10 | `patient_protocol_exercises` | Join da patient_protocols — 2 file |
| 11 | `patient_protocols` | Più file ma pattern uniforme |
| 12 | `therapy_sessions` | RPC già sicure, solo 3 file frontend |
| 13 | `diary_entries` | RED FLAG critico su dashboard — testare bene |
| 14 | `clinical_documents` | Scope limitato a paziente.html |
| 15 | `clinical_notes` | Scope limitato a paziente.html |
| 16 | `visit_photos` | Join complessa — testare visita.html e vp.html |
| 17 | `visits` | Core dell'app — testare tutti i flussi |
| 18 | `professionals` | Impatta utils-premium.js e console-nav — alto rischio regressioni |
| 19 | `patients` | Tabella centrale — attivare per ultima, testare tutto |

---

## 5. Stima Rischio Finale

| Tabella | Rischio | Cosa si rompe se policy sbagliata |
|---|---|---|
| `patients` | 🔴 HIGH | Dashboard senza pazienti; o leak di tutti i pazienti globali |
| `visits` | 🔴 HIGH | Visita non si carica; o accesso cross-tenant via URL |
| `diary_entries` | 🔴 HIGH | Dashboard.html:886 smette di mostrare task; o leak globale |
| `clinical_notes` | 🔴 HIGH | Sezione note cliniche vuota in paziente.html |
| `professionals` | 🔴 HIGH | utils-premium.js non carica il piano; console-nav rotta |
| `visit_photos` | 🟠 HIGH | Foto non si caricano; upload rotto |
| `clinical_documents` | 🟠 HIGH | Documenti non visibili in paziente.html |
| `exercise_videos` | 🟡 MEDIUM | video-esercizio.html rotto |
| `patient_protocols` | 🟡 MEDIUM | assegna-protocollo.html rotto |
| `patient_protocol_exercises` | 🟡 MEDIUM | Esercizi protocollo non visibili |
| `therapy_sessions` | 🟡 MEDIUM | diario-sedute.html rotto |
| `session_logs` | 🟡 MEDIUM | Conteggio sedute odierne sbagliato in dashboard |
| `invites` | 🟡 MEDIUM | Registrazione rotta |
| `profiles` | 🟡 MEDIUM | Admin non vede i profili |
| `exercises` | 🟢 LOW | Catalogo esercizi vuoto in assegna-protocollo |
| `subscriptions` | 🟢 LOW | Nessun impatto (solo webhook SERVICE_KEY) |
| `exercise_steps` | 🟢 LOW | Tabella inattiva |
| `protocol_templates` | 🟢 LOW | Tabella inattiva |
| `protocol_template_exercises` | 🟢 LOW | Tabella inattiva |

---

## 6. RED FLAG Sicurezza Già Presenti Oggi

### 🔴 RED FLAG #1 — CRITICO
**`dashboard.html:886`** — Query globale su `diary_entries` senza filtro `professional_id`
```javascript
// PERICOLOSO — legge diary entries di TUTTI i pazienti di TUTTI i professionisti
.from('diary_entries')
.select('patient_id, data, completato')
.eq('completato', true)
.limit(200)
```
**Impatto:** Un professionista vede indirettamente attività di pazienti non suoi.

---

### 🔴 RED FLAG #2 — CRITICO
**`admin.html:232`** — SELECT globale su `patients` senza filtri
```javascript
// PERICOLOSO — restituisce ID di tutti i pazienti del sistema
.from('patients').select('id')
```
**Contesto:** admin.html non ha verifica di ruolo admin all'avvio.

---

### 🔴 RED FLAG #3 — CRITICO
**`admin.html:231`** — SELECT `*, profiles(*)` su `professionals` senza filtri
```javascript
// PERICOLOSO — nome, cognome, telefono di TUTTI i professionisti
.from('professionals').select('*, profiles(*)')
```

---

### 🔴 RED FLAG #4 — CRITICO
**`dashboard.html:1018`** — Query globale su `session_logs` senza filtro
```javascript
// PERICOLOSO — conteggia sessioni di TUTTI i professionisti oggi
.from('session_logs').select('*', { count: 'exact', head: true })
.gte('started_at', today)
```

---

### 🟠 RED FLAG #5 — ALTO
**`console-nav.js:234`** — SELECT su `patients` senza filtro
```javascript
// Carica pazienti senza professional_id filter (verificare riga esatta)
.from('patients').select(...)
```
**Impatto:** La nav bar carica pazienti non del professionista corrente.

---

### 🟠 RED FLAG #6 — ALTO
**`admin.html:548, 721, 722, 874`** — Multiple SELECT globali su `professionals`
**Impatto:** Più funzioni admin leggono l'intera tabella professionals.

---

### 🟠 RED FLAG #7 — ALTO
**`visita.html`** — Carica visita via URL `?id=` senza verifica ownership
```javascript
// patientId e visitId vengono da URL params
const params = new URLSearchParams(window.location.search)
const visitId = params.get('id')
// Poi: .from('visits').select(...).eq('id', visitId)
// NESSUNA verifica che la visita appartenga al professionista loggato
```
**Impatto:** Conoscendo un UUID di visita, qualsiasi professionista può accedere.

---

### 🟠 RED FLAG #8 — ALTO
**`admin.html`** — Nessuna verifica di ruolo admin all'avvio
**Impatto:** Qualsiasi professionista autenticato può navigare ad `admin.html` e
accedere a query globali (patients, professionals, diary_entries).

---

### 🟡 RED FLAG #9 — MEDIO
**`admin.html:234`** — SELECT su `diary_entries` senza filtri
```javascript
.from('diary_entries').select('id')  // Legge tutti gli ID — quantifica leak
```

---

### 🟡 RED FLAG #10 — MEDIO
**`patients.access_token`** — esposto via SELECT * client-side
Le RPC functions lo escludono correttamente, ma query client-side
tipo `paziente.html:1319` con `.select('*')` potrebbero includerlo.
**Mitigazione:** Specificare sempre colonne esplicitamente, mai SELECT *.

---

*Audit completato — 19 tabelle, ~120 query mappate, 10 RED FLAG identificati.*
