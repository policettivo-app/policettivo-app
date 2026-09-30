/* prova-stepping.mjs — stepping-v1
 * Lo stepping test col telefono: taratura (gradi o radianti), deriva,
 * metronomo, la rotazione sulla verticale, l'errore dalle prove, il salvataggio.
 *   node prova-stepping.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd(), PORT = 8499
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  const f = path.join(ROOT, u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f))
})
let ok = 0, ko = 0; const fallite = []
function check(n, c, x) { if (c) { ok++; console.log('  ✅ ' + n) } else { ko++; fallite.push(n); console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')) } }
function sez(t) { console.log('\n── ' + t) }

const SUPA = ({ sessione, senza055 }) => {
  window.__db = { righe: [], sessioni: [] }
  const q = (tab) => {
    const st = { tab }
    const api = {
      select() { return api }, eq() { return api }, order() { return api }, limit() { return api },
      insert(r) { st.riga = r; return api },
      async maybeSingle() {
        if (st.riga && tab === 'test_sessioni') { window.__db.sessioni.push(st.riga); return { data: { id: 'SESS-1', quando: new Date().toISOString() }, error: null } }
        if (st.riga && tab === 'stepping_test') {
          if (senza055) return { data: null, error: { code: '42P01', message: 'relation "public.stepping_test" does not exist' } }
          window.__db.righe.push(st.riga); return { data: { id: 'st-' + window.__db.righe.length }, error: null }
        }
        if (tab === 'professionals') return { data: { id: 'PROF-1' }, error: null }
        if (tab === 'patients') return { data: { nome: 'Mario', cognome: 'Rossi' }, error: null }
        return { data: null, error: null }
      }
    }
    return api
  }
  window.supabase = { createClient() { return {
    auth: { getSession: async () => ({ data: { session: sessione ? { user: { id: 'U1', email: 'c@s.it' } } : null } }) },
    from: q, rpc: async () => ({ data: null, error: null })
  } } }
}

// il telefono finto: segue le fasi della pagina.
// g = gravità nel telefono (come lo si tiene); asse = quale rotationRate gira attorno alla verticale
// rad = il browser dà i radianti; deriva = errore fisso del giroscopio (°/s)
const GUIDA = ({ R, deriva, g, asse, rad }) => {
  if (window.__ivF) clearInterval(window.__ivF)
  let tGiro = null
  window.__ivF = setInterval(() => {
    const S = window.__step, f = S.fase(), now = performance.now()
    let w = 0
    if (f === 'tar-giro') { if (tGiro == null) tGiro = now; w = (now - tGiro < 600) ? 300 : 0 }
    else if (f === 'passi') w = R
    if (f) w += deriva
    const k = rad ? Math.PI / 180 : 1
    const rr = { alpha: 0, beta: 0, gamma: 0 }; rr[asse] = w * k
    const passo = f === 'passi' && Math.floor(now / 33) % 2 === 0
    const e = new Event('devicemotion')
    Object.defineProperty(e, 'accelerationIncludingGravity', { value: { x: g.x, y: g.y + (passo ? 3 : 0), z: g.z } })
    Object.defineProperty(e, 'rotationRate', { value: rr })
    window.dispatchEvent(e)
  }, 8)
}

sez('⭐ il calcolo (js/stepping.js)')
{
  globalThis.window = globalThis
  await import('./js/stepping.js?x=' + Date.now()).catch(() => {})
  const F = globalThis.PolStepping
  check('⭐ 50 passi, 90 al minuto → 33 secondi', F.PASSI === 50 && F.durataMs() === 33333)
  check('⭐ la rotazione sulla verticale, comunque si tenga il telefono', F.velocitaVerticale({ alpha: 10, beta: 0, gamma: 0 }, { x: 0, y: 0, z: 9.81 }) === 10 &&
    F.velocitaVerticale({ alpha: 0, beta: 0, gamma: 10 }, { x: 0, y: 9.81, z: 0 }) === 10 && Math.abs(F.velocitaVerticale({ alpha: 10, beta: 0, gamma: 0 }, { x: 0, y: 9.81, z: 0 })) < 1e-9)
  const camp = []; for (let t = 0; t <= 2000; t += 10) camp.push({ t, w: 20.5 })
  check('⭐ integra e toglie la deriva: 20,5 °/s per 2 s meno 0,5 → 40°', Math.abs(F.integra(camp, 1, 1, 0.5).angolo - 40) < 0.5)
  check('⭐ taratura: 180 → gradi · 3,14 → radianti · verso', F.taratura(178).scala === 1 && Math.abs(F.taratura(-3.1).scala - 57.2958) < 0.01 && F.taratura(-3.1).verso === -1 && !F.taratura(90).ok)
  check('⭐ direzione: sotto 10° «quasi dritto»', F.direzione(8) === 'quasi dritto' && F.direzione(35) === 'verso destra' && F.direzione(-35) === 'verso sinistra')
  const r = F.riassunto([{ rotazione: 30 }, { rotazione: 50 }])
  check('⭐ due prove: media 40°, errore 2,77 × SD = 39,2°', r.rotazione === 40 && r.errore === 39.2 && r.stessaParte === 2, r)
  check('⭐ una prova: errore sconosciuto', F.riassunto([{ rotazione: 30 }]).errore === null)
  check('⭐ prima/dopo sul valore assoluto, verdetto solo oltre l’errore', F.confronto({ rotazione: 60, errore: 10 }, { rotazione: 20, errore: 12 }).esito === 'meglio' &&
    F.confronto({ rotazione: 60, errore: 40 }, { rotazione: 30, errore: 12 }).esito === 'uguale' && F.confronto({ rotazione: 60, errore: null }, { rotazione: 20, errore: 5 }).esito === 'daconfermare')
  check('⭐ le fonti: Fukuda 1959, Honaker 2009, Hemm 2023, «non un test diagnostico»', /Fukuda 1959/.test(F.FONTI) && /Honaker 2009/.test(F.FONTI) && /Hemm 2023/.test(F.FONTI) && /non un test diagnostico/.test(F.FONTI))
  check('⛔ le frasi non danno giudizi clinici', /non un test diagnostico/.test(F.frasi(r).join(' ')) && !/patolog|normale|vestibol/i.test(F.frasi(r).join(' ')))
  const acc = []; for (let t = 0; t < 5000; t += 10) acc.push({ t, m: 9.8 + (t % 500 < 20 ? 4 : 0) })
  check('⭐ conta i passi dai picchi dell’accelerazione (10 in 5 s)', F.contaPassi(acc) === 10, F.contaPassi(acc))
  const src = fs.readFileSync('js/stepping.js', 'utf8').replace(/\/\*[^]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('⛔ js/stepping.js non parla col database', !/supabase|fetch\(|localStorage/.test(src))
}

await new Promise(r => server.listen(PORT, r))
const browser = await chromium.launch({ executablePath: CHROME })
const B = 'http://localhost:' + PORT + '/'
async function apri(finto, query) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 820 } })
  const page = await ctx.newPage(); const errori = []; page.on('pageerror', e => errori.push(String(e)))
  await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await page.addInitScript(SUPA, finto)
  await page.goto(B + 'prova-stepping.html' + (query || ''), { waitUntil: 'load' }); await page.waitForTimeout(400)
  return { page, ctx, errori }
}
async function prova(page) {
  await page.waitForFunction(() => window.__step.fase() === 'passi', null, { timeout: 8000 })
  await page.waitForFunction(() => window.__step.fase() === null, null, { timeout: 8000 })
  await page.waitForTimeout(150)
}
try {
  sez('⭐⭐ la pagina: taratura in RADIANTI, poi due prove col telefono in piedi fra le mani')
  const pid = '11111111-2222-3333-4444-555555555555'
  const { page, ctx, errori } = await apri({ sessione: true }, '?via=1&veloce=1&pid=' + pid)
  check('⭐ spiega cos’è e che è un’osservazione', /osservazione, non un test diagnostico/.test(await page.textContent('.avviso')))
  check('⭐ quattro passi scritti e il disegno dall’alto', (await page.$$('.passi li')).length === 4 && /DIREZIONE DI PARTENZA/.test(await page.textContent('svg.disegno')))
  check('⭐ dice che lo spostamento non lo misura', /spostamento/.test(await page.textContent('#c-setup')))
  check('⭐ senza taratura il pulsante dice TARATURA', /TARATURA/.test(await page.textContent('#btn-start')))
  // telefono in piano per la taratura, radianti
  await page.evaluate(GUIDA, { R: 0, deriva: 0.3, g: { x: 0, y: 0, z: 9.81 }, asse: 'alpha', rad: true })
  await page.click('#btn-start')
  await page.waitForFunction(() => !!window.__step.taratura(), null, { timeout: 10000 })
  const tar = await page.evaluate(() => window.__step.taratura())
  check('⭐⭐ la taratura riconosce i radianti e il verso', Math.abs(tar.scala - 57.2958) < 0.01 && tar.verso === 1, tar)
  // le prove: telefono in piedi fra le mani (gravità sull'asse y, si gira attorno a y), 24 °/s per ~1,67 s ≈ 40°, deriva 0,3 °/s
  await page.evaluate(GUIDA, { R: 24, deriva: 0.3, g: { x: 0, y: 9.81, z: 0 }, asse: 'gamma', rad: true })
  await page.click('#momento .chip[data-m="pre"]')
  check('⭐ il pulsante: «stepping · 50 passi · 2 prove»', /50 passi · 2 prove/.test(await page.textContent('#btn-start')))
  await page.click('#btn-start')
  await page.waitForFunction(() => window.__step.fase() === 'fermo', null, { timeout: 5000 })
  check('⭐ durante la prova il pulsante Indietro/Home si toglie di mezzo', await page.evaluate(() => document.body.hasAttribute('data-nav-nascondi')))
  await prova(page)
  await page.waitForSelector('#c-pausa', { state: 'visible', timeout: 5000 })
  const g1 = await page.evaluate(() => window.__step.giro().prove[0])
  const atteso = await page.evaluate(() => 24 * 50 * (60000 / 90 / 20) / 1000)
  check('⭐⭐ prova 1: la rotazione giusta (' + Math.round(atteso) + '° verso destra), senza la deriva', Math.abs(g1.rotazione - atteso) <= atteso * 0.2, { misurata: g1.rotazione, atteso })
  check('⭐ fra le prove: «riportalo sullo stesso punto» e il pulsante PROVA 2', /stesso punto/.test(await page.textContent('#c-pausa')) && /PROVA 2/.test(await page.textContent('#btn-start')))
  // (col metronomo 20 volte più veloce i passi veri non ci stanno: si controlla solo che li conti)
  check('⭐ e conta i passi', g1.passi_rilevati >= 3, g1.passi_rilevati)
  await page.evaluate(GUIDA, { R: 36, deriva: 0.3, g: { x: 0, y: 9.81, z: 0 }, asse: 'gamma', rad: true })
  await page.click('#btn-start')
  await prova(page)
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 5000 }); await page.waitForTimeout(300)
  const es = await page.textContent('#esito')
  await page.locator('#c-esito').screenshot({ path: '_schermate/st-esito.png' })
  check('⭐⭐ risultato: media delle due prove, verso destra, con l’errore', /verso destra/.test(es) && /media di 2 prove/.test(es) && /balla di ±\d+°/.test(es), es.slice(0, 200))
  check('⭐ riferimenti solo per il professionista (Fukuda, Honaker, Hemm)', /solo per te/.test(es) && /Honaker/.test(es) && /Hemm/.test(es) && /scelta nostra/.test(es))
  check('⛔ nessun «patologico / normale»', !/patolog|anormale|vestibol/i.test(es))
  await page.waitForFunction(() => window.__db.righe.length === 1, null, { timeout: 5000 })
  const rg = await page.evaluate(() => window.__db.righe[0])
  check('⭐⭐ salvata: rotazione, 2 prove, errore, momento, paziente, taratura', rg.rotazione > 0 && rg.n_prove === 2 && rg.errore > 0 && rg.momento === 'pre' && rg.patient_id === pid &&
    rg.passi === 50 && rg.ritmo_bpm === 90 && Math.abs(rg.scala - 57.2958) < 0.01 && rg.prove.length === 2 && rg.prove[0].serie.length > 3, rg)
  check('⭐ nella sessione dei test', rg.sessione_id === 'SESS-1')
  check('⭐ il pulsante Indietro/Home torna', await page.evaluate(() => !document.body.hasAttribute('data-nav-nascondi')))
  // DOPO: ruota di meno → confronto sulla pagina (verdetto solo oltre l'errore)
  await page.evaluate(GUIDA, { R: 2, deriva: 0.3, g: { x: 0, y: 9.81, z: 0 }, asse: 'gamma', rad: true })
  await page.click('#momento .chip[data-m="post"]')
  await page.click('#btn-start'); await prova(page)
  await page.waitForSelector('#c-pausa', { state: 'visible', timeout: 5000 })
  await page.click('#btn-start'); await prova(page)
  await page.waitForSelector('#c-confronto', { state: 'visible', timeout: 5000 })
  const cf = await page.textContent('#confronto')
  check('⭐ prima/dopo sulla pagina, con la regola dell’errore e «non grazie a»', /Rotazione/.test(cf) && /(più dritto|invariato)/.test(cf) && /non «grazie a»/.test(cf), cf)
  check('nessun errore JS', errori.length === 0, errori)
  await ctx.close()

  sez('⭐ gradi, verso sinistra, una prova sola, «Ferma», senza la migration 055')
  {
    const { page, ctx, errori } = await apri({ sessione: true, senza055: true }, '?via=1&veloce=1')
    await page.evaluate(GUIDA, { R: 0, deriva: 0, g: { x: 0, y: 0, z: 9.81 }, asse: 'alpha', rad: false })
    await page.click('#btn-start')
    await page.waitForFunction(() => !!window.__step.taratura(), null, { timeout: 10000 })
    check('⭐ la taratura riconosce i gradi', (await page.evaluate(() => window.__step.taratura().scala)) === 1)
    await page.evaluate(GUIDA, { R: -30, deriva: 0, g: { x: 0, y: 0, z: 9.81 }, asse: 'alpha', rad: false })
    await page.click('#btn-start'); await page.waitForFunction(() => window.__step.fase() === 'fermo', null, { timeout: 5000 })
    await page.click('#btn-ferma'); await page.waitForTimeout(300)
    check('⭐ «Ferma» torna alla preparazione senza salvare', await page.isVisible('#c-setup') && (await page.evaluate(() => window.__db.righe.length)) === 0)
    await page.click('#nprove .chip[data-n="1"]')
    await page.click('#btn-start'); await prova(page)
    await page.waitForSelector('#c-esito', { state: 'visible', timeout: 5000 }); await page.waitForTimeout(300)
    const es = await page.textContent('#esito')
    check('⭐ telefono in piano, ruota a sinistra → «verso sinistra»', /verso sinistra/.test(es), es.slice(0, 120))
    check('⭐ una prova: l’errore «non si conosce»', /l’errore della misura non si conosce/.test(es))
    check('⛔⭐ senza la 055 lo dice per nome e i numeri restano', /055_stepping_test\.sql/.test(await page.textContent('#salva-stato')))
    check('nessun errore JS', errori.length === 0, errori)
    await ctx.close()
  }

  sez('⭐ dalla pagina dei test')
  {
    const t = fs.readFileSync('test.html', 'utf8')
    check('⭐ la tessera «Stepping test» porta a prova-stepping.html col paziente', /id: 'stepping'[^]*?prova-stepping\.html' \+ q/.test(t))
  }
} finally { await browser.close(); server.close() }

console.log('\n' + '='.repeat(66))
if (ko) { console.log('FALLITI ' + ko + ':'); fallite.forEach(f => console.log('  - ' + f)); process.exit(1) }
console.log('TUTTO VERDE — ' + ok + ' controlli passati.')
