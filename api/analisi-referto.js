import { checkAIAccess } from './_check-ai-access.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const access = await checkAIAccess(req)
  if (!access.ok) {
    return res.status(access.status || 403).json({ error: access.error, limitReached: access.limitReached || false })
  }

  const { image } = req.body
  if (!image || !image.data) return res.status(400).json({ error: 'Image mancante' })

  const prompt = `Sei un assistente medico. Estrai da questo documento medico italiano i seguenti dati se presenti: nome, cognome, data di nascita, codice fiscale, diagnosi principale, patologie, farmaci, note cliniche, medico curante. Rispondi SOLO in JSON con questi campi esatti, senza testo aggiuntivo:
{"nome":"","cognome":"","data_nascita":"","codice_fiscale":"","diagnosi_principale":"","patologie":"","farmaci":"","note_cliniche":"","medico_curante":""}
Se un campo non è leggibile o non presente lascia la stringa vuota.`

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
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.type || 'image/jpeg',
                data: image.data
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    })

    const data = await response.json()
    if (data.error) return res.status(500).json({ error: data.error.message })

    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    let dati = {}
    if (match) {
      try { dati = JSON.parse(match[0]) } catch (e) { /* json malformato, ritorna vuoto */ }
    }

    return res.status(200).json({ dati, ai_uses: access.ai_uses_new })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
