import { checkAdminAuth, createServiceClient } from './_check-admin-auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await checkAdminAuth(req, res)
  if (!user) return

  const { action } = req.body || {}
  if (!action) return res.status(400).json({ error: 'action richiesta' })

  const svc = await createServiceClient()

  switch (action) {
    case 'list-user-emails':   return handleListUserEmails(svc, req, res)
    case 'update-piano':       return handleUpdatePiano(svc, req, res)
    case 'update-profile':     return handleUpdateProfile(svc, req, res)
    case 'delete-user':        return handleDeleteUser(svc, req, res)
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

  const { data: pats } = await svc.from('patients').select('id').eq('professional_id', profId)
  if (pats && pats.length > 0) {
    const patIds = pats.map(p => p.id)

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
