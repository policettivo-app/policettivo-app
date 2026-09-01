/* ===================================================================
   api/analisi-documento.js — referti-letti-v1 (1 settembre 2026)

   LEGGE UN DOCUMENTO GIA' IN CARTELLA E SALVA QUELLO CHE C'E' SCRITTO.

   PERCHE' NON BASTAVA /api/analisi-referto.
   Quello serve a un altro scopo: guarda un'immagine e ne ricava i dati
   ANAGRAFICI per precompilare la scheda del paziente. Il risultato non
   viene salvato da nessuna parte, e il prompt cerca nome, cognome e
   codice fiscale. Qui serve il contrario: il documento e' gia' in
   cartella, il paziente si sa gia', e quello che interessa e' il
   CONTENUTO CLINICO — e va conservato.
   Due scopi diversi, due prompt diversi: tenerli nello stesso endpoint
   avrebbe voluto dire farli divergere a ogni modifica.

   PERCHE' IL FILE LO SCARICA IL SERVER.
   clinical-docs e' un bucket PRIVATO. Farsi mandare il base64 dal
   browser significherebbe far viaggiare due volte un documento clinico
   e fidarsi di quello che arriva. Qui il server prende il file da
   Storage con la service key, dopo aver verificato che quel documento
   appartenga davvero a un paziente di CHI LO STA CHIEDENDO.

   ⚠️ QUESTO ENDPOINT NON DECIDE NIENTE E NON DIAGNOSTICA.
   Registra cosa il documento dice, con le frasi testuali a supporto. Il
   confronto con le controindicazioni delle terapie e' un passo separato,
   e arrivera' quando l'elenco sara' stato riletto dal professionista.
   Un avviso clinico che non si puo' ricondurre a una riga del referto
   non e' verificabile, e non deve entrare in un documento firmato.
   =================================================================== */
import { createClient } from '@supabase/supabase-js'
import { checkAIAccess } from './_check-ai-access.js'

const MAX_BYTE = 12 * 1024 * 1024   // oltre, l'API immagini/PDF rifiuta

const PROMPT = `Sei un assistente che LEGGE documenti clinici italiani per un fisioterapista. Il tuo compito e' riportare CIO' CHE IL DOCUMENTO DICE, non interpretarlo.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"tipo_documento":"","data_documento":"","struttura":"","sintesi":"","diagnosi":[],"condizioni_rilevanti":[],"dispositivi_impiantati":[],"farmaci":[],"esami_alterati":[],"citazioni":[],"leggibile":true}

Regole, in ordine di importanza:
1. NON inventare e NON dedurre. Se una cosa non e' scritta nel documento, non esiste. Meglio un elenco vuoto che un elemento supposto.
2. NON fare diagnosi tue e NON dare indicazioni terapeutiche. Riporta solo quello che il documento riferisce.
3. citazioni: per OGNI voce che metti in diagnosi, condizioni_rilevanti, dispositivi_impiantati, farmaci o esami_alterati, aggiungi la frase testuale del documento da cui l'hai presa, copiata alla lettera. Se non riesci a citarla, togli la voce.
4. condizioni_rilevanti: solo condizioni esplicitamente riportate che un fisioterapista deve conoscere prima di trattare (per esempio gravidanza, neoplasia, epilessia, trombosi, infezione in atto, alterazioni della coagulazione, alterata sensibilita'). Usa le parole del documento.
5. dispositivi_impiantati: pacemaker, defibrillatori, pompe, protesi, mezzi di sintesi, e simili, solo se citati.
6. farmaci: come sono scritti, con dosaggio se presente.
7. data_documento: formato YYYY-MM-DD se leggibile, altrimenti stringa vuota.
8. sintesi: 2-4 righe in italiano su cosa dice il documento, senza aggiungere nulla.
9. leggibile: false se il documento e' illeggibile, vuoto o non e' un documento clinico. In quel caso lascia gli altri campi vuoti e spiega in sintesi perche'.`

