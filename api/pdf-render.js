import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'Token mancante' })

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await anon.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Non autenticato' })

  const { html, filename = 'documento.pdf' } = req.body
  if (!html) return res.status(400).json({ error: 'html mancante' })

  let browser = null
  try {
    const executablePath = await chromium.executablePath()
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForNetworkIdle({ idleTime: 400, timeout: 8000 })
    } catch (_) {}
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' }
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
    return res.status(200).send(Buffer.from(pdf))
  } catch (err) {
    return res.status(500).json({ error: 'Errore generazione PDF: ' + err.message })
  } finally {
    if (browser) await browser.close()
  }
}
