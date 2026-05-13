import { checkAdminAuth, createServiceClient } from './_check-admin-auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await checkAdminAuth(req, res)
  if (!user) return

  const svc = await createServiceClient()
  const { data, error } = await svc.auth.admin.listUsers({ perPage: 1000 })
  if (error) return res.status(500).json({ error: error.message })

  const emails = {}
  ;(data.users || []).forEach(u => { emails[u.id] = u.email || '' })
  return res.status(200).json({ emails })
}
