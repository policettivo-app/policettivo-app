import { createClient } from '@supabase/supabase-js'
import { checkAIAccess } from './_check-ai-access.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { visit_id, professional_id } = req.body
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

  // Generate AI relazione only if not already present (preserves ai_uses)
  let ai_relazione = visit.relazione_ai || null

  if (!ai_relazione) {
    const access = await checkAIAccess(req)
    if (access.ok) {
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

      const systemPrompt = `Sei un fisioterapista esperto che redige relazioni cliniche in italiano formale. Scrivi in stile referto medico: terza persona, linguaggio tecnico-clinico, sezioni distinte, conciso e oggettivo. NON inventare dati che non sono presenti nel materiale fornito. Se un dato manca, ometti la sezione o scrivi "Non riportato". NON fare diagnosi mediche né prognosi vincolanti — limita a osservazioni cliniche, valutazioni funzionali, indicazioni terapeutiche.`

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
        const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 900,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
          })
        })
        const aiData = await aiResp.json()
        if (!aiData.error) {
          ai_relazione = aiData.content?.[0]?.text || null
          if (ai_relazione) {
            await svc.from('visits').update({ relazione_ai: ai_relazione }).eq('id', visit_id)
          }
        }
      } catch (_) {
        // AI failure is non-fatal — PDF is still generated without relazione
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
