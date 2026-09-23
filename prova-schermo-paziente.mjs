/* prova-schermo-paziente.mjs — schermo-paziente-v1
 *
 * Lo schermo del paziente, provato davvero: server locale, finto Supabase con
 * query builder a catena, CDN intercettate, click e tasti veri in Chromium,
 * alla risoluzione di una TV (1920×1080) e di un telefono.
 *
 *   node prova-schermo-paziente.mjs            (le immagini finiscono in _schermate/)
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'
import vm from 'vm'

const ROOT = process.cwd()
const PORT = 8491
const OUT = path.join(ROOT, '_schermate')
fs.mkdirSync(OUT, { recursive: true })

// ── foto finte, con dimensioni vere: una sagoma e il filo a piombo rosso ──
function figura(w, h, piega, testo, fronte) {
  const fx = w / 2
  const corpo = fronte
    ? `<ellipse cx="${fx}" cy="130" rx="46" ry="56" fill="#c9a88a"/>
       <rect x="${fx - 90 + piega}" y="200" width="180" height="300" rx="60" fill="#3b6ea8" transform="rotate(${piega / 4} ${fx} 350)"/>
       <rect x="${fx - 70}" y="490" width="55" height="330" rx="24" fill="#2d2d38"/><rect x="${fx + 15}" y="490" width="55" height="330" rx="24" fill="#2d2d38"/>`
    : `<ellipse cx="${fx + piega * 1.4}" cy="130" rx="44" ry="54" fill="#c9a88a"/>
       <path d="M${fx + piega} 200 Q${fx + piega * 1.8 + 50} 330 ${fx + 10} 500 L${fx - 40} 500 Q${fx - 50} 330 ${fx + piega - 40} 200 Z" fill="#3b6ea8"/>
       <rect x="${fx - 38}" y="490" width="60" height="330" rx="24" fill="#2d2d38"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="#d8d3cb"/>
    <rect x="0" y="${h - 60}" width="${w}" height="60" fill="#8a7d6b"/>
    ${corpo}
    <line x1="${fx}" y1="0" x2="${fx}" y2="${h}" stroke="#e02020" stroke-width="3"/>
    <text x="14" y="34" font-size="26" font-family="sans-serif" fill="#333">${testo}</text>
  </svg>`
}
const FOTO = {
  '/foto/sag-pre.svg':  figura(600, 900, 26, 'sagittale PRE'),
  '/foto/sag-post.svg': figura(600, 900, 6, 'sagittale POST'),
  '/foto/fro-pre.svg':  figura(600, 900, 18, 'frontale PRE', true),
  '/foto/fro-post.svg': figura(600, 900, 4, 'frontale POST', true),
  '/foto/old-pre.svg':  figura(600, 900, 30, '10/09 PRE'),
  '/foto/old-post.svg': figura(600, 900, 20, '10/09 POST'),
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  if (FOTO[u]) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(FOTO[u]); return }
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
const senzaCommenti = t => String(t).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── i dati finti ───────────────────────────────────────────────────────
const PID = 'aaaa1111-2222-3333-4444-555566667777'
// una traccia a 10 Hz: un giro irregolare di raggio r (gradi)
function traccia(r, seme) {
  let s = seme
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5 }
  const t = [], b = [], g = []
  let x = 0, y = 0
  for (let i = 0; i < 300; i++) {
    x = 0.93 * x + r * 0.35 * rnd(); y = 0.93 * y + r * 0.5 * rnd()
    t.push(i * 100); b.push(Math.round(y * 100) / 100); g.push(Math.round(x * 100) / 100)
  }
  return { t, b, g, gb: 0, gg: 0 }
}
let nProva = 0
function prova(quando, evento, velocita, momento, r) {
  nProva++
  const riga = {
    id: 'prova-' + nProva, professional_id: 'PROF-1', patient_id: PID, quando, evento, occhi: 'aperti', piedi: 'scalzo',
    configurazione: null, velocita, osc_ap: r * 0.6, osc_ds: r * 0.4, raggio: r, ellisse: r * r, carico_avanti: 0.4, carico_destra: -0.2,
    tarato: true, verso_beta: 1, verso_gamma: 1, zero_beta: 0, zero_gamma: 0, traccia: traccia(r, nProva * 7919), traccia_hz: 10
  }
  if (momento !== undefined) riga.momento = momento
  return riga
}
function dati(opts = {}) {
  const senza048 = !!opts.senza048
  const m = x => senza048 ? undefined : x
  const prove = [
    // 20/09: beccheggio 3 prima (~3,0) e 3 dopo (~2,2) → −27%, oltre la banda del 20%
    prova('2026-09-20T09:00:00Z', 'beccheggio', 3.0, m('pre'), 1.2), prova('2026-09-20T09:01:00Z', 'beccheggio', 3.1, m('pre'), 1.3),
    prova('2026-09-20T09:02:00Z', 'beccheggio', 2.9, m('pre'), 1.1),
    prova('2026-09-20T09:06:00Z', 'beccheggio', 2.2, m('post'), 0.7), prova('2026-09-20T09:07:00Z', 'beccheggio', 2.1, m('post'), 0.65),
    prova('2026-09-20T09:08:00Z', 'beccheggio', 2.3, m('post'), 0.75),
    // rollio: 1 prima, 1 dopo, −10% → dentro la banda del 35%: INVARIATO
    prova('2026-09-20T09:03:00Z', 'rollio', 4.0, m('pre'), 1.4), prova('2026-09-20T09:09:00Z', 'rollio', 3.6, m('post'), 1.3),
    // una prova non segnata
    prova('2026-09-20T09:12:00Z', 'beccheggio', 2.5, m(null), 0.9),
    // 10/09: per il percorso
    prova('2026-09-10T15:00:00Z', 'beccheggio', 3.6, m('pre'), 1.5), prova('2026-09-10T15:05:00Z', 'beccheggio', 3.2, m('post'), 1.3),
  ]
  return {
    opts,
    patients: [{ id: PID, nome: 'Mario', cognome: 'Rossi', foto_url: opts.scheda ? JSON.stringify({
      // valutazioni-coerenti-v1 · la valutazione iniziale: prima/dopo cuscini sul sagittale, frontale da sola
      'prima-sx': { storage_path: PID + '/iniziali/prima-sx_1788000000000.jpg' },
      'dopo-sx':  PID + '/iniziali/dopo-sx_1788000000000.jpg',
      'frontale': PID + '/iniziali/frontale_1788000000000.jpg'
    }) : '{}' }],
    visits: [
      { id: 'v-post', patient_id: PID, tipo: 'posturale', data_visita: '2026-09-20', created_at: '2026-09-20T08:50:00Z',
        note_scapolare_pre: 'anteriore', note_scapolare_post: 'in_asse' },
      { id: 'v-fisio', patient_id: PID, tipo: 'fisioterapica', data_visita: '2026-09-10', created_at: '2026-09-10T14:50:00Z',
        note_scapolare_pre: 'posteriore', note_scapolare_post: 'posteriore' }
    ],
    visit_photos: [
      { visit_id: 'v-post', tipo: 'sagittale_dx_pre', storage_path: 'visits/v-post/sag-pre.jpg' },
      { visit_id: 'v-post', tipo: 'sagittale_dx_post', storage_path: 'visits/v-post/sag-post.jpg' },
      { visit_id: 'v-post', tipo: 'frontale_pre', storage_path: 'visits/v-post/fro-pre.jpg' },
      { visit_id: 'v-post', tipo: 'frontale_post', storage_path: 'visits/v-post/fro-post.jpg' },
      // un PRE senza il suo POST: non deve diventare una slide
      { visit_id: 'v-post', tipo: 'posteriore_pre', storage_path: 'visits/v-post/fro-pre.jpg' },
      { visit_id: 'v-fisio', tipo: 'sagittale_sx_pre', storage_path: 'visits/v-fisio/old-pre.jpg' },
      { visit_id: 'v-fisio', tipo: 'sagittale_sx_post', storage_path: 'visits/v-fisio/old-post.jpg' },
    ],
    oscillazione_test: prove,
    foto_allineamenti: opts.allineate ? [
      { storage_path: 'visits/v-post/sag-pre.jpg', punti: { a: { x: 0.5, y: 0.1 }, b: { x: 0.5, y: 0.9 } } },
      { storage_path: 'visits/v-post/sag-post.jpg', punti: { a: { x: 0.52, y: 0.12 }, b: { x: 0.52, y: 0.92 } } },
    ] : [],
    aggiornate: []
  }
}
const FIRME = {
  'visits/v-post/sag-pre.jpg': '/foto/sag-pre.svg', 'visits/v-post/sag-post.jpg': '/foto/sag-post.svg',
  'visits/v-post/fro-pre.jpg': '/foto/fro-pre.svg', 'visits/v-post/fro-post.jpg': '/foto/fro-post.svg',
  'visits/v-fisio/old-pre.jpg': '/foto/old-pre.svg', 'visits/v-fisio/old-post.jpg': '/foto/old-post.svg',
  [PID + '/iniziali/prima-sx_1788000000000.jpg']: '/foto/old-pre.svg', [PID + '/iniziali/dopo-sx_1788000000000.jpg']: '/foto/old-post.svg',
  [PID + '/iniziali/frontale_1788000000000.jpg']: '/foto/fro-pre.svg'
}

// il finto Supabase: select/eq/in/order/maybeSingle/then, update, storage
const SUPA = ({ D, FIRME }) => {
  window.__D = D
  const q = (tab) => {
    const st = { tab, f: [], upd: null }
    const righe = () => (D[tab] || []).filter(r => st.f.every(([k, v, op]) => op === 'in' ? v.indexOf(r[k]) >= 0 : r[k] === v))
    const api = {
      select() { return api }, order() { return api }, limit() { return api },
      eq(k, v) { st.f.push([k, v]); return api },
      in(k, v) { st.f.push([k, v, 'in']); return api },
      update(d) { st.upd = d; return api },
      async maybeSingle() {
        if (tab === 'professionals') return { data: { id: 'PROF-1', piano: D.opts.free ? 'free' : 'premium', premium_scadenza: null }, error: null }
        return { data: righe()[0] || null, error: null }
      },
      then(res, rej) {
        let out
        if (st.upd) {
          if (D.opts.senza048 && 'momento' in st.upd) out = { data: null, error: { code: 'PGRST204', message: "Could not find the 'momento' column of 'oscillazione_test' in the schema cache" } }
          else { righe().forEach(r => Object.assign(r, st.upd)); D.aggiornate.push({ tab, d: st.upd, f: st.f }); out = { data: null, error: null } }
        } else if (tab === 'oscillazione_test' && D.opts.senza046) {
          out = { data: null, error: { code: '42P01', message: 'relation "public.oscillazione_test" does not exist' } }
        } else out = { data: righe(), error: null }
        return Promise.resolve(out).then(res, rej)
      }
    }
    return api
  }
  window.supabase = { createClient() { return {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'U1', email: 'prova@studio.it' }, access_token: 'TOK' } } }) },
    from: q,
    storage: { from() { return { createSignedUrls: async (paths) => ({ data: paths.map(p => ({ path: p, signedUrl: FIRME[p] || null })), error: null }) } } }
  } } }
}

async function apri(browser, opts = {}, query = '', viewport = { width: 1920, height: 1080 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errori = []
  page.on('pageerror', e => errori.push(String(e)))
  await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  const D = dati(opts)
  await page.addInitScript(SUPA, { D, FIRME })
  await page.goto('http://localhost:' + PORT + '/schermo-paziente.html?id=' + PID + query, { waitUntil: 'load' })
  await page.waitForTimeout(500)
  return { page, ctx, errori }
}
const slideIds = page => page.evaluate(() => slides.slice())
const testoSlide = page => page.evaluate(() => document.querySelector('#slides .slide.on').innerText)
async function vaiA(page, id) { await page.evaluate(id => vai(slides.indexOf(id)), id); await page.waitForTimeout(550) }

server.listen(PORT)
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] })

try {

sez('Il motore è puro: niente rete, niente database')
{
  const src = senzaCommenti(fs.readFileSync(path.join(ROOT, 'js/schermo-paziente.js'), 'utf8'))
  check('⛔ nessun supabase / fetch / storage nel motore', !/supabase|fetch\(|localStorage|XMLHttpRequest/.test(src))
  const ctx = { console, Intl }
  ctx.globalThis = ctx
  vm.createContext(ctx)
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/oscillazione.js'), 'utf8'), ctx)
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/schermo-paziente.js'), 'utf8'), ctx)
  const S = ctx.PolSchermo
  check('si carica anche senza pagina', !!S && !!S.TESTI)
  const e = (a, b) => S.esitoScapola(a, b).esito
  check('⭐ spalla in avanti → in asse = più vicino al riferimento', e('anteriore', 'in_asse') === 'meglio')
  check('⭐ indietro → in asse = più vicino al riferimento', e('posteriore', 'in_asse') === 'meglio')
  check('uguale → invariato', e('anteriore', 'anteriore') === 'uguale' && e('in_asse', 'in_asse') === 'uguale')
  check('⭐ in asse → in avanti = da lavorare (lo si dice)', e('in_asse', 'anteriore') === 'lavoro')
  check('⭐ da avanti a indietro NON è «meglio»: è «cambiato»', e('anteriore', 'posteriore') === 'altro')
  check('⛔ un valore mancante non produce un verdetto', e(null, 'in_asse') === 'nd' && e('boh', 'in_asse') === 'nd')
  check('⭐ il giorno è quello italiano: 23:30 UTC del 19 è il 20', S.giornoDi('2026-09-19T23:30:00Z') === '2026-09-20', S.giornoDi('2026-09-19T23:30:00Z'))
  check('una data_visita resta com’è', S.giornoDi('2026-09-20') === '2026-09-20')
  // la matematica dell'allineamento: i punti di B finiscono su quelli di A
  const bA = { x: 10, y: 20, w: 300, h: 450 }, bB = { x: 40, y: 0, w: 260, h: 390 }
  const pa = { a: { x: 0.5, y: 0.1 }, b: { x: 0.45, y: 0.9 } }, pb = { a: { x: 0.52, y: 0.15 }, b: { x: 0.5, y: 0.95 } }
  const m = S.matriceAllineamento(bA, bB, pa, pb)
  const ap = (p, r) => ({ x: r.x + p.x * r.w, y: r.y + p.y * r.h })
  const tr = q => ({ x: m[0] * q.x + m[2] * q.y + m[4], y: m[1] * q.x + m[3] * q.y + m[5] })
  const d1 = Math.hypot(tr(ap(pb.a, bB)).x - ap(pa.a, bA).x, tr(ap(pb.a, bB)).y - ap(pa.a, bA).y)
  const d2 = Math.hypot(tr(ap(pb.b, bB)).x - ap(pa.b, bA).x, tr(ap(pb.b, bB)).y - ap(pa.b, bA).y)
  check('⭐ allineamento: i due riferimenti di B finiscono su quelli di A entro 1 px', d1 < 1 && d2 < 1, { d1, d2 })
  const T = Object.values(S.TESTI).join(' ')
  check('⛔ nelle parole per il paziente non c’è «grazie a» (dopo, non grazie)', !/grazie/i.test(T))
  check('⛔ né fasce inventate (blando/moderato/severo)', !/blando|moderato|severo/i.test(T))
  check('⭐ «42 secondi» e «3 Respiri» ci sono', /42 secondi/.test(T) && /3 Respiri/.test(T))
}

sez('⭐ Il giorno di oggi: le slide giuste, nell’ordine giusto')
{
  const { page, ctx, errori } = await apri(browser)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const ids = await slideIds(page)
  check('⭐⭐ copertina, foto profilo, foto fronte, spalla, equilibrio, sintesi, percorso',
    ids.join() === 'copertina,foto:sagittale_dx,foto:frontale,spalla,eq:0,sintesi,percorso', ids)
  check('⛔ un PRE senza il suo POST non diventa una slide', !ids.includes('foto:posteriore'))
  const giorni = await page.$$eval('#giorni .giorno', b => b.map(x => x.innerText.replace(/\s+/g, ' ')))
  check('⭐ i giorni da consultare sono due, e si parte dall’ultimo', giorni.length === 2 && /20\/09/.test(await page.textContent('#giorni .giorno.on')), giorni)
  const cop = await testoSlide(page)
  check('⭐ la copertina dice il nome, «il tuo prima e dopo» e i 42 secondi', /Mario/.test(cop) && /prima e dopo/i.test(cop) && /42 secondi/.test(cop), cop)
  const palco = await page.evaluate(() => document.getElementById('palco').innerText)
  check('⛔ sul palco (che va in TV) c’è solo il nome, non il cognome', !/Rossi/.test(palco))
  check('⭐ la barra del professionista invece ha nome e cognome', /Mario Rossi/.test(await page.textContent('#pro-nome')))
  await page.screenshot({ path: path.join(OUT, '1-copertina.png') })
  await ctx.close()
}

sez('⭐ Le foto: prima e dopo affiancate, poi sovrapposte col cursore')
{
  const { page, ctx, errori } = await apri(browser, { allineate: true })
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(550)
  check('⭐ la freccia della tastiera va avanti', (await page.evaluate(() => corrente)) === 1)
  const t = await testoSlide(page)
  check('⭐ titolo in parole semplici e criterio di normalità', /di profilo/.test(t) && /filo a piombo/.test(t), t)
  check('⭐ «Prima» e «Dopo i 3 Respiri» sopra le foto', /PRIMA/.test(t) && /DOPO I 3 RESPIRI/.test(t))
  const imgs = await page.$$eval('.slide.on .riquadro img', a => a.map(i => ({ w: i.naturalWidth, src: i.getAttribute('src') })))
  check('⭐ le due foto si aprono', imgs.length === 2 && imgs.every(i => i.w > 0), imgs)
  check('prima a sinistra, dopo a destra', /sag-pre/.test(imgs[0].src) && /sag-post/.test(imgs[1].src), imgs)
  const box = await page.$$eval('.slide.on .riquadro', a => a.map(r => { const b = r.getBoundingClientRect(); return { w: b.width, h: b.height } }))
  check('⭐ su una TV le foto sono grandi: alte almeno 600 pixel', box.every(b => b.h >= 600), box)
  check('e della stessa grandezza (stessa scala)', Math.abs(box[0].w - box[1].w) < 1 && Math.abs(box[0].h - box[1].h) < 1, box)
  await page.screenshot({ path: path.join(OUT, '2-foto-affiancate.png') })
  await page.click('.slide.on .modo button:nth-child(2)'); await page.waitForTimeout(600)
  check('⭐ «Sovrapposte»: una foto sopra l’altra, con il cursore', await page.isVisible('.slide.on .cursore input'))
  check('si resta sulla stessa slide', (await page.evaluate(() => corrente)) === 1)
  await page.$eval('.slide.on .cursore input', i => { i.value = 30; i.dispatchEvent(new Event('input')) })
  const op = await page.$eval('.slide.on .ib', i => i.style.opacity)
  check('⭐ il cursore porta dal prima al dopo', op === '0.3', op)
  const tr = await page.$eval('.slide.on .ib', i => i.style.transform)
  check('⭐ con l’allineamento fatto, la foto DOPO si porta sulla PRIMA', /^matrix\(/.test(tr), tr)
  check('e lo dice', /allineate sui riferimenti/.test(await testoSlide(page)))
  await page.$eval('.slide.on .cursore input', i => { i.value = 50; i.dispatchEvent(new Event('input')) })
  await page.screenshot({ path: path.join(OUT, '3-foto-sovrapposte.png') })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  await ctx.close()
}

sez('⭐ Senza allineamento: si guardano, non si misurano')
{
  const { page, ctx } = await apri(browser)
  await vaiA(page, 'foto:sagittale_dx')
  await page.click('.slide.on .modo button:nth-child(2)'); await page.waitForTimeout(500)
  check('⭐ lo dice sotto le foto', /non allineate/.test(await testoSlide(page)))
  check('e la foto DOPO non viene spostata', (await page.$eval('.slide.on .ib', i => i.style.transform)) === '')
  await ctx.close()
}

sez('⭐ La spalla: la tua osservazione, disegnata sulla linea')
{
  const { page, ctx, errori } = await apri(browser)
  await vaiA(page, 'spalla')
  const t = await testoSlide(page)
  check('⭐ prima «In avanti», dopo «In asse»', /In avanti/.test(t) && /In asse/.test(t), t)
  check('⭐ esito: più vicino al riferimento', /Più vicino al riferimento/.test(t))
  check('⭐ il criterio è scritto', /in asse con il filo a piombo/.test(t))
  check('⭐ e si dice che è un’osservazione del fisioterapista, non una misura', /Osservazione del fisioterapista/.test(t))
  const pos = await page.$$eval('.slide.on .figura svg', s => s.map(x => { const c = x.querySelectorAll('circle'); return Number(c[c.length - 1].getAttribute('cx')) }))
  check('⭐ il punto della spalla prima è davanti alla linea, dopo è SULLA linea', pos[0] > 180 && pos[1] === 180, pos)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  await page.screenshot({ path: path.join(OUT, '4-spalla.png') })
  await ctx.close()
}

sez('⭐⭐ L’equilibrio: prima contro dopo, con le soglie della Fase 0')
{
  const { page, ctx, errori } = await apri(browser)
  await vaiA(page, 'eq:0')
  const t = await testoSlide(page)
  const carte = await page.$$eval('.slide.on .eq-card', c => c.map(x => x.innerText.replace(/\s+/g, ' ')))
  check('⭐ due condizioni: beccheggio e rollio, ognuna per conto suo', carte.length === 2, carte)
  const bec = carte.find(c => /beccheggio/i.test(c)) || '', rol = carte.find(c => /rollio/i.test(c)) || ''
  check('⭐⭐ beccheggio: 3,0 → 2,2 °/s, −27%, «Più stabile»', /3,0/.test(bec) && /2,2/.test(bec) && /−27%/.test(bec) && /Più stabile/.test(bec), bec)
  check('⭐⭐ rollio: −10% è dentro la banda del 35% → «Invariato», non «migliorato»', /−10%/.test(rol) && /Invariato/.test(rol) && !/Più stabile/.test(rol), rol)
  check('⭐ ogni carta dice la sua banda', /oltre 20%/.test(bec) && /oltre 35%/.test(rol), [bec, rol])
  check('⭐ il criterio: il riferimento sei tu', /il riferimento sei tu/.test(t))
  check('⛔ la prova non segnata NON entra nel confronto (3 prove prima, 3 dopo)',
    await page.evaluate(() => { const c = giorni[sel].eq.condizioni.find(x => /beccheggio/.test(x.chiave)); return c.nA === 3 && c.nB === 3 }))
  const pix = await page.$eval('.slide.on canvas', cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
    let gial = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && d[i + 1] > 190 && d[i + 2] < 60) gial++; return gial })
  check('⭐ il gomitolo è disegnato davvero (pixel gialli)', pix > 500, pix)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  await page.screenshot({ path: path.join(OUT, '5-equilibrio.png') })
  await ctx.close()
}

sez('⭐ La sintesi conta SOLO quello che ha un verdetto onesto')
{
  const { page, ctx } = await apri(browser)
  await vaiA(page, 'sintesi')
  const t = await testoSlide(page)
  check('⭐⭐ «2 su 3 sono più vicini al riferimento» (spalla + beccheggio; rollio invariato)', /2 su 3/.test(t), t)
  const voci = await page.$$eval('.slide.on .voce', v => v.length)
  check('tre voci: spalla, beccheggio, rollio', voci === 3, voci)
  check('⭐ le foto non hanno verdetto: si dice perché', /tarare la misura/.test(t))
  await page.screenshot({ path: path.join(OUT, '6-sintesi.png') })
  await ctx.close()
}

sez('⭐ Il percorso: seduta dopo seduta')
{
  const { page, ctx, errori } = await apri(browser)
  await vaiA(page, 'percorso')
  const t = await testoSlide(page)
  check('⭐ il grafico della velocità prima/dopo per giorno', await page.isVisible('.slide.on .perc-graf svg'))
  const pl = await page.$$eval('.slide.on polyline', p => p.map(x => x.getAttribute('points').split(' ').length))
  check('due linee (prima, dopo) con un punto per giorno', pl.length === 2 && pl.every(n => n === 2), pl)
  check('⭐ legenda Prima / Dopo', /Prima/.test(t) && /Dopo i 3 Respiri/.test(t))
  check('⭐ la spalla giorno per giorno', /Indietro → Indietro/.test(t) && /In avanti → In asse/.test(t), t)
  await page.hover('.slide.on rect[data-tip]')
  check('⭐ passando sopra un giorno compare il valore', await page.isVisible('#tip'))
  check('nessun errore JS in pagina', errori.length === 0, errori)
  await page.screenshot({ path: path.join(OUT, '7-percorso.png') })
  await ctx.close()
}

sez('⭐ Consultare: si torna a un giorno di prima')
{
  const { page, ctx, errori } = await apri(browser)
  await page.click('#giorni .giorno:nth-child(1)'); await page.waitForTimeout(500)
  const ids = await slideIds(page)
  check('⭐ il 10/09 (visita fisioterapica) ha le sue foto e la sua spalla', ids.includes('foto:sagittale_sx') && ids.includes('spalla'), ids)
  await vaiA(page, 'spalla')
  check('⭐ «Indietro» → «Indietro» = Invariato', /Invariato/.test(await testoSlide(page)))
  check('nessun errore JS in pagina', errori.length === 0, errori)
  await ctx.close()
  const b = await apri(browser, {}, '&visita=v-fisio')
  check('⭐ dalla visita fisioterapica si apre sul SUO giorno', /10\/09/.test(await b.page.textContent('#giorni .giorno.on')))
  await b.ctx.close()
}

sez('⭐ Il professionista segna le prove: prima / dopo')
{
  const { page, ctx, errori } = await apri(browser)
  const righe = await page.$$eval('#pro-prove .segna', s => s.length)
  check('⭐ sotto lo schermo ci sono le 9 prove del giorno, da segnare', righe === 9, righe)
  const non = await page.$$('#pro-prove .segna')
  const ultima = non[non.length - 1]
  await (await ultima.$('button:nth-child(3)')).click()   // «Dopo» sulla prova delle 09:12 (non segnata)
  await page.waitForTimeout(400)
  const agg = await page.evaluate(() => window.__D.aggiornate)
  check('⭐⭐ scrive SOLO il momento, su quella prova', agg.length === 1 && JSON.stringify(agg[0].d) === '{"momento":"post"}' && agg[0].tab === 'oscillazione_test', agg)
  const n = await page.evaluate(() => giorni[sel].eq.condizioni.find(x => /beccheggio/.test(x.chiave)).nB)
  check('⭐ e il confronto si rifà subito: ora 4 prove dopo', n === 4, n)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(OUT, '8-professionista.png') })
  await ctx.close()
}

sez('⭐ Senza la migration 048: niente equilibrio, e lo dice per nome')
{
  const { page, ctx, errori } = await apri(browser, { senza048: true })
  const ids = await slideIds(page)
  check('⭐ l’equilibrio non compare (non si indovina il prima e il dopo)', !ids.some(i => /^eq:/.test(i)), ids)
  check('⭐ il resto sì: foto e spalla', ids.includes('foto:sagittale_dx') && ids.includes('spalla'))
  check('⭐ e sotto lo schermo dice quale SQL manca', /048_oscillazione_momento\.sql/.test(await page.textContent('#pro-prove')))
  check('⛔ ma non sul palco (che vede il paziente)', !/048|migration/i.test(await page.evaluate(() => document.getElementById('palco').innerText)))
  check('nessun errore JS in pagina', errori.length === 0, errori)
  await ctx.close()
}

sez('⭐ Senza la migration 046: lo schermo funziona lo stesso')
{
  const { page, ctx, errori } = await apri(browser, { senza046: true })
  const ids = await slideIds(page)
  check('⭐ foto e spalla ci sono', ids.includes('foto:sagittale_dx') && ids.includes('spalla'), ids)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  await ctx.close()
}

sez('⭐ Sulla TV: «Schermo grande» riempie lo schermo e toglie i comandi')
{
  const { page, ctx, errori } = await apri(browser)
  await page.click('#btn-grande'); await page.waitForTimeout(400)
  const r = await page.evaluate(() => { const b = document.getElementById('palco').getBoundingClientRect(); return { w: b.width, h: b.height, x: b.x, y: b.y } })
  check('⭐⭐ il palco è 1920×1080, tutto lo schermo', Math.abs(r.w - 1920) < 2 && Math.abs(r.h - 1080) < 2, r)
  check('⭐ la barra del professionista sparisce', !(await page.isVisible('#pro-bar')))
  check('e anche il pannello delle prove', !(await page.isVisible('#pro-sotto')))
  await vaiA(page, 'foto:sagittale_dx')
  const minFont = await page.evaluate(() => {
    const s = document.querySelector('#slides .slide.on'); let m = 999
    s.querySelectorAll('*').forEach(e => { if (e.children.length === 0 && e.innerText && e.innerText.trim()) {
      const px = parseFloat(getComputedStyle(e).fontSize) * (document.getElementById('palco').getBoundingClientRect().width / 1600); m = Math.min(m, px) } })
    return m
  })
  check('⭐ su una TV il testo più piccolo è almeno 18 pixel', minFont >= 18, minFont)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  check('Esc torna alla vista normale', await page.isVisible('#pro-bar'))
  check('nessun errore JS in pagina', errori.length === 0, errori)
  await ctx.close()
}

sez('⭐ Sul telefono: niente scorrimento di lato, il palco sta nella larghezza')
{
  for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const { page, ctx, errori } = await apri(browser, {}, '', vp)
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth,
      p: document.getElementById('palco').getBoundingClientRect().width }))
    check('⭐ ' + vp.width + '×' + vp.height + ': nessuno scorrimento orizzontale', r.sw <= r.w, r)
    check('   il palco sta nella larghezza', r.p <= vp.width + 1, r)
    check('   nessun errore JS', errori.length === 0, errori)
    if (vp.width < vp.height) {
      check('⭐ in verticale suggerisce di girare il telefono', await page.isVisible('.ruota'))
      await page.screenshot({ path: path.join(OUT, '9-telefono.png'), fullPage: true })
    }
    // scorrere col dito
    await page.evaluate(() => {
      const el = document.getElementById('palco-wrap')
      const t = (x) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: 100 })]
      el.dispatchEvent(new TouchEvent('touchstart', { touches: t(300), changedTouches: t(300), bubbles: true }))
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: t(120), bubbles: true }))
    })
    await page.waitForTimeout(200)
    check('   ⭐ scorrendo col dito si va avanti', (await page.evaluate(() => corrente)) === 1)
    await ctx.close()
  }
}

sez('⭐⭐ valutazioni-coerenti-v1 · dalla scheda si apre sulla VALUTAZIONE INIZIALE')
{
  const { page, ctx, errori } = await apri(browser, { scheda: true }, '&inizio=scheda')
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const on = await page.textContent('#giorni .giorno.on')
  check('⭐⭐ il giorno scelto è la valutazione iniziale', /Valutazione iniziale/.test(on), on)
  const giorni = await page.$$eval('#giorni .giorno', b => b.map(x => x.innerText.replace(/\s+/g, ' ')))
  check('⭐ ed è la PRIMA voce, prima delle rivalutazioni', /Valutazione iniziale/.test(giorni[0]) && giorni.length === 3, giorni)
  const ids = await slideIds(page)
  check('⭐ copertina e profilo sinistro (l’unico piano con prima E dopo nella scheda)', ids.slice(0, 3).join() === 'copertina,foto:sagittale_sx,sintesi', ids)
  check('⛔ la frontale della scheda, che è una foto sola, non diventa un confronto', !ids.includes('foto:frontale'))
  check('⭐ la copertina dice «Valutazione iniziale · prima e dopo i cuscini»', /Valutazione iniziale · prima e dopo i cuscini/.test(await testoSlide(page)))
  await vaiA(page, 'foto:sagittale_sx')
  const t = await testoSlide(page)
  check('⭐⭐ sulla scheda il dopo è «DOPO I CUSCINI», non «dopo i 3 Respiri»', /DOPO I CUSCINI/.test(t) && !/3 RESPIRI/.test(t), t)
  const src = await page.$$eval('.slide.on .riquadro img', a => a.map(i => i.getAttribute('src')))
  check('le foto sono quelle della scheda', src.join() === '/foto/old-pre.svg,/foto/old-post.svg', src)
  await page.screenshot({ path: path.join(OUT, '10-valutazione-iniziale.png') })
  await ctx.close()
}

sez('⭐ valutazioni-coerenti-v1 · senza «inizio» si apre sull’ultima; ogni voce dice cos’è')
{
  const { page, ctx } = await apri(browser, { scheda: true })
  check('⭐ dal pulsante della posturale (niente «inizio») si apre l’ultima', /20\/09/.test(await page.textContent('#giorni .giorno.on')))
  const tipi = await page.$$eval('#giorni .giorno .t', b => b.map(x => x.textContent))
  check('⭐ ogni voce dice il tipo: iniziale, fisioterapica, posturale', tipi.join('|') === 'Valutazione iniziale|Visita fisioterapica|Valutazione posturale', tipi)
  await ctx.close()
  const b = await apri(browser, {}, '&inizio=scheda')
  check('⭐ se la scheda non ha il prima/dopo, apre l’ultima e lo dice sotto il palco',
    /20\/09/.test(await b.page.textContent('#giorni .giorno.on')) && /non ha le foto/.test(await b.page.textContent('#pro-prove')))
  await b.ctx.close()
}

sez('⭐⭐ valutazioni-coerenti-v1 · Free: copertina e prima coppia di foto, il resto è Premium')
{
  const { page, ctx, errori } = await apri(browser, { free: true })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const ids = await slideIds(page)
  check('⭐⭐ due pagine: la copertina e la prima coppia di foto', ids.join() === 'copertina,foto:sagittale_dx', ids)
  check('⭐ sotto il palco il lucchetto dice quante pagine sblocca Premium', /Premium/.test(await page.textContent('#pro-prove')) && /5 altre pagine/.test(await page.textContent('#pro-prove')), await page.textContent('#pro-prove'))
  check('   e porta alla pagina di upgrade', (await page.getAttribute('#blocco-premium a', 'href')) === 'upgrade.html')
  check('⛔ sul palco (che vede il paziente) nessuna pubblicità', !/Premium|upgrade/i.test(await page.evaluate(() => document.getElementById('palco').innerText)))
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300)
  check('⛔ oltre la seconda pagina non si va', (await page.evaluate(() => corrente)) === 1)
  await page.setViewportSize({ width: 1280, height: 900 }); await page.evaluate(() => window.scrollTo(0, 500)); await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(OUT, '11-free.png') })
  await ctx.close()
}

sez('valutazioni-coerenti-v1 · il motore: stesso giorno, prima la valutazione iniziale')
{
  const ctx = { console, Intl }; ctx.globalThis = ctx; vm.createContext(ctx)
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/schermo-paziente.js'), 'utf8'), ctx)
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/valutazioni.js'), 'utf8'), ctx)
  const PL = [{ plane: 'sagittale_sx', pre: { tipo: 'sagittale_sx_pre' }, post: { tipo: 'sagittale_sx_post' } }]
  const g = ctx.PolSchermo.costruisciGiorni({ piani: PL,
    visite: [{ id: 'v', tipo: 'posturale', data_visita: '2026-09-20', note_scapolare_pre: 'anteriore', note_scapolare_post: 'in_asse' }],
    scheda: { data: '2026-09-20T08:00:00Z', foto: { sagittale_sx: { pre: { url: 'a' }, post: { url: 'b' } } } } })
  check('⭐ scheda e posturale dello stesso giorno sono DUE voci, prima la scheda', g.length === 2 && g[0].scheda && !g[1].scheda, g.map(x => x.chiave))
  const V = ctx.PolValutazioni
  check('⭐ entrano posturali e fisioterapiche (2A)', V.TIPI_VISITA.join() === 'posturale,fisioterapica')
  check('nomi: valutazione iniziale / visita fisioterapica / valutazione posturale',
    V.nomeTipo('scheda') === 'Valutazione iniziale' && V.nomeTipo('visita', 'fisioterapica') === 'Visita fisioterapica' && V.nomeTipo('visita', 'posturale') === 'Valutazione posturale')
  check('la data della scheda è quella nel nome del file (caricamento)', V.dataDaPercorso('x/prima-sx_1788000000000.jpg') === new Date(1788000000000).toISOString())
  check('⛔ senza numero nel nome la data NON c’è', V.dataDaPercorso('x/prima-sx.jpg') === null)
  const src = senzaCommenti(fs.readFileSync(path.join(ROOT, 'js/valutazioni.js'), 'utf8'))
  check('⛔ js/valutazioni.js non usa la rete', !/supabase|fetch\(/.test(src))
}

sez('⭐ Un paziente senza niente di registrato')
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  const errori = []; page.on('pageerror', e => errori.push(String(e)))
  await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  const D = { opts: {}, patients: [{ id: PID, nome: 'Anna', cognome: 'Bianchi', foto_url: null }], visits: [], visit_photos: [], oscillazione_test: [], foto_allineamenti: [], aggiornate: [] }
  await page.addInitScript(SUPA, { D, FIRME })
  await page.goto('http://localhost:' + PORT + '/schermo-paziente.html?id=' + PID, { waitUntil: 'load' })
  await page.waitForTimeout(400)
  check('⭐ lo dice con garbo, sul palco', /appena li registri/.test(await page.evaluate(() => document.getElementById('palco').innerText)))
  check('nessun errore JS in pagina', errori.length === 0, errori)
  await ctx.close()
}

} finally {
  await browser.close()
  server.close()
}

console.log('\n' + '='.repeat(66))
console.log(ko === 0 ? `TUTTO VERDE — ${ok} controlli passati.` : `ROSSO — ${ok} passati, ${ko} falliti:\n  - ` + fallite.join('\n  - '))
process.exit(ko === 0 ? 0 : 1)
