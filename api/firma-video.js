import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.body?.token || '').toString().trim()
  if (!token) return res.status(400).json({ error: 'Token mancante' })

  const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // 1. Valida il token -> trova il paziente
  const { data: patient } = await svc
    .from('patients')
    .select('id')
    .eq('access_token', token)
    .maybeSingle()
  if (!patient) return res.status(404).json({ error: 'Paziente non trovato' })

  // 2. Protocollo attivo (fallback al più recente)
  let { data: proto } = await svc
    .from('patient_protocols')
    .select('id')
    .eq('patient_id', patient.id)
    .eq('stato', 'attivo')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!proto) {
    const r = await svc
      .from('patient_protocols')
      .select('id')
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    proto = r.data
  }
  if (!proto) return res.status(200).json({ videos: [] })

  // 3. Video del protocollo
  const { data: videos } = await svc
    .from('exercise_videos')
    .select('id, titolo, url, tipo, descrizione, durata')
    .eq('protocol_id', proto.id)
    .order('created_at', { ascending: true })

  // 4. Firma ogni video (service_role accede al bucket privato)
  const out = []
  for (const v of (videos || [])) {
    let url = v.url
    if (typeof url === 'string' && url.includes('/videos/')) {
      const path = decodeURIComponent(url.split('/videos/')[1].split('?')[0])
      const { data: su } = await svc.storage.from('videos').createSignedUrl(path, 7200)
      if (su?.signedUrl) url = su.signedUrl
    }
    out.push({ id: v.id, titolo: v.titolo, url, tipo: v.tipo, descrizione: v.descrizione, durata: v.durata })
  }

  return res.status(200).json({ videos: out })
}
