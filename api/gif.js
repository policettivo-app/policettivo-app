export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL mancante' });
  }

  // Verifica che sia un URL ExerciseDB valido
  if (!url.includes('exercisedb.io') && !url.includes('gifdb.com') && !url.includes('rapidapi')) {
    return res.status(403).json({ error: 'URL non consentito' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://exercisedb.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Fetch fallito' });
    }

    const contentType = response.headers.get('content-type') || 'image/gif';
    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.send(Buffer.from(buffer));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
