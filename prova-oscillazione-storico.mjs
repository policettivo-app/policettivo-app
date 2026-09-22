/* prova-oscillazione-storico.mjs — oscillazione-app-v1
 *
 * Controlla oscillazione-storico.html con un Supabase finto dentro Chromium:
 * cosa legge, cosa confronta, con quale soglia, e cosa manda al PDF.
 * E controlla che il test si apra dall'applicazione (home e scheda paziente).
 *
 *   node prova-oscillazione-storico.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const PORT = 8483
const PAGINA = 'oscillazione-storico.html'
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
const sez = t => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length)))

const P1 = '11111111-2222-3333-4444-555555555555'
const P2 = '99999999-2222-3333-4444-555555555555'

// i test finti: Mario, due sedute da tre prove in beccheggio occhi aperti,
// più un rollio; due prove libere; una prova di Luca.
function riga(id, pid, quando, vel, extra) {
  return Object.assign({
    id, patient_id: pid, quando, evento: 'beccheggio', occhi: 'aperti', piedi: 'scalzo',
    configurazione: null, nota: null, tarato: true, verso_beta: 1, verso_gamma: 1,
    zero_beta: 0.5, zero_gamma: -0.2, carico_avanti: 1.0, carico_destra: 0.3,
    osc_ap: 0.8, osc_ds: 0.4, velocita: vel, deriva: 0.2, ellisse: 3, raggio: 0.6, durata_s: 30
  }, extra || {})
}
const DATI = [
  riga('a1', P1, '2026-09-01T09:00:00Z', 4.0),
  riga('a2', P1, '2026-09-01T09:02:00Z', 4.2),
  riga('a3', P1, '2026-09-01T09:04:00Z', 3.8),
  riga('r1', P1, '2026-09-01T09:06:00Z', 6.0, { evento: 'rollio' }),
  riga('b1', P1, '2026-09-15T09:00:00Z', 2.4, { carico_avanti: -1.2 }),
  riga('b2', P1, '2026-09-15T09:02:00Z', 2.6, { carico_avanti: -1.0 }),
  riga('b3', P1, '2026-09-15T09:04:00Z', 2.5, { carico_avanti: -1.1, tarato: false }),
  riga('l1', null, '2026-09-10T10:00:00Z', 5.0),
  riga('l2', null, '2026-09-11T10:00:00Z', 4.9),
  riga('x1', P2, '2026-09-05T10:00:00Z', 3.3)
]

const SUPA = ({ sessione, dati, errore, P1, P2 }) => {
  window.__db = { letture: [], tracce: [] }
  const traccia = () => {
    const b = [], g = []
    for (let i = 0; i < 300; i++) { b.push(0.5 + Math.sin(i / 10)); g.push(-0.2 + 0.5 * Math.cos(i / 10)) }
    return { t: [], b, g }
  }
  const q = (tab) => {
    const st = { tab, eq: {}, inn: null, sel: '' }
    const api = {
      select(s) { st.sel = s; return api },
      order() { return api }, limit() { return api },
      eq(k, v) { st.eq[k] = v; return api },
      in(k, v) { st.inn = v; return api },
      insert() { window.__db.scritto = true; return api },
      update() { window.__db.scritto = true; return api },
      delete() { window.__db.scritto = true; return api },
      async maybeSingle() {
        if (tab === 'oscillazione_test' && st.sel === 'traccia') {
          window.__db.tracce.push(st.eq.id); return { data: { traccia: traccia() }, error: null }
        }
        return { data: null, error: null }
      },
      then(res, rej) {
        let out
        if (tab === 'oscillazione_test') {
          window.__db.letture.push({ sel: st.sel, eq: st.eq })
          if (errore) out = { data: null, error: { message: errore } }
          else out = { data: dati.filter(r => !('patient_id' in st.eq) || r.patient_id === st.eq.patient_id), error: null }
        } else if (tab === 'patients') {
          const tutti = [{ id: P1, nome: 'Mario', cognome: 'Rossi' }, { id: P2, nome: 'Luca', cognome: 'Bianchi' }]
          out = { data: tutti.filter(p => !st.inn || st.inn.includes(p.id)), error: null }
        } else out = { data: [], error: null }
        return Promise.resolve(out).then(res, rej)
      }
    }
    return api
  }
  window.supabase = { createClient() { return {
    auth: { getSession: async () => ({ data: { session: sessione ? { user: { id: 'U1' }, access_token: 'TOK' } : null } }) },
    from: q
  } } }
}

async function apri(browser, finto, query, vista) {
  const ctx = await browser.newContext({ viewport: vista || { width: 400, height: 800 }, acceptDownloads: true })
  const page = await ctx.newPage()
  const errori = []
  page.on('pageerror', e => errori.push(String(e)))
  await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
  await page.addInitScript(SUPA, Object.assign({ dati: DATI, P1, P2 }, finto))
  await page.goto('http://localhost:' + PORT + '/' + PAGINA + (query || ''), { waitUntil: 'load' })
  await page.waitForTimeout(500)
  return { page, ctx, errori }
}

// pixel non bianchi di un canvas: il gomitolo c'è davvero?
const inchiostro = (page, id) => page.evaluate((id) => {
  const c = document.getElementById(id), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] < 200 || d[i+1] < 200 || d[i+2] < 200) n++
  return n
}, id)

await new Promise(r => server.listen(PORT, r))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
try {

sez('senza account: lo dice, e non mostra niente')
{
  const { page, ctx, errori } = await apri(browser, { sessione: false })
  check('nessun errore JS', errori.length === 0, errori)
  check('⭐ dice che non sei entrato', /Non sei entrato/.test(await page.textContent('#paz-banda')))
  check('e offre di entrare', (await page.$('#paz-banda a[href="login.html"]')) !== null)
  check('niente confronto', !(await page.isVisible('#c-confronto')))
  check('non ha nemmeno chiesto i test', (await page.evaluate(() => window.__db.letture.length)) === 0)
  await ctx.close()
}

sez('⭐ dalla scheda del paziente (?pid=): solo i suoi test')
{
  const { page, ctx, errori } = await apri(browser, { sessione: true }, '?pid=' + P1)
  check('nessun errore JS', errori.length === 0, errori)
  const let0 = await page.evaluate(() => window.__db.letture[0])
  check('⭐ legge SOLO i test di quel paziente', let0 && let0.eq.patient_id === P1, let0)
  check('⭐ e NON si porta dietro la traccia di tutti (pesa)', let0 && !/traccia/.test(let0.sel), let0 && let0.sel)
  check('mostra il nome', /Mario Rossi/.test(await page.textContent('#paz-banda')))
  check('e quanti test', /7 test salvati/.test(await page.textContent('#paz-banda')), await page.textContent('#paz-banda'))
  check('⭐ «indietro» torna alla scheda del paziente',
    (await page.getAttribute('#link-indietro', 'href')) === 'paziente.html?id=' + P1)
  check('⭐ «fai un test nuovo» apre il test PER quel paziente',
    (await page.getAttribute('#btn-nuovo', 'href')) === 'prova-oscillazione.html?pid=' + P1)
  const cond = await page.inputValue('#cond')
  check('⭐ parte dalla condizione dell’ultimo test', /beccheggio · occhi aperti/.test(cond), cond)
  const s = await page.evaluate(() => ({ pre: window.__storico.pre().id, post: window.__storico.post().id,
                                         n: window.__storico.filtrati().length }))
  check('⭐ nella lista solo quella condizione (niente rollio)', s.n === 6, s)
  check('⭐⭐ PRIMA = il primo test, DOPO = l’ultimo', s.pre === 'a1' && s.post === 'b3', s)

  const es = await page.evaluate(() => { const e = window.__storico.esito(); return { m: e.usaMedia, b: e.e.banda, na: e.na, nb: e.nb } })
  check('⭐⭐ tre prove per seduta: confronta le MEDIE', es.m === true, es)
  check('⭐⭐ e la soglia scende al 20%', es.b === 20, es)
  check('⭐ lo dice a parole', /medie delle due sedute/.test(await page.textContent('#media')))
  const html = await page.innerHTML('#esito')
  check('⭐ velocità media della seduta: 4 → 2,5', /4 → 2\.5/.test(html), html.slice(0, 300))
  check('⭐ −38% è oltre la soglia: colorato, non grigio', /#0a7d33[^>]*>−38%/.test(html))
  const fr = await page.textContent('#frasi')
  check('⭐ le frasi finiscono lasciando la clinica al professionista', /L’interpretazione clinica la scrivi tu/.test(fr))
  check('⭐ avviso: un test senza taratura (il verso del carico può essere invertito)',
    /senza la taratura del verso/.test(await page.textContent('#avvisi')))

  await page.waitForTimeout(300)
  check('⭐ il gomitolo PRIMA è disegnato', (await inchiostro(page, 'cv-pre')) > 2000)
  check('⭐ e quello DOPO', (await inchiostro(page, 'cv-post')) > 2000)
  const tr = await page.evaluate(() => window.__db.tracce)
  check('⭐ ha scaricato la traccia SOLO dei due test scelti', tr.length === 2 && tr.includes('a1') && tr.includes('b3'), tr)

  check('⭐ andamento: un punto per test', (await page.$$('#andamento circle')).length === 6)
  check('con la fascia del rumore attorno al primo', (await page.$$('#andamento rect')).length === 1)

  // due prove dello stesso giorno: prove singole, soglia 35
  await page.selectOption('#sel-post', '1')
  await page.waitForTimeout(200)
  const es2 = await page.evaluate(() => { const e = window.__storico.esito(); return { m: e.usaMedia, b: e.e.banda } })
  check('⭐ due prove della stessa seduta: NON si fa la media', es2.m === false, es2)
  check('⭐ e la soglia resta al 35%', es2.b === 35, es2)
  check('4 → 4,2 = +5%: grigio (rumore)', /#999[^>]*>\+5%/.test(await page.innerHTML('#esito')))

  // tocco nella lista: PRIMA poi DOPO
  await page.click('#lista .voce[data-i="4"]')
  await page.click('#lista .voce[data-i="5"]')
  await page.waitForTimeout(200)
  const s2 = await page.evaluate(() => ({ pre: window.__storico.pre().id, post: window.__storico.post().id }))
  check('⭐ toccando la lista: primo tocco PRIMA, secondo DOPO', s2.pre === 'b2' && s2.post === 'b3', s2)
  check('e le etichette si vedono', (await page.$$('#lista .etich.pre')).length === 1 && (await page.$$('#lista .etich.post')).length === 1)

  // tutte le condizioni: il confronto fra situazioni diverse lo dice
  await page.selectOption('#cond', '*')
  await page.waitForTimeout(200)
  await page.selectOption('#sel-pre', String(await page.evaluate(() => window.__storico.filtrati().findIndex(t => t.id === 'r1'))))
  await page.waitForTimeout(200)
  check('⭐ rollio contro beccheggio: «situazioni diverse, non un cambiamento nel tempo»',
    /non sono nella stessa condizione/.test(await page.textContent('#esito')))
  check('con tutte le condizioni l’andamento non si disegna (mescolerebbe)', !(await page.isVisible('#c-andamento')))
  await ctx.close()
}

sez('⭐ dalla home: tutti i test, si sceglie di chi')
{
  const { page, ctx, errori } = await apri(browser, { sessione: true })
  check('nessun errore JS', errori.length === 0, errori)
  const let0 = await page.evaluate(() => window.__db.letture[0])
  check('legge tutti i test del professionista (la RLS fa il resto)', let0 && !('patient_id' in let0.eq), let0)
  check('lo dice', /Tutti i tuoi test · 10 salvati/.test(await page.textContent('#paz-banda')))
  const opz = await page.$$eval('#filtro option', o => o.map(x => x.textContent))
  check('⭐ nel «di chi» ci sono i pazienti e le prove libere', opz.some(t => /Mario Rossi · 7/.test(t)) &&
    opz.some(t => /Prove libere/.test(t)) && opz.some(t => /Luca Bianchi · 1/.test(t)), opz)
  check('⭐ parte da chi ha fatto l’ultimo test', (await page.inputValue('#filtro')) === P1)
  await page.selectOption('#filtro', '_libere')
  await page.waitForTimeout(200)
  const s = await page.evaluate(() => ({ pre: window.__storico.pre().id, post: window.__storico.post().id }))
  check('⭐ le prove libere si confrontano fra loro', s.pre === 'l1' && s.post === 'l2', s)
  check('⭐ «indietro» torna all’app', (await page.getAttribute('#link-indietro', 'href')) === 'dashboard.html')
  check('niente scroll orizzontale sul telefono',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await ctx.close()
}

sez('⭐ il PDF del confronto')
{
  const { page, ctx, errori } = await apri(browser, { sessione: true }, '?pid=' + P1)
  let req = null
  await page.route('**/api/pdf-render', async (r) => {
    req = { h: r.request().headers(), b: JSON.parse(r.request().postData()) }
    await r.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 finto' })
  })
  await page.waitForTimeout(300)
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
  await page.click('#btn-pdf')
  const d = await dl
  check('nessun errore JS', errori.length === 0, errori)
  check('⭐ chiede il PDF al server con il token', req && req.h.authorization === 'Bearer TOK', req && req.h)
  check('⭐ legato al paziente e al test DOPO (per il registro)', req && req.b.patient_id === P1 &&
    req.b.record_id === 'b3' && req.b.tabella === 'oscillazione_test', req && req.b)
  check('⭐ il nome del file dice paziente e data', req && req.b.filename === 'Oscillazione_confronto_Mario_Rossi_2026-09-15.pdf',
    req && req.b.filename)
  const h = req ? req.b.html : ''
  check('⭐ nel PDF: il nome, le due date', /Mario Rossi/.test(h) && /01\/09\/2026/.test(h) && /15\/09\/2026/.test(h))
  check('⭐ i due gomitoli come immagini', (h.match(/data:image\/png;base64/g) || []).length === 2)
  check('⭐ la tabella del confronto e le frasi', /cfr-riga/.test(h) && /interpretazione clinica/i.test(h))
  check('⭐ e il piede onesto (non con una norma)', /non con una norma/.test(h))
  check('i pulsanti non finiscono nel PDF', /\.no-stampa\{display:none!important\}/.test(h))
  check('⭐ il file si scarica', d !== null && /Mario_Rossi/.test(d ? d.suggestedFilename() : ''))
  await ctx.close()
}

