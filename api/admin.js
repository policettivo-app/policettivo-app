import { createServiceClient } from './_check-admin-auth.js'
import { randomUUID } from 'node:crypto'

const ADMIN_EMAIL = 'appuntamentimft@gmail.com'
const RUOLI_MEMBRO_VALIDI = ['clinico', 'segreteria', 'amministrazione']

async function getAuthUser(req, res) {
  if (req.headers['x-preview-mode'] === '1') {
    res.status(403).json({ error: 'Non autorizzato: modalità anteprima' }); return null
  }
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) { res.status(401).json({ error: 'Token mancante' }); return null }
  const { createClient } = await import('@supabase/supabase-js')
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error } = await anon.auth.getUser(token)
  if (error || !user) { res.status(401).json({ error: 'Token non valido' }); return null }
  return user
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await getAuthUser(req, res)
  if (!user) return

  const { action } = req.body || {}
  if (!action) return res.status(400).json({ error: 'action richiesta' })

  const svc = await createServiceClient()

  const isPlatformAdmin = user.email === ADMIN_EMAIL

  // Eccezione: 'create-invite' è accessibile anche a un professionista
  // con ruolo='master', ma SOLO per il proprio studio e per ruoli membro validi.
  if (action === 'create-invite' && !isPlatformAdmin) {
    const { studio_id: bodyStudioId, invitato_da: bodyInvitatoDa, ruolo: bodyRuolo } = req.body || {}
    if (!bodyStudioId || !bodyInvitatoDa) {
      return res.status(403).json({ error: 'Non autorizzato: studio_id e invitato_da obbligatori' })
    }
    if (!bodyRuolo || !RUOLI_MEMBRO_VALIDI.includes(bodyRuolo)) {
      return res.status(400).json({ error: 'ruolo non valido: ammessi ' + RUOLI_MEMBRO_VALIDI.join(', ') })
    }
    const { data: mioProf, error: profErr } = await svc
      .from('professionals')
      .select('id, studio_id, ruolo, piano, premium_scadenza')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profErr || !mioProf) return res.status(403).json({ error: 'Non autorizzato: professionista non trovato' })
    if (mioProf.ruolo !== 'master') return res.status(403).json({ error: 'Non autorizzato: solo il master dello studio' })
    if (mioProf.studio_id !== bodyStudioId || mioProf.id !== bodyInvitatoDa) {
      return res.status(403).json({ error: 'Non autorizzato: studio_id o invitato_da non corrispondono' })
    }
    const isPremium = mioProf.piano === 'premium' && (!mioProf.premium_scadenza || new Date(mioProf.premium_scadenza) > new Date())
    if (!isPremium) {
      return res.status(402).json({ error: 'Il multi-utente richiede il piano Premium', code: 'PREMIUM_REQUIRED' })
    }
    return handleCreateInvite(svc, req, res)
  }

  // Tutte le altre action: solo admin piattaforma
  if (!isPlatformAdmin) return res.status(403).json({ error: 'Non autorizzato' })

  switch (action) {
    case 'list-user-emails':   return handleListUserEmails(svc, req, res)
    case 'update-piano':       return handleUpdatePiano(svc, req, res)
    case 'update-profile':     return handleUpdateProfile(svc, req, res)
    case 'delete-user':        return handleDeleteUser(svc, req, res)
    case 'list-invites':       return handleListInvites(svc, req, res)
    case 'create-invite':      return handleCreateInvite(svc, req, res)
    case 'delete-invite':      return handleDeleteInvite(svc, req, res)
    case 'professionalStats':  return handleProfessionalStats(svc, req, res)
    default:                   return res.status(400).json({ error: 'action sconosciuta: ' + action })
  }
}

// ── list-user-emails ─────────────────────────────────────────────────────────
async function handleListUserEmails(svc, req, res) {
  const { data, error } = await svc.auth.admin.listUsers({ perPage: 1000 })
  if (error) return res.status(500).json({ error: error.message })

  const emails = {}
  ;(data.users || []).forEach(u => { emails[u.id] = u.email || '' })
  return res.status(200).json({ emails })
}

// ── update-piano ─────────────────────────────────────────────────────────────
async function handleUpdatePiano(svc, req, res) {
  const { profId, piano, premiumScadenza } = req.body
  if (!profId || !piano) return res.status(400).json({ error: 'profId e piano obbligatori' })

  const upd = { piano }
  if (piano === 'premium' && premiumScadenza) upd.premium_scadenza = premiumScadenza
  if (piano === 'free') upd.premium_scadenza = null

  const { error } = await svc.from('professionals').update(upd).eq('id', profId)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}

// ── update-profile ───────────────────────────────────────────────────────────
async function handleUpdateProfile(svc, req, res) {
  const { profileId, nome, cognome, telefono } = req.body
  if (!profileId) return res.status(400).json({ error: 'profileId obbligatorio' })

  const { error } = await svc.from('profiles').update({ nome, cognome, telefono }).eq('id', profileId)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}

