import { checkAdminAuth, createServiceClient } from './_check-admin-auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await checkAdminAuth(req, res)
  if (!user) return

  const { profId, piano, premiumScadenza } = req.body
  if (!profId || !piano) return res.status(400).json({ error: 'profId e piano obbligatori' })

  const upd = { piano }
  if (piano === 'premium' && premiumScadenza) upd.premium_scadenza = premiumScadenza
  if (piano === 'free') upd.premium_scadenza = null

  const svc = await createServiceClient()
  const { error } = await svc.from('professionals').update(upd).eq('id', profId)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}