sez('manca la migration / nessun test')
{
  let r = await apri(browser, { sessione: true, errore: 'relation "public.oscillazione_test" does not exist' })
  check('⭐ se manca la tabella lo dice chiaro (migration 046)', /migration 046/.test(await r.page.textContent('#err')))
  check('nessun errore JS', r.errori.length === 0, r.errori)
  await r.ctx.close()
  r = await apri(browser, { sessione: true, dati: [] }, '?pid=' + P1)
  check('⭐ nessun test: dice di farne uno, non una pagina vuota', /Nessun test salvato per questo paziente/.test(await r.page.textContent('#lista')))
  check('e il pulsante per farlo c’è', await r.page.isVisible('#btn-nuovo'))
  check('nessun errore JS', r.errori.length === 0, r.errori)
  await r.ctx.close()
}

sez('⛔ lo storico legge e basta')
{
  const src = fs.readFileSync(path.join(ROOT, PAGINA), 'utf8')
  check('⛔ niente insert / update / delete nella pagina', !/\.(insert|update|delete|upsert)\(/.test(src))
  check('⛔ niente localStorage', !/localStorage/.test(src))
  check('usa il confronto del motore, non uno suo', /PO\.confronto\(/.test(src))
}

sez('⭐ il test si apre dall’applicazione')
{
  const dash = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8')
  check('⭐ nella home c’è «Oscillazione Policettiva» → il test', /window\.location\.href='prova-oscillazione\.html'[^]{0,900}Oscillazione Policettiva/.test(dash))
  check('⭐ e «Confronto test» → lo storico', /oscillazione-storico\.html[^]{0,900}Confronto test/.test(dash))
  const paz = fs.readFileSync(path.join(ROOT, 'paziente.html'), 'utf8')
  check('⭐ nella scheda paziente, fra i tipi di visita, il test col paziente',
    /prova-oscillazione\.html\?pid='\+patientId[^]{0,400}Oscillazione Policettiva/.test(paz))
  check('le due visite di prima ci sono ancora', /visita\.html\?pid='\+patientId/.test(paz) && /valutazione-posturale\.html\?pid='\+patientId/.test(paz))
}

} finally {
  await browser.close()
  server.close()
}
console.log('\n' + '='.repeat(66))
console.log(ko === 0 ? `TUTTO VERDE — ${ok} controlli passati.` : `ROSSO — ${ok} passati, ${ko} falliti:\n  - ` + fallite.join('\n  - '))
process.exit(ko === 0 ? 0 : 1)
