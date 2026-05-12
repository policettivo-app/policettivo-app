export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { createClient } = await import('@supabase/supabase-js')
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Token mancante' })

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await anon.auth.getUser(token)
  if (authErr || !user || user.email !== 'appuntamentimft@gmail.com') {
    return res.status(403).json({ error: 'Non autorizzato' })
  }

  const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const { data, error } = await svc.auth.admin.listUsers({ perPage: 1000 })
  if (error) return res.status(500).json({ error: error.message })

  const emails = {}
  ;(data.users || []).forEach(u => { emails[u.id] = u.email || '' })
  return res.status(200).json({ emails })
}
