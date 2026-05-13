const ADMIN_EMAIL = 'appuntamentimft@gmail.com'

export async function checkAdminAuth(req, res) {
  const { createClient } = await import('@supabase/supabase-js')
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) { res.status(401).json({ error: 'Token mancante' }); return null }

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error } = await anon.auth.getUser(token)
  if (error || !user || user.email !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Non autorizzato' }); return null
  }
  return user
}

export function createServiceClient() {
  return import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  )
}
