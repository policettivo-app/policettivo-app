import { createClient } from '@supabase/supabase-js'
import { checkAIAccess } from './_check-ai-access.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { tipo_doc, patient_id, includi, testo_utente, lunghezza } = req.body
  // tipo_doc: 'relazione' | 'lettera'
  // includi: { iniziale: bool, sedute: bool, esito: bool }
  // lunghezza: 'sintetica' | 'approfondita'

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Token mancante' })

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await anon.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Non autenticato' })

  const access = await checkAIAccess(req)
  if (!access.ok) {
    if (access.limitReached) return res.status(403).json({ error: 'Limite AI raggiunto', limitReached: true })
    return res.status(403).json({ error: access.error || 'Accesso AI non disponibile' })
  }

  const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data: prof } = await svc
    .from('professionals')
    .select('id, qualifica, centro, citta, indirizzo, telefono, email_studio, partita_iva, logo_url, profiles(nome, cognome)')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!prof) return res.status(403).json({ error: 'Profilo professionista non trovato' })

  let datiPaziente = ''
  let patient = null

  if (patient_id) {
    const { data: pat } = await svc
      .from('patients')
      .select('nome, cognome, data_nascita')
      .eq('id', patient_id)
      .eq('professional_id', prof.id)
      .maybeSingle()
    if (!pat) return res.status(403).json({ error: 'Paziente non trovato o non autorizzato' })
    patient = pat

    const { data: visite } = await svc
      .from('visits')
      .select('data_visita, motivo_visita, storia_clinica, diagnosi_funzionale, obiettivi_paziente, tecniche_trattamento, miglioramenti, note_finali, vas_inizio, vas_fine, vas_riposo')
      .eq('patient_id', patient_id)
      .eq('professional_id', prof.id)
      .order('data_visita', { ascending: true })

    const vlist = visite || []
    const prima = vlist[0]

    if (includi?.iniziale && prima) {
      datiPaziente += '\n[QUADRO INIZIALE]\n' + [
        prima.motivo_visita && 'Motivo: ' + prima.motivo_visita,
        prima.storia_clinica && 'Storia: ' + prima.storia_clinica,
        prima.diagnosi_funzionale && 'Diagnosi funzionale: ' + prima.diagnosi_funzionale,
        prima.obiettivi_paziente && 'Obiettivi: ' + prima.obiettivi_paziente
      ].filter(Boolean).join('\n')
    }

    if (includi?.sedute && vlist.length) {
      datiPaziente += '\n\n[SEDUTE SVOLTE]\n' + vlist.map(v => {
        const d = v.data_visita ? new Date(v.data_visita).toLocaleDateString('it-IT') : 'data n.d.'
        return '- ' + d + (v.tecniche_trattamento ? ': ' + v.tecniche_trattamento : '')
      }).join('\n')
    }

    if (includi?.esito && vlist.length) {
      const ultima = vlist[vlist.length - 1]
      datiPaziente += '\n\n[ESITO]\n' + [
        ultima.miglioramenti && 'Miglioramenti: ' + ultima.miglioramenti,
        ultima.note_finali && 'Note finali: ' + ultima.note_finali,
        (prima?.vas_riposo != null && ultima?.vas_fine != null) && 'VAS: ' + prima.vas_riposo + '/10 iniziale, ' + ultima.vas_fine + '/10 finale'
      ].filter(Boolean).join('\n')
    }

    // Osservazioni posturali annotate sulle foto (solo se richiesto dal flag)
    if (includi?.posturale) try {
      const { data: _vids } = await svc.from('visits').select('id').eq('patient_id', patient_id)
      const _ids = (_vids || []).map(v => v.id)
      if (_ids.length) {
        const { data: _vph } = await svc.from('visit_photos').select('tipo, annotazioni').in('visit_id', _ids)
        const _righe = []
        for (const ph of (_vph || [])) {
          let ann = ph.annotazioni
          if (typeof ann === 'string') { try { ann = JSON.parse(ann) } catch (e) { ann = null } }
          if (!ann) continue
          const oss = Array.isArray(ann.osservazioni) ? ann.osservazioni : []
          const note = ann.note || ''
          if (!oss.length && !note) continue
          const lbl = (ph.tipo || '').replace(/_/g, ' ')
          const parts = []
          if (oss.length) parts.push(oss.join(', '))
          if (note) parts.push('Note: ' + note)
          _righe.push('- ' + lbl + ': ' + parts.join('. '))
        }
        if (_righe.length) datiPaziente += '\n\n[OSSERVAZIONI POSTURALI (annotate sulle foto)]\n' + _righe.join('\n')
      }
      // Note rapide per piano (testo scritto nella valutazione posturale)
      const { data: _vn } = await svc.from('visits')
        .select('note_sagittale, note_frontale, note_posteriore, note_podoscopio_sotto, note_podoscopio_dietro')
        .eq('patient_id', patient_id)
      const _noteRows = []
      for (const v of (_vn || [])) {
        const _m = [['Sagittale', v.note_sagittale], ['Frontale', v.note_frontale], ['Posteriore', v.note_posteriore], ['Podoscopio (sotto)', v.note_podoscopio_sotto], ['Podoscopio (dietro)', v.note_podoscopio_dietro]]
        for (const [lbl, val] of _m) if (val && String(val).trim()) _noteRows.push('- ' + lbl + ': ' + String(val).trim())
      }
      if (_noteRows.length) datiPaziente += '\n\n[NOTE POSTURALI PER PIANO]\n' + _noteRows.join('\n')
    } catch (e) {}
  }

  const nomePaz = patient ? [patient.nome, patient.cognome].filter(Boolean).join(' ') : ''
  const profName = [prof?.profiles?.nome, prof?.profiles?.cognome].filter(Boolean).join(' ')

  const lung = lunghezza === 'approfondita' ? 'approfondita e dettagliata' : 'sintetica e concisa'
  const tipoLabel = tipo_doc === 'lettera' ? 'lettera/comunicazione professionale' : 'relazione clinica fisioterapica'

  const systemPrompt = `Sei un fisioterapista esperto che redige documenti professionali in italiano formale. Scrivi una ${tipoLabel} ${lung}. Stile: terza persona, linguaggio tecnico-clinico appropriato, professionale. NON inventare dati clinici non forniti: se un dato manca, ometti. NON fare diagnosi mediche né prognosi vincolanti. Basati sulle indicazioni del professionista e sui dati forniti. Restituisci SOLO il testo del documento, pronto da rileggere e firmare, senza intestazioni tipo "Ecco la lettera". IMPORTANTE: NON includere nel testo la data, il luogo, righe tipo 'Data: ___', 'Firma: ___', 'Firma del professionista', né il nome/firma finale del professionista: questi elementi sono già aggiunti automaticamente all'intestazione e in fondo al documento. Termina il testo con il contenuto clinico, senza blocco firma.`

  const userPrompt = `Redigi il documento.

${nomePaz ? 'Paziente: ' + nomePaz : 'Nessun paziente specifico (documento generico)'}
Professionista: ${profName}

INDICAZIONI DEL PROFESSIONISTA (cosa vuole dire):
${testo_utente || 'Nessuna indicazione specifica'}
${datiPaziente ? '\nDATI CLINICI DISPONIBILI:' + datiPaziente : ''}

Scrivi il documento completo in italiano.`

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
        max_tokens: lunghezza === 'approfondita' ? 2000 : 1100,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    })
    const aiData = await aiResp.json()
    if (aiData.error) return res.status(500).json({ error: 'Errore AI: ' + aiData.error.message })
    const testo = aiData.content?.[0]?.text || null
    if (!testo) return res.status(500).json({ error: 'Nessun testo generato' })
    return res.status(200).json({
      testo,
      paziente: nomePaz,
      intestazione: {
        nome:         profName,
        qualifica:    prof.qualifica    || '',
        centro:       prof.centro        || '',
        citta:        prof.citta         || '',
        indirizzo:    prof.indirizzo     || '',
        telefono:     prof.telefono      || '',
        email_studio: prof.email_studio  || '',
        partita_iva:  prof.partita_iva   || '',
        logo_url:     prof.logo_url      || null
      }
    })
  } catch (e) {
    return res.status(500).json({ error: 'Errore: ' + e.message })
  }
}
