export default async function handler(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY
    const response = await fetch(`${supabaseUrl}/rest/v1/professionals?select=id&limit=1`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    })
    res.status(200).json({ ok: true, status: response.status })
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message })
  }
}
