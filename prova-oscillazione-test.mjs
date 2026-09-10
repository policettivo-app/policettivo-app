/* prova-oscillazione-test.mjs — prova-oscillazione-v1
 *
 * Controlla la pagina della prova del banco: la matematica contro valori
 * calcolabili a mano, e il giro completo con sensori finti dentro Chromium.
 * node --check guarda la sintassi, non il comportamento: qui si misura.
 *
 *   node prova-oscillazione-test.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const PORT = 8481
const PAGINA = 'prova-oscillazione.html'

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  const f = path.join(ROOT, u === '/' ? 'index.html' : u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
  res.end(fs.readFileSync(f))
})

let ok = 0, ko = 0
const fallite = []
function check(nome, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + nome) }
  else { ko++; fallite.push(nome); console.log('  ❌ ' + nome + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')) }
}
const vicino = (a, b, tolPerc) => Math.abs(a - b) <= Math.abs(b) * tolPerc / 100
const sez = t => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length)))

// sensori finti: si spara una serie di eventi veri dentro la pagina
// L'angolo si ricava dal TEMPO passato, non dal numero di passi: così la
// verifica non dipende da quanta parte del cerchio la finestra ha preso.
// A giri al secondo costanti la velocità è costante = 2·π·r·giri, e quella
// si può confrontare con un numero calcolato a mano.
const GUIDA = ({ raggio, giriAlSecondo, passoMs, durataMs }) => {
  window.__finto = { mandati: 0 }
  const t0 = performance.now()
  const iv = setInterval(() => {
    const trascorso = performance.now() - t0
    if (trascorso > durataMs) { clearInterval(iv); return }
    const ang = 2 * Math.PI * giriAlSecondo * (trascorso / 1000)
    const g = raggio * Math.cos(ang)     // gamma  → asse x
    const b = raggio * Math.sin(ang)     // beta   → asse y
    const eo = new Event('deviceorientation')
    Object.defineProperty(eo, 'beta',  { value: b })
    Object.defineProperty(eo, 'gamma', { value: g })
    Object.defineProperty(eo, 'alpha', { value: 0 })
    window.dispatchEvent(eo)
    const em = new Event('devicemotion')
    // stessa inclinazione, ma passata come vettore gravita'
    const rad = Math.PI / 180
    Object.defineProperty(em, 'accelerationIncludingGravity', {
      value: { x: 9.81 * Math.sin(g * rad), y: 9.81 * Math.sin(b * rad), z: 9.81 }
    })
    Object.defineProperty(em, 'acceleration', { value: { x: 0, y: 0, z: 0 } })
    window.dispatchEvent(em)
    window.__finto.mandati++
  }, passoMs)
}

async function apri(browser, query = '') {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } })
  const page = await ctx.newPage()
  const errori = []
  page.on('pageerror', e => errori.push(String(e)))
  await page.goto('http://localhost:' + PORT + '/' + PAGINA + query, { waitUntil: 'load' })
  await page.waitForTimeout(150)
  return { page, ctx, errori }
}

server.listen(PORT)
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch(fs.existsSync(CHROME)
  ? { executablePath: CHROME, args: ['--no-sandbox'] }
  : { args: ['--no-sandbox'] })

try {

sez('La pagina è davvero isolata dall’app in uso')
{
  const src = fs.readFileSync(path.join(ROOT, PAGINA), 'utf8')
  check('marker prova-oscillazione-v1', src.includes('prova-oscillazione-v1'))
  check('non carica nessuno script dell’app', !/<script[^>]*\ssrc=/i.test(src))
  check('non parla con Supabase', !/supabase/i.test(src))
  check('non fa nessuna fetch', !/fetch\s*\(/.test(src))
  check('non scrive in localStorage', !/localStorage|sessionStorage|indexedDB/i.test(src))
  check('è noindex', /name="robots"[^>]*noindex/.test(src))
  const altre = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== PAGINA)
  const linkata = altre.some(f => fs.readFileSync(path.join(ROOT, f), 'utf8').includes(PAGINA))
  check('nessuna pagina dell’app la linka', !linkata)
}

sez('La matematica, contro numeri calcolabili a mano')
{
  const { page, ctx, errori } = await apri(browser)
  check('la pagina si apre senza errori', errori.length === 0, errori)

  // cerchio di raggio 2°, un giro: raggio medio = 2, percorso = 2*pi*2 = 12.566,
  // covarianza = r²/2 su ogni asse, quindi ellisse = pi * 5.991 * (r²/2) = 37.65
  const c = await page.evaluate(() => {
    const xs = [], ys = []
    const N = 720
    for (let i = 0; i < N; i++) { const a = 2*Math.PI*i/N; xs.push(2*Math.cos(a)); ys.push(2*Math.sin(a)) }
    return window.__prova.metriche(xs, ys, 30)
  })
  check('raggio medio di un cerchio da 2° = 2°', vicino(c.raggio, 2, 0.5), c.raggio)
  check('percorso di un giro = 2πr = 12.57°', vicino(c.percorso, 12.566, 1), c.percorso)
  check('ellisse al 95% = π·5.991·r²/2 = 37.65°²', vicino(c.area, 37.65, 1), c.area)
  check('velocità = percorso / durata', vicino(c.velocita, 12.566/30, 1), c.velocita)
  check('raggio massimo = raggio medio, su un cerchio', vicino(c.raggioMax, 2, 1), c.raggioMax)

  // fermo davvero: tutto a zero, nessun numero inventato
  const f = await page.evaluate(() => {
    const xs = [], ys = []
    for (let i = 0; i < 500; i++) { xs.push(1.5); ys.push(-0.5) }
    return window.__prova.metriche(xs, ys, 30)
  })
  check('fermo → percorso 0', f.percorso === 0, f.percorso)
  check('fermo → ellisse 0', f.area === 0, f.area)
  check('fermo → raggio 0', f.raggio === 0, f.raggio)

  // ⭐ il motivo per cui si usa l'ellisse e NON il guscio convesso:
  // un solo campione sporco non deve far esplodere la misura
  const s = await page.evaluate(() => {
    const xs = [], ys = []
    const N = 720
    for (let i = 0; i < N; i++) { const a = 2*Math.PI*i/N; xs.push(2*Math.cos(a)); ys.push(2*Math.sin(a)) }
    xs.push(20); ys.push(0)     // un artefatto a 20°, dieci volte il segnale
    return window.__prova.metriche(xs, ys, 30)
  })
  check('un campione sporco a 20° gonfia l’ellisse meno del 50%', s.area < 37.65 * 1.5, { con: s.area, senza: 37.65 })
  check('...ma il raggio massimo lo denuncia', s.raggioMax > 19, s.raggioMax)

  // meno di 3 campioni non si inventa niente
  check('con 2 campioni non restituisce metriche',
    (await page.evaluate(() => window.__prova.metriche([1,2],[1,2],10))) === null)
  await ctx.close()
}

sez('Il giro completo, con i sensori finti')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.click('#btn-start')
  await page.waitForTimeout(120)
  // 50 Hz, cerchio da 3°, un giro al secondo. Il pilota dura piu' della
  // finestra (3 s contro 2) cosi' la misura non trova mai silenzio.
  await page.evaluate(GUIDA, { raggio: 3, giriAlSecondo: 1, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })

  check('nessun errore JS in pagina', errori.length === 0, errori)
  const p = await page.evaluate(() => window.__prova.ultima())
  check('ha registrato dei campioni', p.campioni > 50, p.campioni)
  check('la frequenza reale letta è ~50 Hz', vicino(p.hz_reale, 50, 20), p.hz_reale)
  check('ellisse dall’orientamento = π·5.991·r²/2 con r=3 → 84.7°²',
    vicino(p.orientamento.area, Math.PI*5.991*4.5, 8), p.orientamento.area)
  // ⭐ su un cerchio percorso a giri costanti la velocita' e' costante = 2·π·r·giri,
  // e NON dipende da quanta parte del cerchio la finestra ha preso: e' il numero
  // giusto da confrontare a mano. 2·π·3·1 = 18.85 °/s
  check('velocità = 2π·r·giri = 18.85°/s',
    vicino(p.orientamento.velocita, 2*Math.PI*3, 5), p.orientamento.velocita)
  check('percorso coerente con velocità × durata',
    vicino(p.orientamento.percorso, p.orientamento.velocita * p.durata_reale_s, 2),
    { percorso: p.orientamento.percorso, durata: p.durata_reale_s })
  check('raggio medio = 3°', vicino(p.orientamento.raggio, 3, 8), p.orientamento.raggio)

  // ⭐ la strada dell'accelerometro deve dare la STESSA inclinazione:
  // e' la prova che si sta leggendo la gravita', non un'integrazione
  check('l’accelerometro dà lo stesso raggio dell’orientamento',
    vicino(p.accelerometro.raggio, p.orientamento.raggio, 8),
    { acc: p.accelerometro.raggio, or: p.orientamento.raggio })
  check('l’accelerometro dà la stessa ellisse',
    vicino(p.accelerometro.area, p.orientamento.area, 12),
    { acc: p.accelerometro.area, or: p.orientamento.area })

  check('salva i campioni grezzi col loro tempo', Array.isArray(p.grezzi.t) && p.grezzi.t.length === p.campioni)
  check('i tempi crescono', p.grezzi.t[10] > p.grezzi.t[0])
  check('l’etichetta della prova è salvata', p.evento === 'telefono fermo', p.evento)

  const freq = await page.textContent('#nota-freq')
  check('a schermo compare la frequenza reale', /Hz reali/.test(freq), freq)
  const tab = await page.textContent('#tab-metriche')
  check('la tabella mostra l’ellisse al 95%', /°²/.test(tab))
  check('NON compare nessun indice «stabilità %» inventato',
    !/stabilit[aà]\s*%/i.test(await page.content()))
  await ctx.close()
}

sez('Due prove di fila: lo scarto si vede da solo')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  for (const raggio of [3, 3.3]) {
    await page.click(raggio === 3 ? '#btn-start' : '#btn-ancora')
    await page.waitForTimeout(120)
    await page.evaluate(GUIDA, { raggio, giriAlSecondo: 1, passoMs: 20, durataMs: 3000 })
    await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
    await page.waitForTimeout(100)
  }
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('ha tenuto tutte e due le prove', (await page.evaluate(() => window.__prova.prove().length)) === 2)
  check('lo storico è comparso', await page.isVisible('#c-storico'))
  const lista = await page.textContent('#lista')
  check('lo storico dice quante prove', /2 prove/.test(lista), lista)
  check('lo storico calcola lo scarto fra la più piccola e la più grande', /scarto/.test(lista), lista)
  // r=3 → 84.7 ; r=3.3 → 102.5 : lo scarto vero e' ~19%
  const perc = Number((lista.match(/scarto[^0-9]*(\d+)%/) || [])[1])
  check('e lo scarto è quello giusto (~19%)', perc >= 14 && perc <= 24, perc)

  await page.click('#btn-copia')
  const testo = await page.inputValue('#export')
  check('il riassunto da copiare contiene le due prove', (testo.match(/ellisse/g) || []).length >= 2)
  check('il riassunto contiene la frequenza reale', /Hz reali/.test(testo), testo.slice(0, 200))
  await ctx.close()
}

sez('Se i sensori non rispondono, non si inventa un risultato')
{
  const { page, ctx, errori } = await apri(browser, '?dur=1&via=1')
  await page.click('#btn-start')
  // nessun evento: silenzio totale
  await page.waitForTimeout(2200)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const p = await page.evaluate(() => window.__prova.ultima())
  check('la prova è registrata con zero campioni', p && p.campioni === 0, p && p.campioni)
  check('le metriche restano vuote, non a zero finto', p && p.orientamento === null)
  const tab = await page.textContent('#tab-metriche')
  check('a schermo scrive «—», non un numero', /—/.test(tab), tab)
  await ctx.close()
}

sez('Il permesso negato lo dice, e dice cosa fare')
{
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } })
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    window.DeviceOrientationEvent = window.DeviceOrientationEvent || function(){}
    window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('denied')
  })
  await page.goto('http://localhost:' + PORT + '/' + PAGINA + '?dur=1&via=1', { waitUntil: 'load' })
  await page.click('#btn-start')
  await page.waitForSelector('#err', { state: 'visible', timeout: 8000 })
  const t = await page.textContent('#err')
  check('spiega dove si riattiva su iPhone', /Movimento e orientamento/.test(t), t)
  check('avvisa del Risparmio energetico', /Risparmio energetico/i.test(t), t)
  check('non è partita nessuna misura', !(await page.isVisible('#c-misura')))
  await ctx.close()
}

} finally {
  await browser.close()
  server.close()
}

console.log('\n' + '='.repeat(66))
console.log(ko === 0 ? `TUTTO VERDE — ${ok} controlli passati.` : `ROSSO — ${ok} passati, ${ko} falliti:\n  - ` + fallite.join('\n  - '))
process.exit(ko === 0 ? 0 : 1)
