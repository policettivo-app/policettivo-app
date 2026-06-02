import { createClient } from '@supabase/supabase-js'
import { checkAIAccess } from './_check-ai-access.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const tipo = (req.query?.tipo || req.body?.tipo || '').toString()

  if (tipo === 'posturale') return handlePosturale(req, res)
  if (tipo === 'visita')    return handleVisita(req, res)
  if (tipo === 'video')     return handleVideo(req, res)

  return res.status(400).json({ error: 'Parametro tipo non valido (atteso: posturale | visita | video)' })
}

// ════════════════════════════════════════════════════════════════════════════
// POSTURALE  (ex genera-pdf-posturale.js — logica invariata)
// ════════════════════════════════════════════════════════════════════════════

async function handlePosturale(req, res) {
  const { visit_id, relazione_modalita = 'singola' } = req.body
  if (!visit_id) {
    return res.status(400).json({ error: 'visit_id richiesto' })
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Token mancante' })

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await anon.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Non autenticato' })

  const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data: visit, error: visitErr } = await svc
    .from('visits')
    .select('*')
    .eq('id', visit_id)
    .maybeSingle()

  if (visitErr || !visit) return res.status(404).json({ error: 'Visita non trovata' })
  if (visit.tipo !== 'posturale') return res.status(400).json({ error: 'Questa non è una valutazione posturale' })

  const { data: prof } = await svc
    .from('professionals')
    .select('id, logo_url, qualifica, profiles(nome, cognome)')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!prof) return res.status(403).json({ error: 'Profilo professionista non trovato' })

  if (visit.professional_id !== prof.id) {
    return res.status(403).json({ error: 'Non autorizzato' })
  }

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

  if (relazione_modalita === 'nessuna') {
    ai_relazione = null
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

// ════════════════════════════════════════════════════════════════════════════
// VISITA  (ex genera-pdf-visita.js — logica invariata)
// ════════════════════════════════════════════════════════════════════════════

async function handleVisita(req, res) {
  const { visit_id, professional_id, relazione_modalita = 'singola' } = req.body
  if (!visit_id || !professional_id) {
    return res.status(400).json({ error: 'visit_id e professional_id richiesti' })
  }

  const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data: visit, error: visitErr } = await svc
    .from('visits')
    .select('*')
    .eq('id', visit_id)
    .maybeSingle()

  if (visitErr || !visit) return res.status(404).json({ error: 'Visita non trovata' })
  if (visit.professional_id !== professional_id) {
    return res.status(403).json({ error: 'Non autorizzato' })
  }

  const [{ data: patient }, { data: prof }, { data: photos }] = await Promise.all([
    svc.from('patients')
       .select('nome, cognome, codice_fiscale, data_nascita')
       .eq('id', visit.patient_id)
       .maybeSingle(),
    svc.from('professionals')
       .select('logo_url, qualifica, profiles(nome, cognome)')
       .eq('id', professional_id)
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

  const systemPrompt = `Sei un fisioterapista esperto che redige relazioni cliniche in italiano formale. Scrivi in stile referto medico: terza persona, linguaggio tecnico-clinico, sezioni distinte, conciso e oggettivo. NON inventare dati che non sono presenti nel materiale fornito. Se un dato manca, ometti la sezione o scrivi "Non riportato". NON fare diagnosi mediche né prognosi vincolanti — limita a osservazioni cliniche, valutazioni funzionali, indicazioni terapeutiche.`

  let ai_relazione = null

  if (relazione_modalita === 'nessuna') {
    ai_relazione = null
  } else if (relazione_modalita === 'singola') {
    ai_relazione = visit.relazione_ai || null

    if (!ai_relazione) {
      const access = await checkAIAccess(req)
      if (access.ok) {
        ai_relazione = await generateRelazionesingola(visit, patient, systemPrompt)
        if (ai_relazione) {
          await svc.from('visits').update({ relazione_ai: ai_relazione }).eq('id', visit_id)
        }
      } else if (access.limitReached) {
        return res.status(403).json({ error: 'Limite AI raggiunto', limitReached: true })
      }
    }
  } else if (relazione_modalita === 'storia_completa') {
    ai_relazione = visit.relazione_ai_storia || null

    if (!ai_relazione) {
      const access = await checkAIAccess(req)
      if (access.ok) {
        const { data: visite } = await svc
          .from('visits')
          .select('*')
          .eq('patient_id', visit.patient_id)
          .order('data_visita', { ascending: false })
          .limit(5)

        ai_relazione = await generateRelazioneStoria(visite || [visit], patient, systemPrompt)
        if (ai_relazione) {
          await svc.from('visits').update({ relazione_ai_storia: ai_relazione }).eq('id', visit_id)
        }
      } else if (access.limitReached) {
        return res.status(403).json({ error: 'Limite AI raggiunto', limitReached: true })
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

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

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

function buildVisitaCompact(v) {
  const data = v.data_visita
    ? new Date(v.data_visita).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'N.D.'
  const to = v.test_ortopedici || {}
  const tPos = Object.entries(to)
    .filter(([k, val]) => k !== '_custom' && val?.esito === 'positivo')
    .map(([k, val]) => k + (val.nota ? ` (${val.nota})` : ''))
  const romLim = Object.entries(v.test_rom || {})
    .filter(([, val]) => val?.stato === 'limitato' || val?.stato === 'severo')
    .map(([k, val]) => `${k}: ${val.gradi != null ? val.gradi + '°' : 'n.d.'} (${val.stato})`)

  return [
    `Data: ${data}`,
    v.motivo_visita       && `Motivo: ${v.motivo_visita}`,
    v.diagnosi_funzionale && `Diagnosi: ${v.diagnosi_funzionale}`,
    (v.vas_riposo != null || v.vas_movimento != null) &&
      `VAS: riposo ${v.vas_riposo ?? 'n.d.'}/10, movimento ${v.vas_movimento ?? 'n.d.'}/10`,
    tPos.length           && `Test positivi: ${tPos.join(', ')}`,
    romLim.length         && `ROM limitati: ${romLim.join(', ')}`,
    v.tecniche_trattamento && `Trattamento: ${v.tecniche_trattamento}`,
    (v.vas_inizio != null && v.vas_fine != null) &&
      `VAS seduta: ${v.vas_inizio}/10 → ${v.vas_fine}/10`,
    v.miglioramenti       && `Miglioramenti: ${v.miglioramenti}`,
    v.note_finali         && `Note: ${v.note_finali}`
  ].filter(Boolean).join(' | ')
}

async function generateRelazionesingola(visit, patient, systemPrompt) {
  const nomePaz = [patient?.nome, patient?.cognome].filter(Boolean).join(' ') || 'N.D.'
  const eta = patient?.data_nascita
    ? Math.floor((Date.now() - new Date(patient.data_nascita)) / (365.25 * 24 * 3600 * 1000))
    : null
  const dataVisita = visit.data_visita
    ? new Date(visit.data_visita).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'N.D.'

  const to = visit.test_ortopedici || {}
  const tPos = Object.entries(to)
    .filter(([k, v]) => k !== '_custom' && v?.esito === 'positivo')
    .map(([k, v]) => k + (v.nota ? ` (${v.nota})` : ''))
  const tNeg = Object.entries(to)
    .filter(([k, v]) => k !== '_custom' && v?.esito === 'negativo')
    .map(([k]) => k)
  const romLim = Object.entries(visit.test_rom || {})
    .filter(([, v]) => v?.stato === 'limitato' || v?.stato === 'severo')
    .map(([k, v]) => `${k}: ${v.gradi != null ? v.gradi + '°' : 'n.d.'} (${v.stato})`)

  const userPrompt = `Genera una RELAZIONE CLINICA per la seguente visita fisioterapica.

Paziente: ${nomePaz}${eta ? ', ' + eta + ' anni' : ''}
Data visita: ${dataVisita}

ANAMNESI: ${[
    visit.motivo_visita       && 'Motivo: '              + visit.motivo_visita,
    visit.storia_clinica      && 'Storia: '              + visit.storia_clinica,
    visit.durata_sintomi      && 'Durata sintomi: '      + visit.durata_sintomi.replace(/_/g, ' '),
    visit.insorgenza          && 'Insorgenza: '          + visit.insorgenza.replace(/_/g, ' '),
    visit.obiettivi_paziente  && 'Obiettivi: '           + visit.obiettivi_paziente,
    visit.diagnosi_funzionale && 'Diagnosi funzionale: ' + visit.diagnosi_funzionale
  ].filter(Boolean).join(' | ') || 'Non riportato'}

VALUTAZIONE CLINICA: ${[
    visit.vas_riposo != null    && 'VAS riposo: '    + visit.vas_riposo    + '/10',
    visit.vas_movimento != null && 'VAS movimento: ' + visit.vas_movimento + '/10',
    visit.vas_picco_settimanale != null && 'VAS picco: ' + visit.vas_picco_settimanale + '/10',
    tPos.length && 'Test positivi: ' + tPos.join(', '),
    tNeg.length && 'Test negativi: ' + tNeg.join(', '),
    romLim.length && 'ROM limitati: ' + romLim.join(', '),
    visit.note_valutazione && 'Note: ' + visit.note_valutazione
  ].filter(Boolean).join(' | ') || 'Non riportato'}

POSTURA: ${[
    visit.note_posturali         && visit.note_posturali,
    visit.ai_analisi_posturale   && 'Analisi: ' + visit.ai_analisi_posturale,
    visit.ai_suggerimento_config && 'Configurazione: ' + visit.ai_suggerimento_config.toUpperCase()
  ].filter(Boolean).join(' | ') || 'Non riportato'}

TRATTAMENTO: ${[
    visit.tecniche_trattamento     && 'Tecniche: '  + visit.tecniche_trattamento,
    visit.tempo_trattamento_minuti && 'Durata: '    + visit.tempo_trattamento_minuti + ' min',
    (visit.vas_inizio != null && visit.vas_fine != null) && `VAS seduta: ${visit.vas_inizio}/10 → ${visit.vas_fine}/10`,
    visit.risposta_paziente        && 'Risposta: '  + visit.risposta_paziente
  ].filter(Boolean).join(' | ') || 'Non riportato'}

RIVALUTAZIONE: ${[
    visit.miglioramenti        && 'Miglioramenti: ' + visit.miglioramenti,
    visit.note_finali          && 'Note: '          + visit.note_finali,
    visit.indicazioni_paziente && 'Indicazioni: '   + visit.indicazioni_paziente
  ].filter(Boolean).join(' | ') || 'Non riportato'}

OUTPUT richiesto (4-6 paragrafi, max 600 parole):
1. ANAMNESI E QUADRO CLINICO
2. ESAME OBIETTIVO E VALUTAZIONE FUNZIONALE
3. TRATTAMENTO EROGATO
4. EVOLUZIONE E RACCOMANDAZIONI`

  try {
    return await callClaude(systemPrompt, userPrompt, 900)
  } catch (_) {
    return null
  }
}

async function generateRelazioneStoria(visite, patient, systemPrompt) {
  const nomePaz = [patient?.nome, patient?.cognome].filter(Boolean).join(' ') || 'N.D.'
  const eta = patient?.data_nascita
    ? Math.floor((Date.now() - new Date(patient.data_nascita)) / (365.25 * 24 * 3600 * 1000))
    : null

  const visiteCrono = [...visite].sort((a, b) =>
    new Date(a.data_visita || 0) - new Date(b.data_visita || 0)
  )

  const visiteSummary = visiteCrono
    .map((v, i) => `Visita ${i + 1}: ${buildVisitaCompact(v)}`)
    .join('\n\n')

  const userPrompt = `Genera una RELAZIONE CLINICA SINTETICA del paziente ${nomePaz}, basata sulla cronologia delle ultime visite fisioterapiche.

Paziente: ${nomePaz}${eta ? ', ' + eta + ' anni' : ''}

VISITE (in ordine cronologico, dalla più vecchia alla più recente):

${visiteSummary}

OUTPUT richiesto (sintesi cross-visita, max 500 parole):
1. STORIA CLINICA E PERCORSO ASSISTENZIALE
   - Sintesi della problematica iniziale
   - Evoluzione nel tempo (cronologia visite)

2. QUADRO FUNZIONALE ATTUALE
   - Stato del paziente alla visita più recente
   - Confronto con stato iniziale (miglioramenti / persistenze)

3. INDICAZIONI E RACCOMANDAZIONI
   - Continuazione del trattamento
   - Indicazioni per il paziente

Sii SINTETICO ma COMPLETO. Evidenzia pattern clinici emergenti.`

  try {
    return await callClaude(systemPrompt, userPrompt, 1100)
  } catch (_) {
    return null
  }
}

// ════════════════════════════════════════════════════════════════════════════
// VIDEO  (firma server-side per pagina paziente — accesso via token, no login)
// ════════════════════════════════════════════════════════════════════════════

async function handleVideo(req, res) {
  const token = (req.body?.token || '').toString().trim()
  if (!token) return res.status(400).json({ error: 'Token mancante' })

  const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data: patient } = await svc
    .from('patients')
    .select('id')
    .eq('access_token', token)
    .maybeSingle()
  if (!patient) return res.status(404).json({ error: 'Paziente non trovato' })

  let { data: proto } = await svc
    .from('patient_protocols')
    .select('id')
    .eq('patient_id', patient.id)
    .eq('stato', 'attivo')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!proto) {
    const r = await svc
      .from('patient_protocols')
      .select('id')
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    proto = r.data
  }
  if (!proto) return res.status(200).json({ videos: [] })

  const { data: videos } = await svc
    .from('exercise_videos')
    .select('id, titolo, url, tipo, descrizione, durata')
    .eq('protocol_id', proto.id)
    .order('created_at', { ascending: true })

  const out = []
  for (const v of (videos || [])) {
    let url = v.url
    if (typeof url === 'string' && url.includes('/videos/')) {
      const path = decodeURIComponent(url.split('/videos/')[1].split('?')[0])
      const { data: su } = await svc.storage.from('videos').createSignedUrl(path, 7200)
      if (su?.signedUrl) url = su.signedUrl
    }
    out.push({ id: v.id, titolo: v.titolo, url, tipo: v.tipo, descrizione: v.descrizione, durata: v.durata })
  }

  return res.status(200).json({ videos: out })
}
