const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const order = req.body
  if (!order || order.status !== 'completed') return res.status(200).json({ ok: true, msg: 'Not completed' })

  const email = order.billing?.email
  if (!email) return res.status(400).json({ error: 'No email' })

  let tipoPiano = null
  let giorniDurata = 0
  for (const item of order.line_items || []) {
    const pid = String(item.product_id)
    if (pid === '5245') { tipoPiano = 'mensile'; giorniDurata = 30 }
    if (pid === '5248') { tipoPiano = 'annuale'; giorniDurata = 365 }
  }
  if (!tipoPiano) return res.status(200).json({ ok: true, msg: 'Not a premium product' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: authData } = await supabase.auth.admin.listUsers()
  const user = authData?.users?.find(u => u.email === email)
  if (!user) return res.status(200).json({ ok: true, msg: 'User not found' })

  const { data: profData } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!profData) return res.status(200).json({ ok: true, msg: 'Professional not found' })

  const dataScadenza = new Date()
  dataScadenza.setDate(dataScadenza.getDate() + giorniDurata)

  await supabase
    .from('professionals')
    .update({ piano: 'premium', premium_scadenza: dataScadenza.toISOString() })
    .eq('id', profData.id)

  await supabase.from('subscriptions').insert({
    professional_id: profData.id,
    email: email,
    piano: tipoPiano,
    data_scadenza: dataScadenza.toISOString(),
    ordine_woocommerce: String(order.id)
  })

  return res.status(200).json({ ok: true, piano: tipoPiano, scadenza: dataScadenza })
}
