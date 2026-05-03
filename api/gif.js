export default async function handler(req, res) {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'URL mancante' })
  
  try {
    const response = await fetch(decodeURIComponent(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://exercisedb.p.rapidapi.com'
      }
    })
    if (!response.ok) throw new Error('Fetch fallito: ' + response.status)
    const buffer = await response.arrayBuffer()
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/gif')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.send(Buffer.from(buffer))
  } catch(err) {
    res.status(500).json({ error: err.message })
  }
}
