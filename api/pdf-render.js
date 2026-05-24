import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { html, filename = 'documento.pdf' } = req.body
  if (!html) return res.status(400).json({ error: 'html mancante' })

  let browser = null
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true
    })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForNetworkIdle({ idleTime: 400, timeout: 8000 })
    } catch (_) {
      // foto lente o assenti: si procede comunque col PDF
    }
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
