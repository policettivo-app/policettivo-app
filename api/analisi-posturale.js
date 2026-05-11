import { checkAIAccess } from './_check-ai-access.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const access = await checkAIAccess(req)
  if (!access.ok) {
    return res.status(access.status || 403).json({ error: access.error, limitReached: access.limitReached || false })
  }

  const { system, content, max_tokens } = req.body
  if (!content) return res.status(400).json({ error: 'Content mancante' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: max_tokens || 300,
        system: system || '',
        messages: [{ role: 'user', content: content }]
      })
    })

    const data = await response.json()
    if (data.error) return res.status(500).json({ error: data.error.message })

    const testo = data.content?.[0]?.text || ''
    return res.status(200).json({ testo, ai_uses: access.ai_uses_new })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