export default async function handler (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { document_id } = req.body || {}
  if (!document_id) return res.status(400).json({ error: 'document_id mancante' })

  // 1) Chi sei, e puoi usare l'AI?
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Token mancante' })

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await anon.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Non autenticato' })

  const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // 2) Questo documento e' di un TUO paziente?
  //    Senza questo controllo, un document_id indovinato aprirebbe il
  //    referto di un paziente di un altro professionista.
  const { data: doc, error: docErr } = await svc
    .from('clinical_documents')
    .select('id, patient_id, tipo, descrizione, file_url')
    .eq('id', document_id)
    .maybeSingle()
  if (docErr || !doc) return res.status(404).json({ error: 'Documento non trovato' })

  const { data: prof } = await svc
    .from('professionals').select('id').eq('user_id', user.id).maybeSingle()
  if (!prof) return res.status(403).json({ error: 'Profilo professionista non trovato' })

  const { data: paz } = await svc
    .from('patients').select('id, professional_id').eq('id', doc.patient_id).maybeSingle()
  if (!paz || paz.professional_id !== prof.id) {
    return res.status(403).json({ error: 'Non autorizzato su questo documento' })
  }

  // 3) Il permesso AI si chiede DOPO i controlli: cosi' un tentativo non
  //    autorizzato non consuma una delle analisi del professionista.
  const access = await checkAIAccess(req)
  if (!access.ok) {
    return res.status(access.status || 403).json({ error: access.error, limitReached: access.limitReached || false })
  }

  // 4) Il file, dal bucket privato
  const percorso = percorsoDaUrl(doc.file_url)
  if (!percorso) return res.status(422).json({ error: 'Documento salvato fuori dall\'archivio: non si può leggere da qui.' })

  const { data: blob, error: dlErr } = await svc.storage.from('clinical-docs').download(percorso)
  if (dlErr || !blob) return res.status(404).json({ error: 'File non trovato nell\'archivio: ' + (dlErr?.message || '') })

  const buf = Buffer.from(await blob.arrayBuffer())
  if (buf.length > MAX_BYTE) {
    return res.status(413).json({ error: 'Documento troppo grande da leggere (' + Math.round(buf.length / 1048576) + ' MB). Il limite è 12 MB.' })
  }

  const mime = tipoDaPercorso(percorso, blob.type)
  const base64 = buf.toString('base64')

  // Un PDF va mandato come «document», un'immagine come «image»: sono due
  // blocchi diversi, e sbagliarli fa rispondere all'API un errore di
  // formato che a schermo sembrerebbe «l'AI non capisce il referto».
  const contenuto = (mime === 'application/pdf')
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mime,              data: base64 } }

  // 5) La lettura
  let dati = null, grezzo = ''
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: [contenuto, { type: 'text', text: PROMPT }] }]
      })
    })
    const j = await r.json()
    if (j.error) return res.status(502).json({ error: 'Lettura non riuscita: ' + (j.error.message || 'errore del servizio AI') })
    grezzo = j.content?.[0]?.text || ''
    const m = grezzo.match(/\{[\s\S]*\}/)
    if (m) { try { dati = JSON.parse(m[0]) } catch (e) { dati = null } }
  } catch (e) {
    return res.status(502).json({ error: 'Lettura non riuscita: ' + (e.message || e) })
  }

  if (!dati) {
    // Non si salva niente: un estratto che non si e' capito e' peggio di
    // nessun estratto, perche' il documento risulterebbe «letto».
    return res.status(502).json({ error: 'La risposta della lettura non è stata capita. Riprova; se succede ancora il documento potrebbe non essere leggibile.' })
  }

  const rilievi = normalizza(dati)
  const estratto = testoLeggibile(rilievi)

  const { error: upErr } = await svc.from('clinical_documents')
    .update({ estratto_ai: estratto, estratto_ai_il: new Date().toISOString(), rilievi })
    .eq('id', document_id)

  if (upErr) {
    // ⚠️ Se la 040 non e' stata lanciata l'errore e' 42703. Va detto per
    // nome, se no il sintomo a schermo e' «non funziona» e si cerca la
    // causa nel posto sbagliato.
    const manca = upErr.code === '42703' || /estratto_ai|rilievi/.test(String(upErr.message || ''))
    return res.status(500).json({
      error: manca
        ? 'Il documento è stato letto ma non si può salvare: manca la migration 040 (clinical_documents.estratto_ai). Esegui 040_documenti_letti.sql in Supabase.'
        : 'Documento letto, ma il salvataggio non è riuscito: ' + upErr.message,
      rilievi, estratto, non_salvato: true
    })
  }

  return res.status(200).json({ ok: true, rilievi, estratto, ai_uses: access.ai_uses })
}

