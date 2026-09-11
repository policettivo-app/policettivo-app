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

// pilota con un OFFSET fisso piu' un'oscillazione scelta su un asse:
// serve a provare il carico medio, che l'offset lo misura di sicuro.
const GUIDA2 = ({ offB, offG, ampB, ampG, passoMs, durataMs }) => {
  const t0 = performance.now()
  const iv = setInterval(() => {
    const tr = performance.now() - t0
    if (tr > durataMs) { clearInterval(iv); return }
    const f = 2 * Math.PI * (tr / 1000)
    const b = offB + ampB * Math.sin(f)
    const g = offG + ampG * Math.cos(f)
    const eo = new Event('deviceorientation')
    Object.defineProperty(eo, 'beta',  { value: b })
    Object.defineProperty(eo, 'gamma', { value: g })
    window.dispatchEvent(eo)
    const em = new Event('devicemotion')
    const rad = Math.PI / 180
    Object.defineProperty(em, 'accelerationIncludingGravity', {
      value: { x: 9.81 * Math.sin(g * rad), y: 9.81 * Math.sin(b * rad), z: 9.81 }
    })
    Object.defineProperty(em, 'acceleration', { value: { x: 0, y: 0, z: 0 } })
    window.dispatchEvent(em)
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
  check('marker prova-oscillazione-v2', src.includes('prova-oscillazione-v2'))
  check('marker prova-oscillazione-v3', src.includes('prova-oscillazione-v3'))
  check('marker prova-oscillazione-v4', src.includes('prova-oscillazione-v4'))
  check('marker prova-oscillazione-v5', src.includes('prova-oscillazione-v5'))
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
  check('l’etichetta della prova è salvata', p.evento === 'zero tavola', p.evento)
  check('i piedi sono salvati', p.piedi === 'scalzo', p.piedi)
  check('l’attesa scelta è salvata', p.attesa_s === 5, p.attesa_s)

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
  check('lo storico calcola il CV', /CV/.test(lista), lista)
  // r=3 → ellisse 84.7 ; r=3.3 → 102.5 : media 93.6, sd 12.6, CV ~13%
  const perc = Number((lista.match(/ellisse[^]*?CV\s*(\d+)%/) || [])[1])
  check('e il CV dell’ellisse è quello giusto (~13%)', perc >= 9 && perc <= 18, perc)

  await page.click('#btn-copia')
  const testo = await page.inputValue('#export')
  check('il riassunto da copiare contiene le due prove', (testo.match(/ellisse/g) || []).length >= 2)
  check('il riassunto contiene la frequenza reale', /Hz reali/.test(testo), testo.slice(0, 200))
  await ctx.close()
}

sez('v5 · i due test, e le spiegazioni')
{
  const { page, ctx, errori } = await apri(browser)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  for (const t of ['zero tavola', 'beccheggio', 'rollio'])
    check('c’è il test «' + t + '»', await page.isVisible('#chips .chip[data-e="' + t + '"]'))
  check('c’è la taratura del verso', await page.isVisible('#chips .chip[data-e="taratura avanti"]'))
  check('gli occhi si scelgono a parte', await page.isVisible('#occhi .chip[data-o="chiusi"]'))

  const z = await page.textContent('#spiega')
  check('lo zero tavola è spiegato', /NESSUNO sopra/.test(z), z)
  check('e dice che va rifatto a ogni configurazione', /ogni cambio di/.test(z), z)
  await page.click('#chips .chip[data-e="beccheggio"]')
  const bc = await page.textContent('#spiega')
  check('il beccheggio nomina il giallo davanti e dietro', /GIALLO davanti e dietro/.test(bc), bc)
  check('e dice cosa misura: punte o tallone', /PUNTE/.test(bc) && /TALLONE/.test(bc), bc)
  await page.click('#chips .chip[data-e="rollio"]')
  const rl = await page.textContent('#spiega')
  check('il rollio nomina il giallo ai lati', /GIALLO ai lati/.test(rl), rl)
  check('e dice cosa misura: destra o sinistra', /DESTRA/.test(rl) && /SINISTRA/.test(rl), rl)

  check('la soglia parte da 2', (await page.inputValue('#soglia')) === '2')
  const nota = await page.textContent('#c-setup')
  check('⚠️ la soglia è dichiarata NON una norma', /non viene da nessuna norma/.test(nota))
  check('e spiega perché i mm² della pedana non si trasferiscono', /non trasferibile/.test(nota))
  await ctx.close()
}

sez('v2 · la voce dice la prova, il conto e la fine')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2')
  // si intercetta la sintesi vocale per sentire cosa avrebbe detto
  await page.evaluate(() => {
    window.__detto = []
    window.speechSynthesis.speak = u => window.__detto.push(String(u.text))
  })
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#occhi .chip[data-o="chiusi"]')
  await page.click('#btn-start')
  await page.waitForTimeout(2600)
  const detto1 = await page.evaluate(() => window.__detto.join(' | '))
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('annuncia CHE prova è', /beccheggio/.test(detto1), detto1)
  check('e con che occhi', /occhi chiusi/.test(detto1), detto1)
  check('dice cosa fare', /Sali sulla tavola/.test(detto1), detto1)
  check('dice fra quanto comincia', /fra 5 secondi/.test(detto1), detto1)

  await page.evaluate(GUIDA, { raggio: 2, giriAlSecondo: 1, passoMs: 20, durataMs: 9000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 20000 })
  const detto2 = await page.evaluate(() => window.__detto.join(' | '))
  check('conta alla rovescia a voce', /\| 5 \|/.test(' | ' + detto2 + ' | '), detto2)
  check('dice «Via» quando parte', /Via/.test(detto2), detto2)
  check('dice quando è finito', /Finito/.test(detto2), detto2)
  check('l’attesa di 5 s NON è finita nella misura',
    (await page.evaluate(() => window.__prova.ultima().durata_reale_s)) < 4,
    await page.evaluate(() => window.__prova.ultima().durata_reale_s))
  await ctx.close()
}

sez('v3 · l’ellisse si può disegnare, e i conti tornano')
{
  const { page, ctx, errori } = await apri(browser)
  const c = await page.evaluate(() => {
    const xs = [], ys = []
    const N = 720
    // ellisse vera: 4° su un asse, 1° sull'altro
    for (let i = 0; i < N; i++) { const a = 2*Math.PI*i/N; xs.push(4*Math.cos(a)); ys.push(1*Math.sin(a)) }
    return window.__prova.metriche(xs, ys, 30)
  })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  // π·semiA·semiB DEVE tornare esattamente l'area calcolata: e' la stessa misura
  check('π · semiA · semiB = area dell’ellisse',
    vicino(Math.PI * c.semiA * c.semiB, c.area, 0.1), { disegnata: Math.PI*c.semiA*c.semiB, calcolata: c.area })
  check('il semiasse lungo sta sull’asse lungo', c.semiA > c.semiB, { a: c.semiA, b: c.semiB })
  check('su un’ellisse orizzontale l’inclinazione è ~0', Math.abs(c.angolo) < 0.02, c.angolo)
  check('il centro è dove deve stare', Math.abs(c.mx) < 0.01 && Math.abs(c.my) < 0.01, { mx: c.mx, my: c.my })
  await ctx.close()
}

sez('v3 · data e ora, nota dopo l’esito, e lo zero della tavola')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start')
  await page.waitForTimeout(120)
  await page.evaluate(GUIDA, { raggio: 2, giriAlSecondo: 1, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)

  const q = await page.textContent('#quando')
  check('il risultato mostra data e ora', /20\d\d/.test(q) && /:/.test(q), q)
  check('e ripete la configurazione', /tavola/.test(q) || q.length > 10, q)

  await page.fill('#nota-dopo', 'mi sono mosso al quindicesimo secondo')
  await page.waitForTimeout(120)
  await page.click('#btn-copia')
  const testo = await page.inputValue('#export')
  check('la nota scritta DOPO finisce nel riassunto', /quindicesimo secondo/.test(testo), testo.slice(0,300))
  check('il riassunto porta data e ora della prova', /\d{2}\/\d{2}\/20\d\d/.test(testo), testo.slice(0,300))
  await ctx.close()
}

sez('v3 · la voce si sblocca DENTRO il tocco (se no iPhone la zittisce)')
{
  const { page, ctx, errori } = await apri(browser, '?dur=1&via=1')
  await page.evaluate(() => {
    window.__ordine = []
    const vero = window.speechSynthesis.speak.bind(window.speechSynthesis)
    window.speechSynthesis.speak = u => { window.__ordine.push({ t: String(u.text), dopoAwait: window.__awaited === true }); }
    const permOrig = window.DeviceOrientationEvent
    // si finge un permesso ASINCRONO, come su iPhone
    window.DeviceOrientationEvent = window.DeviceOrientationEvent || function(){}
    window.DeviceOrientationEvent.requestPermission = () =>
      new Promise(r => setTimeout(() => { window.__awaited = true; r('granted') }, 200))
  })
  await page.click('#btn-start')
  await page.waitForTimeout(600)
  const ord = await page.evaluate(() => window.__ordine)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('il primo speak parte PRIMA dell’await del permesso',
    ord.length > 0 && ord[0].dopoAwait === false, ord)
  check('e le frasi vere arrivano dopo', ord.length > 1, ord.map(o => o.t))
  await ctx.close()
}

sez('v4 · il percorso lisciato toglie il tremolio del sensore')
{
  const { page, ctx, errori } = await apri(browser)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  // un cerchio PULITO: lisciato e grezzo devono quasi coincidere
  const pulito = await page.evaluate(() => {
    const xs = [], ys = []
    for (let i = 0; i < 1800; i++) { const a = 2*Math.PI*2*i/1800; xs.push(3*Math.cos(a)); ys.push(3*Math.sin(a)) }
    return window.__prova.metriche(xs, ys, 30, 60)
  })
  check('su un segnale pulito il lisciato ≈ il grezzo',
    vicino(pulito.percorsoLisciato, pulito.percorso, 6),
    { grezzo: pulito.percorso, lisciato: pulito.percorsoLisciato })

  // lo stesso cerchio SPORCATO con un tremolio da sensore
  const sporco = await page.evaluate(() => {
    const xs = [], ys = []
    let sx = 12345
    const rnd = () => { sx = (sx * 1103515245 + 12345) & 0x7fffffff; return sx / 0x7fffffff - 0.5 }
    for (let i = 0; i < 1800; i++) {
      const a = 2*Math.PI*2*i/1800
      xs.push(3*Math.cos(a) + rnd()*0.12)
      ys.push(3*Math.sin(a) + rnd()*0.12)
    }
    return window.__prova.metriche(xs, ys, 30, 60)
  })
  check('⭐ il tremolio gonfia moltissimo il percorso GREZZO',
    sporco.percorso > pulito.percorso * 3,
    { pulito: pulito.percorso, sporco: sporco.percorso })
  check('⭐ ma il LISCIATO resta vicino al vero',
    vicino(sporco.percorsoLisciato, pulito.percorso, 15),
    { vero: pulito.percorso, lisciato: sporco.percorsoLisciato })
  check('e l’ellisse quasi non se ne accorge (è una varianza, non una somma)',
    vicino(sporco.area, pulito.area, 10), { pulito: pulito.area, sporco: sporco.area })
  check('la finestra di lisciatura è 0,25 s a 60 Hz = 15 campioni',
    pulito.finestraLisciata === 15, pulito.finestraLisciata)
  await ctx.close()
}

sez('v4 · il CV, e il confronto col rumore')
{
  const { page, ctx, errori } = await apri(browser)
  const st = await page.evaluate(() => window.__prova.statistiche([28.98, 20.21, 14.44]))
  check('nessun errore JS in pagina', errori.length === 0, errori)
  // gli occhi aperti veri del 10 settembre: media 21.21, sd 7.32, CV 34.5%
  check('media giusta sui dati veri', vicino(st.media, 21.21, 0.5), st.media)
  check('scarto tipo giusto', vicino(st.sd, 7.32, 1), st.sd)
  check('CV giusto', vicino(st.cv, 34.5, 1), st.cv)
  check('con una prova sola il CV non si inventa',
    (await page.evaluate(() => window.__prova.statistiche([5]).cv)) === null)
  await ctx.close()
}

sez('v4 · la configurazione raggruppa le prove')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  check('c’è il campo configurazione', await page.isVisible('#config'))
  await page.fill('#config', 'tavola 1 cuscino')
  await page.click('#btn-start')
  await page.waitForTimeout(120)
  await page.evaluate(GUIDA, { raggio: 2, giriAlSecondo: 1, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const lista = await page.textContent('#lista')
  check('lo storico raggruppa per configurazione', /tavola 1 cuscino/.test(lista), lista)
  await page.click('#btn-copia')
  const testo = await page.inputValue('#export')
  check('la configurazione finisce nel riassunto', /\[tavola 1 cuscino\]/.test(testo), testo.slice(0,300))
  check('e anche il percorso lisciato', /LISCIATO/.test(testo), testo.slice(0,400))
  await ctx.close()
}

sez('⭐ v5 · IL CARICO: lo zero tavola fa da riferimento')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.fill('#config', 'giallo avanti-dietro')

  // 1) zero tavola: la tavola scarica sta a beta +3, gamma -1
  await page.click('#chips .chip[data-e="zero tavola"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 3, offG: -1, ampB: 0, ampG: 0, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  const zeri = await page.evaluate(() => window.__prova.zeri())
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('lo zero della tavola è registrato per quella configurazione',
    zeri['giallo avanti-dietro'] && vicino(zeri['giallo avanti-dietro'].beta, 3, 3), zeri)

  // 2) beccheggio: adesso la tavola sta a beta +5 -> carico avanti = 5 - 3 = 2 gradi
  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 5, offG: -1, ampB: 1.2, ampG: 0.15, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  const p = await page.evaluate(() => window.__prova.ultima())
  check('⭐ il carico è la differenza dallo zero, non il valore assoluto',
    vicino(p.carico_avanti, 2, 15), { atteso: 2, avuto: p.carico_avanti })
  check('sull’altro asse il carico è ~0 (stesso offset dello zero)',
    Math.abs(p.carico_destra) < 0.4, p.carico_destra)
  check('il carico dell’asse del test è quello del beccheggio',
    p.carico_principale === p.carico_avanti)

  const box = await page.textContent('#carico-box')
  check('a schermo scrive la PAROLA, non un segno', /AVANTI/.test(box), box)
  check('e non dice indietro', !/INDIETRO/.test(box), box)
  check('mostra le due oscillazioni separate', /oscillazione avanti-dietro/.test(box) && /oscillazione destra-sinistra/.test(box))
  check('l’ellisse resta, come chiesto', /ellisse 95%/.test(box), box)
  check('dice se è dentro o fuori la soglia', /soglia/.test(box), box)

  const omini = await page.innerHTML('#omini')
  check('ci sono i tre omini', (omini.match(/<svg/g) || []).length === 3, (omini.match(/<svg/g) || []).length)
  check('l’omino dall’alto ha il punto di carico', /circle/.test(omini))
  check('e le scritte avanti/indietro', /AVANTI/.test(omini) && /INDIETRO/.test(omini))
  await ctx.close()
}

sez('⭐ v5 · senza zero tavola lo dice, invece di dare un numero falso')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.fill('#config', 'mai azzerata')
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 4, offG: 0, ampB: 1, ampG: 0.1, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const box = await page.textContent('#carico-box')
  check('avvisa che manca lo zero tavola', /Manca lo/.test(box) && /zero tavola/.test(box), box)
  check('e dice che il carico è misurato dall’orizzontale', /orizzontale/.test(box), box)
  const p = await page.evaluate(() => window.__prova.ultima())
  check('e lo registra nel dato', p.ha_zero_tavola === false)
  await page.click('#btn-copia')
  check('il riassunto lo marca', /SENZA zero tavola/.test(await page.inputValue('#export')))
  await ctx.close()
}

sez('⭐ v5 · la taratura impara da che parte è «avanti»')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.fill('#config', 'tarata')
  // il sensore di questo telefono ha il verso INVERTITO: sporgendosi avanti beta scende
  await page.click('#chips .chip[data-e="taratura avanti"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: -6, offG: 0, ampB: 0.3, ampG: 0.1, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('⭐ ha capito che il verso è invertito',
    (await page.evaluate(() => window.__prova.verso().beta)) === -1)

  // ora una prova con beta negativo deve leggersi AVANTI, non indietro
  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: -2, offG: 0, ampB: 0.8, ampG: 0.1, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  const box = await page.textContent('#carico-box')
  check('⭐ col verso tarato legge AVANTI, non INDIETRO', /AVANTI/.test(box), box)
  const p = await page.evaluate(() => window.__prova.ultima())
  check('e il numero è positivo', p.carico_avanti > 0, p.carico_avanti)
  await ctx.close()
}

