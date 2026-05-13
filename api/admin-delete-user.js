import { checkAdminAuth, createServiceClient } from './_check-admin-auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await checkAdminAuth(req, res)
  if (!user) return

  const { profId, userId } = req.body
  if (!profId || !userId) return res.status(400).json({ error: 'profId e userId obbligatori' })

  const svc = await createServiceClient()

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
