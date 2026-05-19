import { createClient } from '@supabase/supabase-js'
import { checkAIAccess } from './_check-ai-access.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { visit_id, professional_id, relazione_modalita = 'singola' } = req.body
  if (!visit_id || !professional_id) {
    return res.status(400).json({ error: 'visit_id e professional_id richiesti' })
  }

  const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // Load visit + verify ownership
  const { data: visit, error: visitErr } = await svc
    .from('visits')
    .select('*')
    .eq('id', visit_id)
    .maybeSingle()

  if (visitErr || !visit) return res.status(404).json({ error: 'Visita non trovata' })
  if (visit.professional_id !== professional_id) {
    return res.status(403).json({ error: 'Non autorizzato' })
  }

  // Load patient, professional, photos in parallel
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

  // ── modalita: nessuna ───────────────────────────────────────────────────
  if (relazione_modalita === 'nessuna') {
    ai_relazione = null

  // ── modalita: singola ───────────────────────────────────────────────────
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

  // ── modalita: storia_completa ───────────────────────────────────────────
  } else if (relazione_modalita === 'storia_completa') {
    ai_relazione = visit.relazione_ai_storia || null

    if (!ai_relazione) {
      const access = await checkAIAccess(req)
      if (access.ok) {
        // Load last 5 visits for this patient (most recent first)
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

async function callClaude(systemPrompt, userPrompt, maxTokens = 900) {
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

  // Ordine cronologico (più vecchia prima) per leggibilità narrativa
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
