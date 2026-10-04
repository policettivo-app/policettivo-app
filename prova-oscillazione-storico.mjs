/* prova-oscillazione-storico.mjs — oscillazione-app-v1 · test-sessioni-v1 · prove-confronto-v1 · momento-nota-v1
 *
 * Controlla, con un Supabase finto dentro Chromium:
 *   - oscillazione-storico.html: sessioni, confronto sessione contro sessione,
 *     le quattro domande, le soglie, il PDF;
 *   - test.html: la pagina dei test (home e scheda paziente);
 *   - che il test si apra dall'applicazione.
 *
 *   node prova-oscillazione-storico.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const PORT = 8483
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
const S1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const S2 = 'aaaaaaaa-0000-0000-0000-000000000002'
const L1 = 'bbbbbbbb-0000-0000-0000-000000000001'
const L2 = 'bbbbbbbb-0000-0000-0000-000000000002'
const X1 = 'cccccccc-0000-0000-0000-000000000001'

function riga(id, pid, sid, quando, vel, extra) {
  return Object.assign({
    id, patient_id: pid, sessione_id: sid, quando, evento: 'beccheggio', occhi: 'aperti', piedi: 'scalzo',
    configurazione: null, nota: null, tarato: true, verso_beta: 1, verso_gamma: 1,
    zero_beta: 0.5, zero_gamma: -0.2, carico_avanti: 1.0, carico_destra: 0.3,
    osc_ap: 0.8, osc_ds: 0.4, velocita: vel, deriva: 0.2, ellisse: 3, raggio: 0.6, durata_s: 30
  }, extra || {})
}
// Mario: sessione 1 (3 OA + 1 OC), prove vecchie senza sessione, sessione 2 (3 OA + 1 OC)
// Anna (prova libera con nome): due sessioni, una scritta in minuscolo
const DATI = [
  riga('a1', P1, S1, '2026-09-01T09:00:00Z', 4.0),
  riga('a2', P1, S1, '2026-09-01T09:02:00Z', 4.2),
  riga('a3', P1, S1, '2026-09-01T09:04:00Z', 3.8),
  riga('a4', P1, S1, '2026-09-01T09:06:00Z', 8.0, { occhi: 'chiusi' }),
  riga('v1', P1, null, '2026-09-05T10:00:00Z', 3.5),
  riga('v2', P1, null, '2026-09-05T10:05:00Z', 3.6),
  riga('b1', P1, S2, '2026-09-15T09:00:00Z', 2.4, { carico_avanti: -1.2 }),
  riga('b2', P1, S2, '2026-09-15T09:02:00Z', 2.6, { carico_avanti: -1.0 }),
  riga('b3', P1, S2, '2026-09-15T09:04:00Z', 2.5, { carico_avanti: -1.1, tarato: false }),
  riga('b4', P1, S2, '2026-09-15T09:06:00Z', 4.0, { occhi: 'chiusi' }),
  riga('l1', null, L1, '2026-09-10T10:00:00Z', 5.0),
  riga('l2', null, L2, '2026-09-11T10:00:00Z', 4.9),
  riga('x1', P2, X1, '2026-09-05T10:00:00Z', 3.3)
]
const SESSIONI = [
  { id: S1, patient_id: P1, quando: '2026-09-01T08:59:00Z', nome: null, eta: null, peso_kg: null },
  { id: S2, patient_id: P1, quando: '2026-09-15T08:59:00Z', nome: null, eta: null, peso_kg: null },
  { id: L1, patient_id: null, quando: '2026-09-10T09:59:00Z', nome: 'Anna Verdi', eta: 42, peso_kg: 61.5 },
  { id: L2, patient_id: null, quando: '2026-09-11T09:59:00Z', nome: 'anna verdi', eta: 42, peso_kg: 61 },
  { id: X1, patient_id: P2, quando: '2026-09-05T09:59:00Z', nome: null, eta: null, peso_kg: null }
]

const SUPA = ({ sessione, dati, sess, errore, senza047, senza053, P1, P2 }) => {
  window.__db = { letture: [], tracce: [], scritto: false }
  const traccia = () => {
    const b = [], g = []
    for (let i = 0; i < 300; i++) { b.push(0.5 + Math.sin(i / 10)); g.push(-0.2 + 0.5 * Math.cos(i / 10)) }
    return { t: [], b, g }
  }
  const q = (tab) => {
    const st = { tab, eq: {}, inn: null, is: {}, sel: '' }
    const api = {
      select(s) { st.sel = s || ''; return api },
      order() { return api }, limit() { return api },
      eq(k, v) { st.eq[k] = v; return api },
      is(k, v) { st.is[k] = v; return api },
      in(k, v) { st.inn = v; return api },
      insert() { window.__db.scritto = true; return api },
      update() { window.__db.scritto = true; return api },
      delete() { window.__db.scritto = true; return api },
      async maybeSingle() {
        if (tab === 'patients') return { data: { nome: 'Mario', cognome: 'Rossi', access_token: 'TOKPAZ' }, error: null }
        return { data: null, error: null }
      },
      then(res, rej) {
        let out
        if (tab === 'oscillazione_test' && st.sel === 'id,traccia') {
          window.__db.tracce.push(...st.inn)
          out = { data: st.inn.map(id => ({ id, traccia: traccia() })), error: null }
        } else if (tab === 'oscillazione_test') {
          window.__db.letture.push({ sel: st.sel, eq: st.eq })
          if (errore) out = { data: null, error: { message: errore } }
          else if (senza053 && /appoggio/.test(st.sel)) out = { data: null, error: { message: 'column oscillazione_test.appoggio does not exist' } }
          else if (senza047 && /sessione_id/.test(st.sel)) out = { data: null, error: { message: 'column oscillazione_test.sessione_id does not exist' } }
          else out = { data: dati.filter(r => !('patient_id' in st.eq) || r.patient_id === st.eq.patient_id)
                                 .map(r => senza047 ? Object.assign({}, r, { sessione_id: undefined }) : r), error: null }
        } else if (tab === 'test_sessioni') {
          if (senza047) out = { data: null, error: { message: 'relation "public.test_sessioni" does not exist' } }
          else out = { data: sess.filter(s => (!('patient_id' in st.eq) || s.patient_id === st.eq.patient_id) &&
                                             (!('patient_id' in st.is) || s.patient_id === null)), error: null }
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

async function apri(browser, pagina, finto, query) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, acceptDownloads: true })
  const page = await ctx.newPage()
  const errori = []
  page.on('pageerror', e => errori.push(String(e)))
  await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
  await page.addInitScript(SUPA, Object.assign({ dati: DATI, sess: SESSIONI, P1, P2 }, finto))
  await page.goto('http://localhost:' + PORT + '/' + pagina + (query || ''), { waitUntil: 'load' })
  await page.waitForTimeout(700)
  return { page, ctx, errori }
}
const inchiostro = (page, sel) => page.evaluate((sel) => {
  const c = document.querySelector(sel); if (!c) return 0
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] < 200 || d[i+1] < 200 || d[i+2] < 200) n++
  return n
}, sel)

await new Promise(r => server.listen(PORT, r))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ST = 'oscillazione-storico.html'
try {

sez('senza account: lo dice, e non legge niente')
{
  const { page, ctx, errori } = await apri(browser, ST, { sessione: false })
  check('nessun errore JS', errori.length === 0, errori)
  check('⭐ dice che non sei entrato', /Non sei entrato/.test(await page.textContent('#paz-banda')))
  check('non ha chiesto i test', (await page.evaluate(() => window.__db.letture.length)) === 0)
  await ctx.close()
}

sez('⭐ dalla scheda del paziente: SESSIONE contro SESSIONE')
{
  const { page, ctx, errori } = await apri(browser, ST, { sessione: true }, '?pid=' + P1)
  check('nessun errore JS', errori.length === 0, errori)
  const let0 = await page.evaluate(() => window.__db.letture[0])
  check('⭐ legge solo i test del paziente', let0 && let0.eq.patient_id === P1, let0)
  check('⭐ senza la traccia di tutti (pesa)', let0 && !/traccia/.test(let0.sel))
  check('⭐ con la sessione di ogni prova', let0 && /sessione_id/.test(let0.sel))
  const ss = await page.evaluate(() => window.__storico.sessioni().map(s => ({ id: s.id, n: s.prove.length })))
  check('⭐⭐ tre sessioni: due vere e le prove vecchie raggruppate per giorno',
    ss.length === 3 && ss[0].id && ss[0].n === 4 && ss[1].id === null && ss[1].n === 2 && ss[2].n === 4, ss)
  check('mostra nome e numero di sessioni', /Mario Rossi.*3 sessioni/.test(await page.textContent('#paz-banda')))
  check('⭐ «indietro» torna ai test del paziente', (await page.getAttribute('#link-indietro', 'href')) === 'test.html?pid=' + P1)
  check('⭐ «fai un test nuovo» apre il test per il paziente', (await page.getAttribute('#btn-nuovo', 'href')) === 'prova-oscillazione.html?pid=' + P1)
  check('il «di chi» non serve: è già il paziente', !(await page.isVisible('#filtro')))
  const pp = await page.evaluate(() => ({ pre: window.__storico.pre().id, post: window.__storico.post().id }))
  check('⭐⭐ di partenza PRIMA = la prima sessione, DOPO = l’ultima', pp.pre === 'aaaaaaaa-0000-0000-0000-000000000001' && pp.post === 'aaaaaaaa-0000-0000-0000-000000000002', pp)
  check('⭐ la lista dice cosa c’è in ogni sessione', /beccheggio · OA ×3 · beccheggio · OC ×1/.test(await page.textContent('#lista')),
    await page.textContent('#lista'))

  const e = await page.evaluate(() => { const u = window.__storico.esito(); return u && u.e.condizioni.map(c => ({ k: c.condizione, v: c.verdetto, b: c.bandaVel, dv: Math.round(c.dv) })) })
  check('⭐ confronta condizione per condizione (occhi aperti e occhi chiusi)', e && e.length === 2, e)
  check('⭐⭐ occhi aperti, 3 contro 3: PIÙ STABILE, soglia 20%', e && e[0].v === 'PIÙ STABILE' && e[0].b === 20 && Math.abs(e[0].dv + 37.5) <= 0.6, e && e[0])
  check('⭐⭐ occhi chiusi, 1 contro 1: soglia larga 35%', e && e[1].b === 35 && e[1].v === 'PIÙ STABILE', e && e[1])
  const html = await page.innerHTML('#esito')
  check('⭐ la sintesi in cima: una riga per condizione', (await page.$$('#esito .sintesi-riga')).length === 2)
  check('⭐ le quattro domande ci sono', /1 · È più stabile/.test(html) && /2 · Dove oscilla di più/.test(html) &&
    /3 · Dove tende ad avere più carico/.test(html) && /4 · Da che parte si sbilancia/.test(html))
  check('⭐ la 4 è dichiarata descrittiva', /descrittivo/.test(html) && /non è \s*ancora misurata/.test(html.replace(/<[^>]+>/g, '')))
  check('⭐ il carico spostato di 2,1° indietro si vede (oltre 1,0°)', /Rispetto a prima si è spostato di 2,1° verso indietro/.test(await page.textContent('#frasi')),
    await page.textContent('#frasi'))
  check('⭐ quanto si appoggia alla vista: chiusi ÷ aperti', /Quanto si appoggia alla vista/.test(html) && /2,00 → 1,60/.test(html))
  check('⭐ avviso: una prova senza taratura', /senza la taratura del verso/.test(html))
  check('⭐ niente «(non indicata)» davanti ai nomi', !/non indicata/.test(html))
  check('⭐ le parole sono «più stabile», non «migliorato»', !/migliorat|peggiorat/i.test(html + await page.textContent('#frasi')))
  check('⭐ le frasi lasciano la clinica al professionista', /L’interpretazione clinica la scrivi tu/.test(await page.textContent('#frasi')))
  await page.waitForTimeout(300)
  check('⭐ i gomitoli: due per condizione', (await page.$$('#gomitoli canvas')).length === 4)
  check('⭐ e sono disegnati', (await inchiostro(page, '#g-pre-0')) > 2000 && (await inchiostro(page, '#g-post-0')) > 2000)
  const tr = await page.evaluate(() => window.__db.tracce)
  check('⭐ ha scaricato la traccia SOLO delle prove delle due sessioni', tr.length === 8 && !tr.includes('v1'), tr)
  check('⭐ andamento: un punto per sessione', (await page.$$('#andamento circle')).length === 3)

  // la sessione vecchia senza id come PRIMA
  await page.click('#lista .voce[data-i="1"]')
  await page.waitForTimeout(300)
  const e2 = await page.evaluate(() => { const u = window.__storico.esito(); return { pre: window.__storico.pre().prove.length, c: u.e.condizioni.length, so: u.e.soloB.length } })
  check('⭐ toccando la lista cambia la PRIMA', e2.pre === 2, e2)
  check('⭐ quello che c’è solo in una sessione non si confronta, e lo dice', e2.c === 1 && e2.so === 1 && /Non confrontate/.test(await page.textContent('#esito')), e2)
  await ctx.close()
}

sez('⭐ il PDF del confronto e della sessione')
{
  const { page, ctx, errori } = await apri(browser, ST, { sessione: true }, '?pid=' + P1)
  const reqs = []
  await page.route('**/api/pdf-render', async (r) => {
    reqs.push({ h: r.request().headers(), b: JSON.parse(r.request().postData()) })
    await r.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 finto' })
  })
  await page.waitForTimeout(300)
  let dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
  await page.click('#btn-pdf')
  const d = await dl
  check('nessun errore JS', errori.length === 0, errori)
  const q = reqs[0]
  check('⭐ col token', q && q.h.authorization === 'Bearer TOK')
  check('⭐ legato al paziente', q && q.b.patient_id === P1, q && q.b.patient_id)
  check('⭐ nome del file', q && q.b.filename === 'Oscillazione_confronto_Mario_Rossi_2026-09-15.pdf', q && q.b.filename)
  const h = q ? q.b.html : ''
  check('⭐ nel PDF: nome, le due sessioni', /Mario Rossi/.test(h) && /01\/09\/2026/.test(h) && /15\/09\/2026/.test(h))
  check('⭐ le quattro domande e la sintesi', /1 · È più stabile/.test(h) && /sintesi-riga/.test(h))
  check('⭐ i gomitoli come immagini (2 per condizione)', (h.match(/data:image\/png;base64/g) || []).length === 4)
  check('⭐ lo stile dentro il documento (il server non ha la pagina)', /<style>[^<]*\.cond-card/.test(h))
  check('e il piede onesto', /non con una norma/.test(h))
  check('⭐ il file si scarica', d !== null)
  dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
  await page.click('#btn-sess-post')
  await dl
  await page.waitForTimeout(300)
  const q2 = reqs[1]
  check('⭐ il PDF di UNA sessione: tutte le sue prove, ognuna col suo gomitolo',
    q2 && (q2.b.html.match(/class="prova-ref"/g) || []).length === 4 && (q2.b.html.match(/data:image\/png/g) || []).length === 4)
  check('   con le medie della sessione', q2 && /Medie della sessione/.test(q2.b.html))
  check('   e il nome del file', q2 && q2.b.filename === 'Oscillazione_sessione_Mario_Rossi_2026-09-15.pdf', q2 && q2.b.filename)
  await ctx.close()
}