/* clinical_documents.file_url e' un URL pubblico (di un bucket privato:
   non si apre, e' il difetto noto). Il percorso dentro il bucket e'
   l'unica cosa che serve, e sta dopo /clinical-docs/. */
function percorsoDaUrl (u) {
  if (!u || typeof u !== 'string') return null
  const i = u.indexOf('/clinical-docs/')
  if (i < 0) return null
  return decodeURIComponent(u.slice(i + '/clinical-docs/'.length).split('?')[0]) || null
}

function tipoDaPercorso (p, tipoBlob) {
  const est = String(p).toLowerCase().split('.').pop()
  if (est === 'pdf')  return 'application/pdf'
  if (est === 'png')  return 'image/png'
  if (est === 'webp') return 'image/webp'
  if (est === 'gif')  return 'image/gif'
  if (est === 'jpg' || est === 'jpeg') return 'image/jpeg'
  if (tipoBlob && /^(image\/|application\/pdf)/.test(tipoBlob)) return tipoBlob
  return 'image/jpeg'
}

/* Il modello puo' rispondere con una stringa dove serve un elenco, o
   saltare un campo. Qui si normalizza una volta sola: il resto dell'app
   trova sempre la stessa forma. */
function normalizza (d) {
  const lista = v => Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean)
                    : (v ? [String(v).trim()] : [])
  return {
    v: 1,
    tipo_documento:         String(d.tipo_documento || '').trim(),
    data_documento:         String(d.data_documento || '').trim(),
    struttura:              String(d.struttura || '').trim(),
    sintesi:                String(d.sintesi || '').trim(),
    diagnosi:               lista(d.diagnosi),
    condizioni_rilevanti:   lista(d.condizioni_rilevanti),
    dispositivi_impiantati: lista(d.dispositivi_impiantati),
    farmaci:                lista(d.farmaci),
    esami_alterati:         lista(d.esami_alterati),
    citazioni:              lista(d.citazioni),
    leggibile:              d.leggibile !== false
  }
}

/* Una versione a testo, cosi' l'estratto si legge anche senza aprire il
   JSON — e cosi' entra nel contesto della Sintesi AI senza doverlo
   ricostruire una seconda volta da un'altra parte. */
function testoLeggibile (r) {
  const p = []
  if (!r.leggibile) return 'Documento non leggibile. ' + (r.sintesi || '')
  if (r.tipo_documento) p.push(r.tipo_documento + (r.data_documento ? ' del ' + r.data_documento : '') + (r.struttura ? ' — ' + r.struttura : ''))
  if (r.sintesi) p.push(r.sintesi)
  if (r.diagnosi.length)               p.push('Diagnosi riportate: ' + r.diagnosi.join('; '))
  if (r.condizioni_rilevanti.length)   p.push('Condizioni rilevanti: ' + r.condizioni_rilevanti.join('; '))
  if (r.dispositivi_impiantati.length) p.push('Dispositivi impiantati: ' + r.dispositivi_impiantati.join('; '))
  if (r.farmaci.length)                p.push('Farmaci: ' + r.farmaci.join('; '))
  if (r.esami_alterati.length)         p.push('Esami alterati: ' + r.esami_alterati.join('; '))
  return p.join('\n')
}

export const _test = { percorsoDaUrl, tipoDaPercorso, normalizza, testoLeggibile }
