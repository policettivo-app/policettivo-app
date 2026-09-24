/* prova-fase0-gradi.mjs — editor-punti-v1
 * La pagina della Fase 0 dei gradi (prova-gradi.html), provata in Chromium:
 * foto scelte dal telefono, editor condiviso, calcolo della soglia, memoria
 * locale, niente rete verso il database.
 *   node prova-fase0-gradi.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd(), PORT = 8493
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  const f = path.join(ROOT, u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f))
})
let ok = 0, ko = 0; const fallite = []
function check(n, c, x) { if (c) { ok++; console.log('  ✅ ' + n) } else { ko++; fallite.push(n); console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')) } }
function sez(t) { console.log('\n── ' + t) }
const FOTO = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#ddd"/><line x1="300" y1="0" x2="300" y2="900" stroke="red"/></svg>`)

await new Promise(r => server.listen(PORT, r))
const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] })
async function apri(ctx) {
  const page = await ctx.newPage()
  const errori = [], rete = []
  page.on('pageerror', e => errori.push(String(e)))
  page.on('request', r => { if (!/localhost|^blob:|^data:|fonts\.googleapis/.test(r.url())) rete.push(r.url()) })
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await page.addInitScript(() => { window.__mpFinto = async () => ({ ok: false, message: 'Nessuna persona rilevata nella foto.' }) })
  await page.goto('http://localhost:' + PORT + '/prova-gradi.html', { waitUntil: 'load' })
  await page.waitForTimeout(200)
  return { page, errori, rete }
}
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  sez('⭐ la pagina')
  let { page, errori, rete } = await apri(ctx)
  const txt = await page.textContent('body')
  check('nessun errore JS', errori.length === 0, errori)
  check('⭐ spiega il protocollo: 5 persone, 3 foto, scendere e risalire, stesso professionista', /5 persone/.test(txt) && /3 foto/.test(txt) && /scende dal tappetino e risale/.test(txt) && /stesso professionista/.test(txt))
  check('⭐ dice che le foto non si salvano', /non si salvano/.test(txt))
  check('⭐ cita Bland & Altman', /Bland &amp; Altman|Bland & Altman/.test(txt) && /1996;313:744/.test(txt))
  check('tre viste', (await page.$$('#viste .chip')).length === 3)

  sez('⭐⭐ P1, di fronte: tre foto misurate con l’editor condiviso')
  await page.click('#viste .chip[data-v="1"]')
  const spalla = [0.25, 0.262, 0.256]   // la spalla sinistra un filo diversa a ogni foto
  for (let i = 0; i < 3; i++) {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-scatta="' + i + '"]')])
    await fc.setFiles({ name: 'f.svg', mimeType: 'image/svg+xml', buffer: FOTO })
    await page.waitForTimeout(500)
    if (i === 0) {
      check('⭐ si apre lo stesso editor dello schermo del paziente', await page.isVisible('#ed'))
      check('⭐ col titolo giusto', /P1 · Di fronte · foto 1/.test(await page.textContent('#ed-tit')))
      check('senza modello: punti a mano', /a mano/.test(await page.textContent('#ed-stato')))
    }
    await page.evaluate(y => { const s = PolEditorPunti.stato(); s.punti.spalla_dx = { x: .39, y: .25 }; s.punti.spalla_sx = { x: .61, y } }, spalla[i])
    await page.click('#ed-salva'); await page.waitForTimeout(250)
  }
  check('l’editor si chiude', !(await page.isVisible('#ed')))
  check('⭐ tre caselle fatte', (await page.$$('.slot.fatto')).length === 3)
  check('⭐ il contatore della persona: 3/9', /3\/9/.test(await page.textContent('#persone')))
  check('⭐ «Correggi punti» c’è finché la foto è in memoria', (await page.$$('[data-correggi]')).length === 3)
  const S = await page.evaluate(() => JSON.parse(localStorage.getItem('pol-fase0-gradi-v1')))
  check('⭐ in memoria: punti e gradi, NIENTE foto', S.persone.P1.frontale.length === 3 && S.persone.P1.frontale.every(f => f.punti && f.gradi && !('url' in f)) && !/blob:|data:image/.test(JSON.stringify(S)))
  const r1 = await page.evaluate(() => __fase0.calcola().find(x => x.chiave === 'frontale:spalle'))
  const v = S.persone.P1.frontale.map(f => f.gradi.find(m => m.k === 'spalle').gradi)
  const m = v.reduce((a, b) => a + b) / 3, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / 2)
  check('⭐⭐ la soglia è 2,77 × SD entro la persona (con segno)', r1 && r1.r.persone === 1 && Math.abs(r1.r.soglia - Math.round(2.77 * sd * 10) / 10) < 1e-9, [r1, v])
  check('⭐ con 1 persona la soglia è indicativa (niente ✓)', /1\/5/.test(await page.textContent('#risultati')) && (await page.$$('#risultati td.ok')).length === 0)

  sez('⭐⭐ con 5 persone la soglia è pronta, e il testo da mandare ha ERRORE')
  await page.evaluate(() => {
    const S = JSON.parse(localStorage.getItem('pol-fase0-gradi-v1'))
    const base = S.persone.P1.frontale[0]
    ;['P2', 'P3', 'P4', 'P5'].forEach((p, j) => {
      S.persone[p] = { frontale: [0, 1, 2].map(i => ({ ...base, gradi: base.gradi.map(x => x.k === 'spalle' ? { ...x, gradi: x.gradi + (i - 1) * 0.5 * (j + 1) } : x) })) }
    })
    localStorage.setItem('pol-fase0-gradi-v1', JSON.stringify(S))
  })
  ;({ page, errori, rete } = await apri(ctx))
  check('⭐ ricaricando i dati ci sono ancora', /3\/9/.test(await page.textContent('#persone')))
  check('⭐ ma senza la foto «Correggi punti» sparisce (resta «Rifai»)', await page.evaluate(() => { document.querySelector('#viste .chip[data-v="1"]').click(); return document.querySelectorAll('[data-correggi]').length === 0 && document.querySelectorAll('[data-rifai]').length === 3 }))
  const ris = await page.textContent('#risultati')
  check('⭐⭐ 5/5 persone e soglia con ✓', /5\/5/.test(ris) && /✓/.test(ris), ris)
  const t = await page.evaluate(() => __fase0.testo())
  const js = JSON.parse(t.split('\n').pop())
  check('⭐⭐ il testo da mandare contiene ERRORE con «frontale:spalle»', typeof js['frontale:spalle'] === 'number' && js['frontale:spalle'] > 0, t)
  check('⛔ e SOLO le misure con 5 persone', Object.keys(js).every(k => k.startsWith('frontale:')), js)
  await page.click('#copia'); await page.waitForTimeout(200)
  check('«Copia» non rompe niente', errori.length === 0, errori)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')])
  const csv = fs.readFileSync(await dl.path(), 'utf8')
  check('⭐ CSV: una riga per foto e misura, con la virgola decimale', /persona;vista;foto;misura;gradi/.test(csv) && csv.split('\n').length === 1 + 5 * 3 * 4 && /P1;frontale;2;spalle;-?\d+,\d/.test(csv), csv.slice(0, 200))
  page.once('dialog', d => d.accept())
  await page.click('#azzera'); await page.waitForTimeout(200)
  check('⭐ «Azzera tutto» (con conferma) svuota', await page.evaluate(() => Object.keys(__fase0.stato().persone).length === 0 || JSON.stringify(__fase0.stato().persone).indexOf('gradi') < 0))
  check('⛔ nessuna chiamata fuori da questa pagina (niente database)', rete.length === 0, rete)
  check('nessun errore JS', errori.length === 0, errori)

  sez('test.html: una riga nuova nella lista')
  const th = fs.readFileSync('test.html', 'utf8')
  check('⭐ «Gradi · Fase 0» porta a prova-gradi.html', /fase0-gradi/.test(th) && /prova-gradi\.html/.test(th))
  await ctx.close()
} finally { await browser.close(); server.close() }
console.log('\n' + '='.repeat(66))
console.log(ko === 0 ? `TUTTO VERDE — ${ok} controlli passati.` : `ROSSO — ${ok} passati, ${ko} falliti:\n  - ` + fallite.join('\n  - '))
process.exit(ko === 0 ? 0 : 1)
