export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token } = req.body
  if (!token) return res.status(400).json({ success: false, error: 'Token mancante' })

  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return res.status(500).json({ success: false, error: 'Configurazione server mancante' })

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token })
  })

  const data = await response.json()
  if (data.success) return res.status(200).json({ success: true })
  return res.status(400).json({ success: false, error: 'Verifica anti-bot fallita. Riprova.' })
}