sez('⭐ dalla home: le persone, anche le prove libere col nome')
{
  const { page, ctx, errori } = await apri(browser, ST, { sessione: true })
  check('nessun errore JS', errori.length === 0, errori)
  const opz = await page.$$eval('#filtro option', o => o.map(x => x.textContent))
  check('⭐ nel «di chi»: Mario, Luca, Anna', opz.some(t => /Mario Rossi · 3 sessioni/.test(t)) &&
    opz.some(t => /Luca Bianchi · 1 sessione/.test(t)) && opz.some(t => /Anna Verdi · 2 sessioni/.test(t)), opz)
  check('⭐ «Anna Verdi» e «anna verdi» sono la stessa persona', opz.filter(t => /anna verdi/i.test(t)).length === 1, opz)
  check('parte da chi ha fatto l’ultima sessione', (await page.inputValue('#filtro')) === 'p:' + P1)
  await page.selectOption('#filtro', 'n:anna verdi')
  await page.waitForTimeout(400)
  check('⭐ nella lista età e peso della prova libera', /42 anni · 61,5 kg/.test(await page.textContent('#lista')))
  const e = await page.evaluate(() => window.__storico.esito().e.condizioni[0].verdetto)
  check('⭐ e il confronto fra le sue due sessioni', e === 'INVARIATO', e)
  await page.selectOption('#filtro', 'p:' + P2)
  await page.waitForTimeout(400)
  check('⭐ una sessione sola: niente confronto, ma il riepilogo', await page.isVisible('#c-una') && !(await page.isVisible('#c-confronto')))
  check('   con la sua prova', (await page.$$('#una-referto .prova-ref')).length === 1)
  check('niente scroll orizzontale sul telefono',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await ctx.close()
}

sez('⭐ si apre sulla sessione appena fatta (?sessione=)')
{
  const { page, ctx } = await apri(browser, ST, { sessione: true }, '?sessione=' + L1)
  const s = await page.evaluate(() => ({ post: window.__storico.post().id, chi: document.getElementById('filtro').value }))
  check('⭐ la sessione chiesta è la DOPO, e la persona è la sua', s.post === L1 && s.chi === 'n:anna verdi', s)
  await ctx.close()
}

sez('migration 047 non lanciata / nessun test')
{
  let r = await apri(browser, ST, { sessione: true, senza047: true }, '?pid=' + P1)
  check('nessun errore JS', r.errori.length === 0, r.errori)
  check('⭐ senza 047 le prove si raggruppano per giorno e lo dice', /Manca la migration 047/.test(await r.page.textContent('#paz-banda')))
  const n = await r.page.evaluate(() => window.__storico.sessioni().length)
  check('   tre giorni → tre sessioni', n === 3, n)
  check('   e il confronto funziona lo stesso', await r.page.isVisible('#c-confronto'))
  await r.ctx.close()
  r = await apri(browser, ST, { sessione: true, errore: 'relation "public.oscillazione_test" does not exist' })
  check('⭐ se manca la 046 lo dice', /migration 046/.test(await r.page.textContent('#err')))
  await r.ctx.close()
  r = await apri(browser, ST, { sessione: true, dati: [] }, '?pid=' + P1)
  check('⭐ nessun test: dice di farne uno', /Nessun test salvato per questo paziente/.test(await r.page.textContent('#lista')))
  check('nessun errore JS', r.errori.length === 0, r.errori)
  await r.ctx.close()
}

sez('⛔ il confronto legge e basta')
{
  const src = fs.readFileSync(path.join(ROOT, ST), 'utf8')
  check('⛔ niente insert / update / delete', !/\.(insert|update|delete|upsert)\(/.test(src))
  check('⛔ niente localStorage', !/localStorage/.test(src))
  check('usa il confronto del motore', /PO\.confrontoSessioni\(/.test(src))
}

sez('⭐ la pagina dei TEST')
{
  let { page, ctx, errori } = await apri(browser, 'test.html', { sessione: true }, '?pid=' + P1)
  check('nessun errore JS', errori.length === 0, errori)
  check('⭐ ci sono Oscillazione, Confronto e Autotest', await page.isVisible('#t-oscillazione') &&
    await page.isVisible('#t-confronto') && await page.isVisible('#t-autotest'))
  check('dice di chi', /Mario Rossi/.test(await page.textContent('#paz-banda')))
  check('⭐ le ultime sessioni del paziente', (await page.$$('#sessioni .sess')).length === 2)
  check('⭐ e toccandone una si apre il confronto su quella', (await page.getAttribute('#sessioni .sess', 'href')).includes('pid=' + P1 + '&sessione='))
  await page.click('#t-oscillazione'); await page.waitForTimeout(300)
  check('⭐ Oscillazione apre il test PER il paziente', page.url().endsWith('prova-oscillazione.html?pid=' + P1), page.url())
  await ctx.close()
  ;({ page, ctx, errori } = await apri(browser, 'test.html', { sessione: true }, '?pid=' + P1))
  await page.click('#t-autotest'); await page.waitForTimeout(300)
  check('⭐ Autotest apre il suo test col token del paziente, e sa tornare', /autotest\.html\?token=TOKPAZ&pro=1&id=/.test(page.url()), page.url())
  await ctx.close()
  ;({ page, ctx, errori } = await apri(browser, 'test.html', { sessione: true }))
  check('dalla home: test liberi', /Test liberi/.test(await page.textContent('#paz-banda')))
  check('⭐ le sessioni libere con nome, età e peso', /Anna Verdi · 42 anni · 61,5 kg/.test(await page.textContent('#sessioni')), await page.textContent('#sessioni'))
  check('«indietro» torna all’app', (await page.getAttribute('#link-indietro', 'href')) === 'dashboard.html')
  await page.click('#t-oscillazione'); await page.waitForTimeout(300)
  check('⭐ Oscillazione dalla home: test libero', page.url().endsWith('prova-oscillazione.html'), page.url())
  await ctx.close()
  ;({ page, ctx, errori } = await apri(browser, 'test.html', { sessione: true, senza047: true }))
  check('⭐ senza 047 lo dice, senza rompersi', /migration 047/.test(await page.textContent('#sessioni')) && errori.length === 0)
  await ctx.close()
}

sez('⭐ monopodalico-v1 · l’appoggio (053) si legge, e senza 053 non si rompe niente')
{
  let r = await apri(browser, ST, { sessione: true }, '?pid=' + P1)
  const l = await r.page.evaluate(() => window.__db.letture)
  check('⭐ legge anche l’appoggio (un piede è un’altra condizione)', /appoggio/.test(l[0].sel), l[0] && l[0].sel)
  const n1 = await r.page.evaluate(() => window.__storico.sessioni().length)
  await r.ctx.close()
  r = await apri(browser, ST, { sessione: true, senza053: true }, '?pid=' + P1)
  const l2 = await r.page.evaluate(() => window.__db.letture)
  check('⭐ senza 053 rilegge senza l’appoggio', l2.length >= 2 && !/appoggio/.test(l2[l2.length - 1].sel), l2.map(x => x.sel.slice(-30)))
  check('⭐ e mostra le stesse sessioni di prima', (await r.page.evaluate(() => window.__storico.sessioni().length)) === n1)
  check('nessun errore JS', r.errori.length === 0, r.errori)
  await r.ctx.close()
}

sez('⭐ il test si apre dall’applicazione')
{
  const dash = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8')
  check('⭐ nella home: «Test» → la pagina dei test', /window\.location\.href='test\.html'[^]{0,900}>Test</.test(dash))
  check('   e «Confronto test» → il confronto', /oscillazione-storico\.html[^]{0,900}Confronto test/.test(dash))
  const paz = fs.readFileSync(path.join(ROOT, 'paziente.html'), 'utf8')
  check('⭐ nella scheda paziente il pulsante in alto è «Test»', /test\.html\?pid=' \+ patientId"><span class="pol-act-ico">🎯<\/span><span class="pol-act-lbl">Test</.test(paz))
  check('⭐ e c’è la card gialla «Test» accanto alla Cartella', /test\.html\?pid='\+patientId">\s*<span class="hub-card-icon">🎯<\/span>\s*<span class="hub-card-title">Test/.test(paz))
  check('   e nelle azioni rapide', /polChiudiHub\(\);window\.location\.href='test\.html\?pid='\+patientId/.test(paz))
  check('l’Autotest si raggiunge ancora (la funzione c’è)', /function vaiAutotestPro/.test(paz))
  check('le visite di prima ci sono ancora', /visita\.html\?pid='\+patientId/.test(paz) && /valutazione-posturale\.html\?pid='\+patientId/.test(paz))
}

sez('⭐ prove-confronto-v1 · PROVA contro PROVA dentro una sessione')
{
  const SQ = 'dddddddd-0000-0000-0000-000000000001'
  const G = [
    riga('q1', P1, SQ, '2026-10-03T08:18:05Z', 5.0), riga('q2', P1, SQ, '2026-10-03T08:19:10Z', 5.2),
    riga('q3', P1, SQ, '2026-10-03T08:20:15Z', 4.8), riga('q4', P1, SQ, '2026-10-03T08:31:00Z', 2.0, { nota: 'dopo <b>tecnica</b>' }),
    riga('q5', P1, SQ, '2026-10-03T08:32:00Z', 2.1), riga('q6', P1, SQ, '2026-10-03T08:33:00Z', 1.9),
    riga('q7', P1, SQ, '2026-10-03T08:34:00Z', 5.1), riga('q8', P1, SQ, '2026-10-03T08:35:00Z', 6.0, { evento: 'rollio' })
  ]
  const finto = { sessione: true, dati: G, sess: [{ id: SQ, patient_id: P1, quando: '2026-10-03T08:17:00Z', nome: null, eta: null, peso_kg: null }] }
  const { page, ctx, errori } = await apri(browser, ST, finto, '?pid=' + P1)
  const segna = async (n, l) => { await page.click('#pv-lista .pv-riga:nth-child(' + n + ') .pv-b.' + l); await page.waitForTimeout(250) }
  const esito = () => page.evaluate(() => document.getElementById('pv-esito').innerText)
  check('⭐ con UNA sessione sola il riquadro c’è lo stesso', await page.isVisible('#c-prove'))
  check('⭐ elenca le 8 prove, in ordine di orario, con ore:minuti:secondi', await page.evaluate(() => {
    const r = [...document.querySelectorAll('#pv-lista .pv-riga b')].map(b => b.textContent)
    return r.length === 8 && r.every(t => /^\d\d:\d\d:\d\d$/.test(t)) && r.slice().sort().join() === r.join() }))
  check('⭐ ogni prova ha la velocità e la barra', await page.evaluate(() =>
    document.querySelectorAll('#pv-lista .pv-barra i').length === 8 && /5,0 °\/s/.test(document.querySelector('#pv-lista .pv-vel').textContent)))
  check('⭐ la nota scritta nella prova si legge e non diventa HTML', await page.evaluate(() =>
    /dopo <b>tecnica<\/b>/.test(document.getElementById('pv-lista').innerText) && !document.querySelector('#pv-lista .cnd b')))
  check('senza segni: dice cosa fare', /Segna almeno una prova/.test(await esito()))
  const tr0 = await page.evaluate(() => window.__db.tracce.length)

  await segna(1, 'pre'); await segna(4, 'post')
  let t = await esito()
  check('⭐⭐ una contro una, 5,0 → 2,0: «si è mossa MENO», verde', /si è mossa MENO/.test(t) && await page.isVisible('#pv-esito .pv-esito.meglio'), t)
  check('⭐ dice la percentuale e la variabilità', /−60%/.test(t) && /oltre la variabilità della misura \(±\d+%\)/.test(t), t)
  check('⭐ dice gli orari di PRIMA e DOPO', await page.evaluate(() => { const b = document.querySelectorAll('#pv-esito .nota b'); return /^\d\d:\d\d:\d\d$/.test(b[0].textContent) && /^\d\d:\d\d:\d\d$/.test(b[1].textContent) }))
  check('⭐ avvisa che con meno di tre prove la soglia è larga', /meno di tre prove per parte/.test(t))
  check('⭐ due barre PRIMA/DOPO con i valori', await page.evaluate(() => { const e = [...document.querySelectorAll('#pv-esito .pv-l em')].map(x => x.textContent); return e.length === 2 && /5,0/.test(e[0]) && /2,0/.test(e[1]) }))
  check('⭐ i due gomitoli sono disegnati', (await inchiostro(page, '#pv-pre-0')) > 300 && (await inchiostro(page, '#pv-post-0')) > 300)
  check('⭐ non richiede tracce in più del necessario (al massimo le due segnate)', (await page.evaluate(() => window.__db.tracce.length)) - tr0 <= 2)
  check('⭐ «tutti i numeri» c’è, con le quattro domande', await page.evaluate(() => document.getElementById('pv-dett').style.display !== 'none' && /È più stabile\?/.test(document.getElementById('pv-html').textContent)))
  check('le righe segnate sono colorate', await page.evaluate(() => document.querySelector('#pv-lista .pv-riga:nth-child(1)').classList.contains('pre') && document.querySelector('#pv-lista .pv-riga:nth-child(4)').classList.contains('post')))

  await segna(2, 'pre'); await segna(3, 'pre'); await segna(5, 'post'); await segna(6, 'post')
  t = await esito()
  check('⭐⭐ tre contro tre: ancora MENO, e non parla più di soglia larga', /si è mossa MENO/.test(t) && /3 prove prima · 3 prove dopo/.test(t) && !/meno di tre prove/.test(t), t)

  await segna(4, 'pre')
  check('⭐ una prova segnata DOPO e poi PRIMA cambia parte (mai tutt’e due)', await page.evaluate(() => { const r = document.querySelector('#pv-lista .pv-riga:nth-child(4)'); return r.classList.contains('pre') && !r.querySelector('.pv-b.post').classList.contains('on') }))
  await page.click('#pv-azzera'); await page.waitForTimeout(200)
  check('⭐ «togli tutti i segni» azzera', await page.evaluate(() => !document.querySelector('#pv-lista .pv-b.on')) && /Segna almeno/.test(await esito()))

  await segna(4, 'pre'); await segna(7, 'post')
  t = await esito()
  check('⭐⭐ 2,0 → 5,1: «si è mossa DI PIÙ», rosso', /si è mossa DI PIÙ/.test(t) && await page.isVisible('#pv-esito .pv-esito.peggio'), t)
  await page.click('#pv-azzera'); await segna(1, 'pre'); await segna(2, 'post')
  t = await esito()
  check('⭐⭐ 5,0 → 5,2: «non si distingue», grigio (dentro la variabilità)', /Non si distingue/.test(t) && /dentro la variabilità/.test(t) && await page.isVisible('#pv-esito .pv-esito.uguale'), t)
  await page.click('#pv-azzera'); await segna(4, 'pre'); await segna(1, 'post')
  check('⭐ PRIMA fatta dopo la DOPO: lo avvisa', /è stata fatta dopo una segnata DOPO/.test(await esito()))
  await page.click('#pv-azzera'); await segna(1, 'pre'); await segna(8, 'post')
  t = await esito()
  check('⭐⭐ beccheggio contro rollio: NON confronta, e dice perché', /non hanno la stessa condizione/.test(t) && !(await page.$('#pv-esito .pv-esito')), t)
  check('⭐ il confronto fra sessioni di prima non è stato toccato', await page.isVisible('#c-una') || await page.isVisible('#c-confronto'))
  check('⛔ la pagina non ha scritto niente nel database', (await page.evaluate(() => window.__db.scritto)) === false)
  check('nessun errore JS', errori.length === 0, errori)

  await page.evaluate(() => { window.PolOscillazione.confrontoSessioni = () => { throw new Error('rotto apposta') } })
  await page.click('#pv-azzera'); await segna(1, 'pre'); await segna(4, 'post')
  check('⭐⭐ se il calcolo salta, il riquadro SPARISCE e la pagina resta in piedi', !(await page.isVisible('#c-prove')) && await page.isVisible('#c-scelta') && errori.length === 0, errori)
  await ctx.close()

  const r2 = await apri(browser, ST, { sessione: true }, '?pid=' + P1)
  check('⭐ con più sessioni: si sceglie la sessione, di partenza l’ultima', await r2.page.evaluate(() => document.querySelectorAll('#pv-sess option').length === 3 && document.querySelectorAll('#pv-lista .pv-riga').length === 4))
  await r2.page.selectOption('#pv-sess', { index: 2 }); await r2.page.waitForTimeout(200)
  check('⭐ cambiando sessione cambia l’elenco delle prove', await r2.page.evaluate(() => /0?9:00|11:00|10:00|\d\d:00:00/.test(document.querySelector('#pv-lista .pv-riga b').textContent) && document.querySelectorAll('#pv-lista .pv-riga').length === 4))
  check('⭐ il confronto sessione contro sessione c’è ancora, coi suoi gomitoli', await r2.page.isVisible('#c-confronto') && (await inchiostro(r2.page, '#g-pre-0')) > 300)
  check('nessun errore JS', r2.errori.length === 0, r2.errori)
  await r2.ctx.close()

  const r3 = await apri(browser, ST, { sessione: true, dati: [riga('z1', P1, SQ, '2026-10-03T08:18:05Z', 5.0)], sess: finto.sess }, '?pid=' + P1)
  check('⭐ con una prova sola in tutto il riquadro non compare', !(await r3.page.isVisible('#c-prove')) && r3.errori.length === 0)
  await r3.ctx.close()
}

sez('⭐ momento-nota-v1 · le prove segnate nel test arrivano già PRIMA / DOPO')
{
  const SQ = 'eeeeeeee-0000-0000-0000-000000000001'
  const G = [
    riga('m1', P1, SQ, '2026-10-04T07:00:00Z', 5.0, { momento: 'pre', momento_nota: 'neutro, mai provato <i>cuscini</i>' }),
    riga('m2', P1, SQ, '2026-10-04T07:01:00Z', 5.2, { momento: 'pre', momento_nota: 'neutro, mai provato <i>cuscini</i>' }),
    riga('m3', P1, SQ, '2026-10-04T07:10:00Z', 3.0, { momento: 'post', momento_nota: 'schema 1' }),
    riga('m4', P1, SQ, '2026-10-04T07:20:00Z', 2.0, { momento: 'post', momento_nota: 'schema 2' }),
    riga('m5', P1, SQ, '2026-10-04T07:21:00Z', 2.1, { momento: 'post', momento_nota: 'schema 2' }),
    riga('m6', P1, SQ, '2026-10-04T07:30:00Z', 4.0)
  ]
  const finto = { sessione: true, dati: G, sess: [{ id: SQ, patient_id: P1, quando: '2026-10-04T06:59:00Z', nome: null, eta: null, peso_kg: null }] }
  const { page, ctx, errori } = await apri(browser, ST, finto, '?pid=' + P1)
  const esito = () => page.evaluate(() => document.getElementById('pv-esito').innerText)
  check('⭐ chiede al database anche momento e descrizione', await page.evaluate(() => /momento,momento_nota/.test(window.__db.letture[0].sel)))
  let t = await esito()
  check('⭐⭐ senza toccare niente il confronto c’è già: PRIMA contro l’ULTIMO «dopo» (schema 2)', /si è mossa MENO/.test(t) && /2 prove prima · 2 prove dopo/.test(t), t)
  check('⭐ e dice che cosa: le due descrizioni, senza diventare HTML', /«neutro, mai provato <i>cuscini<\/i>»/.test(t) && /«schema 2»/.test(t) && !/schema 1/.test(t) && !(await page.$('#pv-esito .nota i')), t)
  check('⭐ ogni prova porta la sua etichetta PRIMA / DOPO con la descrizione', await page.evaluate(() => {
    const e = [...document.querySelectorAll('#pv-lista .pv-info .etich')].map(x => x.textContent)
    return e.length === 5 && /^PRIMA · neutro/.test(e[0]) && e[2] === 'DOPO · schema 1' && e[3] === 'DOPO · schema 2' }))
  check('⭐ la prova non segnata resta senza etichetta e senza segno', await page.evaluate(() => { const r = document.querySelector('#pv-lista .pv-riga:nth-child(6)'); return !r.querySelector('.etich') && !r.classList.contains('pre') && !r.classList.contains('post') }))
  check('⭐ con due «dopo» diversi si sceglie con quale confrontare', await page.evaluate(() => { const g = [...document.querySelectorAll('#pv-auto .pv-g')]; return g.length === 2 && g[0].textContent === 'DOPO · schema 1' && g[1].classList.contains('on') }))
  await page.click('#pv-auto .pv-g:nth-child(1)'); await page.waitForTimeout(300)
  t = await esito()
  check('⭐⭐ scegliendo «schema 1» confronta il PRIMA con quello', /«schema 1»/.test(t) && !/schema 2/.test(t) && /2 prove prima · 1 prova dopo/.test(t), t)
  await page.click('#pv-lista .pv-riga:nth-child(6) .pv-b.post'); await page.waitForTimeout(300)
  check('⭐ a mano si può sempre aggiungere o correggere', /2 prove prima · 2 prove dopo/.test(await esito()))
  check('⭐ il confronto fra sessioni NON vede il momento (condizioni come prima)', await page.evaluate(() => window.__storico.sessioni()[0].prove.every(p => !('momento' in p))))
  check('⛔ la pagina non ha scritto niente', (await page.evaluate(() => window.__db.scritto)) === false)
  check('nessun errore JS', errori.length === 0, errori)
  await ctx.close()
}

} finally {
  await browser.close()
  server.close()
}
console.log('\n' + '='.repeat(66))
console.log(ko === 0 ? `TUTTO VERDE — ${ok} controlli passati.` : `ROSSO — ${ok} passati, ${ko} falliti:\n  - ` + fallite.join('\n  - '))
process.exit(ko === 0 ? 0 : 1)
