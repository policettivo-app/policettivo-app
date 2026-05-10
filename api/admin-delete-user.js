export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { createClient } = await import('@supabase/supabase-js')
  const SUPABASE_URL = process.env.SUPABASE_URL
  const ANON_KEY     = process.env.SUPABASE_ANON_KEY
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  // Verifica che il chiamante sia l'admin
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Token mancante' })

  const anon = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error: authErr } = await anon.auth.getUser(token)
  if (authErr || !user || user.email !== 'appuntamentimft@gmail.com') {
    return res.status(403).json({ error: 'Non autorizzato' })
  }

  const { profId, userId } = req.body
  if (!profId || !userId) return res.status(400).json({ error: 'profId e userId obbligatori' })

  const svc = createClient(SUPABASE_URL, SERVICE_KEY)

  // 1. Carica i pazienti del professionista
  const { data: pats } = await svc.from('patients').select('id').eq('professional_id', profId)
  if (pats && pats.length > 0) {
    const patIds = pats.map(p => p.id)

    // 2. Elimina esercizi dei protocolli
    const { data: protos } = await svc.from('patient_protocols').select('id').in('patient_id', patIds)
    if (protos && protos.length > 0) {
      const protoIds = protos.map(p => p.id)
      await svc.from('patient_protocol_exercises').delete().in('patient_protocol_id', protoIds)
      await svc.from('patient_protocols').delete().in('id', protoIds)
    }

    // 3. Elimina diari, visite, video
    await svc.from('diary_entries').delete().in('patient_id', patIds)
    await svc.from('visite').delete().in('patient_id', patIds)
    await svc.from('exercise_videos').delete().in('patient_id', patIds)
    await svc.from('patients').delete().in('id', patIds)
  }

  // 4. Elimina il record professionals e il profilo
  await svc.from('professionals').delete().eq('id', profId)
  await svc.from('profiles').delete().eq('id', userId)

  // 5. Elimina l'utente da auth.users (richiede service key)
  const { error: delErr } = await svc.auth.admin.deleteUser(userId)
  if (delErr) return res.status(500).json({ error: 'Errore eliminazione auth: ' + delErr.message })

  return res.status(200).json({ ok: true })
}
