# Policettivo® — Test Checklist: RPC Migration

## Prima di iniziare

1. Aprire il Supabase SQL Editor per il progetto `kazlnoikvwdqwvxtigej`
2. Eseguire **tutto** il contenuto di `rpc_patient_functions.sql` (la sezione RLS commentata va lasciata commentata)
3. Verificare che tutte e 7 le funzioni siano presenti in Database → Functions

---

## Step 1 — Verifica funzioni RPC via SQL Editor

Eseguire queste query nel SQL Editor per confermare che le funzioni funzionano:

```sql
-- Sostituire con un token reale dalla tabella patients
SELECT * FROM get_patient_by_token('TOKEN_REALE_QUI');

SELECT get_protocol_data('TOKEN_REALE_QUI');

SELECT * FROM get_patient_sessions('TOKEN_REALE_QUI', NULL, 1);

SELECT * FROM get_diary_entries('TOKEN_REALE_QUI', 5);
```

**Atteso:** ciascuna query restituisce dati del paziente corretto.

---

## Step 2 — Test protocollo.html

Aprire: `https://policettivo-app.vercel.app/protocollo.html?token=TOKEN_REALE`

| Test | Atteso |
|------|--------|
| Pagina carica senza errori console | ✓ |
| Nome paziente nel titolo ("Ciao [nome]") | ✓ |
| Lista esercizi del protocollo attivo visibile | ✓ |
| Smile-card con streak mostrata | ✓ |
| Scheda feedback seduta visibile (se c'è una seduta senza feedback) | ✓ |
| Selezionare stelle e salvare feedback → messaggio "Grazie" | ✓ |
| Compilare il diario e salvare → messaggio "Salvato" | ✓ |
| Aprire Network tab → nessuna richiesta diretta a `/rest/v1/patients` o `/rest/v1/diary_entries` ecc. | ✓ solo `/rest/v1/rpc/...` |

---

## Step 3 — Test esercizio.html

Aprire: `https://policettivo-app.vercel.app/esercizio.html?token=TOKEN_REALE`

| Test | Atteso |
|------|--------|
| Pagina carica, mostra primo esercizio | ✓ |
| Timer funziona | ✓ |
| Completare tutti gli esercizi → overlay "Completato!" con streak | ✓ |
| Console: nessun errore 403/400 da Supabase | ✓ |
| Network: `/rest/v1/rpc/save_diary_entry` chiamata con 200 | ✓ |
| Premere "Dolore" → confermare → torna a protocollo.html | ✓ |
| Network: `/rest/v1/rpc/save_diary_entry` con `dolore:7, completato:false` | ✓ |
| Token inesistente → redirect a `protocollo.html` | ✓ |
| Nessun protocollo attivo → redirect a `protocollo.html` | ✓ |

---

## Step 4 — Test rapida.html

Aprire: `https://policettivo-app.vercel.app/rapida.html?token=TOKEN_REALE`

| Test | Atteso |
|------|--------|
| Lista esercizi caricata | ✓ |
| "Completa seduta" → overlay completamento | ✓ |
| "Salta e completa" → overlay completamento | ✓ |
| Network: `/rest/v1/rpc/save_diary_entry` con 200 | ✓ |

---

## Step 5 — Test pagella.html

Aprire: `https://policettivo-app.vercel.app/pagella.html?token=TOKEN_REALE`

| Test | Atteso |
|------|--------|
| Pagina carica con statistiche | ✓ |
| Grafici e calendario visibili | ✓ |
| Streak calcolata correttamente | ✓ |

---

## Step 6 — Test consenso.html

Aprire: `https://policettivo-app.vercel.app/consenso.html?token=TOKEN_REALE`

| Test | Atteso |
|------|--------|
| Pagina consenso visibile | ✓ |
| Checkbox tutti spuntati → bottone abilitato | ✓ |
| Click "Accetto" → redirect a `protocollo.html?token=TOKEN_REALE` | ✓ |
| Riaprire consenso.html → redirect immediato (già accettato in localStorage) | ✓ |

---

## Step 7 — Test sicurezza: nessun accesso diretto alle tabelle

Eseguire questi curl (o usare il browser) senza Authorization header:

```bash
# Deve tornare 200 con array vuoto [] (prima di RLS) o 401/403 (dopo RLS)
curl "https://kazlnoikvwdqwvxtigej.supabase.co/rest/v1/patients?select=*&limit=1" \
  -H "apikey: ANON_KEY"

curl "https://kazlnoikvwdqwvxtigej.supabase.co/rest/v1/diary_entries?select=*&limit=1" \
  -H "apikey: ANON_KEY"
```

**Nota:** questi test sono significativi DOPO aver abilitato RLS (Step 3 del piano di stabilizzazione). Prima di RLS, le tabelle sono ancora accessibili direttamente — ma nessuna pagina paziente le usa più.

---

## Step 8 — Test con token non valido

Aprire ciascuna pagina con `?token=token-inesistente`:

| Pagina | Atteso |
|--------|--------|
| protocollo.html | Mostra "Paziente non trovato" |
| esercizio.html | Redirect a `protocollo.html` |
| rapida.html | Redirect a `protocollo.html` |
| pagella.html | Pagina vuota (silent fail, nessun crash) |

---

## Pronto per Step 3 (RLS)

Dopo che tutti i test sopra passano:

1. Eseguire la sezione RLS di `rpc_patient_functions.sql` (togliere i commenti `/* */`)
2. Ripetere **Step 7** — questa volta le tabelle devono rispondere con array vuoto o errore auth
3. Ripetere tutti i test dei passi 2-6 — devono funzionare identici (via RPC che bypassa RLS)
