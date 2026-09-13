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
  // ⚠️ v7 — si SPEGNE il flusso della prova precedente prima di accenderne uno
  // nuovo. Senza, una guida con durataMs piu' lunga della finestra di misura
  // continua a sparare eventi dentro la prova DOPO, e la media esce sporca di
  // qualche decimo senza che si capisca perche'. E' costato un rosso vero.
  if (window.__ivFinto) clearInterval(window.__ivFinto)
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
  window.__ivFinto = iv
}

// pilota con un OFFSET fisso piu' un'oscillazione scelta su un asse:
// serve a provare il carico medio, che l'offset lo misura di sicuro.
const GUIDA2 = ({ offB, offG, ampB, ampG, passoMs, durataMs }) => {
  if (window.__ivFinto) clearInterval(window.__ivFinto)   // v7, vedi GUIDA
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
  window.__ivFinto = iv
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
  check('marker prova-oscillazione-v6', src.includes('prova-oscillazione-v6'))
  check('marker prova-oscillazione-v7', src.includes('prova-oscillazione-v7'))
  check('marker taratura-dopo-v1', src.includes('taratura-dopo-v1'))
  check('marker prova-oscillazione-v8', src.includes('prova-oscillazione-v8'))
  check('marker referto-v1', src.includes('referto-v1'))
  check('marker taratura-unica-v1', src.includes('taratura-unica-v1'))
  check('marker prova-oscillazione-v9', src.includes('prova-oscillazione-v9'))
  check('marker prova-oscillazione-v10', src.includes('prova-oscillazione-v10'))
  check('marker grafica-tavola-v1', src.includes('grafica-tavola-v1'))
  check('marker prova-oscillazione-v11', src.includes('prova-oscillazione-v11'))
  check('marker confronto-v1', src.includes('confronto-v1'))
  check('⭐ il nome nuovo è nel titolo', /<title>Oscillazione Policettiva/.test(src))
  check('e nell’intestazione della pagina', /<h1>Oscillazione Policettiva<\/h1>/.test(src))
  check('non carica nessuno script dell’app', !/<script[^>]*\ssrc=/i.test(src))
  check('non parla con Supabase', !/supabase/i.test(src))
  check('non fa nessuna fetch', !/fetch\s*\(/.test(src))
  // taratura-unica-v1 — adesso salva UNA cosa sola, e deve restare una sola:
  // due segni e una data. Nessuna misura, nessun dato di paziente.
  check('non usa sessionStorage né indexedDB', !/sessionStorage|indexedDB/i.test(src))
  check('⭐ l’unica chiave salvata è quella del verso',
    (src.match(/localStorage\.(setItem|getItem|removeItem)/g) || []).length === 3 &&
    (src.match(/CHIAVE_TARATURA/g) || []).length >= 4, src.match(/localStorage\.\w+/g))
  check('⛔ e non salva né prove né campioni',
    !/localStorage\.setItem\([^)]*prove/.test(src) && !/localStorage\.setItem\([^)]*grezz/.test(src))
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
  check('l’etichetta della prova è salvata', p.evento === 'zero tavola (beccheggio)', p.evento)
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

sez('⭐ v6 · la scheda non si sbiadisce mai (la pagina sembrava rotta)')
{
  // La v5 metteva opacity 0.45 sull'INTERA card invece che sul gruppetto degli
  // occhi. I controlli non l'hanno preso perche' guardavano il comportamento e
  // non l'aspetto: da qui in poi si guarda anche l'aspetto.
  const { page, ctx, errori } = await apri(browser)
  const opacita = async (sel) => page.evaluate(s => getComputedStyle(document.querySelector(s)).opacity, sel)
  for (const ev of ['zero tavola (beccheggio)', 'zero tavola (rollio)', 'beccheggio', 'rollio', 'taratura']) {
    await page.click('#chips .chip[data-e="' + ev + '"]')
    await page.waitForTimeout(60)
    check('con «' + ev + '» la scheda resta piena', (await opacita('#c-setup')) === '1', await opacita('#c-setup'))
  }
  check('nessun errore JS in pagina', errori.length === 0, errori)
  await page.click('#chips .chip[data-e="zero tavola (beccheggio)"]')
  check('...e solo il gruppetto degli occhi si sbiadisce',
    Number(await opacita('#blocco-occhi')) < 0.6, await opacita('#blocco-occhi'))
  await page.click('#chips .chip[data-e="beccheggio"]')
  check('che torna pieno su un test vero', (await opacita('#blocco-occhi')) === '1')

  // e tutto quello che serve resta visibile e cliccabile
  for (const sel of ['#chips', '#blocco-occhi', '#piedi', '#config', '#soglia', '#durata', '#btn-start'])
    check('resta visibile: ' + sel, await page.isVisible(sel))
  check('il pulsante è premibile', await page.isEnabled('#btn-start'))
  await ctx.close()
}

sez('v5 · i due test, e le spiegazioni')
{
  const { page, ctx, errori } = await apri(browser)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  for (const t of ['zero tavola (beccheggio)', 'zero tavola (rollio)', 'beccheggio', 'rollio'])
    check('c’è il test «' + t + '»', await page.isVisible('#chips .chip[data-e="' + t + '"]'))
  check('c’è la taratura del verso', await page.isVisible('#chips .chip[data-e="taratura"]'))
  check('gli occhi si scelgono a parte', await page.isVisible('#occhi .chip[data-o="chiusi"]'))

  const z0 = await page.textContent('#spiega')
  const z = z0
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
  check('⚠️ la soglia è dichiarata NON una norma',
    /valore di lavoro nostro, non una norma/.test(nota) && /non esistono valori di riferimento/.test(nota), nota)
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
  await page.click('#chips .chip[data-e="zero tavola (beccheggio)"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 3, offG: -1, ampB: 0, ampG: 0, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  const zeri = await page.evaluate(() => window.__prova.zeri())
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('lo zero è registrato sotto l’ORIENTAMENTO del cuscino, non sotto il testo libero',
    !!zeri['beccheggio'] && vicino(zeri['beccheggio'].beta, 3, 3), zeri)
  check('e non sotto il campo «configurazione»', zeri['giallo avanti-dietro'] === undefined, Object.keys(zeri))
  check('lo zero si porta dietro la configurazione con cui è stato preso',
    zeri['beccheggio'].conf === 'giallo avanti-dietro', zeri['beccheggio'].conf)

  // 2) beccheggio: adesso la tavola sta a beta +5 -> carico avanti = 5 - 3 = 2 gradi
  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 5, offG: -1, ampB: 1.2, ampG: 0.15, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  const c1 = await page.evaluate(() => window.__prova.carico(window.__prova.ultima()))
  check('⭐ il carico è la differenza dallo zero, non il valore assoluto',
    vicino(c1.avanti, 2, 15), { atteso: 2, avuto: c1.avanti })
  check('sull’altro asse il carico è ~0 (stesso offset dello zero)',
    Math.abs(c1.destra) < 0.4, c1.destra)
  check('il carico dell’asse del test è quello del beccheggio',
    c1.principale === c1.avanti)

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
  const cz = await page.evaluate(() => window.__prova.carico(window.__prova.ultima()))
  check('e lo registra nel dato', cz.zero === null, cz.zero)
  await page.click('#btn-copia')
  check('il riassunto lo marca', /SENZA zero tavola/.test(await page.inputValue('#export')))
  await ctx.close()
}

sez('⭐ v5 · la taratura impara da che parte è «avanti»')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.fill('#config', 'tarata')
  // il sensore di questo telefono ha il verso INVERTITO: sporgendosi avanti beta scende
  await page.click('#chips .chip[data-e="taratura"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: -6, offG: 5, ampB: 0.3, ampG: 0.3, passoMs: 20, durataMs: 3000 })
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
  const ct = await page.evaluate(() => window.__prova.carico(window.__prova.ultima()))
  check('e il numero è positivo', ct.avanti > 0, ct.avanti)
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


// ═══════════════════════════════════════════════════════════════════════
// v7 / taratura-dopo-v1 — il guasto vero dell'11 settembre 2026:
// le tarature furono fatte PER ULTIME e tutte le prove prese prima uscirono
// con l'asse avanti-indietro INVERTITO. Nessun controllo lo vedeva perche'
// nessuno faceva la taratura DOPO una prova.
// ═══════════════════════════════════════════════════════════════════════

sez('⭐ v7 · la taratura fatta ALLA FINE corregge le prove già registrate')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.fill('#config', 'assetto A')

  // 1) un test PRIMA di qualsiasi taratura: la tavola sta a beta +4
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 4, offG: 0, ampB: 1, ampG: 0.1, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  const prima = await page.evaluate(() => window.__prova.carico(window.__prova.prove()[0]))
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('senza taratura il verso è solo indovinato', prima.tarato === false)
  check('e legge «avanti» perché beta è positivo', prima.avanti > 0, prima.avanti)
  const boxPrima = await page.textContent('#carico-box')
  check('⭐ lo GRIDA a schermo: TARATURA MAI FATTA', /TARATURA MAI FATTA/.test(boxPrima), boxPrima)
  check('e dice che si può tarare dopo', /adesso, alla fine|si correggono da sole/.test(boxPrima), boxPrima)
  await page.click('#btn-copia')
  check('e l’export lo marca prova per prova',
    /NON TARATO/.test(await page.inputValue('#export')))

  // 2) la taratura, DOPO: sporgendosi avanti beta SCENDE (telefono girato)
  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="taratura"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: -6, offG: 5, ampB: 0.3, ampG: 0.3, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('la taratura ha imparato il verso invertito',
    (await page.evaluate(() => window.__prova.verso().beta)) === -1)

  // 3) ⭐ la prova di prima, riletta ADESSO, deve essersi ribaltata
  const dopo = await page.evaluate(() => window.__prova.carico(window.__prova.prove()[0]))
  check('⭐⭐ la prova già presa si è RIBALTATA da sola: adesso è INDIETRO',
    dopo.avanti < 0, { prima: prima.avanti, dopo: dopo.avanti })
  check('⭐ e il valore assoluto non è cambiato: è solo il verso',
    Math.abs(Math.abs(dopo.avanti) - Math.abs(prima.avanti)) < 0.01,
    { prima: prima.avanti, dopo: dopo.avanti })
  // ⭐ taratura-unica-v1: UN gesto diagonale ha imparato TUTTI E DUE i versi
  check('⭐ un gesto solo ha tarato anche destra-sinistra',
    (await page.evaluate(() => window.__prova.tarato().gamma)) === true)
  await page.click('#btn-copia')
  const exp = await page.inputValue('#export')
  check('⭐ l’export è pulito, senza più avvisi di taratura',
    !/NON TARATO/.test(exp.split('\n').filter(r => /CARICO/.test(r))[0]),
    exp.split('\n').filter(r => /CARICO/.test(r))[0])
  check('l’intestazione dichiara che la taratura è stata fatta', /taratura: FATTA/.test(exp))
  check('e porta la data', /taratura: FATTA il \d/.test(exp), exp.split('\n')[3])
  await ctx.close()
}

sez('⭐ v7 · anche lo ZERO fatto dopo corregge le prove già registrate')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.fill('#config', 'assetto B')
  // test senza zero: tavola a beta +5
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 5, offG: 0, ampB: 1, ampG: 0.1, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  const senza = await page.evaluate(() => window.__prova.carico(window.__prova.prove()[0]))
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('senza zero misura dall’orizzontale', vicino(senza.avanti, 5, 12), senza.avanti)
  check('e dichiara che lo zero manca', senza.zero === null)

  // lo zero, DOPO: tavola scarica a beta +3
  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="zero tavola (beccheggio)"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 3, offG: 0, ampB: 0, ampG: 0, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  const con = await page.evaluate(() => window.__prova.carico(window.__prova.prove()[0]))
  check('⭐ la prova di prima adesso è misurata dalla tavola scarica (5-3=2)',
    vicino(con.avanti, 2, 20), { prima: senza.avanti, dopo: con.avanti })
  await ctx.close()
}

sez('⭐ v7 · lo zero non si perde più se il testo della configurazione cambia')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.fill('#config', 'scritto bene')
  await page.click('#chips .chip[data-e="zero tavola (beccheggio)"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 3, offG: 0, ampB: 0, ampG: 0, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })

  // ⚠️ e' il caso dell'11 settembre: zero sotto «(non indicata)», prove sotto «Beccheggio »
  await page.click('#btn-nuova')
  await page.fill('#config', 'Beccheggio ')
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  // ⚠️ ampiezza piccola di proposito: con l'oscillazione grande il sensore finto
  // non campiona il seno in modo uniforme e la media esce di qualche decimo.
  // Qui si sta provando lo ZERO, non la media: il rumore del finto va tolto.
  await page.evaluate(GUIDA2, { offB: 5, offG: 0, ampB: 0.2, ampG: 0.1, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const c = await page.evaluate(() => window.__prova.carico(window.__prova.ultima()))
  check('⭐ lo zero vale lo stesso: il testo non è più la chiave', c.zero !== null)
  check('e il carico è la differenza (5-3=2)', vicino(c.avanti, 2, 20), c.avanti)
  const box = await page.textContent('#carico-box')
  check('⭐ ma avvisa che la configurazione scritta è cambiata',
    /configurazione/.test(box) && /scritto bene/.test(box), box)
  await ctx.close()
}

sez('⭐ v7 · beccheggio e rollio hanno due zeri distinti')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.click('#chips .chip[data-e="zero tavola (beccheggio)"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 3, offG: 0, ampB: 0, ampG: 0, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="zero tavola (rollio)"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 0, offG: 4, ampB: 0, ampG: 0, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  const zeri = await page.evaluate(() => window.__prova.zeri())
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('sono due zeri separati', !!zeri.beccheggio && !!zeri.rollio, Object.keys(zeri))
  check('quello del beccheggio ha beta 3', vicino(zeri.beccheggio.beta, 3, 10), zeri.beccheggio)
  check('quello del rollio ha gamma 4', vicino(zeri.rollio.gamma, 4, 10), zeri.rollio)

  // un test di rollio deve usare lo zero del ROLLIO, non quello del beccheggio
  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="rollio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 0, offG: 6, ampB: 0.1, ampG: 1, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  const c = await page.evaluate(() => window.__prova.carico(window.__prova.ultima()))
  check('⭐ il rollio usa lo zero del rollio (6-4=2)', vicino(c.destra, 2, 20), c.destra)
  check('e non quello del beccheggio (che darebbe 6)', Math.abs(c.destra - 6) > 1, c.destra)
  await ctx.close()
}

sez('⭐ v7 · una taratura poco netta viene RIFIUTATA, non creduta')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.click('#chips .chip[data-e="taratura"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  // si sposta di mezzo grado: sotto la soglia, il segno lo deciderebbe il rumore
  await page.evaluate(GUIDA2, { offB: -0.5, offG: 0, ampB: 0.2, ampG: 0.1, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('⭐ il verso NON è stato imparato',
    (await page.evaluate(() => window.__prova.tarato().beta)) === false)
  check('il verso resta quello di partenza',
    (await page.evaluate(() => window.__prova.verso().beta)) === 1)
  const box = await page.textContent('#carico-box')
  check('e lo dice, con la ragione e con l’asse che manca',
    /meno di 1\.5/.test(box) && /NON è stato imparato/.test(box) && /in avanti e a destra/.test(box), box)

  // la stessa taratura fatta come si deve passa
  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="taratura"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: -6, offG: 5, ampB: 0.3, ampG: 0.3, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('fatta come si deve, il verso si impara',
    (await page.evaluate(() => window.__prova.tarato().beta)) === true)
  check('e il banner della taratura sparisce',
    !/TARATURA MAI FATTA/.test(await page.textContent('#carico-box')))
  await ctx.close()
}

sez('⭐ v7 · quante oscillazioni, e a che ritmo')
{
  const { page, ctx, errori } = await apri(browser)
  // 10 giri in 10 secondi a 1 giro al secondo: 10 cicli per asse, 1 Hz
  const m = await page.evaluate(() => {
    const xs = [], ys = [], hz = 60, sec = 10
    for (let i = 0; i < hz*sec; i++) {
      const a = 2*Math.PI*1*(i/hz)
      xs.push(2*Math.cos(a)); ys.push(2*Math.sin(a))
    }
    return window.__prova.metriche(xs, ys, sec, hz)
  })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('conta ~10 oscillazioni avanti-dietro in 10 s a 1 Hz', m.cicliY >= 9 && m.cicliY <= 10, m.cicliY)
  check('e altrettante destra-sinistra', m.cicliX >= 9 && m.cicliX <= 10, m.cicliX)
  check('il ritmo dominante è 1 Hz', vicino(m.freqY, 1, 8), m.freqY)
  check('~60 oscillazioni al minuto', vicino(m.cicliAlMinY, 60, 12), m.cicliAlMinY)

  // mezza frequenza: meta' delle oscillazioni
  const m2 = await page.evaluate(() => {
    const xs = [], ys = [], hz = 60, sec = 10
    for (let i = 0; i < hz*sec; i++) {
      const a = 2*Math.PI*0.5*(i/hz)
      xs.push(2*Math.cos(a)); ys.push(2*Math.sin(a))
    }
    return window.__prova.metriche(xs, ys, sec, hz)
  })
  check('a metà ritmo conta ~5 oscillazioni', m2.cicliY >= 4 && m2.cicliY <= 5, m2.cicliY)
  check('e il ritmo dominante è 0,5 Hz', vicino(m2.freqY, 0.5, 12), m2.freqY)

  // ⭐ fermo = zero. Se qui uscisse un numero, il conteggio misurerebbe il rumore.
  const m3 = await page.evaluate(() => {
    const xs = [], ys = []
    for (let i = 0; i < 600; i++) { xs.push(1); ys.push(1) }
    return window.__prova.metriche(xs, ys, 10, 60)
  })
  check('⭐ fermo: zero oscillazioni, non un numero inventato', m3.cicliX === 0 && m3.cicliY === 0,
    { x: m3.cicliX, y: m3.cicliY })

  // ⭐ il tremolio del sensore NON deve moltiplicare il conteggio:
  // stesso segnale di prima piu' rumore, il numero deve restare vicino.
  const m4 = await page.evaluate(() => {
    const xs = [], ys = [], hz = 60, sec = 10
    let sem = 7
    const rnd = () => { sem = (sem*1103515245 + 12345) % 2147483648; return sem/2147483648 - 0.5 }
    for (let i = 0; i < hz*sec; i++) {
      const a = 2*Math.PI*1*(i/hz)
      xs.push(2*Math.cos(a) + rnd()*0.5); ys.push(2*Math.sin(a) + rnd()*0.5)
    }
    return window.__prova.metriche(xs, ys, sec, hz)
  })
  check('⭐ col rumore addosso il conteggio non esplode', m4.cicliY >= 9 && m4.cicliY <= 12, m4.cicliY)
  check('e il ritmo dominante resta 1 Hz', vicino(m4.freqY, 1, 10), m4.freqY)

  // la banda morta e la finestra viaggiano col numero: senza, due conteggi
  // fatti con parametri diversi non sono confrontabili
  check('la banda morta è dichiarata', m.bandaX > 0 && m.bandaY > 0, { x: m.bandaX, y: m.bandaY })
  check('e anche la finestra di lisciatura', m.finestraLisciata > 1, m.finestraLisciata)
  await ctx.close()
}

sez('⭐ v7 · il conteggio arriva a schermo e nell’export')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 4, offG: 0, ampB: 1.5, ampG: 0.2, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const box = await page.textContent('#carico-box')
  check('a schermo ci sono le oscillazioni contate', /oscillazioni sull’asse del test/.test(box), box)
  check('e la velocità, che nella v8 è la misura di testa', /velocità media/.test(box), box)
  const tab = await page.textContent('#tab-metriche')
  check('la tabella le riporta', /Oscillazioni avanti-dietro/.test(tab), tab)
  check('e riporta il ritmo in Hz', /Hz/.test(tab), tab)
  await page.click('#btn-copia')
  const exp = await page.inputValue('#export')
  check('l’export porta il conteggio', /oscillazioni contate/.test(exp), exp.slice(0, 400))
  check('⭐ e porta anche banda e finestra, se no due conteggi non si confrontano',
    /banda morta/.test(exp) && /lisciato su/.test(exp))
  check('l’intestazione elenca gli zeri registrati', /zeri tavola registrati/.test(exp))
  await ctx.close()
}

sez('⭐ v7 · lo storico ricalcola anche lui dopo la taratura')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.click('#chips .chip[data-e="beccheggio"]')
  for (const off of [4, 4.4]) {
    await page.click(off === 4 ? '#btn-start' : '#btn-ancora')
    await page.waitForTimeout(120)
    await page.evaluate(GUIDA2, { offB: off, offG: 0, ampB: 0.6, ampG: 0.1, passoMs: 20, durataMs: 2500 })
    await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
    await page.waitForTimeout(100)
  }
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const primaTxt = await page.textContent('#lista')
  const primaVal = Number((primaTxt.match(/CARICO \(asse del test\): (-?[\d.]+)/) || [])[1])
  check('lo storico mostra il carico', primaVal > 0, primaVal)

  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="taratura"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: -6, offG: 5, ampB: 0.3, ampG: 0.3, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  const dopoTxt = await page.textContent('#lista')
  const dopoVal = Number((dopoTxt.match(/CARICO \(asse del test\): (-?[\d.]+)/) || [])[1])
  check('⭐ e dopo la taratura lo storico si è ribaltato anche lui', dopoVal < 0, { prima: primaVal, dopo: dopoVal })
  check('lo storico riporta anche le oscillazioni contate', /oscillazioni contate/.test(dopoTxt))
  await ctx.close()
}


// ═══════════════════════════════════════════════════════════════════════
// v8 / referto-v1 — dopo il giro da 5+5 dell'11 settembre 2026
// ═══════════════════════════════════════════════════════════════════════

sez('⭐ v8 · il conteggio NON è più al contrario')
{
  const { page, ctx, errori } = await apri(browser)
  // Il caso vero: un asse con un'ampia DERIVA lenta e poche oscillazioni,
  // e un altro con poca ampiezza e molte oscillazioni. Nella v7 usciva il
  // contrario: l'asse che oscillava di più contava di meno.
  const m = await page.evaluate(() => {
    const xs = [], ys = [], hz = 60, sec = 30
    for (let i = 0; i < hz*sec; i++) {
      const t = i/hz
      // Y: deriva lenta ampia (6 gradi in 30 s) + 6 oscillazioni vere piccole
      ys.push(6*(t/30) + 0.4*Math.sin(2*Math.PI*0.2*t))
      // X: nessuna deriva, 15 oscillazioni piccole
      xs.push(0.3*Math.sin(2*Math.PI*0.5*t))
    }
    return window.__prova.metriche(xs, ys, sec, hz)
  })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('⭐ conta ~6 oscillazioni sull’asse con la deriva', m.cicliY >= 5 && m.cicliY <= 7, m.cicliY)
  check('⭐ e ~15 sull’asse senza deriva', m.cicliX >= 13 && m.cicliX <= 16, m.cicliX)
  check('il ritmo dell’asse con la deriva è 0,2 Hz', vicino(m.freqY, 0.2, 20), m.freqY)
  check('e quello dell’altro 0,5 Hz', vicino(m.freqX, 0.5, 15), m.freqX)
  check('⭐ la deriva è misurata a parte: ~4,8 gradi su Y', vicino(m.derivaY, 4.8, 20), m.derivaY)
  check('e su X è ~0', Math.abs(m.derivaX) < 0.3, m.derivaX)

  // ⚠️ il caso che nella v7 falliva: ampiezza grande = conteggio piccolo
  const v7 = await page.evaluate(() => {
    const xs = [], ys = [], hz = 60, sec = 30
    for (let i = 0; i < hz*sec; i++) {
      const t = i/hz
      ys.push(2.5*Math.sin(2*Math.PI*0.3*t))   // ampia, 9 oscillazioni
      xs.push(0.5*Math.sin(2*Math.PI*0.3*t))   // piccola, 9 oscillazioni
    }
    return window.__prova.metriche(xs, ys, sec, hz)
  })
  check('⭐⭐ stessa frequenza e ampiezze diverse danno lo STESSO conteggio',
    Math.abs(v7.cicliY - v7.cicliX) <= 1, { ampia: v7.cicliY, piccola: v7.cicliX })
  check('e sono ~9', v7.cicliY >= 8 && v7.cicliY <= 10, v7.cicliY)

  // fermo: zero, e nessuna deriva inventata
  const f = await page.evaluate(() => {
    const xs = [], ys = []
    for (let i = 0; i < 1800; i++) { xs.push(1); ys.push(1) }
    return window.__prova.metriche(xs, ys, 30, 60)
  })
  check('fermo: zero oscillazioni e zero deriva',
    f.cicliX === 0 && f.cicliY === 0 && Math.abs(f.deriva) < 0.01, { c: f.cicliX, d: f.deriva })
  await ctx.close()
}

sez('⭐ v8 · la velocità lisciata, la misura di testa')
{
  const { page, ctx, errori } = await apri(browser)
  // cerchio r=2 a 0,2 giri/s (la banda dell'oscillazione posturale vera):
  // percorso = 2*pi*2*0,2 = 2,513 gradi al secondo
  const m = await page.evaluate(() => {
    const xs = [], ys = [], hz = 60, sec = 30
    for (let i = 0; i < hz*sec; i++) { const a = 2*Math.PI*0.2*(i/hz); xs.push(2*Math.cos(a)); ys.push(2*Math.sin(a)) }
    return window.__prova.metriche(xs, ys, sec, hz)
  })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('la velocità lisciata torna col conto a mano (2,51 °/s)',
    vicino(m.velocitaLisciata, 2.513, 4), m.velocitaLisciata)
  check('ed è il percorso lisciato diviso la durata',
    Math.abs(m.velocitaLisciata - m.percorsoLisciato/30) < 0.01)
  // ⚠️ e si dichiara il limite: la media mobile da 0,25 s taglia le frequenze
  // alte. A 1 Hz l'attenuazione e' gia' del 10-15%. Sotto 0,5 Hz, dove sta
  // l'oscillazione posturale, e' trascurabile — ma va saputo, non scoperto.
  const alto = await page.evaluate(() => {
    const xs = [], ys = [], hz = 60, sec = 10
    for (let i = 0; i < hz*sec; i++) { const a = 2*Math.PI*(i/hz); xs.push(2*Math.cos(a)); ys.push(2*Math.sin(a)) }
    return window.__prova.metriche(xs, ys, sec, hz)
  })
  check('⚠️ a 1 Hz la lisciatura attenua, ed è documentato',
    alto.velocitaLisciata < 12.57 * 0.95 && alto.velocitaLisciata > 12.57 * 0.75,
    { atteso_grezzo: 12.57, lisciato: alto.velocitaLisciata })
  await ctx.close()
}

sez('⭐ v8 · il cuneo: si vede se l’oscillazione ha una direzione, no se è tonda')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  const pixelBlu = () => page.evaluate(() => {
    const c = document.getElementById('traccia'), x = c.getContext('2d')
    const d = x.getImageData(0, 0, c.width, c.height).data
    // il cuneo e' volutamente chiarissimo: si cerca la TINTA azzurrina su
    // fondo bianco (blu > rosso), non il blu pieno della traccia (R = 40)
    let n = 0
    for (let i = 0; i < d.length; i += 4)
      if (d[i] > 185 && d[i] < 250 && d[i+2] - d[i] > 6) n++
    return n
  })
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 0, offG: 0, ampB: 3, ampG: 0.25, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  const conCuneo = await pixelBlu()
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('⭐ con un’oscillazione tutta avanti-indietro il cuneo si disegna', conCuneo > 400, conCuneo)
  const testo = await page.textContent('#carico-box')
  check('il risultato mostra la velocità per prima', /velocità media/.test(testo), testo)
  check('e la deriva', /deriva/.test(testo), testo)

  // ⭐ oscillazione TONDA: il cuneo non ha niente da dire e deve sparire
  await page.click('#btn-ancora'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 0, offG: 0, ampB: 2, ampG: 2, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  await page.waitForTimeout(150)
  const tondo = await pixelBlu()
  check('⭐ su un’oscillazione tonda il cuneo quasi sparisce', tondo < conCuneo/3,
    { direzionale: conCuneo, tondo })
  await ctx.close()
}

sez('⭐ v8 · le frasi: descrivono i numeri, MAI un giudizio clinico')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.fill('#config', 'tavola 1 cuscino')
  await page.click('#chips .chip[data-e="zero tavola (beccheggio)"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 0.5, offG: 0, ampB: 0, ampG: 0, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 4, offG: 0.2, ampB: 2, ampG: 0.3, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)

  const sp = await page.textContent('#spiegazione')
  check('le frasi sono a schermo senza premere niente', sp.length > 80, sp.length)
  check('dicono che test è', /beccheggio/.test(sp), sp)
  check('dicono la velocità', /velocità media/i.test(sp), sp)
  check('dicono quante prove servono per confrontare', /almeno tre/.test(sp), sp)
  check('⚠️ e l’italiano è giusto: mai «ci sono 1 prova»', !/ci sono 1 prov/.test(sp), sp)
  check('⭐ chiudono dicendo che l’interpretazione è del professionista',
    /interpretazione clinica la scrivi tu/i.test(sp), sp)
  // ⛔ il confine che non si passa
  for (const vietata of ['propriocezion', 'deficit', 'patolog', 'diagnos', 'terapia',
                         'devi ', 'guarit', 'normale per la tua età', 'nella norma'])
    check('⛔ non contiene «' + vietata + '»', !new RegExp(vietata, 'i').test(sp), sp)

  check('il pulsante della voce c’è', await page.isVisible('#btn-spiega'))
  await page.click('#btn-spiega')
  await page.waitForTimeout(200)
  check('premendolo non esplode niente', errori.length === 0, errori)
  await ctx.close()
}

sez('⭐ v8 · la frase cambia col dato, e avvisa quando il carico è troppo piccolo')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.click('#chips .chip[data-e="zero tavola (beccheggio)"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 0, offG: 0, ampB: 0, ampG: 0, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  // carico minuscolo: 0,5 gradi
  await page.evaluate(GUIDA2, { offB: 0.5, offG: 0, ampB: 1.5, ampG: 0.2, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const sp = await page.textContent('#spiegazione')
  check('⭐ con un carico piccolo dice che non si può leggere da che parte',
    /praticamente al centro/.test(sp) && /non distingue/.test(sp), sp)
  check('e non scrive una parola di direzione', !/indietro di/.test(sp), sp)
  await ctx.close()
}

sez('⭐ v8 · referto da stampare e campioni grezzi')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 3, offG: 0, ampB: 1.5, ampG: 0.2, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('il pulsante del referto c’è', await page.isVisible('#btn-referto'))
  check('l’intestazione del referto è compilata',
    (await page.textContent('#ref-quando')).includes('beccheggio'), await page.textContent('#ref-quando'))
  const ref = await page.textContent('.intest-referto')
  check('⭐ il referto dice che è un test del Sistema Policettivo®',
    /Sistema Policettivo®/.test(ref), ref)
  check('e dichiara il limite: non è una stabilometria su pedana',
    /non è una stabilometria su pedana/i.test(ref), ref)
  check('⭐ e la regola che conta: si confronta col paziente, non con una norma',
    /fra prove dello stesso paziente, non con una norma/i.test(ref), ref)

  await page.click('#btn-grezzi')
  const csv = await page.inputValue('#export')
  const righe = csv.trim().split('\n')
  check('il CSV ha l’intestazione giusta', righe[0] === 'prova;t_s;beta_grezzo;gamma_grezzo;evento;occhi;configurazione', righe[0])
  check('e una riga per campione', righe.length > 50, righe.length)
  check('i campioni sono quelli grezzi, non quelli girati dal verso',
    righe[1].split(';').length === 7, righe[1])
  await ctx.close()
}

// ═══════════════════════════════════════════════════════════════════════
// taratura-unica-v1 — la taratura e' una proprieta' del TELEFONO, non della
// sessione: un gesto diagonale da 5 s, una volta, e la pagina se la ricorda.
// ═══════════════════════════════════════════════════════════════════════

const TARA = async (page, { b = -6, g = 5 } = {}) => {
  await page.click('#chips .chip[data-e="taratura"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: b, offG: g, ampB: 0.3, ampG: 0.3, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
}

sez('⭐ taratura-unica · un gesto diagonale impara TUTTI E DUE i versi')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  // telefono col beta invertito e il gamma dritto: la diagonale li separa
  await TARA(page, { b: -6, g: 5 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const v = await page.evaluate(() => window.__prova.verso())
  const t = await page.evaluate(() => window.__prova.tarato())
  check('⭐ ha capito che avanti-indietro è invertito', v.beta === -1, v)
  check('⭐ e che destra-sinistra è dritto', v.gamma === 1, v)
  check('tutti e due gli assi risultano tarati', t.beta === true && t.gamma === true, t)
  const box = await page.textContent('#carico-box')
  check('lo dice, e dice che non si rifà più', /non la rifarai più/i.test(box), box)
  await ctx.close()
}

sez('⭐ taratura-unica · si ricorda, e sopravvive alla pagina ricaricata')
{
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } })
  const page = await ctx.newPage()
  const errori = []
  page.on('pageerror', e => errori.push(String(e)))
  await page.goto('http://localhost:' + PORT + '/' + PAGINA + '?dur=2&via=1', { waitUntil: 'load' })
  await page.waitForTimeout(150)
  check('all’apertura dice che la taratura manca',
    /mai fatta/i.test(await page.textContent('#stato-taratura')), await page.textContent('#stato-taratura'))
  await TARA(page, { b: -6, g: 5 })
  check('dopo la taratura la riga diventa verde',
    /Verso tarato/.test(await page.textContent('#stato-taratura')))

  // ⭐ si ricarica la pagina da zero: la taratura deve esserci ancora
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(200)
  const v = await page.evaluate(() => window.__prova.verso())
  const t = await page.evaluate(() => window.__prova.tarato())
  check('⭐⭐ dopo il ricaricamento il verso è ancora quello imparato', v.beta === -1 && v.gamma === 1, v)
  check('e risulta tarata', t.beta && t.gamma, t)
  const riga = await page.textContent('#stato-taratura')
  check('la riga dice quando è stata fatta', /Verso tarato/.test(riga) && /\d{1,2}\/\d{1,2}\/\d{4}/.test(riga), riga)
  check('e non chiede più di rifarla', !/mai fatta/i.test(riga), riga)
  check('nessun errore JS in pagina', errori.length === 0, errori)

  // ⛔ ma NON deve essersi salvata nessuna prova
  check('⛔ le prove non sono state salvate sul telefono',
    (await page.evaluate(() => window.__prova.prove().length)) === 0)
  check('⛔ e in localStorage c’è una chiave sola',
    (await page.evaluate(() => Object.keys(localStorage).length)) === 1,
    await page.evaluate(() => Object.keys(localStorage)))

  // il pulsante «rifai» la dimentica
  await page.click('#btn-scorda')
  await page.waitForTimeout(100)
  const dopo = await page.evaluate(() => window.__prova.tarato())
  check('«rifai» dimentica la taratura', dopo.beta === false && dopo.gamma === false, dopo)
  check('e il verso torna a quello di partenza',
    (await page.evaluate(() => window.__prova.verso().beta)) === 1)
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(200)
  check('⭐ e resta dimenticata anche dopo il ricaricamento',
    (await page.evaluate(() => window.__prova.tarato().beta)) === false)
  await ctx.close()
}

sez('⭐ taratura-unica · un gesto storto non insegna niente')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  // si sporge solo in avanti: manca l'asse destra-sinistra
  await TARA(page, { b: -6, g: 0.3 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const t = await page.evaluate(() => window.__prova.tarato())
  check('⭐ mezza diagonale non basta: NON impara niente', t.beta === false && t.gamma === false, t)
  check('e il verso resta quello di partenza',
    (await page.evaluate(() => window.__prova.verso().beta)) === 1)
  const box = await page.textContent('#carico-box')
  check('dice quale metà è mancata', /a destra/.test(box) && !/in avanti e a destra/.test(box), box)
  check('⛔ e non ha salvato niente sul telefono',
    (await page.evaluate(() => Object.keys(localStorage).length)) === 0)
  await ctx.close()
}

sez('⭐ taratura-unica · il telefono fuori piano viene detto, non misurato zitto')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await TARA(page, { b: -6, g: 5 })
  await page.click('#btn-nuova')
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  // telefono quasi in piedi: 55 gradi
  await page.evaluate(GUIDA2, { offB: 55, offG: 2, ampB: 1, ampG: 0.3, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const av = await page.textContent('#avviso-asse')
  check('⭐ avvisa che il telefono non è in piano', /non è appoggiato in piano/i.test(av), av)
  check('e dice perché conta (oltre i 30° la lettura non tiene)', /30°/.test(av), av)

  // e in piano non avvisa
  await page.click('#btn-ancora'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 3, offG: 0.5, ampB: 1, ampG: 0.3, passoMs: 20, durataMs: 3000 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('in piano non avvisa', !/non è appoggiato in piano/i.test(await page.textContent('#avviso-asse')))
  await ctx.close()
}

sez('⭐ taratura-unica · il disegno dell’appoggio e le parole giuste')
{
  const { page, ctx, errori } = await apri(browser)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const svg = await page.innerHTML('#appoggio')
  check('c’è il disegno dell’appoggio', /<svg/.test(svg), svg.slice(0, 60))
  check('e dice da che parte sta il paziente', /VERSO IL PAZIENTE/.test(svg))
  const testo = await page.textContent('#c-setup')
  for (const parola of ['in piano sulla tavola', 'schermo in su', 'in verticale (ritratto)',
                        'al centro', 'lato corto rivolto verso il paziente'])
    check('l’istruzione dice «' + parola + '»', testo.includes(parola), testo.slice(-400))
  await page.click('#chips .chip[data-e="taratura"]')
  const sp = await page.textContent('#spiega')
  check('la taratura spiega il gesto diagonale', /DIAGONALE/.test(sp), sp)
  check('e che è una volta sola', /UNA VOLTA SOLA/.test(sp), sp)
  check('e quanto dura', /cinque secondi/.test(sp), sp)
  await ctx.close()
}

sez('⭐ grafica-tavola-v1 · il disegno segue il test, e la sicurezza si vede e si sente')
{
  const { page, ctx, errori } = await apri(browser)
  const svg = () => page.innerHTML('#appoggio')

  // beccheggio: giallo davanti e dietro
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.waitForTimeout(80)
  const b = await svg()
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('il disegno dice che il cuscino è in BECCHEGGIO', /BECCHEGGIO — giallo DAVANTI e DIETRO/.test(b), b.slice(-200))
  check('c’è la tavola con le due lineette dei piedi', /piedi sulle due lineette/.test(b))
  check('e il telefono al centro, in piano', /in piano/.test(b))

  // rollio: il cuscino ruota, e il disegno lo mostra
  await page.click('#chips .chip[data-e="rollio"]')
  await page.waitForTimeout(80)
  const r = await svg()
  check('⭐ scegliendo il rollio il disegno cambia', /ROLLIO — giallo ai LATI/.test(r), r.slice(-200))
  check('e i due disegni sono davvero diversi', b !== r)

  // ⭐ il giallo si sposta davvero: si contano i poligoni gialli e dove stanno
  const gialliDi = (t) => (t.match(/fill="#DDF00A"/g) || []).length
  check('il cuscino ha sempre due quadranti gialli e due neri',
    gialliDi(b) === 2 && gialliDi(r) === 2, { becc: gialliDi(b), roll: gialliDi(r) })
  const primoGiallo = (t) => t.slice(0, t.indexOf('fill="#DDF00A"'))
    .lastIndexOf('<polygon points="') >= 0
      ? t.slice(t.slice(0, t.indexOf('fill="#DDF00A"')).lastIndexOf('<polygon points="') + 17,
                t.indexOf('fill="#DDF00A"')).split(',').slice(0,2).map(Number)
      : null
  const pb = primoGiallo(b), pr = primoGiallo(r)
  check('⭐ in beccheggio il primo giallo è sopra il centro (davanti)',
    pb && pb[1] < 100 && Math.abs(pb[0] - 160) < 2, pb)
  check('⭐ in rollio il primo giallo è di lato, non davanti',
    pr && Math.abs(pr[1] - 130) < 2 && Math.abs(pr[0] - 160) > 40, pr)

  // lo zero segue lo stesso verso
  await page.click('#chips .chip[data-e="zero tavola (rollio)"]')
  await page.waitForTimeout(80)
  check('anche lo zero del rollio mostra il cuscino girato', /ROLLIO/.test(await svg()))

  // il cuscino in piccolo accanto alla spiegazione
  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.waitForTimeout(80)
  check('c’è il cuscino in piccolo accanto alla spiegazione',
    /giallo DAVANTI e DIETRO/.test(await page.innerHTML('#cuscino-disegno')))
  await page.click('#chips .chip[data-e="taratura"]')
  await page.waitForTimeout(80)
  check('e sulla taratura sparisce, perché lì il cuscino non conta',
    (await page.innerHTML('#cuscino-disegno')).trim() === '')
  await ctx.close()
}

sez('⭐ grafica-tavola-v1 · l’avvertenza di sicurezza')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  const t = await page.textContent('#avviso-occhi')
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('l’avvertenza c’è sempre', /Resta sempre accanto/.test(t), t)
  check('e dice cosa fare, non solo di stare attenti', /a un braccio di distanza/.test(t), t)
  check('e di non lasciarlo solo', /Non lasciare mai solo il paziente/.test(t), t)

  await page.click('#chips .chip[data-e="beccheggio"]')
  await page.waitForTimeout(80)
  const cl1 = await page.getAttribute('#avviso-occhi', 'class')
  check('a occhi aperti l’avvertenza è quella normale', !/occhi-forte/.test(cl1), cl1)
  await page.click('#occhi .chip[data-o="chiusi"]')
  await page.waitForTimeout(80)
  const cl2 = await page.getAttribute('#avviso-occhi', 'class')
  check('⭐ a occhi chiusi diventa rossa', /occhi-forte/.test(cl2), cl2)

  // ⭐ e viene DETTA: a occhi chiusi lo schermo non lo vede nessuno
  await page.evaluate(() => {
    window.__dette = []
    // lo stato cambia in fretta: si registra la prima frase invece di rincorrerla
    const st = document.getElementById('stato')
    new MutationObserver(() => {
      if (!window.__statoVisto && /Stagli accanto/.test(st.textContent)) window.__statoVisto = st.textContent
    }).observe(st, { childList: true, characterData: true, subtree: true })
    const vero = window.speechSynthesis.speak.bind(window.speechSynthesis)
    window.speechSynthesis.speak = (u) => { window.__dette.push(u.text); try { vero(u) } catch(e){} }
  })
  await page.click('#btn-start')
  await page.waitForTimeout(600)
  const dett = await page.evaluate(() => window.__dette.join(' | '))
  check('⭐⭐ a occhi chiusi la voce avvisa di stare accanto',
    /resta accanto al paziente/i.test(dett), dett)
  check('e lo scriveva anche sullo schermo della misura',
    /Stagli accanto/.test(await page.evaluate(() => window.__statoVisto || '')),
    await page.evaluate(() => window.__statoVisto || ''))
  await ctx.close()
}

sez('⭐ grafica-tavola-v1 · i testi accorciati dicono cosa il test È')
{
  const { page, ctx, errori } = await apri(browser)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const a = await page.textContent('#avviso-iniziale')
  check('l’apertura lo dice: test del Sistema Policettivo®', /Sistema Policettivo®/.test(a), a)
  check('dice cosa misura: il carico', /dove porta il carico/.test(a), a)
  check('e quanto oscilla', /quanto oscilla/.test(a), a)
  check('dice a cosa serve: squilibri e cambiamenti', /squilibri/.test(a) && /cambiamenti/.test(a), a)
  check('⭐ tiene il limite onesto, in una riga', /non con una norma/.test(a), a)
  check('e che i dati restano sul telefono', /esce da questo telefono/.test(a), a)
  check('⭐ ed è corto: sotto i 620 caratteri', a.replace(/\s+/g, ' ').trim().length < 620,
    a.replace(/\s+/g, ' ').trim().length)
  check('⛔ non si sminuisce più con «non è uno strumento clinico»',
    !/non è uno strumento clinico/i.test(await page.content()))
  await ctx.close()
}

const UNA = async (page, ev, g2) => {
  await page.click('#btn-nuova').catch(() => {})
  await page.click('#chips .chip[data-e="' + ev + '"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, Object.assign({ passoMs: 20, durataMs: 2500 }, g2))
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  await page.waitForTimeout(80)
}

sez('⭐ confronto-v1 · taratura e zero non raccontano più il test')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.click('#chips .chip[data-e="zero tavola (beccheggio)"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 1, offG: 0, ampB: 0, ampG: 0, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('⭐ sullo zero non c’è nessuna spiegazione del test',
    !(await page.isVisible('#spiegazione')), await page.textContent('#spiegazione'))
  check('e sparisce anche il pulsante della voce', !(await page.isVisible('#btn-spiega')))

  await UNA(page, 'taratura', { offB: -6, offG: 5, ampB: 0.3, ampG: 0.3 })
  check('⭐ nemmeno sulla taratura', !(await page.isVisible('#spiegazione')))

  // ma su un test vero c'è
  await UNA(page, 'beccheggio', { offB: 4, offG: 0.3, ampB: 1.6, ampG: 0.3 })
  check('⭐ su un test vero la spiegazione torna', await page.isVisible('#spiegazione'))
  check('e il pulsante della voce anche', await page.isVisible('#btn-spiega'))
  check('e parla del test', /Test di beccheggio/.test(await page.textContent('#spiegazione')))
  await ctx.close()
}

sez('⭐ confronto-v1 · gli omini si vedono, col numero')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await UNA(page, 'beccheggio', { offB: 4, offG: 0.3, ampB: 1.6, ampG: 0.3 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const om = await page.innerHTML('#omini')
  check('ci sono i tre omini', (om.match(/<svg/g) || []).length === 3)
  check('⭐ c’è il titolo che li introduce', /Dove sta il carico/.test(await page.textContent('#omini')))
  check('⭐ e sotto ognuno c’è il numero in gradi', (om.match(/cap-num/g) || []).length === 3, om.slice(0,200))
  check('con le parole della direzione', /AVANTI|INDIETRO/.test(await page.textContent('#omini')))
  check('e le tre viste', /di profilo/.test(await page.textContent('#omini')) &&
        /di fronte/.test(await page.textContent('#omini')) &&
        /dal centro/.test(await page.textContent('#omini')))
  const h = await page.evaluate(() => document.querySelector('#omini svg').getBoundingClientRect().height)
  check('⭐ sono più grandi di prima (erano 86 px)', h > 100, h)
  await ctx.close()
}

sez('⭐ confronto-v1 · il confronto prima/dopo e le due bande')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.fill('#config', 'tavola 1 cuscino')
  // zero + taratura, poi due prove nella STESSA condizione
  await page.click('#chips .chip[data-e="zero tavola (beccheggio)"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 0, offG: 0, ampB: 0, ampG: 0, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  await UNA(page, 'taratura', { offB: -6, offG: 5, ampB: 0.3, ampG: 0.3 })

  check('con meno di due test il confronto non c’è', !(await page.isVisible('#c-confronto')))
  await UNA(page, 'beccheggio', { offB: -3, offG: 0.3, ampB: 2.4, ampG: 0.35 })
  check('con un test solo nemmeno', !(await page.isVisible('#c-confronto')))
  // seconda prova: oscillazione MOLTO più piccola → differenza oltre la banda
  await page.click('#btn-ancora'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: -3, offG: 0.3, ampB: 0.7, ampG: 0.2, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  await page.waitForTimeout(120)

  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('⭐ con due test il confronto compare', await page.isVisible('#c-confronto'))
  const t = await page.textContent('#conf-esito')
  check('mostra la velocità per prima', /Velocità media/.test(t), t)
  check('mostra il carico', /CARICO/.test(t), t)
  check('⭐ dichiara la banda del 35%', /35%/.test(t), t)
  check('⭐ e quella del carico, 1,5°', /1,5°/.test(t), t)
  check('e dice che sono valori provvisori su una persona', /provvisori/.test(t), t)
  check('⭐ un calo grosso è fuori banda e NON è grigio',
    /color: ?rgb\(10, ?125, ?51\)|#0a7d33/.test(await page.innerHTML('#conf-esito')),
    (await page.innerHTML('#conf-esito')).slice(0, 400))

  const fr = await page.textContent('#conf-frasi')
  check('le frasi del confronto ci sono', /Confronto fra la prova/.test(fr), fr)
  check('⭐ e chiudono lasciando l’interpretazione al professionista',
    /interpretazione clinica la scrivi tu/.test(fr), fr)
  check('i due gomitoli sono disegnati, affiancati',
    await page.isVisible('#cfr-pre') && await page.isVisible('#cfr-post') && await page.isVisible('#cfr-tele'))
  check('⭐ e c’è scritto PRIMA e DOPO', /PRIMA/.test(await page.textContent('#cfr-tele')) &&
    /DOPO/.test(await page.textContent('#cfr-tele')))
  check('⭐ e che la scala è la stessa', /alla stessa scala/.test(await page.textContent('#cfr-nota-scala')))
  const [wa, wb] = await page.evaluate(() => [
    document.getElementById('cfr-pre').getBoundingClientRect().width,
    document.getElementById('cfr-post').getBoundingClientRect().width])
  check('sono affiancati davvero (metà larghezza ciascuno)', wa < 220 && Math.abs(wa - wb) < 2, { wa, wb })
  check('⭐ e alla stessa scala, se no l’occhio si inganna',
    (await page.evaluate(() => {
      const a = document.getElementById('cfr-pre'), b = document.getElementById('cfr-post')
      const t = (c) => c.getContext('2d').getImageData(0, c.height - 40, c.width, 40).data.join(',')
      return t(a).length > 0 && t(b).length > 0
    })))
  await ctx.close()
}

sez('⭐ confronto-v1 · una differenza piccola resta grigia, e lo dice')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.click('#chips .chip[data-e="zero tavola (beccheggio)"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 0, offG: 0, ampB: 0, ampG: 0, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  await UNA(page, 'beccheggio', { offB: -2, offG: 0.2, ampB: 2.0, ampG: 0.3 })
  await page.click('#btn-ancora'); await page.waitForTimeout(120)
  // quasi identica: ~10% di differenza, dentro il rumore
  await page.evaluate(GUIDA2, { offB: -2.2, offG: 0.2, ampB: 2.2, ampG: 0.3, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  await page.waitForTimeout(120)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const fr = await page.textContent('#conf-frasi')
  check('⭐ dice che sotto la banda non si distingue dal rumore',
    /non si distingue dal rumore della misura/.test(fr), fr)
  check('e dice cosa fare: tre prove per parte', /almeno tre prove per parte/.test(fr), fr)
  await ctx.close()
}

sez('⭐ confronto-v1 · condizioni diverse: lo dice e non parla di cambiamento')
{
  const { page, ctx, errori } = await apri(browser, '?dur=2&via=1')
  await page.click('#chips .chip[data-e="zero tavola (beccheggio)"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: 0, offG: 0, ampB: 0, ampG: 0, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  await UNA(page, 'beccheggio', { offB: -2, offG: 0.2, ampB: 1.2, ampG: 0.3 })
  await page.click('#btn-nuova')
  await page.click('#occhi .chip[data-o="chiusi"]')
  await page.click('#btn-start'); await page.waitForTimeout(120)
  await page.evaluate(GUIDA2, { offB: -2, offG: 0.2, ampB: 3.4, ampG: 0.6, passoMs: 20, durataMs: 2500 })
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 15000 })
  await page.waitForTimeout(120)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const t = await page.textContent('#conf-esito')
  check('⭐ avvisa che le condizioni non sono le stesse', /non sono nella stessa condizione/.test(t), t)
  check('⭐ e lo chiama col suo nome: non è un cambiamento nel tempo',
    /non.{0,3} un cambiamento nel tempo/i.test(t), t)
  const fr = await page.textContent('#conf-frasi')
  check('e lo dice anche a voce', /NON sono nella stessa condizione/.test(fr), fr)
  await ctx.close()
}
} finally {
  await browser.close()
  server.close()
}

console.log('\n' + '='.repeat(66))
console.log(ko === 0 ? `TUTTO VERDE — ${ok} controlli passati.` : `ROSSO — ${ok} passati, ${ko} falliti:\n  - ` + fallite.join('\n  - '))
process.exit(ko === 0 ? 0 : 1)
