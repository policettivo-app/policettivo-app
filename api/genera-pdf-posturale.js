import { createClient } from '@supabase/supabase-js'
import { checkAIAccess } from './_check-ai-access.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { visit_id, relazione_modalita = 'singola' } = req.body
  if (!visit_id) {
    return res.status(400).json({ error: 'visit_id richiesto' })
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Token mancante' })

  // Resolve authenticated user from bearer token
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await anon.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Non autenticato' })

  const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // Load visit + verify tipo
  const { data: visit, error: visitErr } = await svc
    .from('visits')
    .select('*')
    .eq('id', visit_id)
    .maybeSingle()

  if (visitErr || !visit) return res.status(404).json({ error: 'Visita non trovata' })
  if (visit.tipo !== 'posturale') return res.status(400).json({ error: 'Questa non è una valutazione posturale' })

  // Resolve professional_id from authenticated user
  const { data: prof } = await svc
    .from('professionals')
    .select('id, logo_url, qualifica, profiles(nome, cognome)')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!prof) return res.status(403).json({ error: 'Profilo professionista non trovato' })

  // Ownership check
  if (visit.professional_id !== prof.id) {
    return res.status(403).json({ error: 'Non autorizzato' })
  }

  // Load patient + photos in parallel
  const [{ data: patient }, { data: photos }] = await Promise.all([
    svc.from('patients')
       .select('nome, cognome, codice_fiscale, data_nascita')
       .eq('id', visit.patient_id)
       .maybeSingle(),
    svc.from('visit_photos')
       .select('id, tipo, url_pubblico, note, ordine')
       .eq('visit_id', visit_id)
       .order('ordine', { ascending: true })
  ])

  const professional = {
    nome:      prof?.profiles?.nome    || '',
    cognome:   prof?.profiles?.cognome || '',
    qualifica: prof?.qualifica         || '',
    logo_url:  prof?.logo_url          || null
  }

  const systemPrompt = `Sei un fisioterapista esperto specializzato in valutazione posturale, che redige referti clinici in italiano formale. Scrivi in stile referto medico: terza persona, linguaggio tecnico-clinico, sezioni distinte secondo i piani anatomici, conciso e oggettivo. NON inventare dati che non sono presenti nel materiale fornito. Se un dato manca, ometti la sezione o scrivi "Non riportato". NON fare diagnosi mediche né prognosi vincolanti — limita a osservazioni cliniche posturali e indicazioni terapeutiche/correttive. Struttura SEMPRE la relazione nelle seguenti sezioni in ordine: 1) Quadro generale, 2) Piano Sagittale, 3) Piano Frontale, 4) Piano Posteriore, 5) Esame Podoscopico, 6) Tecnica 3 Respiri (risposta PRE/POST), 7) Conclusioni e indicazioni. Usa intestazioni in grassetto markdown (**Titolo**) per ogni sezione.`

  let ai_relazione = null

  // ── modalita: nessuna ───────────────────────────────────────────────────
  if (relazione_modalita === 'nessuna') {
    ai_relazione = null

  // ── modalita: singola ───────────────────────────────────────────────────
  } else if (relazione_modalita === 'singola') {
    ai_relazione = visit.relazione_ai || null

    if (!ai_relazione) {
      const access = await checkAIAccess(req)
      if (access.ok) {
        ai_relazione = await generateRelazionePosturale(visit, patient, systemPrompt)
        if (ai_relazione) {
          await svc.from('visits').update({ relazione_ai: ai_relazione }).eq('id', visit_id)
        }
      } else if (access.limitReached) {
        return res.status(403).json({ error: access.error || 'Limite AI raggiunto', limitReached: true })
      } else {
        // access.ok === false senza limitReached: errore auth o gating generico
        return res.status(403).json({ error: access.error || 'Accesso AI non disponibile' })
      }
    }
  }

  return res.status(200).json({
    visit_data:   visit,
    patient:      patient      || {},
    professional,
    photos:       photos       || [],
    ai_relazione
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function callClaude(systemPrompt, userPrompt, maxTokens = 1100) {
  const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  })
  const aiData = await aiResp.json()
  return aiData.error ? null : (aiData.content?.[0]?.text || null)
}

async function generateRelazionePosturale(visit, patient, systemPrompt) {
  const dataVisita = visit.data_visita
    ? new Date(visit.data_visita).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Non riportato'

  const or = (val) => val || 'Non riportato'

  const userPrompt = `DATI VALUTAZIONE POSTURALE

Data valutazione: ${dataVisita}

== OSSERVAZIONI PER PIANO ANATOMICO ==

Piano Sagittale:
${or(visit.note_sagittale)}

Piano Frontale:
${or(visit.note_frontale)}

Piano Posteriore:
${or(visit.note_posteriore)}

== ESAME PODOSCOPICO ==

Arco plantare: ${or(visit.arco_plantare)}
Assetto podalico: ${or(visit.assetto_podalico)}

Podoscopio vista plantare (sotto):
${or(visit.note_podoscopio_sotto)}

Podoscopio vista posteriore (dietro):
${or(visit.note_podoscopio_dietro)}

Test monopodalico:
- Destro: ${or(visit.monopodalico_dx)}
- Sinistro: ${or(visit.monopodalico_sx)}
- Note: ${or(visit.monopodalico_note)}

== TECNICA 3 RESPIRI ==

Chip scapolare PRE: ${or(visit.note_scapolare_pre)}
Chip scapolare POST: ${or(visit.note_scapolare_post)}

== ALTRE NOTE ==

Note osservazionali: ${or(visit.note_osservazionali)}
Configurazione suggerita: ${or(visit.configurazione_suggerita)}
Note finali: ${or(visit.note_finali)}

Genera la relazione clinica posturale strutturata.`

  try {
    return await callClaude(systemPrompt, userPrompt, 1100)
  } catch (_) {
    return null
  }
}
