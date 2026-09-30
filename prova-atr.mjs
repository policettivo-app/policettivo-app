/* prova-atr.mjs — atr-v1
 * L'ATR col telefono: taratura, tre passate, il valore fermo più alto per
 * zona, l'errore dalle passate, le fasce solo al professionista, il salvataggio.
 *   node prova-atr.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd(), PORT = 8498
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

const SUPA = ({ sessione, senza054 }) => {
  window.__db = { righe: [], sessioni: [] }
  const q = (tab) => {
    const st = { tab }
    const api = {
      select() { return api }, eq() { return api }, order() { return api }, limit() { return api },
      insert(r) { st.riga = r; return api },
      async maybeSingle() {
        if (st.riga && tab === 'test_sessioni') { window.__db.sessioni.push(st.riga); return { data: { id: 'SESS-1', quando: new Date().toISOString() }, error: null } }
        if (st.riga && tab === 'atr_test') {
          if (senza054) return { data: null, error: { code: '42P01', message: 'relation "public.atr_test" does not exist' } }
          window.__db.righe.push(st.riga); return { data: { id: 'atr-' + window.__db.righe.length }, error: null }
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

// il telefono finto: segue la taratura e le zone della pagina
// taratura: sensore con errore +0,4°, tavolo in pendenza di 0,6°
// schiena: per zona un valore vero; nella zona prima metà valore, poi quello pieno (lo «scorrere»)
const GUIDA = ({ valori, errore, tavolo, verso }) => {
  if (window.__ivF) clearInterval(window.__ivF)
  const t0 = {}
  window.__ivF = setInterval(() => {
    const A = window.__atr; let b = null
    const p = A.passoTaratura()
    if (p === 'destra') b = errore + tavolo
    else if (p === 'sinistra') b = errore - tavolo
    else if (p === 'alzata') b = errore + tavolo + 8 * verso
    else if (A.giro()) {
      const g = A.giro(), k = ['toracico_alto', 'toracico', 'toracolombare', 'lombare'][g.zona], chiave = g.passata + ':' + k
      if (!t0[chiave]) t0[chiave] = performance.now()
      const vero = valori[k][g.passata % valori[k].length]
      const pieno = performance.now() - t0[chiave] > 700
      b = errore + (pieno ? vero : vero * 0.5) * verso + (Math.random() - 0.5) * 0.1
    }
    if (b == null) return
    const e = new Event('deviceorientation'); Object.defineProperty(e, 'beta', { value: b }); Object.defineProperty(e, 'gamma', { value: 35 })
    window.dispatchEvent(e)
  }, 20)
}

sez('⭐ il calcolo (js/atr.js)')
{
  globalThis.window = globalThis
  await import('./js/atr.js?x=' + Date.now()).catch(() => {})
  const A = globalThis.PolAtr
  check('⭐ quattro zone, dall’alto in basso', A.LIVELLI.map(l => l.k).join() === 'toracico_alto,toracico,toracolombare,lombare')
  check('⭐ fasce: 4,9 sotto 5° · 5 da ricontrollare · 6,9 da ricontrollare · 7 da far valutare',
    A.fascia(4.9).k === 'basso' && A.fascia(5).k === 'ricontrollo' && A.fascia(-6.9).k === 'ricontrollo' && A.fascia(7).k === 'invio')
  check('⭐ le fonti sono scritte (Bunnell, Amendt, AAFP) e dice «non una diagnosi»', /Bunnell 1984/.test(A.FONTI) && /Amendt 1990/.test(A.FONTI) && /AAFP 2014/.test(A.FONTI) && /non una diagnosi/.test(A.FONTI))
  check('⭐ lato: + = più alto a destra, − = a sinistra, sotto 0,5° in piano', A.lato(3) === 'più alto a destra' && A.lato(-3) === 'più alto a sinistra' && A.lato(0.3) === 'in piano')
  const buf = []; for (let t = 0; t <= 600; t += 20) buf.push({ t, v: 6 + (t % 40 ? 0.1 : -0.1) })
  check('⭐ «fermo»: mezzo secondo entro 0,6° → il valore', Math.abs(A.fermo(buf, 600) - 6) < 0.1)
  const mosso = []; for (let t = 0; t <= 600; t += 20) mosso.push({ t, v: t / 50 })
  check('⛔ in movimento → niente valore', A.fermo(mosso, 600) === null)
  const fuori = []; for (let t = 0; t <= 600; t += 20) fuori.push({ t, v: 45 })
  check('⛔ oltre 30° (telefono non di traverso) → niente valore', A.fermo(fuori, 600) === null)
  check('⭐ tiene il più lontano da zero, col segno', A.tieni(3, -5) === -5 && A.tieni(-5, 4) === -5 && A.tieni(null, 2) === 2)
  const r = A.riassunto([{ toracico: 5.8, lombare: -1.4 }, { toracico: 6.2, lombare: -1.6 }, { toracico: 6.0, lombare: -1.5 }])
  // Sw: varianze entro zona (0,04 e 0,01) su 2+2 gradi di libertà → √0,025 = 0,158 → 2,77 × = 0,44
  check('⭐ media per zona e massimo', r.livelli.toracico.valore === 6 && r.massimo === 6 && r.livelloMassimo === 'toracico', r)
  check('⭐ l’errore dalle passate: 2,77 × Sw = 0,44°', r.errore === 0.44, r.errore)
  check('⭐ con una passata sola l’errore non c’è', A.riassunto([{ toracico: 6 }]).errore === null)
  const c = A.confronto({ toracico: 6, lombare: -2, errore: 0.5 }, { toracico: 4, lombare: 2.3, errore: 0.4 })
  check('⭐ prima/dopo sul valore assoluto: 6 → 4 «meglio», |−2| → 2,3 dentro l’errore «uguale»', c[0].esito === 'meglio' && c[1].esito === 'uguale', c)
  check('⛔ senza errore da una delle due parti: «da confermare»', A.confronto({ toracico: 6, errore: null }, { toracico: 2, errore: 0.4 })[0].esito === 'daconfermare')
  check('⛔ le frasi non danno giudizi clinici', /non una diagnosi/.test(A.frasi(r).join(' ')) && /L’interpretazione clinica la scrivi tu/.test(A.frasi(r).join(' ')) && !/scoliosi/i.test(A.frasi(r).join(' ')))
  const src = fs.readFileSync('js/atr.js', 'utf8').replace(/\/\*[^]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('⛔ js/atr.js non parla col database', !/supabase|fetch\(|localStorage/.test(src))
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
  await page.goto(B + 'prova-atr.html' + (query || ''), { waitUntil: 'load' }); await page.waitForTimeout(400)
  return { page, ctx, errori }
}
const VALORI = { toracico_alto: [1.0, 1.2, 0.8], toracico: [5.8, 6.2, 6.0], toracolombare: [-3.0, -3.4, -3.2], lombare: [-1.5, -1.4, -1.6] }
async function zona(page, p, k, v) {
  await page.waitForFunction(({ p, k, v }) => { const g = window.__atr.giro(); return g && g.passate[p] && g.passate[p][k] != null && Math.abs(g.passate[p][k] - v) < 0.25 }, { p, k, v }, { timeout: 8000 })
}
try {
  sez('⭐⭐ la pagina: taratura una volta, poi tre passate')
  const pid = '11111111-2222-3333-4444-555555555555'
  const { page, ctx, errori } = await apri({ sessione: true }, '?via=1&pid=' + pid)
  check('⭐ spiega cos’è e che è uno screening', /screening, non una diagnosi/.test(await page.textContent('.avviso')))
  check('⭐ il disegno: telefono di traverso, punta a DESTRA, mollette', /punta → DESTRA/.test(await page.textContent('svg.disegno')) && /mollette/.test(await page.textContent('svg.disegno')))
  check('⭐ quattro passi scritti', (await page.$$('.passi li')).length === 4)
  check('⭐ senza taratura il pulsante dice TARATURA', /TARATURA/.test(await page.textContent('#btn-start')))
  await page.evaluate(GUIDA, { valori: VALORI, errore: 0.4, tavolo: 0.6, verso: 1 })
  await page.click('#btn-start')
  await page.waitForFunction(() => !!window.__atr.taratura(), null, { timeout: 10000 })
  const tar = await page.evaluate(() => window.__atr.taratura())
  check('⭐⭐ taratura: l’errore del sensore (0,4°) anche col tavolo storto (0,6°)', Math.abs(tar.zero - 0.4) < 0.08 && Math.abs(tar.tavolo - 0.6) < 0.08, tar)
  check('⭐ e il verso della punta', tar.verso === 1)
  check('⭐ e resta sul telefono', !!(await page.evaluate(() => localStorage.getItem('policettivo.atr.taratura.v1'))))
  await page.waitForTimeout(200)
  check('⭐ dopo la taratura il pulsante dice PARTI', /PARTI/.test(await page.textContent('#btn-start')))
  await page.click('#momento .chip[data-m="pre"]')
  await page.click('#btn-start')
  await page.waitForFunction(() => !!window.__atr.giro(), null, { timeout: 5000 })
  await page.waitForTimeout(900); await page.screenshot({ path: '_schermate/atr-misura.png' })
  check('⭐ durante la misura: zona in grande e pulsante «ZONA SUCCESSIVA»', /TORACICO ALTO/.test(await page.textContent('#m-zona')) && /ZONA SUCCESSIVA/.test(await page.textContent('#btn-start')))
  check('⭐ e il pulsante Indietro/Home si toglie di mezzo', await page.evaluate(() => document.body.hasAttribute('data-nav-nascondi')))
  const K = ['toracico_alto', 'toracico', 'toracolombare', 'lombare']
  for (let p = 0; p < 3; p++) for (let z = 0; z < 4; z++) {
    await zona(page, p, K[z], VALORI[K[z]][p])
    if (p === 0 && z === 1) check('⭐⭐ scorrendo tiene il valore più alto (6,0 e non 2,9)', Math.abs((await page.evaluate(() => window.__atr.giro().passate[0].toracico)) - 5.8) < 0.25)
    if (p === 0 && z === 2) check('⭐ il lato: toracolombare più alto a SINISTRA', /sinistra/.test(await page.textContent('#m-tenuto')))
    await page.click('#btn-start'); await page.waitForTimeout(30)
  }
  await page.waitForSelector('#c-esito', { state: 'visible', timeout: 5000 })
  await page.waitForTimeout(300)
  const es = await page.textContent('#esito')
  await page.locator('#c-esito').screenshot({ path: '_schermate/atr-esito.png' })
  check('⭐⭐ risultato: toracico 6,0° più alto a destra, il massimo', /6,0°/.test(es) && /più alto a destra/.test(es) && /zona toracico: 6,0°/.test(es), es.slice(0, 200))
  check('⭐ le tre passate scritte', /5,8° dx · 6,2° dx · 6,0° dx/.test(es))
  check('⭐ l’errore della misura dalle passate', /Errore della misura \(dalle tue 3 passate\): ±0,[3-6]°/.test(es), es.match(/Errore[^.]*/))
  check('⭐ fasce solo per il professionista: toracico «da ricontrollare», toracolombare «sotto 5°»', /da ricontrollare/.test(es) && /sotto 5°/.test(es) && /solo per te/.test(es))
  check('⭐ con le fonti e l’accordo telefono/scoliometro (±3,5–4°)', /Bunnell 1984/.test(es) && /Navarro 2025/.test(es))
  check('⛔ mai la parola «scoliosi» nel risultato', !/scoliosi/i.test(es))
  await page.waitForFunction(() => window.__db.righe.length === 1, null, { timeout: 5000 })
  const rg = await page.evaluate(() => window.__db.righe[0])
  check('⭐⭐ salvata: quattro zone col segno, 3 passate, errore, momento, paziente', rg.toracico === 6 && rg.toracolombare < -3 && rg.n_passate === 3 && rg.errore > 0 && rg.momento === 'pre' && rg.patient_id === pid && rg.massimo === 6 && rg.livello_massimo === 'toracico', rg)
  check('⭐ con la taratura usata', Math.abs(rg.zero - 0.4) < 0.08 && rg.verso === 1 && rg.tarato === true)
  check('⭐ nella sessione dei test', rg.sessione_id === 'SESS-1')
  check('⭐ il pulsante Indietro/Home torna', await page.evaluate(() => !document.body.hasAttribute('data-nav-nascondi')))
  // una seconda misura DOPO: il confronto sulla pagina
  const DOPO = { toracico_alto: [0.5, 0.6, 0.4], toracico: [3.0, 3.2, 3.1], toracolombare: [-3.1, -3.3, -3.2], lombare: [-1.5, -1.4, -1.6] }
  await page.evaluate(GUIDA, { valori: DOPO, errore: 0.4, tavolo: 0.6, verso: 1 })
  await page.click('#momento .chip[data-m="post"]')
  await page.click('#btn-start')
  await page.waitForFunction(() => !!window.__atr.giro(), null, { timeout: 5000 })
  for (let p = 0; p < 3; p++) for (let z = 0; z < 4; z++) { await zona(page, p, K[z], DOPO[K[z]][p]); await page.click('#btn-start'); await page.waitForTimeout(30) }
  await page.waitForSelector('#c-confronto', { state: 'visible', timeout: 5000 })
  const cf = await page.textContent('#confronto')
  check('⭐⭐ prima/dopo: toracico 6,0 → 3,1 «più simmetrico», toracolombare «invariato»', /Toracico6,0° → 3,1°più simmetrico/.test(cf.replace(/\s+/g, '')) || (/più simmetrico/.test(cf) && /invariato/.test(cf)), cf)
  check('⭐ e dice «dopo», non «grazie a»', /non «grazie a»/.test(cf))
  check('nessun errore JS', errori.length === 0, errori)
  await ctx.close()

  sez('⭐ una passata sola, «Ferma», e senza la migration 054')
  {
    const { page, ctx, errori } = await apri({ sessione: true, senza054: true }, '?via=1')
    await page.evaluate(() => localStorage.setItem('policettivo.atr.taratura.v1', JSON.stringify({ zero: 0.4, verso: 1 })))
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300)
    check('⭐ taratura già fatta: si parte subito', /PARTI/.test(await page.textContent('#btn-start')))
    await page.evaluate(GUIDA, { valori: VALORI, errore: 0.4, tavolo: 0.6, verso: 1 })
    await page.click('#btn-start'); await page.waitForFunction(() => !!window.__atr.giro(), null, { timeout: 5000 })
    await page.click('#btn-ferma'); await page.waitForTimeout(200)
    check('⭐ «Ferma» torna alla preparazione senza salvare', await page.isVisible('#c-setup') && !(await page.isVisible('#c-misura')) && (await page.evaluate(() => window.__db.righe.length)) === 0)
    await page.click('#passate .chip[data-n="1"]')
    check('⭐ il pulsante dice «1 passata»', /1 passata/.test(await page.textContent('#btn-start')))
    await page.click('#btn-start'); await page.waitForFunction(() => !!window.__atr.giro(), null, { timeout: 5000 })
    for (let z = 0; z < 4; z++) { await zona(page, 0, K[z], VALORI[K[z]][0]); await page.click('#btn-start'); await page.waitForTimeout(30) }
    await page.waitForSelector('#c-esito', { state: 'visible', timeout: 5000 }); await page.waitForTimeout(300)
    check('⭐ una passata: l’errore «non si conosce»', /l’errore della misura non si conosce/.test(await page.textContent('#esito')))
    check('⛔⭐ senza la 054 lo dice per nome e i numeri restano sullo schermo', /054_atr_test\.sql/.test(await page.textContent('#salva-stato')) && /5,8°/.test(await page.textContent('#esito')))
    check('nessun errore JS', errori.length === 0, errori)
    await ctx.close()
  }

  sez('⭐ dalla pagina dei test')
  {
    const t = fs.readFileSync('test.html', 'utf8')
    check('⭐ la tessera «ATR · rotazione del tronco» porta a prova-atr.html col paziente', /id: 'atr'[^]*?prova-atr\.html' \+ q/.test(t))
  }
} finally { await browser.close(); server.close() }

console.log('\n' + '='.repeat(66))
if (ko) { console.log('FALLITI ' + ko + ':'); fallite.forEach(f => console.log('  - ' + f)); process.exit(1) }
console.log('TUTTO VERDE — ' + ok + ' controlli passati.')
