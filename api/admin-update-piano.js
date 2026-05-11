export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { createClient } = await import('@supabase/supabase-js')
  const SUPABASE_URL = process.env.SUPABASE_URL
  const ANON_KEY     = process.env.SUPABASE_ANON_KEY
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Token mancante' })

  const anon = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error: authErr } = await anon.auth.getUser(token)
  if (authErr || !user || user.email !== 'appuntamentimft@gmail.com') {
    return res.status(403).json({ error: 'Non autorizzato' })
  }

  const { profId, piano, premiumScadenza } = req.body
  if (!profId || !piano) return res.status(400).json({ error: 'profId e piano obbligatori' })

  const upd = { piano }
  if (piano === 'premium' && premiumScadenza) upd.premium_scadenza = premiumScadenza
  if (piano === 'free') upd.premium_scadenza = null

  const svc = createClient(SUPABASE_URL, SERVICE_KEY)
  const { error } = await svc.from('professionals').update(upd).eq('id', profId)
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ ok: true })
}
