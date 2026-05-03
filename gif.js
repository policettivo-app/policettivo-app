export default async function handler(req, res) {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'URL mancante' })
  
  try {
    const decodedUrl = decodeURIComponent(url)
    const response = await fetch(decodedUrl, {
      headers: {
        'x-rapidapi-key': 'a72cf08819msh2876171502d57aep18e41ajsn5a7971a175a8',
        'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
        'User-Agent': 'Mozilla/5.0'
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
