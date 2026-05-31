export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, token } = req.body || {}
  if (!action) return res.status(400).json({ error: 'action richiesta' })
  if (!token) return res.status(400).json({ error: 'token richiesto' })

  const { createClient } = await import('@supabase/supabase-js')
  const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  if (action === 'get-invite') {
    const { data, error } = await svc.from('invites')
      .select('*')
      .eq('token', token)
      .eq('usato', false)
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ invito: data })
  }

  if (action === 'consume-invite') {
    const { error } = await svc.from('invites')
      .update({ usato: true, used_at: new Date().toISOString() })
      .eq('token', token)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(400).json({ error: 'action sconosciuta: ' + action })
}
