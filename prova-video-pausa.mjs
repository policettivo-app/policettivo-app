/* prova-video-pausa.mjs — video-pausa-v1
 * video-esercizio.html («Registra nuovo contenuto personalizzato»):
 * la registrazione si mette in pausa e riprende; i 40 secondi contano solo
 * il tempo registrato; il video finale è uno solo. Chromium con fotocamera finta.
 *   npm i --no-save playwright && node prova-video-pausa.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const PORT = 8493
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  const f = path.join(ROOT, u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f))
})
let ok = 0, ko = 0
function check(n, c, x) { if (c) { ok++; console.log('  ✅ ' + n) } else { ko++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')) } }

const FINTO = () => {
  const q = () => { const o = { select: () => o, eq: () => o, order: () => o, is: () => o, maybeSingle: () => Promise.resolve({ data: null, error: null }), then: (r) => r({ data: [], error: null }) }; return o }
  window.supabase = { createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1', email: 'studio@esempio.it' } } } }) },
    from: q, rpc: () => Promise.resolve({ data: null, error: null }),
    storage: { from: () => ({ upload: () => Promise.resolve({}), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) }
  }) }
  window.policettivoCheckPremium = async () => { window.isPremium = true }
}

server.listen(PORT)
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera', 'microphone'] })
  await ctx.route('**://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
  await ctx.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await ctx.route('**/utils-premium.js*', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
  const page = await ctx.newPage()
  const errori = []; page.on('pageerror', e => errori.push(String(e)))
  await page.addInitScript(FINTO)
  await page.goto('http://localhost:' + PORT + '/video-esercizio.html?id=p1', { waitUntil: 'networkidle' })
  await page.evaluate(() => { window.isPremium = true })
  const vis = id => page.$eval('#' + id, e => getComputedStyle(e).display !== 'none')
  const num = () => page.$eval('#countdown-num', e => Number(e.textContent))

  console.log('\n── Pausa e ripresa durante la registrazione')
  await page.evaluate(() => avviaCamera('video'))
  await page.waitForTimeout(600)
  check('prima di registrare il pulsante Pausa non c\'è', !(await vis('btn-pausa-rec')))
  await page.click('#btn-start-rec')
  await page.waitForTimeout(2300)
  check('durante la registrazione compare «⏸ Pausa»', await vis('btn-pausa-rec') && (await page.textContent('#btn-pausa-rec')).includes('Pausa'))
  const n1 = await num()
  check('il conto scende mentre registra', n1 <= 38, n1)
  await page.click('#btn-pausa-rec')
  check('il registratore è in pausa', await page.evaluate(() => mediaRecorder.state) === 'paused')
  check('il pulsante diventa «▶ Riprendi»', (await page.textContent('#btn-pausa-rec')).includes('Riprendi'))
  check('in alto si legge «IN PAUSA»', (await page.textContent('#rec-badge')).includes('IN PAUSA'))
  const nP = await num()
  await page.waitForTimeout(3200)
  check('in pausa i 40 secondi NON scendono', (await num()) === nP, [nP, await num()])
  await page.click('#btn-pausa-rec')
  check('riprende a registrare', await page.evaluate(() => mediaRecorder.state) === 'recording')
  check('in alto torna «REC»', (await page.textContent('#rec-badge')).includes('REC'))
  await page.waitForTimeout(2200)
  check('dopo la ripresa il conto riparte', (await num()) < nP, [nP, await num()])
  await page.click('#btn-stop-rec')
  await page.waitForTimeout(1200)
  check('alla fine c\'è UN video in anteprima', (await page.$$('#preview-container video')).length === 1)
  check('il video ha dei dati', await page.evaluate(() => pendingFile && pendingFile.size > 1000), await page.evaluate(() => pendingFile && pendingFile.size))
  check('il pulsante Pausa sparisce', !(await vis('btn-pausa-rec')))
  // durata vera del file: ~2,3 + ~2,2 s registrati, la pausa di 3,2 s NON deve esserci
  const b64 = await page.evaluate(async () => { const b = new Uint8Array(await pendingFile.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s) })
  fs.writeFileSync('/tmp/video-pausa.webm', Buffer.from(b64, 'base64'))
  const { execSync } = await import('child_process')
  let dur = NaN
  try { dur = Number(execSync('ffmpeg -v error -i /tmp/video-pausa.webm -f null - -progress pipe:1 2>/dev/null | grep out_time_ms | tail -1 | cut -d= -f2').toString().trim()) / 1e6 } catch (e) {}
  check('il video dura il tempo registrato (circa 4,5 s), senza i 3,2 s di pausa', dur > 3.5 && dur < 6.2, dur)

  console.log('\n── Fermare mentre è in pausa')
  await page.evaluate(() => { document.getElementById('preview-section').style.display = 'none'; return avviaCamera('video') })
  await page.waitForTimeout(600)
  await page.click('#btn-start-rec'); await page.waitForTimeout(1500)
  await page.click('#btn-pausa-rec'); await page.waitForTimeout(500)
  await page.click('#btn-stop-rec'); await page.waitForTimeout(1200)
  check('si ferma anche in pausa e dà il video', await page.evaluate(() => pendingFile && pendingFile.size > 500))

  console.log('\n── Browser che non sa mettere in pausa: come prima')
  await page.evaluate(() => { MediaRecorder.prototype.pause = undefined; document.getElementById('preview-section').style.display = 'none'; return avviaCamera('video') })
  await page.waitForTimeout(600)
  await page.click('#btn-start-rec'); await page.waitForTimeout(800)
  check('il pulsante Pausa non compare', !(await vis('btn-pausa-rec')))
  check('Ferma c\'è', await vis('btn-stop-rec'))
  await page.click('#btn-stop-rec'); await page.waitForTimeout(800)
  check('nessun errore JS', errori.length === 0, errori)
  check('marker video-pausa-v1 nel file', fs.readFileSync(path.join(ROOT, 'video-esercizio.html'), 'utf8').includes('video-pausa-v1'))
} finally { await browser.close(); server.close() }
console.log('\n' + (ko ? '❌ ROSSI: ' + ko : '✅ TUTTI VERDI') + ' — ' + ok + ' ok, ' + ko + ' ko')
if (ko) process.exit(1)
