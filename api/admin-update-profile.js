import { checkAdminAuth, createServiceClient } from './_check-admin-auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await checkAdminAuth(req, res)
  if (!user) return

  const { profileId, nome, cognome, telefono } = req.body
  if (!profileId) return res.status(400).json({ error: 'profileId obbligatorio' })

  const svc = await createServiceClient()
  const { error } = await svc.from('profiles').update({ nome, cognome, telefono }).eq('id', profileId)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}
