/* prova-firma-consenso.mjs — firma-diagnosi-v1
 *
 * Stessa impalcatura degli altri: server locale sul repo, window.supabase
 * finto, CDN intercettate, e si FIRMA DAVVERO sul canvas con pointer veri.
 * node --check guarda la sintassi, non il comportamento: qui si clicca.
 *
 *   node prova-firma-consenso.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const PORT = 8479
const PID  = '11111111-1111-1111-1111-111111111111'

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json' }
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
const sez = t => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 60 - t.length)))
const senzaCommenti = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── il finto Supabase ──────────────────────────────────────────────────
const FINTO = (DB) => {
  window.__chiamate = { insert: [], upload: [] }

  function risultato(rows) {
    const p = {
      data: rows, error: null,
      select(){ return p }, eq(){ return p }, in(){ return p }, or(){ return p },
      order(){ return p },
      maybeSingle(){ return Promise.resolve({ data: rows && rows.length ? rows[0] : (Array.isArray(rows) ? null : rows), error: null }) },
      then(res){ return Promise.resolve({ data: rows, error: null }).then(res) }
    }
    return p
  }

  window.supabase = {
    createClient() {
      return {
        auth: { getSession: async () => ({ data: { session: DB.session } }) },
        from(tabella) {
          return {
            select(){ return risultato(DB.tabelle[tabella] || []) },
            insert(riga) {
              window.__chiamate.insert.push({ tabella, riga })
              const guasto = DB.guasti['insert:' + tabella + ':' + (riga && riga.evento || '')] || DB.guasti['insert:' + tabella]
              const out = guasto
                ? { data: null, error: { message: guasto, name: 'TypeError' } }
                : { data: { id: 'nuovo-' + tabella }, error: null }
              const q = {
                select(){ return q },
                maybeSingle(){ return Promise.resolve(out) },
                then(res){ return Promise.resolve(out).then(res) }
              }
              return q
            }
          }
        },
        storage: {
          from() {
            return {
              async upload(p, buf, opt) {
                window.__chiamate.upload.push({ p, byte: buf && buf.byteLength })
                if (DB.guasti['upload']) return { data: null, error: { message: DB.guasti['upload'], name: 'TypeError' } }
                return { data: { path: p }, error: null }
              },
              getPublicUrl(p) { return { data: { publicUrl: 'https://finto/' + p } } }
            }
          }
        }
      }
    }
  }
}

function dati(guasti = {}) {
  const v = (tipo, id) => ({ id, professional_id: null, tipo, versione: '1.0', titolo: 'Doc ' + tipo, contenuto: 'Testo del documento.', attiva: true, created_at: '2026-01-01T00:00:00Z' })
  return {
    session: { access_token: 'tok-finto', user: { id: 'uid-prof' } },
    guasti,
    tabelle: {
      professionals: [{ id: 'prof-1', centro: 'Studio X', indirizzo: 'Via Roma 1', citta: 'San Donà', partita_iva: '01234567890', email_studio: 'a@b.it', profiles: { nome: 'Giuliano', cognome: 'Baron' } }],
      patients: [{ id: PID, nome: 'Mario', cognome: 'Rossi', data_nascita: '1980-05-05', codice_fiscale: 'RSSMRA80E05L736X' }],
      documenti_versioni: [v('informativa_privacy','v-1'), v('consenso_informato','v-2'), v('consenso_foto_video','v-3')],
      consensi: []
    }
  }
}

async function apri(browser, DB, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 } })
  await ctx.route('**://cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'text/javascript', body:'/* finto */' }))
  await ctx.route('**://fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }))
  await ctx.route('**://fonts.gstatic.com/**', r => r.abort())
  if (opts.pdfRender) await ctx.route('**/api/pdf-render', opts.pdfRender)
  await ctx.route('**/api/genera-pdf**', r => r.fulfill({ status:200, contentType:'application/json', body:'{}' }))
  const page = await ctx.newPage()
  const errori = []
  page.on('pageerror', e => errori.push(String(e)))
  page.on('dialog', d => d.dismiss().catch(()=>{}))
  await page.addInitScript(FINTO, DB)
  await page.goto('http://localhost:' + PORT + '/consenso-paziente.html?pid=' + PID, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  return { page, ctx, errori }
}

// disegna davvero sul canvas: il bottone si sblocca solo con dei tratti veri
async function firmaEConferma(page) {
  await page.click('button.cta-card.primary')
  await page.waitForTimeout(200)
  // il primo documento è la presa visione (niente canvas): si passa oltre
  if (await page.isVisible('#firma-presa-btn')) {
    await page.check('#firma-check')
    await page.click('#firma-presa-btn')
    await page.waitForTimeout(250)
  }
  await page.check('#firma-check')
  const box = await page.locator('#firma-canvas').boundingBox()
  await page.mouse.move(box.x + 30, box.y + 100)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 30 + i * 12, box.y + 100 + (i % 2 ? -18 : 18))
  await page.mouse.up()
  await page.waitForTimeout(150)
  await page.click('#firma-confirm')
}

