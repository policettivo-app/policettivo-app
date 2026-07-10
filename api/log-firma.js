import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Token mancante' })

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await anon.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Non autenticato' })

  const { consenso_id } = req.body || {}
  if (!consenso_id) return res.status(400).json({ error: 'consenso_id richiesto' })

  const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // Source of truth: il record consensi appena creato
  const { data: cons, error: consErr } = await svc
    .from('consensi')
    .select('id, patient_id, professional_id, documento_tipo, evento')
    .eq('id', consenso_id)
    .maybeSingle()

  if (consErr || !cons) return res.status(404).json({ error: 'Consenso non trovato' })

  // consensi.professional_id contiene auth.uid() dopo il commit c7a0706,
  // quindi il confronto e' diretto con user.id
  if (cons.professional_id !== user.id) {
    return res.status(403).json({ error: 'Non autorizzato' })
  }

  const { error: auditErr } = await svc.from('audit_log').insert({
    actor: user.id,
    tabella: 'consensi',
    operazione: 'FIRMA',
    record_id: cons.id,
    patient_id: cons.patient_id,
    prima: null,
    dopo: { documento_tipo: cons.documento_tipo, evento: cons.evento }
  })

  if (auditErr) {
    console.warn('[audit_log] insert error:', auditErr.message)
    return res.status(500).json({ error: 'Errore audit: ' + auditErr.message })
  }

  return res.status(200).json({ ok: true })
}