// ── delete-user ──────────────────────────────────────────────────────────────
async function handleDeleteUser(svc, req, res) {
  const { profId, userId } = req.body
  if (!profId || !userId) return res.status(400).json({ error: 'profId e userId obbligatori' })

  // Blocco preventivo: consensi firmati = prova legale, non cancellabili.
  // Senza questo check la cascata FK su consents.professional_id (SET NULL)
  // viola il CHECK consent_soggetto_ck e GoTrue riporta "Database error deleting user".
  const { count: profConsCount, error: profConsErr } = await svc
    .from('consents').select('id', { count: 'exact', head: true }).eq('professional_id', profId)
  if (profConsErr) return res.status(500).json({ error: 'Errore verifica consensi professionista: ' + profConsErr.message })
  if (profConsCount && profConsCount > 0) {
    return res.status(409).json({ error: 'Impossibile eliminare: ' + profConsCount + ' consenso/i firmato/i collegati al professionista (valore legale). Contatta il supporto per la procedura di archiviazione.' })
  }

  const { data: pats } = await svc.from('patients').select('id').eq('professional_id', profId)
  if (pats && pats.length > 0) {
    const patIds = pats.map(p => p.id)

    const { count: patConsCount, error: patConsErr } = await svc
      .from('consents').select('id', { count: 'exact', head: true }).in('patient_id', patIds)
    if (patConsErr) return res.status(500).json({ error: 'Errore verifica consensi pazienti: ' + patConsErr.message })
    if (patConsCount && patConsCount > 0) {
      return res.status(409).json({ error: 'Impossibile eliminare: ' + patConsCount + ' consenso/i firmato/i collegati ai pazienti del professionista (valore legale). Contatta il supporto per la procedura di archiviazione.' })
    }

    const { data: protos } = await svc.from('patient_protocols').select('id').in('patient_id', patIds)
    if (protos && protos.length > 0) {
      const protoIds = protos.map(p => p.id)
      await svc.from('patient_protocol_exercises').delete().in('patient_protocol_id', protoIds)
      await svc.from('patient_protocols').delete().in('id', protoIds)
    }

    await svc.from('diary_entries').delete().in('patient_id', patIds)
    await svc.from('visite').delete().in('patient_id', patIds)
    await svc.from('exercise_videos').delete().in('patient_id', patIds)
    await svc.from('patients').delete().in('id', patIds)
  }

  await svc.from('professionals').delete().eq('id', profId)
  await svc.from('profiles').delete().eq('id', userId)

  const { error: delErr } = await svc.auth.admin.deleteUser(userId)
  if (delErr) return res.status(500).json({ error: 'Errore eliminazione auth: ' + delErr.message })

  return res.status(200).json({ ok: true })
}

// ── list-invites ─────────────────────────────────────────────────────────────
async function handleListInvites(svc, req, res) {
  const { data, error } = await svc.from('invites')
    .select('*')
    .eq('usato', false)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ inviti: data || [] })
}

// ── create-invite ────────────────────────────────────────────────────────────
async function handleCreateInvite(svc, req, res) {
  const { nome, email, ruolo, studio_id, invitato_da } = req.body
  if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'nome obbligatorio' })

  const token = randomUUID()
  const { data, error } = await svc.from('invites')
    .insert({
      nome: String(nome).trim(),
      email: email || null,
      token,
      ruolo: ruolo || null,
      studio_id: studio_id || null,
      invitato_da: invitato_da || null
    })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ invito: data })
}

// ── delete-invite ────────────────────────────────────────────────────────────
async function handleDeleteInvite(svc, req, res) {
  const { id } = req.body
  if (!id) return res.status(400).json({ error: 'id obbligatorio' })
  const { error } = await svc.from('invites').delete().eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}

// ── professionalStats ────────────────────────────────────────────────────────
// Conta pazienti attivi / sedute (therapy_sessions) / visite (visits) di un
// professionista e ritorna le ultime N di ciascuno con il nome del paziente
// associato. Necessario lato server: le RLS filtrano queste letture per il
// professionista loggato, quindi dal browser (admin) restituirebbero 0 per
// gli altri.
async function handleProfessionalStats(svc, req, res) {
  const { profId } = req.body
  if (!profId) return res.status(400).json({ error: 'profId obbligatorio' })

  const { data: pats, error: patErr } = await svc
    .from('patients')
    .select('id, nome, cognome, created_at')
    .eq('professional_id', profId)
    .eq('stato', 'attivo')
    .order('created_at', { ascending: false })
  if (patErr) return res.status(500).json({ error: 'patients: ' + patErr.message })

  const allPats = pats || []
  const patIds  = allPats.map(p => p.id)
  const patNames = {}
  allPats.forEach(p => { patNames[p.id] = ((p.nome || '') + ' ' + (p.cognome || '')).trim() })

  let sessioni = []
  let visite   = []
  if (patIds.length > 0) {
    const [sRes, vRes] = await Promise.all([
      svc.from('therapy_sessions')
        .select('id, patient_id, data_seduta')
        .in('patient_id', patIds),
      svc.from('visits')
        .select('id, patient_id, data_visita')
        .in('patient_id', patIds)
    ])
    if (sRes.error) return res.status(500).json({ error: 'therapy_sessions: ' + sRes.error.message })
    if (vRes.error) return res.status(500).json({ error: 'visits: ' + vRes.error.message })
    sessioni = sRes.data || []
    visite   = vRes.data || []
  }

  const ultimeSedute = [...sessioni]
    .sort((a, b) => String(b.data_seduta || '').localeCompare(String(a.data_seduta || '')))
    .slice(0, 10)
    .map(s => ({ id: s.id, patient_id: s.patient_id, data: s.data_seduta || '', patient_name: patNames[s.patient_id] || '' }))

  const ultimeVisite = [...visite]
    .sort((a, b) => String(b.data_visita || '').localeCompare(String(a.data_visita || '')))
    .slice(0, 5)
    .map(v => ({ id: v.id, patient_id: v.patient_id, data: v.data_visita || '', patient_name: patNames[v.patient_id] || '' }))

  const ultimiPazienti = allPats.slice(0, 10).map(p => ({
    id: p.id,
    nome: patNames[p.id] || '',
    created_at: p.created_at
  }))

  return res.status(200).json({
    totals: {
      pazienti: allPats.length,
      sessioni: sessioni.length,
      visite:   visite.length
    },
    ultimiPazienti,
    ultimeSedute,
    ultimeVisite
  })
}