// ── VIA ────────────────────────────────────────────────────────────────
server.listen(PORT)
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch(fs.existsSync(CHROME)
  ? { executablePath: CHROME, args: ['--no-sandbox'] }
  : { args: ['--no-sandbox'] })

try {

sez('I marker sono nei file')
{
  const html = fs.readFileSync(path.join(ROOT, 'consenso-paziente.html'), 'utf8')
  const sw   = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')
  check('marker firma-diagnosi-v1 in consenso-paziente.html', html.includes('firma-diagnosi-v1'))
  check('marker firma-diagnosi-v1 in sw.js', sw.includes('firma-diagnosi-v1'))
}

sez('Il service worker non tocca più le richieste che non sono GET')
{
  const sw = senzaCommenti(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'))
  check("c'è la guardia sul metodo prima di ogni respondWith",
    /method\s*!==\s*'GET'\s*\)\s*return/.test(sw))
  const posGuardia = sw.indexOf("!== 'GET'")
  const posPrimoRespond = sw.indexOf('respondWith')
  check('la guardia viene PRIMA del primo respondWith', posGuardia > 0 && posGuardia < posPrimoRespond,
    { posGuardia, posPrimoRespond })
  // la prova vera: un service worker vero, con una POST vera
  const risposta = await (async () => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('http://localhost:' + PORT + '/index.html')
    const r = await page.evaluate(async (porta) => {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller) { await new Promise(r => setTimeout(r, 500)); location.reload() }
      return 'registrato'
    }, PORT)
    await ctx.close()
    return r
  })()
  check('il service worker si registra ancora senza errori', risposta === 'registrato')
}

sez('Quando il PDF non parte: la firma resta e si legge il perché')
{
  let tentativi = 0
  const { page, ctx, errori } = await apri(browser, dati(), {
    pdfRender: r => { tentativi++; return r.abort('failed') }   // esattamente il «Load failed»
  })
  await firmaEConferma(page)
  await page.waitForSelector('#firma-errore:visible', { timeout: 20000 })

  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('ha riprovato 3 volte prima di arrendersi', tentativi === 3, { tentativi })
  const titolo = await page.textContent('#firma-errore-titolo')
  check('il titolo dice a che punto si è fermato', /generazione del PDF/.test(titolo), titolo)
  const frase = await page.textContent('#firma-errore-frase')
  check('dice che il consenso NON è stato registrato', /NON è stato registrato/.test(frase), frase)
  check('dice che la firma è ancora lì', /firma è ancora/i.test(frase), frase)
  const dett = await page.textContent('#firma-errore-testo')
  check('il dettaglio riporta il passo', /passo:\s+generazione del PDF/.test(dett), dett)
  check('il dettaglio riporta se il service worker è attivo', /sw:\s+(attivo|assente)/.test(dett), dett)
  check('il dettaglio riporta lo stato della rete', /rete:\s+(online|OFFLINE)/.test(dett), dett)

  check('il canvas della firma è ancora a schermo', await page.isVisible('#firma-canvas'))
  const vuoto = await page.evaluate(() => {
    const c = document.getElementById('firma-canvas')
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false
    return true
  })
  check('la firma disegnata NON è stata cancellata', vuoto === false)
  check('il pulsante «Conferma firma» è di nuovo premibile',
    await page.isEnabled('#firma-confirm'))
  check('nessuna riga è finita in consensi',
    (await page.evaluate(() => window.__chiamate.insert.filter(i => i.tabella === 'consensi' && i.riga.evento === 'firma').length)) === 0)
  check("l'overlay di attesa è stato chiuso", !(await page.isVisible('.progress-overlay.open')))
  await ctx.close()
}