sez('⭐ v5 · se il cuscino è girato, lo dice')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.fill('#config', 'girata')
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  // si muove soprattutto di LATO, ma il test scelto e' il beccheggio
  await page.evaluate(GUIDA2, { offB: 0, offG: 0, ampB: 0.2, ampG: 3, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const av = await page.textContent('#avviso-asse')
  check('⭐ avvisa che si è mosso sull’altro asse', /altro asse/.test(av), av)
  check('e dice cosa controllare', /cuscino/.test(av) && /telefono/.test(av), av)

  // e viceversa: col rollio, nessun avviso
  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="rollio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 0, offG: 0, ampB: 0.2, ampG: 3, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('col test giusto l’avviso non compare', (await page.textContent('#avviso-asse')).trim() === '')
  await ctx.close()
}

sez('⭐ v5 · il colore segue la soglia, e la soglia la decidi tu')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  const dentro = await page.evaluate(() => window.__prova.colore(1.2, 2))
  const oltre  = await page.evaluate(() => window.__prova.colore(2.6, 2))
  const molto  = await page.evaluate(() => window.__prova.colore(5.0, 2))
  const senza  = await page.evaluate(() => window.__prova.colore(5.0, 0))
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('sotto la soglia è verde', dentro.c === '#0a7d33', dentro)
  check('poco oltre è arancione', oltre.c === '#b07500', oltre)
  check('molto oltre è rosso', molto.c === '#c0392b', molto)
  check('senza soglia non colora e lo dice', /nessuna soglia/.test(senza.n), senza)
  check('il segno non conta, conta la distanza dal centro',
    (await page.evaluate(() => window.__prova.colore(-1.2, 2))).c === dentro.c)
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
