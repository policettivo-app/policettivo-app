import { checkAIAccess } from './_check-ai-access.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const access = await checkAIAccess(req)
  if (!access.ok) {
    return res.status(access.status || 403).json({ error: access.error, limitReached: access.limitReached || false })
  }

  const { image } = req.body
  if (!image || !image.data) return res.status(400).json({ error: 'Image mancante' })

  const prompt = `Sei un assistente medico. Estrai da questo documento medico italiano TUTTI i dati presenti. Rispondi SOLO con un oggetto JSON valido, senza testo aggiuntivo, con esattamente questi campi:
{"nome":"","cognome":"","data_nascita":"","sesso":"","codice_fiscale":"","telefono":"","email":"","indirizzo":"","citta":"","cap":"","professione":"","diagnosi_principale":"","patologie":"","farmaci":"","allergie":"","interventi_chirurgici":"","medico_curante":"","specialista_inviante":"","note_cliniche":""}
Regole:
- data_nascita: formato YYYY-MM-DD se presente, altrimenti stringa vuota
- sesso: solo "M", "F", "Altro" oppure stringa vuota
- codice_fiscale: maiuscolo
- diagnosi_principale: la diagnosi principale o il motivo della visita
- patologie: elenco patologie pregresse o croniche
- farmaci: farmaci in uso con dosaggio se presente
- note_cliniche: testo descrittivo libero (anamnesi, storia clinica, referto) che non rientra negli altri campi
- Se un campo non è leggibile o non presente, lascia la stringa vuota. NON inventare dati.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
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
    let parseError = null
    if (match) {
      try {
        dati = JSON.parse(match[0])
      } catch (e) {
        parseError = e.message
        console.error('[analisi-referto] JSON.parse failed:', e.message, '— text length:', text.length)
      }
    } else {
      parseError = 'no JSON found in response'
      console.error('[analisi-referto] no JSON match found — text length:', text.length, 'preview:', text.substring(0, 200))
    }

    return res.status(200).json({ dati, ai_uses: access.ai_uses_new, parseError })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