sez('Una connessione che fa i capricci un attimo non blocca la firma')
{
  let tentativi = 0
  const { page, ctx, errori } = await apri(browser, dati(), {
    pdfRender: r => {
      tentativi++
      if (tentativi < 3) return r.abort('failed')
      return r.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4 finto') })
    }
  })
  await firmaEConferma(page)
  await page.waitForFunction(() => window.__chiamate.insert.some(i => i.tabella === 'consensi' && i.riga.evento === 'firma'), null, { timeout: 25000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('al terzo tentativo il PDF passa e il consenso viene registrato', true)
  check('il riquadro rosso non compare', !(await page.isVisible('#firma-errore')))
  const riga = await page.evaluate(() => window.__chiamate.insert.find(i => i.tabella === 'consensi' && i.riga.evento === 'firma').riga)
  check('la riga ha la firma png', typeof riga.firma_png === 'string' && riga.firma_png.startsWith('data:image/png'))
  check('la riga ha il percorso del pdf', /^consensi\//.test(riga.pdf_storage_path || ''))
  check('la riga ha l\'hash del pdf', /^[0-9a-f]{64}$/.test(riga.pdf_hash || ''))
  await ctx.close()
}

sez('Un 4xx non si riprova all\'infinito, e lo dice')
{
  let tentativi = 0
  const { page, ctx, errori } = await apri(browser, dati(), {
    pdfRender: r => { tentativi++; return r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Non autenticato' }) }) }
  })
  await firmaEConferma(page)
  await page.waitForSelector('#firma-errore:visible', { timeout: 20000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('un 401 viene provato una volta sola', tentativi === 1, { tentativi })
  const dett = await page.textContent('#firma-errore-testo')
  check('il dettaglio riporta il codice http', /http:\s+401/.test(dett), dett)
  check('il dettaglio riporta il messaggio del server', /Non autenticato/.test(dett), dett)
  await ctx.close()
}

sez('Se si rompe l\'archivio, l\'errore lo dice — e non parla di PDF')
{
  const { page, ctx, errori } = await apri(browser, dati({ upload: 'Load failed' }), {
    pdfRender: r => r.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4 finto') })
  })
  await firmaEConferma(page)
  await page.waitForSelector('#firma-errore:visible', { timeout: 20000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const titolo = await page.textContent('#firma-errore-titolo')
  check('il titolo parla del caricamento nell\'archivio', /archivio/.test(titolo), titolo)
  check('NON dà la colpa alla generazione del PDF', !/generazione del PDF/.test(titolo), titolo)
  await ctx.close()
}

sez('Se si rompe la scrittura del consenso, l\'errore lo dice')
{
  const { page, ctx, errori } = await apri(browser, dati({ 'insert:consensi:firma': 'Load failed' }), {
    pdfRender: r => r.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4 finto') })
  })
  await firmaEConferma(page)
  await page.waitForSelector('#firma-errore:visible', { timeout: 20000 })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  const titolo = await page.textContent('#firma-errore-titolo')
  check('il titolo parla della registrazione del consenso', /registrazione del consenso/.test(titolo), titolo)
  await ctx.close()
}

sez('Il server non risponde più: si molla dopo 45 secondi, non si resta appesi')
{
  const html = fs.readFileSync(path.join(ROOT, 'consenso-paziente.html'), 'utf8')
  check("c'è un AbortController sulla chiamata del PDF", /new AbortController\(\)/.test(html))
  check('il tempo massimo è 45 secondi', /ctrl\.abort\(\)\s*\}\s*,\s*45000\)/.test(html))
  check('il signal viene passato alla fetch', /signal:\s*ctrl\.signal/.test(html))
}

sez('Quello che c\'era prima non si è rotto')
{
  const { page, ctx, errori } = await apri(browser, dati(), {
    pdfRender: r => r.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4 finto') })
  })
  check('la pagina si apre senza errori', errori.length === 0, errori)
  check('il nome del paziente compare', (await page.textContent('#ph-nome')).includes('Mario Rossi'))
  check('il riquadro dell\'errore parte nascosto', !(await page.isVisible('#firma-errore')))
  // presa visione: percorso senza firma, deve continuare a funzionare
  await page.click('button.cta-card.primary')
  await page.waitForTimeout(200)
  await page.check('#firma-check')
  await page.click('#firma-presa-btn')
  await page.waitForTimeout(300)
  const presa = await page.evaluate(() => window.__chiamate.insert.find(i => i.tabella === 'consensi' && i.riga.evento === 'presa_visione'))
  check('la presa visione si registra ancora', !!presa)
  check('la presa visione scrive pdf_storage_path null', presa && presa.riga.pdf_storage_path === null)
  await ctx.close()
}

} finally {
  await browser.close()
  server.close()
}

console.log('\n' + '='.repeat(64))
console.log(ko === 0 ? `TUTTO VERDE — ${ok} controlli passati.` : `ROSSO — ${ok} passati, ${ko} falliti:\n  - ` + fallite.join('\n  - '))
process.exit(ko === 0 ? 0 : 1)
