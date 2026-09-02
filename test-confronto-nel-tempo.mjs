/* test-confronto-nel-tempo.mjs — confronto-nel-tempo-v1
 *
 * Impalcatura come test-visita-allineata.mjs: server locale sul repo,
 * window.supabase finto con query builder a catena, CDN intercettate,
 * click veri in Chromium. node --check controlla la sintassi, non il
 * comportamento: qui si clicca.
 *
 *   node test-confronto-nel-tempo.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const PORT = 8477

// ── foto finte, con dimensioni vere (serve naturalWidth) ────────────────
function svg(w, h, colore, testo) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${colore}"/>
    <line x1="${w/2}" y1="0" x2="${w/2}" y2="${h}" stroke="#f00" stroke-width="3"/>
    <text x="10" y="30" font-size="24" fill="#fff">${testo}</text>
  </svg>`
}
const FOTO = {
  '/foto/scheda-sag.svg':  svg(400, 600, '#334', 'scheda sag'),
  '/foto/scheda-fro.svg':  svg(400, 600, '#343', 'scheda fro'),
  '/foto/v1-sag.svg':      svg(400, 600, '#433', 'v1 sag'),
  '/foto/v1-fro.svg':      svg(400, 600, '#443', 'v1 fro'),
  '/foto/v2-sag.svg':      svg(500, 700, '#353', 'v2 sag'),
  '/foto/v2-fro.svg':      svg(500, 700, '#535', 'v2 fro'),
  '/foto/v2-fro-post.svg': svg(500, 700, '#553', 'v2 fro post'),
}

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  if (FOTO[u]) { res.writeHead(200, { 'Content-Type':'image/svg+xml' }); res.end(FOTO[u]); return }
  const f = path.join(ROOT, u === '/' ? 'index.html' : u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
  res.end(fs.readFileSync(f))
})

// ── esito ──────────────────────────────────────────────────────────────
let ok = 0, ko = 0
const fallite = []
function check(nome, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + nome) }
  else { ko++; fallite.push(nome); console.log('  ❌ ' + nome + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')) }
}
const sez = t => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 60 - t.length)))

/* Una rimozione non si verifica cercando la PAROLA: il commento che spiega
   perché una riga è stata tolta contiene il nome della riga tolta, e il conto
   non torna mai. Si guarda il codice senza commenti. */
const senzaCommenti = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const senzaCommentiHtml = (t) => String(t).replace(/<!--[\s\S]*?-->/g, '')

// ── dati finti ─────────────────────────────────────────────────────────
const PID  = '8585ba1c-a34b-4336-9a19-187310245cdd'
const PATH_SCHEDA_SAG = PID + '/iniziali/prima-sx_1751328000000.jpg'   // 01/07/2025-ish
const PATH_SCHEDA_FRO = PID + '/iniziali/frontale_1751328000000.jpg'
const PATH_V1_SAG = 'visits/v1/sagittale_sx_pre_1.jpg'
const PATH_V1_FRO = 'visits/v1/frontale_pre_1.jpg'
const PATH_V2_SAG = 'visits/v2/sagittale_sx_pre_2.jpg'
const PATH_V2_FRO = 'visits/v2/frontale_pre_2.jpg'
const PATH_V2_FRO_POST = 'visits/v2/frontale_post_2.jpg'

function datiBase(opts = {}) {
  return {
    opts,
    patients: [{ id: PID, nome:'Mario', cognome:'Rossi', foto_url: JSON.stringify({
      'prima-sx': PATH_SCHEDA_SAG, 'frontale': PATH_SCHEDA_FRO
    }) }],
    /* messaggio-professionista-v1 — «piano: premium» e «profiles» NON sono
       un abbellimento. Da ai-solo-premium-v1 in poi il finto professionista
       senza piano non passava piu' il cancello Premium, e due controlli sui
       referti (l'errore che deve restare SCRITTO sotto il documento) erano
       gia' ROSSI nello zip di partenza: non era il codice, era il finto
       rimasto indietro. L'account vero di Giuliano e' l'admin, quindi
       Premium sempre. `profiles` serve alla firma del messaggio. */
    professionals: [{ id:'prof-1', user_id:'user-1', piano:'premium', premium_scadenza:null,
                      profiles:{ nome:'Giuliano', cognome:'Baron' } }],
    visits: [
      { id:'v1', patient_id:PID, tipo:'posturale', data_visita:'2026-08-01', created_at:'2026-08-01' },
      { id:'v2', patient_id:PID, tipo:'posturale', data_visita:'2026-08-30', created_at:'2026-08-30' },
      { id:'vf', patient_id:PID, tipo:'fisioterapica', data_visita:'2026-08-15', created_at:'2026-08-15' },
    ],
    visit_photos: [
      { id:'p1', visit_id:'v1', tipo:'sagittale_sx_pre', storage_path:PATH_V1_SAG, data_scatto:'2026-08-01' },
      // v1 non ha il frontale: serve a provare il buco nella striscia

      { id:'p3', visit_id:'v2', tipo:'sagittale_sx_pre', storage_path:PATH_V2_SAG, data_scatto:'2026-08-30' },
      { id:'p4', visit_id:'v2', tipo:'frontale_pre',     storage_path:PATH_V2_FRO, data_scatto:'2026-08-30' },
      { id:'p5', visit_id:'v2', tipo:'frontale_post',    storage_path:PATH_V2_FRO_POST, data_scatto:'2026-08-30' },
    ],
    foto_allineamenti: opts.allineamenti || [],
    clinical_documents: [],
    urlFoto: {
      [PATH_SCHEDA_SAG]:'/foto/scheda-sag.svg',
      [PATH_SCHEDA_FRO]:'/foto/scheda-fro.svg',
      [PATH_V1_SAG]:'/foto/v1-sag.svg',
      [PATH_V1_FRO]:'/foto/v1-fro.svg',
      [PATH_V2_SAG]:'/foto/v2-sag.svg',
      [PATH_V2_FRO]:'/foto/v2-fro.svg',
      [PATH_V2_FRO_POST]:'/foto/v2-fro-post.svg',
    }
  }
}

/* precarica-pre-da-scheda-v1 — dati per la terza voce dell'Acquisizione
   Rapida, dentro valutazione-posturale.html. Coprono i quattro casi veri:
   foto con data nel nome, foto SENZA data (vecchia migrazione), casella PRE
   gia' piena, foto vecchia salvata fuori dall'archivio. */
const PATH_SCHEDA_POST_SENZA_DATA = PID + '/iniziali/posteriore.jpg'
const PATH_SCHEDA_PODO_DIETRO     = PID + '/iniziali/podo-dietro_1751328000000.jpg'
const PATH_V3_FRO_PRE             = 'visits/v3/frontale_pre_3.jpg'

function datiPosturale(opts = {}) {
  const d = datiBase(opts)
  d.patients = [{ id: PID, nome:'Mario', cognome:'Rossi', foto_url: JSON.stringify({
    'prima-sx':    PATH_SCHEDA_SAG,               // data nel nome
    'frontale':    PATH_SCHEDA_FRO,               // data nel nome, ma casella gia' piena
    'posteriore':  PATH_SCHEDA_POST_SENZA_DATA,   // ⚠️ senza data
    'podo-dietro': PATH_SCHEDA_PODO_DIETRO,
    'podo-sotto':  'data:image/jpeg;base64,AAAA'  // vecchia, fuori dall'archivio
    // 'prima-dx' manca apposta: deve dire «non c'e' nella scheda»
  }) }]
  d.visits.push({ id:'v3', patient_id:PID, tipo:'posturale', data_visita:'2026-08-31', created_at:'2026-08-31' })
  d.visit_photos.push({ id:'p9', visit_id:'v3', tipo:'frontale_pre', storage_path:PATH_V3_FRO_PRE, data_scatto:'2026-08-31', ordine:4 })
  d.urlFoto[PATH_SCHEDA_POST_SENZA_DATA] = '/foto/scheda-fro.svg'
  d.urlFoto[PATH_SCHEDA_PODO_DIETRO]     = '/foto/scheda-sag.svg'
  d.urlFoto[PATH_V3_FRO_PRE]             = '/foto/v1-fro.svg'
  return d
}

// ── il finto Supabase, iniettato PRIMA di ogni script della pagina ─────
const FINTO = (DB) => {
  window.__DB = DB
  window.__chiamate = { upsert: [], insert: [], update: [], delete: [], upload: [], rimossi: [] }

  function filtra(righe, filtri) {
    return righe.filter(r => filtri.every(f => {
      if (f.op === 'eq') return String(r[f.col]) === String(f.val)
      if (f.op === 'in') return f.val.map(String).indexOf(String(r[f.col])) >= 0
      return true
    }))
  }

  function tabella(nome) {
    const stato = { filtri: [], op: 'select', campi: '' }
    const q = {
      /* progetto-terapeutico-v1 — il finto sa anche NON avere la colonna
         tipo, come un database dove la migration 039 non è stata lanciata:
         PostgREST risponde 42703 e il codice deve reggere. */
      select(campi) { stato.op = 'select'; stato.campi = campi || ''; return q },
      eq(col, val) { stato.filtri.push({ op:'eq', col, val }); return q },
      in(col, val) { stato.filtri.push({ op:'in', col, val }); return q },
      /* messaggio-professionista-v1 — order() e limit() ORDINANO e TAGLIANO
         davvero. Prima erano due scatole vuote: qualunque cosa chiedesse la
         pagina, il finto restituiva le righe nell'ordine in cui stavano nel
         fixture. Con i messaggi quell'ordine E' il comportamento — «quale
         messaggio vede adesso il paziente» e' il primo non archiviato in
         ordine di data — e un finto che non ordina avrebbe detto sempre di
         sì. Le tabelle vecchie non passano order(), quindi non cambia niente
         per loro.
         ⚠️ tabella per il database, mai la lista del fixture: si ordina una
         COPIA (slice), se no il finto riordina i dati sotto agli altri test. */
      order(col, o) { stato.ordine = { col, asc: !(o && o.ascending === false) }; return q },
      limit(n) { stato.limite = n; return q },
      maybeSingle() { return q.then0(true) },
      then0(single) {
        if (DB.opts.senzaTipo && nome === 'clinical_notes' && String(stato.campi).indexOf('tipo') >= 0) {
          return Promise.resolve({ data:null, error:{ code:'42703', message:'column clinical_notes.tipo does not exist' } })
        }
        if (nome === 'foto_allineamenti' && DB.opts.erroreAllineamenti) {
          return Promise.resolve({ data:null, error:{ message:'relation "public.foto_allineamenti" does not exist', code:'42P01' } })
        }
        if (nome === 'patient_messages' && DB.opts.senzaMessaggi) {
          return Promise.resolve({ data:null, error:{ code:'42P01', message:'relation "public.patient_messages" does not exist' } })
        }
        let righe = filtra(DB[nome] || [], stato.filtri)
        if (stato.ordine) {
          const c = stato.ordine.col, segno = stato.ordine.asc ? 1 : -1
          righe = righe.slice().sort((a, b) => {
            const x = a[c], y = b[c]
            if (x === y) return 0
            if (x == null) return 1
            if (y == null) return -1
            return (x > y ? 1 : -1) * segno
          })
        }
        if (stato.limite != null) righe = righe.slice(0, stato.limite)
        return Promise.resolve(single ? { data: righe[0] || null, error:null } : { data: righe, error:null })
      },
      then(res, rej) { return q.then0(false).then(res, rej) },
      upsert(righe) {
        window.__chiamate.upsert.push({ tabella:nome, righe })
        ;[].concat(righe).forEach(r => {
          const i = (DB[nome] || []).findIndex(x => x.storage_path === r.storage_path)
          if (i >= 0) DB[nome][i] = r; else (DB[nome] = DB[nome] || []).push(r)
        })
        return Promise.resolve({ data:righe, error:null })
      },
      insert(riga) {
        window.__chiamate.insert.push({ tabella:nome, riga })
        if (DB.opts.senzaTipo && nome === 'clinical_notes' && riga && Object.prototype.hasOwnProperty.call(riga, 'tipo')) {
          const err = { code:'42703', message:'column "tipo" of relation "clinical_notes" does not exist' }
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data:null, error:err }) }),
                   then: (r) => r({ data:null, error:err }) }
        }
        /* messaggio-professionista-v1 — una tabella che non esiste non
           esiste nemmeno in scrittura. Senza questo la prova diceva
           «Inviato» su un database dove la 041 non e' stata lanciata:
           esattamente il guasto muto che si vuole evitare. */
        if (DB.opts.senzaMessaggi && nome === 'patient_messages') {
          const err = { code:'42P01', message:'relation "public.patient_messages" does not exist' }
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data:null, error:err }) }),
                   then: (r) => r({ data:null, error:err }) }
        }
        /* precarica-pre-da-scheda-v1 — il vero Supabase restituisce la riga
           CON l'id generato. Prima qui tornava la riga senza id, e il codice
           che poi usa quell'id (cancellare la casella, sostituire la foto)
           non si poteva provare: sembrava che non facesse niente. */
        /* messaggio-scade-v1 — il database mette anche i suoi valori di
           default. Senza `creato_il`, il pannello ricaricato dopo l'invio
           calcolava la scadenza su una data che non c'era: nel finto si
           vedeva «ancora null giorni», nel vero no. Il finto deve mentire
           il meno possibile. */
        const difetti = (nome === 'patient_messages')
          ? { creato_il: new Date().toISOString(), letto_il: null, archiviato: false }
          : {}
        const salvata = Object.assign({ id:'new-'+Math.random() }, difetti, riga)
        ;(DB[nome] = DB[nome] || []).push(salvata)
        return { select: () => ({ maybeSingle: () => Promise.resolve({ data:salvata, error:null }) }),
                 then: (r) => r({ data:salvata, error:null }) }
      },
      update(patch) {
        window.__chiamate.update.push({ tabella:nome, patch })
        /* precarica-pre-da-scheda-v1 — la sostituzione di una foto usa
           .update().eq().select().maybeSingle(): prima qui la catena si
           fermava a .eq() e il codice vero non si poteva provare. */
        const applica = (col, val) => {
          const riga = (DB[nome] || []).find(r => String(r[col]) === String(val))
          if (riga) Object.assign(riga, patch)
          return riga || null
        }
        return { eq: (col, val) => {
          const riga = applica(col, val)
          const p = Promise.resolve({ data:riga, error:null })
          p.select = () => ({ maybeSingle: () => Promise.resolve({ data:riga, error:null }) })
          return p
        } }
      },
      delete() {
        return { eq: (col, val) => {
          window.__chiamate.delete.push({ tabella:nome, col, val })
          DB[nome] = (DB[nome] || []).filter(r => String(r[col]) !== String(val))
          return Promise.resolve({ data:null, error:null })
        } }
      }
    }
    return q
  }

  /* daily-context-v1 — le pagine del paziente non usano .from(): usano
     .rpc(). Finche' il finto non sapeva rispondere a rpc(), rapida.html,
     esercizio.html e protocollo.html non si potevano provare affatto.
     DB.rpc e' una mappa nome -> dato (o funzione). Ogni chiamata finisce
     in window.__chiamate.rpc, cosi' il test guarda COSA e' stato mandato
     al database, non solo che la pagina non sia esplosa. */
  window.__chiamate.rpc = []

  window.supabase = {
    createClient() {
      return {
        rpc(nome, args) {
          window.__chiamate.rpc.push({ nome, args })
          /* daily-context-v1 — una risposta che non arriva mai. Serve a
             provare che una pagina ASPETTA il salvataggio prima di
             cambiare pagina: se non aspettasse, se ne andrebbe lo stesso
             e il test lo vedrebbe. */
          if ((DB.opts.rpcAppeso || []).indexOf(nome) >= 0) return new Promise(function () {})
          const r = (DB.rpc || {})[nome]
          const val = (typeof r === 'function') ? r(args) : r
          if (val && val.error) return Promise.resolve(val)
          return Promise.resolve({ data: (val === undefined ? null : val), error: null })
        },
        auth: {
          getSession: () => Promise.resolve(DB.opts.senzaSessione
            ? { data:{ session:null } }
            : { data:{ session:{ access_token:'tok', user:{ id:'user-1' } } } })
        },
        from: tabella,
        storage: {
          from() {
            return {
              createSignedUrls(paths) {
                return Promise.resolve({ data: paths.map(p => ({
                  path: p,
                  signedUrl: (DB.opts.nonFirmare || []).indexOf(p) >= 0 ? null : (DB.urlFoto[p] || null)
                })), error:null })
              },
              createSignedUrl(p) { return Promise.resolve({ data:{ signedUrl: DB.urlFoto[p] || null }, error:null }) },
              upload(p, body, o) { window.__chiamate.upload.push(p); return Promise.resolve({ data:{ path:p }, error:null }) },
              getPublicUrl(p) { return { data:{ publicUrl:'http://pubblico/' + p } } },
              // precarica-pre-da-scheda-v1 — qui si vede se una cancellazione
              // ha toccato un file condiviso con la scheda paziente.
              remove(paths) { [].concat(paths).forEach(p => window.__chiamate.rimossi.push(p)); return Promise.resolve({ data:null, error:null }) }
            }
          }
        }
      }
    }
  }
}

async function apriPagina(browser, dati, file, query, opts = {}) {
  const ctx = await browser.newContext({ viewport:{ width:1280, height:900 } })
  // daily-context-v1 / video-guida-v1 — `blocca` fa sparire un file dalla
  // rete: serve a vedere cosa succede quando un js condiviso non arriva.
  // Una sezione informativa non deve poter rompere la pagina da cui il
  // paziente fa gli esercizi.
  for (const p of (opts.blocca || [])) await ctx.route(p, r => r.abort())
  // niente rete verso l'esterno: font e supabase-js dal CDN non servono al test
  await ctx.route('**://cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'text/javascript', body:'/* finto */' }))
  await ctx.route('**://cdnjs.cloudflare.com/**', r => r.fulfill({ status:200, contentType:'text/javascript', body:'/* finto */' }))
  await ctx.route('**://fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }))
  await ctx.route('**://fonts.gstatic.com/**', r => r.abort())
  const page = await ctx.newPage()
  const errori = []
  page.on('pageerror', e => errori.push(String(e)))
  await page.addInitScript(FINTO, dati)
  await page.goto('http://localhost:' + PORT + '/' + file + query, { waitUntil:'networkidle' })
  await page.waitForTimeout(400)
  return { page, ctx, errori }
}

async function apri(browser, dati, query = '?id=' + PID) {
  return apriPagina(browser, dati, 'comparazione.html', query)
}

// ── VIA ────────────────────────────────────────────────────────────────
server.listen(PORT)
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch(fs.existsSync(CHROME)
  ? { executablePath: CHROME, args:['--no-sandbox'] }
  : { args:['--no-sandbox'] })

try {

sez('Caricamento e riga del tempo')
{
  const { page, ctx, errori } = await apri(browser, datiBase())
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('il marker confronto-nel-tempo-v1 è nel file',
    fs.readFileSync(path.join(ROOT,'comparazione.html'),'utf8').includes('confronto-nel-tempo-v1'))
  check('il nome del paziente compare', (await page.textContent('#pt-nome')).includes('Mario Rossi'))

  const punti = await page.$$eval('.tl-punto', els => els.map(e => ({
    data: e.querySelector('.tl-data').textContent,
    tipo: e.querySelector('.tl-tipo').textContent,
    n: e.querySelector('.tl-n').textContent
  })))
  check('tre punti nella riga del tempo (scheda + 2 posturali)', punti.length === 3, punti)
  check('il primo punto è la SCHEDA PAZIENTE', punti[0] && punti[0].tipo === 'Scheda paziente', punti[0])
  /* Il testo era «caricata il» in confronto-nel-tempo-v1; la v2 lo ha
     spostato accanto alla data, dove si legge «data di caricamento». Il
     controllo guarda la SOSTANZA — non deve mai dire «scattata» — invece
     della parola di allora, che era rimasta indietro. */
  check('la scheda dice che la data è di caricamento, non di scatto',
    punti[0] && /caricat|caricament/i.test(punti[0].n) && !/scattat/i.test(punti[0].n), punti[0])
  check('punti in ordine cronologico', punti[1].data === '01/08/2026' && punti[2].data === '30/08/2026', punti)
  check('la visita fisioterapica NON entra nel confronto posturale',
    punti.every(p => p.tipo !== 'Valutazione' || ['01/08/2026','30/08/2026'].includes(p.data)))

  const tag = await page.$$eval('.tl-punto', els => els.map(e => e.className))
  check('A sul più vecchio, B sul più recente', tag[0].includes('selA') && tag[2].includes('selB'), tag)
  await ctx.close()
}

sez('Il visore — dissolvenza predefinita')
{
  const { page, ctx } = await apri(browser, datiBase())
  const attivo = await page.$$eval('.piano [data-m].on', els => els.map(e => e.textContent))
  check('la modalità predefinita è Dissolvenza',
    attivo.length > 0 && attivo.every(t => t === 'Dissolvenza'), attivo)

  const piani = await page.$$eval('.piano-tit', els => els.map(e => e.textContent))
  check('un blocco per piano, solo quelli con foto (sagittale SX + frontale)',
    piani.length === 2 && piani.includes('Sagittale SX') && piani.includes('Frontale'), piani)

  // slider: cambia l'opacità della lastra B senza ricaricare le immagini
  const primo = await page.$('.piano')
  const srcPrima = await primo.$eval('.lastra:nth-child(2) img', i => i.src)
  await primo.$eval('.slider-row input', i => { i.value = 30; i.dispatchEvent(new Event('input')) })
  await page.waitForTimeout(120)
  const op = await primo.$eval('.lastra:nth-child(2)', e => e.style.opacity)
  const srcDopo = await primo.$eval('.lastra:nth-child(2) img', i => i.src)
  check('il cursore muove la dissolvenza (opacità 0.3)', Math.abs(Number(op) - 0.3) < 0.01, op)
  check('la foto non viene ricaricata muovendo il cursore', srcPrima === srcDopo)

  // lampeggio
  await primo.$eval('[data-m="lampeggio"]', b => b.click())
  await page.waitForTimeout(120)
  const a1 = await primo.$eval('.lastra:nth-child(2)', e => e.style.opacity)
  await page.waitForTimeout(700)
  const a2 = await primo.$eval('.lastra:nth-child(2)', e => e.style.opacity)
  check('il lampeggio alterna A e B da solo, e il primo scatto arriva subito', a1 !== a2, { a1, a2 })
  check('col lampeggio il cursore è spento', await primo.$eval('.slider-row input', i => i.disabled))

  // affiancato
  await primo.$eval('[data-m="affiancato"]', b => b.click())
  await page.waitForTimeout(150)
  const rects = await primo.$$eval('.lastra', els => els.map(e => e.getBoundingClientRect().x))
  check('affiancato: le due lastre sono una accanto all\'altra', rects.length === 2 && rects[1] > rects[0] + 100, rects)
  await ctx.close()
}

sez('La tendina — la trappola del piano frontale')
{
  const { page, ctx } = await apri(browser, datiBase())
  const blocchi = await page.$$('.piano')
  const idx = await page.$$eval('.piano-tit', els => els.map(e => e.textContent))
  const iFro = idx.indexOf('Frontale')
  const iSag = idx.indexOf('Sagittale SX')

  await blocchi[iFro].$eval('[data-m="tendina"]', b => b.click())
  await page.waitForTimeout(150)
  const clipFro = await blocchi[iFro].$eval('.lastra:nth-child(2)', e => e.style.clipPath)
  check('sul FRONTALE la tendina parte ORIZZONTALE (taglio sull\'asse y)',
    /^inset\(\s*\d+(\.\d+)?%/.test(clipFro.trim()) && !/^inset\(\s*0%\s/.test(clipFro.trim()), clipFro)
  const mixFro = await blocchi[iFro].$eval('.slider-row input', i => i.value)
  check('la tendina parte a metà, col divisore in mezzo alla foto', mixFro === '50', mixFro)
  check('il divisore si vede', await blocchi[iFro].$eval('.divisore', e => e.style.display === 'block'))
  const nota = await blocchi[iFro].$eval('.nota-modo', e => e.textContent)
  check('con l\'orizzontale non c\'è nessun allarme', !nota.includes('asimmetria che non c'), nota)

  await blocchi[iFro].$eval('.nota-modo [data-o="v"]', b => b.click())
  await page.waitForTimeout(150)
  const nota2 = await blocchi[iFro].$eval('.nota-modo', e => e.textContent)
  check('scegliendo il verticale sul frontale compare l\'avviso dell\'asimmetria finta',
    nota2.includes('asimmetria che non c'), nota2)
  const clipV = await blocchi[iFro].$eval('.lastra:nth-child(2)', e => e.style.clipPath)
  check('e il taglio diventa verticale', /^inset\(\s*0(px)?\s+0(px)?\s+0(px)?\s+\d/.test(clipV.replace(/\s+/g,' ').trim()), clipV)

  await blocchi[iSag].$eval('[data-m="tendina"]', b => b.click())
  await page.waitForTimeout(150)
  const clipSag = await blocchi[iSag].$eval('.lastra:nth-child(2)', e => e.style.clipPath)
  check('sul SAGITTALE la tendina verticale va bene e resta predefinita',
    /^inset\(\s*0(px)?\s+0(px)?\s+0(px)?\s+\d/.test(clipSag.replace(/\s+/g,' ').trim()), clipSag)
  await ctx.close()
}

sez('Allineamento — l\'avviso e i due punti')
{
  const { page, ctx } = await apri(browser, datiBase())
  const testo = await page.textContent('.avviso-allin')
  check('senza allineamento c\'è scritto «impressione visiva, non una misura»',
    testo.includes('impressione visiva, non una misura'), testo.slice(0, 90))
  const trasf = await page.$eval('.piano .lastra:nth-child(2) img', i => i.style.transform)
  check('senza allineamento la foto B non viene trasformata', !trasf, trasf)

  // 🎯 Allinea, quattro tocchi veri
  await page.$eval('.piano .mini:nth-of-type(1)', () => {})
  const btnAllinea = await page.$('.piano-hdr >> text=🎯 Allinea')
  await btnAllinea.click()
  await page.waitForTimeout(250)
  check('si apre il pannello di allineamento', await page.isVisible('#allin-modal .modal-card'))
  check('il pulsante è spento finché i punti non sono due', await page.$eval('#allin-btn-avanti', b => b.disabled))

  const box = await page.$('#allin-img')
  const r = await box.boundingBox()
  await page.mouse.click(r.x + r.width * 0.50, r.y + r.height * 0.10)
  await page.waitForTimeout(80)
  check('dopo un tocco solo il pulsante è ancora spento', await page.$eval('#allin-btn-avanti', b => b.disabled))
  await page.mouse.click(r.x + r.width * 0.50, r.y + r.height * 0.90)
  await page.waitForTimeout(80)
  check('due punti sulla foto A: si può andare avanti', !(await page.$eval('#allin-btn-avanti', b => b.disabled)))
  check('i due contrassegni ① ② si vedono sulla foto', (await page.$$('.allin-marker')).length === 2)

  await page.click('#allin-btn-avanti')
  await page.waitForTimeout(250)
  check('il passo 2 chiede la foto B', (await page.textContent('#allin-tit')).startsWith('Foto B'))
  const r2 = await (await page.$('#allin-img')).boundingBox()
  await page.mouse.click(r2.x + r2.width * 0.55, r2.y + r2.height * 0.15)
  await page.mouse.click(r2.x + r2.width * 0.55, r2.y + r2.height * 0.85)
  await page.waitForTimeout(80)
  check('il pulsante diventa «Salva allineamento»', (await page.textContent('#allin-btn-avanti')).includes('Salva'))
  await page.click('#allin-btn-avanti')
  await page.waitForTimeout(400)

  const up = await page.evaluate(() => window.__chiamate.upsert)
  check('salva DUE righe, una per foto', up.length === 1 && up[0].righe.length === 2, up)
  check('la chiave è lo storage_path, non l\'id della riga foto',
    up[0].righe.every(r => !!r.storage_path && !r.visit_photo_id), up[0].righe)
  check('salva su foto_allineamenti', up[0].tabella === 'foto_allineamenti')

  const testo2 = await page.textContent('.avviso-allin')
  check('l\'avviso diventa «Foto allineate»', testo2.includes('Foto allineate'), testo2.slice(0, 60))
  await ctx.close()
}

sez('Allineamento — la geometria porta davvero B sopra A')
{
  const allineamenti = [
    { storage_path: PATH_SCHEDA_SAG, punti:{ a:{x:0.50,y:0.10}, b:{x:0.50,y:0.90} } },
    { storage_path: PATH_V2_SAG,     punti:{ a:{x:0.60,y:0.20}, b:{x:0.58,y:0.80} } },
    { storage_path: PATH_SCHEDA_FRO, punti:{ a:{x:0.50,y:0.10}, b:{x:0.50,y:0.90} } },
    { storage_path: PATH_V2_FRO,     punti:{ a:{x:0.60,y:0.20}, b:{x:0.58,y:0.80} } },
  ]
  const { page, ctx } = await apri(browser, datiBase({ allineamenti }))
  await page.waitForTimeout(500)
  const t = await page.$eval('.piano .lastra:nth-child(2) img', i => i.style.transform)
  check('la foto B viene trasformata (matrice applicata)', /^matrix\(/.test(t), t)

  const scarto = await page.evaluate(() => {
    const piano = document.querySelector('.piano')
    const el = piano.querySelector('.visore')
    const imgA = piano.querySelector('.lastra:nth-child(1) img')
    const imgB = piano.querySelector('.lastra:nth-child(2) img')
    const bw = el.clientWidth, bh = el.clientHeight
    const retto = img => { const s = Math.min(bw/img.naturalWidth, bh/img.naturalHeight)
      return { x:(bw-img.naturalWidth*s)/2, y:(bh-img.naturalHeight*s)/2, w:img.naturalWidth*s, h:img.naturalHeight*s } }
    const inBox = (img, p) => { const r = retto(img); return { x:r.x+p.x*r.w, y:r.y+p.y*r.h } }
    const pa = window.__DB.foto_allineamenti.find(r => r.storage_path.indexOf('prima-sx') >= 0).punti
    const pb = window.__DB.foto_allineamenti.find(r => r.storage_path === 'visits/v2/sagittale_sx_pre_2.jpg').punti
    const m = new DOMMatrix(getComputedStyle(imgB).transform)
    const applica = p => ({ x: m.a*p.x + m.c*p.y + m.e, y: m.b*p.x + m.d*p.y + m.f })
    const a1 = inBox(imgA, pa.a), a2 = inBox(imgA, pa.b)
    const b1 = applica(inBox(imgB, pb.a)), b2 = applica(inBox(imgB, pb.b))
    return { d1: Math.hypot(a1.x-b1.x, a1.y-b1.y), d2: Math.hypot(a2.x-b2.x, a2.y-b2.y) }
  })
  check('il riferimento ① di B finisce sopra ① di A (scarto < 1px)', scarto.d1 < 1, scarto)
  check('il riferimento ② di B finisce sopra ② di A (scarto < 1px)', scarto.d2 < 1, scarto)

  const testo = await page.textContent('.avviso-allin')
  check('l\'allineamento salvato viene riletto alla riapertura', testo.includes('Foto allineate'))
  await ctx.close()
}

sez('Quando va storto: il motivo si legge a schermo')
{
  const { page, ctx } = await apri(browser, datiBase({ erroreAllineamenti:true }))
  const b = await page.textContent('#banner-errore')
  check('migration 038 mancante: lo dice, e dice cosa fare', b.includes('migration 038') && b.includes('SQL Editor'), b.slice(0,120))
  check('e il confronto funziona lo stesso', (await page.$$('.piano')).length === 2)
  const av = await page.textContent('.avviso-allin')
  check('con l\'allineamento non disponibile resta l\'avviso «impressione visiva»', av.includes('impressione visiva'))
  await ctx.close()
}
{
  const { page, ctx } = await apri(browser, datiBase({ nonFirmare:[PATH_V2_SAG] }))
  const b = await page.textContent('#banner-errore')
  check('foto non firmabile: conta quante e spiega perché, invece di un riquadro rotto',
    b.includes('1 foto non si apre') && b.includes('clinical-docs'), b.slice(0,120))
  await ctx.close()
}
{
  const { page, ctx } = await apri(browser, datiBase(), '?id=')
  check('senza paziente nell\'indirizzo lo dice', (await page.textContent('#banner-errore')).includes('manca il paziente'))
  await ctx.close()
}

sez('PRE / POST e striscia temporale')
{
  const { page, ctx } = await apri(browser, datiBase())
  await page.click('#fase-post')
  await page.waitForTimeout(300)
  const piani = await page.$$eval('.piano-tit', els => els.map(e => e.textContent))
  check('in POST 3R resta solo il piano che ha foto POST', piani.length === 1 && piani[0] === 'Frontale', piani)
  const msg = await page.textContent('.piano .msg, .piano')
  check('e dice quale foto manca invece di mostrare un buco', /Manca la foto/.test(msg) || piani.length === 1)

  await page.click('#fase-pre')
  await page.click('#modo-striscia')
  await page.waitForTimeout(300)
  const celle = await page.$$eval('.piano:first-child .str-cella', els => els.length)
  check('la striscia temporale mette in fila tutte le date', celle === 3, celle)
  const vuote = await page.$$eval('.str-vuota', els => els.length)
  check('dove la foto non c\'è la striscia dice «assente», non lascia il vuoto', vuote >= 1, vuote)

  await page.click('.piano:first-child .str-box')
  await page.waitForTimeout(300)
  check('toccando una foto della striscia si torna al confronto',
    await page.$eval('#modo-confronto', b => b.classList.contains('on')))
  await ctx.close()
}

sez('Mostra al paziente')
{
  const { page, ctx } = await apri(browser, datiBase())
  await (await page.$('.piano-hdr >> text=👁 Mostra al paziente')).click()
  await page.waitForTimeout(400)
  check('si apre a schermo intero', await page.isVisible('#paz-modal'))
  const da = await page.textContent('#paz-data-a'), db = await page.textContent('#paz-data-b')
  check('le date sono scritte in chiaro, senza termini clinici',
    da.startsWith('Prima — ') && db.startsWith('Dopo — ') && !/PRE|POST|sagittale/i.test(da + db), { da, db })
  const dim = await page.$eval('#paz-data-a', e => parseFloat(getComputedStyle(e).fontSize))
  check('le date sono grandi (≥ 15px)', dim >= 15, dim)
  const h = await page.$eval('#paz-slider', e => e.getBoundingClientRect().height)
  check('il cursore è da pollice (≥ 40px)', h >= 40, h)
  check('nel visore del paziente ci sono solo le due foto', (await page.$$('#paz-visore img')).length === 2)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check('Esc chiude lo schermo intero', !(await page.isVisible('#paz-modal')))
  await ctx.close()
}

sez('PDF del confronto')
{
  const { page, ctx } = await apri(browser, datiBase())
  await page.click('#btn-pdf')
  await page.waitForTimeout(400)
  check('si apre l\'anteprima', await page.isVisible('#pdf-modal'))
  const corpo = await page.textContent('#pdf-body')
  check('l\'anteprima nomina il paziente e le due date',
    corpo.includes('Mario Rossi') && corpo.includes('agosto'), corpo.slice(0,80))
  check('senza allineamento il PDF lo dichiara', corpo.includes('Confronto visivo, non una misura'))
  check('il PDF dice che le foto confrontate sono le PRE', corpo.includes('PRE'))
  check('il PDF avverte che la data della scheda è di caricamento', corpo.includes('caricamento'))
  check('il salvataggio è chiuso finché non c\'è la spunta', await page.$eval('#pdf-btn-salva', b => b.disabled))

  await page.check('#pdf-validato')
  check('con la spunta il salvataggio si apre', !(await page.$eval('#pdf-btn-salva', b => b.disabled)))

  await page.fill('#pdf-relazione', 'Confronto a 29 giorni.')
  await page.waitForTimeout(600)
  check('correggendo il testo la spunta si toglie: si rilegge', !(await page.$eval('#pdf-validato', c => c.checked)))
  check('il salvataggio si richiude', await page.$eval('#pdf-btn-salva', b => b.disabled))
  check('il testo corretto entra nell\'anteprima', (await page.textContent('#pdf-body')).includes('Confronto a 29 giorni.'))

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check('Esc chiude l\'anteprima', !(await page.isVisible('#pdf-modal')))
  await ctx.close()
}

/* ═══════════════════════════════════════════════════════════════════════
   precarica-pre-da-scheda-v1
   ═══════════════════════════════════════════════════════════════════════ */

sez('Rivalutazione — la terza voce e il suo elenco')
{
  const { page, ctx, errori } = await apriPagina(browser, datiPosturale(), 'valutazione-posturale.html', '?id=v3')
  check('nessun errore JS nella posturale', errori.length === 0, errori)

  await page.click('text=📷 Acquisizione Rapida')
  await page.waitForTimeout(150)
  const voci = await page.$$eval('#rapid-fase-modal .rapid-fase-btn', els => els.map(e => e.textContent.trim()))
  check('le voci dell\'Acquisizione Rapida sono tre', voci.length === 3, voci)
  check('la terza è la RIVALUTAZIONE', voci[2] && voci[2].startsWith('RIVALUTAZIONE — solo le POST'), voci[2])
  check('le prime due non sono state toccate',
    voci[0].startsWith('PRE — Valutazione iniziale') && voci[1].startsWith('POST 3R'), voci)

  await page.click('.rapid-fase-riv')
  await page.waitForTimeout(400)
  check('si apre la conferma, non la fotocamera',
    await page.isVisible('#precarica-modal') && !(await page.isVisible('#webcam-modal.open')))

  const righe = await page.$$eval('#prec-corpo .prec-riga', els => els.map(e => e.textContent))
  const riga = n => righe.find(t => t.indexOf(n) === 0 || t.indexOf(n) >= 0) || ''
  check('sei righe, una per casella PRE', righe.length === 6, righe.length)
  check('la sagittale sx porta la SUA data, non oggi',
    riga('Sagittale sinistra').includes('caricata il 01/07/2025'), riga('Sagittale sinistra'))
  check('⚠️ la foto senza timestamp dice «data non registrata»',
    riga('Posteriore').includes('data non registrata'), riga('Posteriore'))
  check('la casella già piena dice che non la tocca',
    riga('Frontale').includes('già piena') && riga('Frontale').includes('non la tocco'), riga('Frontale'))
  check('la casella piena offre la sostituzione, spenta',
    riga('Frontale').includes('sostituisci lo stesso') &&
    !(await page.$eval('#prec-corpo input[type=checkbox]', c => c.checked)))
  check('la foto fuori dall\'archivio non si carica da qui, e lo dice',
    riga('Plantare').includes('fuori dall\'archivio'), riga('Plantare'))
  check('lo slot assente dice «non c\'è nella scheda»',
    riga('Sagittale destra').includes('non c\'è nella scheda'), riga('Sagittale destra'))

  check('la conferma avverte del confronto fra giorni diversi',
    (await page.textContent('#prec-corpo')).includes('confronto sarà fra due giorni diversi'))
  const btn = await page.textContent('.prec-btn-ok')
  check('il pulsante conta 3 foto (le piene e le non caricabili restano fuori)',
    btn.includes('Carica 3 foto'), btn)
  check('c\'è la via d\'uscita «solo le POST, senza caricare»',
    (await page.textContent('.prec-btn-solopost')).includes('senza caricare'))

  await ctx.close()
}

sez('Rivalutazione — il caricamento vero')
{
  const { page, ctx, errori } = await apriPagina(browser, datiPosturale(), 'valutazione-posturale.html', '?id=v3')
  await page.click('text=📷 Acquisizione Rapida')
  await page.waitForTimeout(120)
  await page.click('.rapid-fase-riv')
  await page.waitForTimeout(400)
  await page.click('.prec-btn-ok')
  await page.waitForTimeout(900)

  const ins = await page.evaluate(() => window.__chiamate.insert.filter(c => c.tabella === 'visit_photos').map(c => c.riga))
  check('tre righe inserite in visit_photos', ins.length === 3, ins.map(r => r.tipo))
  check('nessuna riga scritta sulla casella già piena', !ins.some(r => r.tipo === 'frontale_pre'), ins.map(r => r.tipo))
  const sag = ins.find(r => r.tipo === 'sagittale_sx_pre')
  check('la sagittale sx tiene la sua data (2025), non quella di oggi',
    sag && String(sag.data_scatto).startsWith('2025-06-30') || String(sag && sag.data_scatto).startsWith('2025-07-01'), sag && sag.data_scatto)
  const post = ins.find(r => r.tipo === 'posteriore_pre')
  check('⚠️ senza data nel nome la data resta VUOTA: mai la data di oggi',
    post && post.data_scatto === null, post && post.data_scatto)
  check('la foto inserita è quella della scheda, non una copia nuova',
    ins.every(r => r.storage_path.indexOf('/iniziali/') >= 0), ins.map(r => r.storage_path))

  const tag = await page.$$eval('.slot-scheda-tag', els => els.map(e => e.textContent))
  check('tre caselle portano il contrassegno SCHEDA', tag.length === 3, tag)
  check('il contrassegno porta la data quando c\'è', tag.some(t => t.includes('01/07')), tag)
  check('e dice «senza data» quando non c\'è', tag.some(t => t.includes('senza data')), tag)
  check('la casella già piena NON ha il contrassegno',
    await page.$eval('#slot-frontale_pre', el => !el.querySelector('.slot-scheda-tag')))

  const avviso = await page.textContent('#vp-avviso-scheda')
  check('l\'avviso resta a schermo mentre si lavora', await page.isVisible('#vp-avviso-scheda'))
  check('l\'avviso dice che il confronto è fra giorni diversi',
    avviso.includes('Confronto fra giorni diversi') && avviso.includes('non scattate in questa seduta'), avviso.slice(0,120))
  check('l\'esito resta scritto, non in un toast',
    (await page.textContent('#prec-corpo')).includes('3 foto caricate'))

  // Da qui si passa alle POST, che si scattano oggi.
  await page.click('.prec-btn-ok')
  await page.waitForTimeout(300)
  check('dopo il caricamento parte la sequenza POST 3R',
    (await page.evaluate(() => rapidStepLabel())).includes('Step 1/6') &&
    (await page.evaluate(() => rapidStepLabel())).includes('POST'))
  check('si apre il menu di caricamento del primo step POST',
    await page.isVisible('#upload-menu-modal.open'))
  await ctx.close()
}

sez('Rivalutazione — sostituire una casella già piena si chiede prima')
{
  const { page, ctx } = await apriPagina(browser, datiPosturale(), 'valutazione-posturale.html', '?id=v3')
  await page.click('text=📷 Acquisizione Rapida')
  await page.waitForTimeout(120)
  await page.click('.rapid-fase-riv')
  await page.waitForTimeout(400)
  await page.check('#prec-corpo input[type=checkbox]')
  await page.waitForTimeout(200)
  const btn = await page.textContent('.prec-btn-ok')
  check('spuntando «sostituisci» il conteggio sale a 4', btn.includes('Carica 4 foto'), btn)

  await page.click('.prec-btn-ok')
  await page.waitForTimeout(900)
  const upd = await page.evaluate(() => window.__chiamate.update.filter(c => c.tabella === 'visit_photos').map(c => c.patch))
  check('la casella piena viene sostituita, non duplicata',
    upd.some(p => p.storage_path && p.storage_path.indexOf('/iniziali/frontale_') >= 0), upd)
  const ins = await page.evaluate(() => window.__chiamate.insert.filter(c => c.tabella === 'visit_photos').map(c => c.riga.tipo))
  check('e non nasce una seconda riga frontale_pre', !ins.includes('frontale_pre'), ins)
  check('ora anche la casella frontale porta il contrassegno',
    await page.$eval('#slot-frontale_pre', el => !!el.querySelector('.slot-scheda-tag')))
  await ctx.close()
}

sez('Rivalutazione — «solo le POST» non tocca niente')
{
  const { page, ctx } = await apriPagina(browser, datiPosturale(), 'valutazione-posturale.html', '?id=v3')
  await page.click('text=📷 Acquisizione Rapida')
  await page.waitForTimeout(120)
  await page.click('.rapid-fase-riv')
  await page.waitForTimeout(400)
  await page.click('.prec-btn-solopost')
  await page.waitForTimeout(300)
  const ins = await page.evaluate(() => window.__chiamate.insert.filter(c => c.tabella === 'visit_photos'))
  check('nessuna foto caricata', ins.length === 0, ins.length)
  check('nessun contrassegno in giro', (await page.$$('.slot-scheda-tag')).length === 0)
  check('l\'avviso in pagina resta spento', !(await page.isVisible('#vp-avviso-scheda')))
  check('la sequenza POST parte lo stesso',
    (await page.evaluate(() => rapidStepLabel())).includes('Step 1/6'))
  await ctx.close()
}

sez('Rivalutazione — scheda senza foto iniziali')
{
  const dati = datiPosturale()
  dati.patients[0].foto_url = '{}'
  const { page, ctx } = await apriPagina(browser, dati, 'valutazione-posturale.html', '?id=v3')
  await page.click('text=📷 Acquisizione Rapida')
  await page.waitForTimeout(120)
  await page.click('.rapid-fase-riv')
  await page.waitForTimeout(400)
  const t = await page.textContent('#prec-sub')
  check('lo dice invece di aprire un elenco vuoto', t.includes('non ci sono foto iniziali'), t)
  check('non offre un caricamento che non può fare', (await page.$$('.prec-btn-ok')).length === 0)
  check('offre comunque di andare alle POST', (await page.$$('.prec-btn-solopost')).length === 1)
  await ctx.close()
}

sez('Rivalutazione — svuotare la casella non svuota la scheda paziente')
{
  const { page, ctx } = await apriPagina(browser, datiPosturale(), 'valutazione-posturale.html', '?id=v3')
  await page.click('text=📷 Acquisizione Rapida'); await page.waitForTimeout(120)
  await page.click('.rapid-fase-riv'); await page.waitForTimeout(400)
  await page.click('.prec-btn-ok'); await page.waitForTimeout(900)
  await page.click('.prec-btn-annulla'); await page.waitForTimeout(200)

  await page.evaluate(() => removePhoto('sagittale_sx_pre'))
  await page.waitForTimeout(400)
  const rimossi = await page.evaluate(() => window.__chiamate.rimossi)
  check('⚠️ la foto della scheda NON viene cancellata da Storage',
    !rimossi.some(p => p.indexOf('/iniziali/') >= 0), rimossi)
  const del = await page.evaluate(() => window.__chiamate.delete.filter(c => c.tabella === 'visit_photos'))
  check('ma la casella si svuota davvero (riga cancellata)', del.length === 1, del)
  check('la casella torna vuota a schermo',
    await page.$eval('#slot-sagittale_sx_pre', el => !el.classList.contains('filled')))

  // Controprova: una foto scattata in questa visita si cancella eccome.
  await page.evaluate(() => removePhoto('frontale_pre'))
  await page.waitForTimeout(400)
  const dopo = await page.evaluate(() => window.__chiamate.rimossi)
  check('una foto scattata in questa visita si cancella normalmente',
    dopo.some(p => p.indexOf('visits/v3/frontale_pre') >= 0), dopo)
  await ctx.close()
}

sez('Rivalutazione — il contrassegno nel PDF')
{
  const { page, ctx } = await apriPagina(browser, datiPosturale(), 'valutazione-posturale.html', '?id=v3')
  const html = await page.evaluate((paths) => buildPDFTemplatePosturale(
    { data_visita:'2026-08-31' },
    { nome:'Mario', cognome:'Rossi' },
    { nome:'Giuliano', cognome:'B' },
    [ { tipo:'frontale_pre',  url_pubblico:'/foto/scheda-fro.svg', storage_path: paths.scheda },
      { tipo:'posteriore_pre',url_pubblico:'/foto/scheda-fro.svg', storage_path: paths.senzaData },
      { tipo:'frontale_post', url_pubblico:'/foto/v2-fro-post.svg', storage_path:'visits/v3/frontale_post.jpg' } ],
    null
  ), { scheda: PATH_SCHEDA_FRO, senzaData: PATH_SCHEDA_POST_SENZA_DATA })

  check('il PDF avverte in cima che il confronto è fra giorni diversi',
    html.includes('CONFRONTO FRA GIORNI DIVERSI'))
  check('il PDF dice che quelle foto non sono di questa seduta',
    html.includes('non sono state scattate in questa seduta'))
  check('sotto la foto c\'è «dalla scheda paziente del gg/mm/aaaa»',
    html.includes('dalla scheda paziente del 01/07/2025'), html.includes('dalla scheda paziente'))
  check('e «data non registrata» dove la data non c\'è',
    html.includes('dalla scheda paziente — data non registrata'))
  check('la foto scattata oggi non porta nessun contrassegno: due didascalie su tre foto',
    (html.match(/dalla scheda paziente/g) || []).length === 2,
    (html.match(/dalla scheda paziente/g) || []).length)

  const pulito = await page.evaluate(() => buildPDFTemplatePosturale(
    { data_visita:'2026-08-31' }, { nome:'Mario', cognome:'Rossi' }, { nome:'Giuliano' },
    [ { tipo:'frontale_pre', url_pubblico:'/foto/v1-fro.svg', storage_path:'visits/v3/frontale_pre.jpg' } ], null))
  check('senza foto della scheda l\'avviso NON compare',
    !pulito.includes('CONFRONTO FRA GIORNI DIVERSI') && !pulito.includes('dalla scheda paziente'))
  await ctx.close()
}

/* ═══════════════════════════════════════════════════════════════════════
   cartella-in-anamnesi-v1 — la Relazione clinica e' UN pannello solo,
   in js/cartella-clinica.js, montato da paziente.html e da anamnesi.html.
   ═══════════════════════════════════════════════════════════════════════ */

function datiCartella(opts = {}) {
  const d = datiBase(opts)
  d.patients = [{ id: PID, nome:'Mario', cognome:'Rossi',
    foto_url: '{}',
    red_flags: { voci:['Dolore notturno non meccanico','Calo ponderale inspiegato'], nota:'' },
    anamnesi: JSON.stringify({
      motivo_txt: 'Lombalgia da tre mesi',
      obiettivi: ['Ridurre il dolore','Tornare al lavoro'],
      obiettivi_breve: 'Ridurre il dolore notturno',
      obiettivi_medio: 'Recuperare la flessione',
      obiettivi_lungo: 'Tornare in palestra'
    }) }]
  d.clinical_notes = opts.note || [
    { id:'n1', patient_id:PID, professional_id:'prof-1', title:'Prima seduta [#abc-123]',
      content:'Mobilizzazioni lombari L4-S1.', updated_at:'2026-08-20T10:00:00Z' },
    { id:'n2', patient_id:PID, professional_id:'prof-1', title:'Sintesi del 25',
      content:'[SINTESI_AI_V1]\n{"problema_principale":"Lombalgia cronica aspecifica"}', updated_at:'2026-08-25T10:00:00Z' }
  ]
  d.clinical_documents = []
  return d
}

sez('Cartella in anamnesi — un pannello solo, in js/')
{
  const src  = fs.readFileSync(path.join(ROOT,'js/cartella-clinica.js'),'utf8')
  const paz  = fs.readFileSync(path.join(ROOT,'paziente.html'),'utf8')
  const anam = fs.readFileSync(path.join(ROOT,'anamnesi.html'),'utf8')

  check('il file condiviso esiste e porta il marker', src.includes('cartella-in-anamnesi-v1'))
  check('entrambe le pagine caricano lo stesso file',
    paz.includes('js/cartella-clinica.js') && anam.includes('js/cartella-clinica.js'))
  check('⚠️ il markup della scheda NON è più scritto in paziente.html',
    !paz.includes('cn-tpl-select'), 'cn-tpl-select trovato in paziente.html')
  check('⚠️ e non è stato ricopiato in anamnesi.html',
    !anam.includes('cn-tpl-select'), 'cn-tpl-select trovato in anamnesi.html')
  check('il markup sta nel file condiviso, una volta sola',
    (src.match(/cn-tpl-select/g) || []).length === 2)
  check('i template rapidi stanno in un posto solo',
    !paz.includes('CN_TEMPLATES = [') && src.includes('CN_TEMPLATES = ['))
  check('la Sintesi AI di paziente.html continua a chiamare gli stessi nomi',
    paz.includes('clinicalNotesGetProfId()') && paz.includes('clinicalNotesInit()') &&
    src.includes('window.clinicalNotesGetProfId') && src.includes('window.clinicalNotesInit'))
  /* Aggiornato con progetto-terapeutico-v1: la 039 ora esiste, ma serve SOLO
     al progetto. La sintesi AI continua a riconoscersi dal prefisso, e la
     relazione clinica deve funzionare anche senza la colonna. */
  check('la relazione regge anche senza la colonna tipo (42703 intercettato)',
    src.includes('[SINTESI_AI_V1]') && src.includes('mancaLaColonna') && src.includes("'42703'"))
}

sez('Cartella in anamnesi — si scrive dall\'anamnesi')
{
  const { page, ctx, errori } = await apriPagina(browser, datiCartella(), 'anamnesi.html', '?pid=' + PID)
  check('nessun errore JS nell\'anamnesi', errori.length === 0, errori)
  check('la sezione «Relazione clinica» c\'è', await page.isVisible('#sec-relazione'))
  check('parte chiusa, come le altre sezioni', !(await page.isVisible('#sec-relazione-body')))

  await page.click('#sec-relazione .sec-head')
  await page.waitForTimeout(500)
  check('si apre senza uscire dall\'anamnesi', await page.isVisible('#sec-relazione-body'))
  check('l\'indirizzo è ancora quello dell\'anamnesi', page.url().includes('anamnesi.html'))

  const card = await page.$$eval('.cn-note-card .cn-note-card-title', els => els.map(e => e.textContent))
  check('le note del paziente si leggono da qui', card.length === 2, card)
  check('il marker [#…] non si vede nel titolo', card.some(t => t.startsWith('Prima seduta') && !t.includes('[#')), card)
  /* messaggio-professionista-v1 — era `.cn-note-card`, cioe' «la prima card
     che capita». Da quando il finto ORDINA come il database (updated_at
     desc) la prima e' la sintesi del 25, non la Prima seduta: il controllo
     diceva rosso su un codice giusto. Un selettore e' un indirizzo. */
  check('ma resta intatto nel dato (se no si rompe l\'upsert dalla visita)',
    (await page.$$eval('.cn-note-card', els => els.map(e => e.getAttribute('data-title') || '')))
      .some(t => t.includes('[#abc-123]')))
  check('la sintesi AI porta il bollino AI', (await page.$$('.cn-note-badge-ai')).length === 1)

  await page.click('#cn-btn-nuova')
  await page.waitForTimeout(250)
  check('si apre l\'editor', await page.isVisible('#cn-editor'))
  await page.fill('#cn-title', 'Nota scritta dall\'anamnesi')
  await page.fill('#cn-content', 'Il paziente riferisce miglioramento.')
  await page.selectOption('#cn-tpl-select', 'Lombalgia')
  await page.waitForTimeout(200)
  check('il template rapido funziona anche qui',
    (await page.inputValue('#cn-content')).includes('Mobilizzazioni lombari'))

  await page.click('#cn-btn-salva')
  await page.waitForTimeout(700)
  const ins = await page.evaluate(() => window.__chiamate.insert.filter(c => c.tabella === 'clinical_notes').map(c => c.riga))
  check('la nota viene salvata in clinical_notes', ins.length === 1, ins)
  check('col paziente e il professionista giusti',
    ins[0] && ins[0].patient_id === PID.toString() || (ins[0] && ins[0].patient_id), ins[0] && ins[0].patient_id)
  check('è la stessa tabella della scheda paziente, non una tabella «dell\'anamnesi»',
    ins[0] && ins[0].professional_id === 'prof-1', ins[0])
  check('tornata in cronologia, si vede', (await page.$$('.cn-note-card')).length === 3)

  // la sintesi AI non si apre qui: si dice dove si apre, non si mostra un JSON
  page.on('dialog', d => d.dismiss())
  check('la card AI non apre l\'editor col JSON grezzo',
    await page.$eval('.cn-note-badge-ai', el => el.closest('.cn-note-card').getAttribute('onclick').includes('_cnAvvisoAI')))
  await ctx.close()
}

sez('Cartella in anamnesi — la scheda paziente disegna lo stesso pannello')
{
  const { page, ctx, errori } = await apriPagina(browser, datiCartella(), 'paziente.html', '?id=' + PID)
  const gravi = errori.filter(e => /cartella|clinicalNotes|polCartella/i.test(e))
  check('nessun errore JS che riguardi la cartella', gravi.length === 0, gravi)

  await page.click('#btn-cartella')
  await page.waitForTimeout(300)
  await page.click('#cn-btn-relazione')
  await page.waitForTimeout(700)

  check('la scheda Relazione si disegna', await page.isVisible('#cn-note-list'))
  check('l\'ha disegnata il file condiviso',
    await page.evaluate(() => !!window.polCartellaClinica && window.polCartellaClinica.marker === 'cartella-in-anamnesi-v1'))
  const t = await page.$$eval('.cn-note-card .cn-note-card-title', els => els.map(e => e.textContent))
  check('le note ci sono, come prima', t.length === 2, t)
  check('il bollino AI c\'è anche qui', (await page.$$('.cn-note-badge-ai')).length === 1)
  check('qui la sintesi AI si apre nel suo visore, non con l\'avviso',
    await page.$eval('.cn-note-badge-ai', el => el.closest('.cn-note-card').getAttribute('onclick').includes('_cnApriAI')))
  check('la Sintesi AI legge ancora la mappa dei contenuti',
    await page.evaluate(() => !!window._cnNoteDataMap && !!window._cnNoteDataMap['n2']))

  await page.click('#cn-btn-nuova')
  await page.waitForTimeout(250)
  await page.fill('#cn-content', 'Nota scritta dalla scheda paziente.')
  await page.click('#cn-btn-salva')
  await page.waitForTimeout(700)
  const ins = await page.evaluate(() => window.__chiamate.insert.filter(c => c.tabella === 'clinical_notes'))
  check('anche da qui si salva sulla stessa tabella', ins.length === 1, ins.length)
  await ctx.close()
}

/* ═══════════════════════════════════════════════════════════════════════
   progetto-terapeutico-v1
   ═══════════════════════════════════════════════════════════════════════ */

sez('Progetto terapeutico — la migration e il vocabolario')
{
  const sql  = fs.readFileSync(path.join(ROOT,'db/migrations/039_clinical_notes_tipo.sql'),'utf8')
  const ter  = fs.readFileSync(path.join(ROOT,'js/terapie.js'),'utf8')
  const paz  = fs.readFileSync(path.join(ROOT,'paziente.html'),'utf8')
  const anam = fs.readFileSync(path.join(ROOT,'anamnesi.html'),'utf8')
  const mod  = fs.readFileSync(path.join(ROOT,'js/cartella-clinica.js'),'utf8')

  check('la migration 039 esiste', sql.includes('clinical_notes'))
  check('è sicura da eseguire due volte',
    sql.includes('ADD COLUMN IF NOT EXISTS') && sql.includes('CREATE INDEX IF NOT EXISTS'))
  check('il backfill non ri-tocca le righe alla seconda esecuzione',
    sql.includes("AND tipo <> 'sintesi_ai'"))
  check('i tipi ammessi sono vincolati', sql.includes('clinical_notes_tipo_check'))

  check('le terapie stanno in un file solo', ter.includes('polTerapie'))
  check('ci sono tutte e otto le macchine dello studio',
    ['tecar','laser904','laser_alta','ultrasuoni','us_micro','emtt','tens','ems'].every(k => ter.includes("k:'" + k + "'")))
  check('coi nomi che usa Giuliano, non quelli dei cataloghi',
    ter.includes('Chronic Five Crio Plus') && ter.includes('EMS ad impulsi variabili'))
  check('⚠️ le controindicazioni NON sono ancora qui: le deve rivedere lui',
    !/controindicazion[ei]\s*:/i.test(ter))
  check('nessuna pagina si costruisce un elenco terapie «suo»',
    !paz.includes('Chronic Five') && !anam.includes('Chronic Five') && !mod.includes('Chronic Five'))
  check('entrambe le pagine caricano il vocabolario',
    paz.includes('js/terapie.js') && anam.includes('js/terapie.js'))
}

sez('Progetto terapeutico — si crea, e prende gli obiettivi dall\'anamnesi')
{
  const { page, ctx, errori } = await apriPagina(browser, datiCartella(), 'anamnesi.html', '?pid=' + PID)
  check('nessun errore JS', errori.length === 0, errori)
  await page.click('#sec-relazione .sec-head')
  await page.waitForTimeout(700)

  check('senza progetto lo dice, e offre di crearlo',
    (await page.textContent('#cn-progetto')).includes('Nessun progetto terapeutico'))

  await page.click('#pg-btn-crea')
  await page.waitForTimeout(600)
  check('si apre il modulo del progetto', await page.isVisible('#cn-progetto-editor'))
  check('e la cronologia note si toglie di mezzo', !(await page.isVisible('#cn-list-view')))

  check('⚠️ gli obiettivi arrivano dall\'anamnesi §28, non a mano',
    (await page.inputValue('#pg-ob-breve')) === 'Ridurre il dolore notturno' &&
    (await page.inputValue('#pg-ob-lungo')) === 'Tornare in palestra')
  check('e il problema dal motivo della visita',
    (await page.inputValue('#pg-problema')).includes('Lombalgia da tre mesi'))
  check('⚠️ le precauzioni partono dallo screening di sicurezza §27',
    (await page.inputValue('#pg-precauzioni')).includes('Dolore notturno non meccanico'))
  check('e viene detto che è precompilato e correggibile',
    (await page.textContent('#cn-progetto-editor')).includes('Ho precompilato'))

  check('parte da «iniziativa autonoma»',
    await page.$$eval('#cn-progetto-editor .pg-chip.on', els => els.some(e => e.textContent.includes('Iniziativa autonoma'))))
  check('i campi del prescrittore sono nascosti finché non serve',
    !(await page.isVisible('#pg-presc')))
  await page.click('text=Su prescrizione')
  await page.waitForTimeout(300)
  check('scegliendo «su prescrizione» compaiono chi e quando', await page.isVisible('#pg-presc'))
  await page.fill('#pg-prescrittore', 'Dott. Bianchi, ortopedico')

  const grp = await page.$$eval('#pg-chips .pg-grp', els => els.map(e => e.textContent))
  check('le terapie sono divise in manuali e strumentali', grp.length === 2, grp)
  await page.click('#pg-chips .pg-chip[data-k="tecar"]')
  await page.click('#pg-chips .pg-chip[data-k="esercizio"]')
  await page.waitForTimeout(200)
  check('i chip si accendono', (await page.$$('#pg-chips .pg-chip.on')).length === 2)

  await page.fill('#pg-frequenza', '2 a settimana')
  await page.fill('#pg-durata', '6 settimane')
  await page.fill('#pg-riv-quando', 'alla 6ª seduta')
  await page.fill('#pg-riv-data', '2026-10-15')

  await page.click('#pg-btn-salva')
  await page.waitForTimeout(900)

  const ins = await page.evaluate(() => window.__chiamate.insert.filter(c => c.tabella === 'clinical_notes').map(c => c.riga))
  check('viene salvata una riga sola', ins.length === 1, ins.length)
  check('con tipo=progetto, non come nota qualsiasi', ins[0] && ins[0].tipo === 'progetto', ins[0] && ins[0].tipo)
  const j = JSON.parse(ins[0].content)
  check('il contenuto è a campi, non testo libero', j.origine === 'prescrizione' && j.frequenza === '2 a settimana', j)
  check('gli interventi sono chiavi stabili, non nomi', JSON.stringify(j.interventi) === '["tecar","esercizio"]', j.interventi)
  check('il prescrittore è registrato', j.prescrittore === 'Dott. Bianchi, ortopedico', j.prescrittore)
  check('niente campi di servizio finiti nel database',
    !('__id' in j) && !('__nuovo' in j) && !('__precompilato' in j), Object.keys(j))
  await ctx.close()
}

sez('Progetto terapeutico — il riquadro e la rivalutazione scaduta')
{
  const scaduta = new Date(Date.now() - 20 * 86400000).toISOString().slice(0,10)
  const dati = datiCartella()
  dati.clinical_notes.push({ id:'pg1', patient_id:PID, professional_id:'prof-1', tipo:'progetto',
    title:'Progetto terapeutico — 01/09/2026', updated_at:'2026-09-01T08:00:00Z',
    content: JSON.stringify({ v:1, stato:'attivo', origine:'autonomo', problema:'Lombalgia meccanica',
      ob_breve:'Ridurre il dolore', interventi:['tecar','terapia_manuale'], frequenza:'2 a settimana',
      durata:'6 settimane', precauzioni:'Evitare carichi in flessione', rivaluta_quando:'alla 6ª seduta',
      rivaluta_data: scaduta, esito:'' }) })

  const { page, ctx } = await apriPagina(browser, dati, 'paziente.html', '?id=' + PID + '#relazione')
  await page.waitForTimeout(1600)

  const txt = await page.textContent('#cn-progetto')
  check('il progetto sta IN CIMA alla scheda', await page.isVisible('.pg-box'))
  check('è marcato ATTIVO', txt.includes('ATTIVO'))
  check('⚖️ dice che nasce da iniziativa autonoma', txt.includes('iniziativa autonoma'))
  check('mostra gli interventi coi nomi per esteso',
    txt.includes('Tecar Terapia') && txt.includes('Terapia manuale'), txt.slice(0,200))
  check('mostra frequenza e durata', txt.includes('2 a settimana') && txt.includes('6 settimane'))
  check('⚠️ la rivalutazione scaduta viene detta, coi giorni',
    txt.includes('sono passati 20 giorni'), (txt.match(/sono passati[^.]*/) || [''])[0])
  check('l\'avviso è rosso, non una riga come le altre', (await page.$$('.pg-scaduto')).length === 1)

  const card = await page.$$eval('.cn-note-card .cn-note-card-title', els => els.map(e => e.textContent))
  check('⚠️ il progetto NON compare fra le note: là si vedrebbe come JSON',
    !card.some(t => t.includes('Progetto terapeutico')), card)
  check('le note normali restano in cronologia', card.length === 2, card)

  await page.click('#pg-btn-revisione')
  await page.waitForTimeout(600)
  check('la revisione parte dal progetto di prima',
    (await page.inputValue('#pg-problema')) === 'Lombalgia meccanica' &&
    (await page.$$('#pg-chips .pg-chip.on')).length === 2)
  check('e non si dichiara precompilata dall\'anamnesi (viene dal progetto)',
    !(await page.textContent('#cn-progetto-editor')).includes('Ho precompilato'))
  await page.fill('#pg-riv-data', '2026-12-01')
  await page.click('#pg-btn-salva')
  await page.waitForTimeout(900)
  const ins = await page.evaluate(() => window.__chiamate.insert.filter(c => c.tabella === 'clinical_notes'))
  check('la revisione è una riga NUOVA: la precedente resta in archivio', ins.length === 1, ins.length)
  await ctx.close()
}

sez('Progetto terapeutico — se la migration 039 non è stata lanciata')
{
  const { page, ctx, errori } = await apriPagina(browser, datiCartella({ senzaTipo: true }), 'anamnesi.html', '?pid=' + PID)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  await page.click('#sec-relazione .sec-head')
  await page.waitForTimeout(900)

  const t = await page.textContent('#cn-progetto')
  check('⚠️ lo dice a schermo invece di rompersi in silenzio', t.includes('manca la migration 039'), t.slice(0,90))
  check('e dice esattamente quale SQL lanciare', t.includes('039_clinical_notes_tipo.sql'))
  check('🔴 la relazione clinica continua a funzionare lo stesso',
    (await page.$$('.cn-note-card')).length === 2)
  await page.click('#cn-btn-nuova')
  await page.waitForTimeout(300)
  check('e si possono ancora scrivere note', await page.isVisible('#cn-editor'))
  await ctx.close()
}

/* ═══════════════════════════════════════════════════════════════════════
   referti-letti-v1
   ═══════════════════════════════════════════════════════════════════════ */

function datiDocumenti(opts = {}) {
  const d = datiCartella(opts)
  d.clinical_documents = [
    { id:'d1', patient_id:PID, tipo:'referto', descrizione:'RMN lombare', file_url:'https://x/storage/v1/object/public/clinical-docs/' + PID + '/docs/rmn.pdf',
      created_at:'2026-03-12T09:00:00Z',
      estratto_ai: 'RMN rachide lombosacrale del 2026-03-12\nProtrusione discale L5-S1.\nDispositivi impiantati: pacemaker bicamerale',
      estratto_ai_il: '2026-08-30T10:00:00Z',
      rilievi: { v:1, tipo_documento:'RMN rachide lombosacrale', data_documento:'2026-03-12',
        sintesi:'Protrusione discale L5-S1 senza compressione radicolare.',
        diagnosi:['protrusione discale L5-S1'], condizioni_rilevanti:[],
        dispositivi_impiantati:['pacemaker bicamerale'], farmaci:['warfarin 5 mg'],
        esami_alterati:[], citazioni:['portatore di pacemaker bicamerale dal 2019','in terapia con warfarin 5 mg'], leggibile:true } },
    { id:'d2', patient_id:PID, tipo:'esame', descrizione:'Emocromo', file_url:'https://x/storage/v1/object/public/clinical-docs/' + PID + '/docs/emo.jpg',
      created_at:'2026-07-01T09:00:00Z' },
    { id:'d3', patient_id:PID, tipo:'visita', descrizione:'Visita ortopedica', file_url:'https://x/storage/v1/object/public/clinical-docs/' + PID + '/docs/orto.pdf',
      created_at:'2026-07-20T09:00:00Z' }
  ]
  return d
}

sez('Referti letti — la migration e le funzioni dell\'endpoint')
{
  const sql = fs.readFileSync(path.join(ROOT,'db/migrations/040_documenti_letti.sql'),'utf8')
  const api = fs.readFileSync(path.join(ROOT,'api/analisi-referto.js'),'utf8')

  check('la migration 040 esiste ed è idempotente',
    sql.includes('ADD COLUMN IF NOT EXISTS estratto_ai') && sql.includes('CREATE INDEX IF NOT EXISTS'))
  check('l\'indice serve proprio ai «non letti»', sql.includes('WHERE estratto_ai IS NULL'))

  check('⚖️ l\'endpoint verifica che il documento sia di un TUO paziente',
    api.includes("professional_id !== prof.id") && api.includes('Non autorizzato su questo documento'))
  /* L'ordine va guardato DENTRO il ramo cartella: nel file c'è anche il
     ramo anagrafica, che chiama checkAIAccess per primo legittimamente. */
  const ramoDoc = api.slice(api.indexOf('async function leggiDocumentoInCartella'))
  check('⚖️ un tentativo non autorizzato NON consuma un\'analisi AI',
    ramoDoc.indexOf('Non autorizzato su questo documento') < ramoDoc.indexOf('checkAIAccess(req)'),
    { nega: ramoDoc.indexOf('Non autorizzato su questo documento'), ai: ramoDoc.indexOf('checkAIAccess(req)') })
  check('il file lo scarica il server dal bucket privato, non il browser',
    api.includes("storage.from('clinical-docs').download"))
  check('il PDF va come «document», l\'immagine come «image»',
    api.includes("type: 'document'") && api.includes("type: 'image'"))
  check('⚠️ il prompt vieta di dedurre e impone le citazioni',
    api.includes('NON inventare e NON dedurre') && api.includes('copiata alla lettera'))
  check('⚠️ e vieta diagnosi e indicazioni terapeutiche',
    api.includes('NON fare diagnosi tue'))
  check('se la risposta non si capisce NON si salva niente',
    api.includes('un estratto che non si e\' capito e\' peggio'))
  check('se manca la 040 lo dice per nome', api.includes('040_documenti_letti.sql'))
  /* ⚠️ Il piano Vercel ammette 12 funzioni serverless per deploy e il repo
     ne aveva gia' 12: la tredicesima ha fatto fallire il deploy in 15s.
     I file che iniziano con _ non contano come funzioni. */
  const funzioni = fs.readdirSync(path.join(ROOT,'api')).filter(f => f.endsWith('.js') && !f.startsWith('_'))
  check('⚠️ non più di 12 funzioni serverless in api/', funzioni.length <= 12, funzioni.length)
  check('la lettura NON è una funzione a parte', !fs.existsSync(path.join(ROOT,'api/analisi-documento.js')))
  check('i due lavori dell\'endpoint hanno prompt separati',
    api.includes('const PROMPT_DOC') && api.includes('Sei un assistente medico') &&
    api.includes('if (body.document_id)'))
}

sez('Referti letti — le funzioni pure, provate davvero')
{
  const m = await import(path.join(ROOT, 'api/analisi-referto.js'))
  const { percorsoDaUrl, tipoDaPercorso, normalizza, testoLeggibile } = m._test

  check('dal file_url ricava il percorso dentro il bucket',
    percorsoDaUrl('https://x.supabase.co/storage/v1/object/public/clinical-docs/pid/a%20b.pdf?t=1') === 'pid/a b.pdf')
  check('un documento fuori dall\'archivio non produce un percorso finto',
    percorsoDaUrl('data:image/png;base64,AA') === null && percorsoDaUrl(null) === null)
  check('il PDF è riconosciuto anche in maiuscolo', tipoDaPercorso('a/B.PDF') === 'application/pdf')
  check('senza estensione si usa il tipo del file', tipoDaPercorso('a/b', 'image/png') === 'image/png')

  const n = normalizza({ tipo_documento:'RMN', diagnosi:'ernia L5-S1', farmaci:['warfarin',''], citazioni:['protrusione L5-S1'] })
  check('una stringa dove serviva un elenco non rompe niente', JSON.stringify(n.diagnosi) === '["ernia L5-S1"]', n.diagnosi)
  check('le voci vuote vengono tolte', JSON.stringify(n.farmaci) === '["warfarin"]', n.farmaci)
  check('i campi che il modello ha saltato diventano elenchi vuoti',
    Array.isArray(n.condizioni_rilevanti) && n.condizioni_rilevanti.length === 0)
  check('un documento illeggibile lo dice, invece di produrre un estratto vuoto',
    testoLeggibile(normalizza({ leggibile:false, sintesi:'Foto sfocata.' })).startsWith('Documento non leggibile'))
  check('il testo leggibile riporta i rilievi', testoLeggibile(n).includes('Diagnosi riportate: ernia L5-S1'))
}

sez('Referti letti — letto, da leggere, e cosa dice')
{
  const { page, ctx, errori } = await apriPagina(browser, datiDocumenti(), 'paziente.html', '?id=' + PID + '#cartella')
  const gravi = errori.filter(e => /documento|estratto|caricaDocumenti/i.test(e))
  check('nessun errore JS sui documenti', gravi.length === 0, gravi)
  await page.waitForTimeout(1400)

  const stati = await page.$$eval('.doc-stato', els => els.map(e => e.textContent))
  check('ogni documento dice se è stato letto', stati.length === 3, stati)
  check('uno letto e due da leggere',
    stati.filter(t => t === 'LETTO').length === 1 && stati.filter(t => t === 'DA LEGGERE').length === 2, stati)

  check('⚠️ l\'avviso dice quanti non sono stati letti',
    (await page.textContent('#doc-list')).includes('2 documenti non sono stati letti'))
  check('e dice cosa comporta: non entrano nella Sintesi AI',
    (await page.textContent('.doc-nonletti')).includes('Sintesi AI'))

  check('sul documento letto c\'è «Cosa dice», non «Leggi»',
    (await page.$$('.btn-doc-estratto')).length === 1 && (await page.$$('.btn-doc-leggi')).length === 2)

  await page.click('.btn-doc-estratto')
  await page.waitForTimeout(400)
  const est = await page.textContent('#estratto-d1')
  check('l\'estratto si apre sotto la riga del documento', await page.isVisible('#estratto-d1'))
  check('riporta la sintesi del referto', est.includes('Protrusione discale L5-S1'))
  check('e i dispositivi impiantati, che contano per le terapie', est.includes('pacemaker bicamerale'))
  check('⚠️ e le CITAZIONI testuali dal documento',
    est.includes('portatore di pacemaker bicamerale dal 2019'))
  check('le citazioni sono marcate come tali', (await page.$$('#estratto-d1 .de-cit')).length === 2)
  check('⚖️ dichiara che NON è un parere e non autorizza terapie',
    est.includes('non è un parere clinico e non autorizza alcuna terapia'))
  check('si può rileggere il documento', est.includes('Rileggi'))

  await page.click('.btn-doc-estratto')
  await page.waitForTimeout(300)
  check('e si richiude', !(await page.isVisible('#estratto-d1')))
  await ctx.close()
}

sez('Referti letti — il contenuto entra nella Sintesi AI')
{
  const { page, ctx } = await apriPagina(browser, datiDocumenti(), 'paziente.html', '?id=' + PID + '#cartella')
  await page.waitForTimeout(1400)

  // si intercetta la chiamata all'AI per leggere il contesto che le arriva
  await page.route('**/api/ai-analisi', route => {
    route.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ content:[{ text: JSON.stringify({ problema_principale:'Lombalgia', elementi_documentali:'2 documenti non sono stati letti.', osservazioni_cliniche:'', protocollo_attivo:'', criticita:'', evoluzione_clinica:'', nota_finale:'' }) }] }) })
  })
  let inviato = null
  page.on('request', r => { if (r.url().includes('/api/ai-analisi')) inviato = r.postData() })

  // La Sintesi AI è riservata a Premium: nel test si finge il piano, se no
  // si apre la modale di upgrade invece del pannello delle opzioni.
  await page.evaluate(() => { window.isPremium = true })
  await page.click('#cn-btn-sintesi')
  await page.waitForTimeout(400)
  await page.click('#csai-avvia-btn')
  await page.waitForTimeout(400)
  await page.click('text=🧠 Genera sintesi')
  await page.waitForTimeout(1400)

  check('la sintesi è partita', !!inviato)
  check('⚠️ il CONTENUTO del referto arriva all\'AI, non solo il titolo',
    inviato && inviato.includes('CONTENUTO LETTO DAL DOCUMENTO') && inviato.includes('pacemaker bicamerale'), (inviato||'').slice(0,60))
  check('i documenti non letti sono marcati uno per uno',
    (inviato.match(/NON LETTO/g) || []).length === 2)
  check('⚠️ e il conto dei non letti è scritto nel prompt',
    inviato.includes('2 di questi documenti NON sono stati letti'))
  check('all\'AI viene chiesto di dichiararlo nella sintesi',
    inviato.includes('documenti NON LETTI, dillo apertamente'))
  check('⚠️ e l\'avviso si vede a schermo sopra la sintesi',
    await page.isVisible('#csai-avviso-nonletti'))
  check('con il numero giusto',
    (await page.textContent('#csai-avviso-nonletti')).includes('2 documenti non sono stati letti'))
  await ctx.close()
}

sez('Referti letti — quando tutti sono letti non si avvisa a vuoto')
{
  const dati = datiDocumenti()
  dati.clinical_documents = [dati.clinical_documents[0]]   // solo quello letto
  const { page, ctx } = await apriPagina(browser, dati, 'paziente.html', '?id=' + PID + '#cartella')
  await page.waitForTimeout(1400)
  check('nessun avviso se non manca niente', (await page.$$('.doc-nonletti:not(#csai-avviso-nonletti)')).length === 0)
  check('e il documento resta marcato LETTO', (await page.textContent('.doc-stato')) === 'LETTO')
  await ctx.close()
}

sez('Referti letti — se la lettura non riesce, il motivo resta scritto')
{
  const { page, ctx } = await apriPagina(browser, datiDocumenti(), 'paziente.html', '?id=' + PID + '#cartella')
  await page.waitForTimeout(1400)
  await page.route('**/api/analisi-referto', route => {
    route.fulfill({ status:502, contentType:'application/json',
      body: JSON.stringify({ error:'La risposta della lettura non è stata capita.' }) })
  })
  /* messaggio-professionista-v1 — era `.btn-doc-leggi`, «il primo pulsante
     che capita». Da quando il finto ordina i documenti come il database
     (created_at desc) il primo e' d3, ma le righe sotto guardano d2. Si
     clicca l'indirizzo esatto. */
  await page.click('#btn-leggi-d2')
  await page.waitForTimeout(900)
  const t = await page.textContent('#estratto-d2')
  check('⚠️ l\'errore resta sotto QUEL documento, non in un alert che sparisce',
    t.includes('Non sono riuscito a leggerlo') && t.includes('non è stata capita'), t.slice(0,80))
  check('e il pulsante torna disponibile per riprovare',
    (await page.textContent('#btn-leggi-d2')).includes('Riprova'))
  check('il documento NON risulta letto', (await page.$$eval('.doc-stato', els => els.map(e => e.textContent))).filter(x => x === 'LETTO').length === 1)
  await ctx.close()
}

sez('Andata e ritorno anamnesi ↔ cartella')
{
  const { page, ctx, errori } = await apriPagina(browser, datiCartella(), 'anamnesi.html', '?pid=' + PID)
  check('nessun errore JS con la barra', errori.length === 0, errori)
  check('il marker è in tutti e due i file',
    fs.readFileSync(path.join(ROOT,'anamnesi.html'),'utf8').includes('nav-anamnesi-cartella-v1') &&
    fs.readFileSync(path.join(ROOT,'paziente.html'),'utf8').includes('nav-anamnesi-cartella-v1'))
  const voci = await page.$$eval('.navbar-rapida .nr-btn', els => els.map(e => e.textContent.trim()))
  check('la barra «Vai a» è in cima', voci.length === 4, voci)
  check('porta a Obiettivi, Screening e Relazione',
    voci[0].includes('Obiettivi') && voci[1].includes('Screening') && voci[2].includes('Relazione'), voci)

  // Gli obiettivi sono la sezione 28: chiusa e in fondo. Un tocco la apre.
  check('la 28 Obiettivi parte chiusa',
    !(await page.$eval('#sec-obiettivi', el => el.classList.contains('open'))))
  await page.click('.navbar-rapida .nr-btn')
  await page.waitForTimeout(700)
  check('il salto apre davvero la sezione Obiettivi',
    await page.$eval('#sec-obiettivi', el => el.classList.contains('open')))
  check('e la porta dentro lo schermo, non solo la apre',
    await page.$eval('#sec-obiettivi', el => { const r = el.getBoundingClientRect(); return r.top > -50 && r.top < window.innerHeight }))
  check('senza chiudere quello che era già aperto',
    (await page.$$('.sec.open')).length >= 2)

  await page.click('.navbar-rapida .nr-btn:nth-child(4)')
  await page.waitForTimeout(700)
  check('«Relazione clinica» dalla barra apre la scheda', await page.isVisible('#cn-note-list'))

  check('il ritorno alla cartella porta l\'ancora, così si riapre dov\'eri',
    (await page.$eval('.nr-btn.scuro', el => el.getAttribute('onclick'))).includes('vaiAllaCartella'))
  check('e punta alla scheda paziente giusta',
    (await page.evaluate(() => { var u=''; window.location.assign = function(x){u=x}; return String(vaiAllaCartella.toString()) })).includes("'paziente.html?id=' + pid + '#cartella'"))
  await ctx.close()
}

sez('Andata e ritorno — l\'ancora riapre la cartella')
{
  const { page, ctx } = await apriPagina(browser, datiCartella(), 'paziente.html', '?id=' + PID + '#cartella')
  await page.waitForTimeout(1200)
  check('arrivando con #cartella la card è già aperta, non chiusa',
    await page.isVisible('#cartella-container'))
  check('il pulsante 🩺 Anamnesi è nell\'intestazione della cartella',
    await page.$eval('#cartella-clinica .section-header', el => el.textContent.includes('Anamnesi')))
  check('e porta all\'anamnesi di QUESTO paziente',
    (await page.evaluate(() => vaiAllAnamnesi.toString())).includes("'anamnesi.html?pid=' + patientId"))

  // #relazione salta direttamente alla scheda giusta
  const p2 = await apriPagina(browser, datiCartella(), 'paziente.html', '?id=' + PID + '#relazione')
  await p2.page.waitForTimeout(1500)
  check('con #relazione si atterra direttamente sulle note', await p2.page.isVisible('#cn-note-list'))
  await p2.ctx.close()
  await ctx.close()
}

sez('Cartella in anamnesi — quando va storto si legge a schermo')
{
  const dati = datiCartella()
  dati.professionals = []          // profilo professionista assente
  const { page, ctx } = await apriPagina(browser, dati, 'anamnesi.html', '?pid=' + PID)
  await page.click('#sec-relazione .sec-head')
  await page.waitForTimeout(600)
  const txt = await page.textContent('#cn-note-list')
  check('il motivo è scritto nel pannello, non in un toast che sparisce',
    txt.includes('Profilo professionista non trovato'), txt.slice(0,80))
  check('e dice che le note non si salvano', txt.includes('non si possono') || txt.includes('né salvare'), txt.slice(0,120))
  await ctx.close()
}

sez('Ingresso dalla valutazione posturale')
{
  const src = fs.readFileSync(path.join(ROOT,'valutazione-posturale.html'),'utf8')
  check('c\'è il pulsante «Confronto nel tempo»', src.includes('📈 Confronto nel tempo'))
  check('la funzione esiste e apre comparazione.html?id=', /function apriConfrontoNelTempo[\s\S]{0,400}comparazione\.html\?id=/.test(src))
  check('il PRE/POST della singola seduta resta dov\'era', src.includes('🔄 Confronto PRE/POST'))
  check('il marker è nel file', (src.match(/confronto-nel-tempo-v1/g) || []).length >= 1)
}

// ══════════════════════════════════════════════════════════════════════
// daily-context-v1 — LE PAGINE DEL PAZIENTE MANDANO DAVVERO I CAMPI NUOVI
// Non basta che le colonne esistano: finora esistevano e nessuno le
// scriveva. Qui si guarda COSA finisce dentro save_diary_entry.
// ══════════════════════════════════════════════════════════════════════

const TOK = 'decafbad-0000-0000-0000-00000000000a'

function datiPaziente(opts = {}) {
  return {
    opts,
    urlFoto: {},
    rpc: {
      get_protocol_data: {
        patient: { nome:'Mario', cognome:'Rossi', configurazione_default:'NPL' },
        protocol: { id:'bb000000-0000-0000-0000-0000000000b1', stato: opts.statoProtocollo || 'attivo',
                    configurazione_generale:'NPL', data_inizio:'2026-08-01', frequenza:'3/sett',
                    nome_personalizzato:'Programma lombare' },
        exercises: [
          { ppe:{ id:'p1', exercise_id:'e1', ordine:1, durata:60, configurazione:'NPL' },
            exercise:{ id:'e1', nome:'Ponte lombare', descrizione_paziente:'', video_url:'', durata_default:60, slug:'ponte' } },
          { ppe:{ id:'p2', exercise_id:'e2', ordine:2, durata:60, configurazione:'NPL' },
            exercise:{ id:'e2', nome:'Apertura toracica', descrizione_paziente:'', video_url:'', durata_default:60, slug:'apertura' } }
        ],
        custom_videos: [], elicoidali: []
      },
      get_professional_contact: { telefono:'3331234567' },
      get_patient_sessions: [],
      get_diary_entries: [],
      save_diary_entry: 'nuova-riga-1',
      save_therapy_session: 'nuova-seduta-1',
      log_patient_event: true
    }
  }
}

const chiamateSave = (c) => c.filter(x => x.nome === 'save_diary_entry').map(x => x.args.p_data)

sez('daily-context-v1 · il file condiviso')
{
  const src = fs.readFileSync(path.join(ROOT,'js','pol-sessione.js'),'utf8')
  check('js/pol-sessione.js esiste e ha il marker', src.includes('daily-context-v1'))
  check('non fa mai fallire una seduta (tutto protetto)', (src.match(/catch/g) || []).length >= 8)
  for (const f of ['rapida.html','esercizio.html','protocollo.html']) {
    const h = fs.readFileSync(path.join(ROOT,f),'utf8')
    check(f + ' carica js/pol-sessione.js', h.includes('src="js/pol-sessione.js"'))
  }
}

sez('daily-context-v1 · modalità rapida')
{
  const { page, ctx, errori } = await apriPagina(browser, datiPaziente(), 'rapida.html', '?token=' + TOK)
  check('la rapida si apre senza errori', errori.length === 0, errori.join(' | '))
  await page.click('#chk-0').catch(() => {})
  await page.waitForTimeout(150)
  await page.click('#btn-completa')
  await page.waitForTimeout(400)
  const inviati = await page.evaluate(() => window.__chiamate.rpc.filter(x => x.nome === 'save_diary_entry').map(x => x.args.p_data))
  check('la rapida salva una riga', inviati.length === 1, JSON.stringify(inviati).slice(0,150))
  const d = inviati[0] || {}
  check('modalita = rapid', d.modalita === 'rapid', String(d.modalita))
  check('session_type = main (la seduta prescritta resta la principale)', d.session_type === 'main', String(d.session_type))
  check('manda la chiave anti doppio-click', typeof d.client_session_id === 'string' && d.client_session_id.length >= 8, String(d.client_session_id))
  check('manda quando è cominciata e quando è finita', !!d.iniziata_alle && !!d.finita_alle, d.iniziata_alle + ' → ' + d.finita_alle)
  check('l\'inizio è PRIMA della fine', Date.parse(d.iniziata_alle) <= Date.parse(d.finita_alle))
  check('manda l\'elenco degli esercizi spuntati', Array.isArray(d.esercizi_completati), JSON.stringify(d.esercizi_completati))
  await ctx.close()
}

sez('daily-context-v1 · «salta tutto e segna come completato» = manual')
{
  const { page, ctx } = await apriPagina(browser, datiPaziente(), 'rapida.html', '?token=' + TOK)
  await page.click('#btn-salta')
  await page.waitForTimeout(400)
  const inviati = await page.evaluate(() => window.__chiamate.rpc.filter(x => x.nome === 'save_diary_entry').map(x => x.args.p_data))
  const d = inviati[0] || {}
  check('il salto si registra come manual, non come seduta fatta', d.modalita === 'manual', String(d.modalita))
  check('resta completato: true come prima (niente tolto)', d.completato === true)
  await ctx.close()
}

sez('daily-context-v1 · modalità guidata e interruzione per dolore')
{
  // Il salvataggio non risponde mai, di proposito: cosi' si vede se la
  // pagina lo ASPETTA. Prima non lo aspettava e se ne andava, e il dato
  // dell'interruzione poteva essere annullato dal cambio pagina.
  const { page, ctx, errori } = await apriPagina(browser, datiPaziente({ rpcAppeso:['save_diary_entry'] }), 'esercizio.html', '?token=' + TOK)
  check('la guidata si apre senza errori', errori.length === 0, errori.join(' | '))
  let visti = 0
  page.on('dialog', d => { visti++; d.accept() })      // un solo ascoltatore, con contatore
  await page.click('#btn-pain')
  await page.waitForTimeout(600)
  const inviati = await page.evaluate(() => window.__chiamate.rpc.filter(x => x.nome === 'save_diary_entry').map(x => x.args.p_data))
  const d = inviati[0] || {}
  check('è stata chiesta una sola conferma', visti === 1, String(visti))
  check('la pagina aspetta il salvataggio prima di andarsene',
        page.url().includes('esercizio.html'), page.url())
  check('l\'interruzione per dolore arriva nella COLONNA, non solo nella nota',
        d.interrotto_per_dolore === true, JSON.stringify(d).slice(0,200))
  check('e resta completato: false', d.completato === false)
  check('modalita = guided', d.modalita === 'guided', String(d.modalita))
  check('anche l\'interruzione porta la chiave della seduta', typeof d.client_session_id === 'string')
  await ctx.close()
}

sez('daily-context-v1 · la guidata completata conta gli esercizi fatti')
{
  const { page, ctx } = await apriPagina(browser, datiPaziente({ rpcAppeso:['save_diary_entry'] }), 'esercizio.html', '?token=' + TOK)
  await page.click('#btn-complete')      // esercizio 1 → passa al 2
  await page.waitForTimeout(250)
  await page.click('#btn-complete')      // esercizio 2 → fine seduta, salva
  await page.waitForTimeout(700)
  const inviati = await page.evaluate(() => window.__chiamate.rpc.filter(x => x.nome === 'save_diary_entry').map(x => x.args.p_data))
  const d = inviati[0] || {}
  check('la guidata completata salva una riga', inviati.length === 1, String(inviati.length))
  check('modalita = guided', d.modalita === 'guided', String(d.modalita))
  check('elenca gli esercizi attraversati', Array.isArray(d.esercizi_completati) && d.esercizi_completati.length === 2,
        JSON.stringify(d.esercizi_completati))
  await ctx.close()
}

sez('daily-context-v1 · la stessa seduta riaperta resta la stessa seduta')
{
  const { page, ctx } = await apriPagina(browser, datiPaziente(), 'rapida.html', '?token=' + TOK)
  const primo = await page.evaluate(() => window.polSessione.avvia().id)
  await page.reload({ waitUntil:'networkidle' })
  await page.waitForTimeout(300)
  const dopo = await page.evaluate(() => window.polSessione.avvia().id)
  check('dopo un refresh la chiave della seduta non cambia', primo === dopo, primo + ' vs ' + dopo)
  const chiusa = await page.evaluate(() => { window.polSessione.chiudi(); return window.polSessione.avvia().id })
  check('dopo chiudi() la seduta successiva è nuova', chiusa !== primo)
  await ctx.close()
}

sez('daily-context-v1 · pagine diverse, sedute diverse')
{
  const a = await apriPagina(browser, datiPaziente(), 'rapida.html', '?token=' + TOK)
  const idRapida = await a.page.evaluate(() => window.polSessione.avvia().id)
  await a.page.goto('http://localhost:' + PORT + '/esercizio.html?token=' + TOK, { waitUntil:'networkidle' })
  await a.page.waitForTimeout(300)
  const idGuidata = await a.page.evaluate(() => window.polSessione.avvia().id)
  check('rapida e guidata dello stesso giorno restano due sedute distinte',
        idRapida !== idGuidata, idRapida + ' vs ' + idGuidata)
  await a.ctx.close()
}

sez('daily-context-v1 · il diario della home si registra come manual')
{
  const { page, ctx, errori } = await apriPagina(browser, datiPaziente(), 'protocollo.html', '?token=' + TOK)
  check('la home del paziente si apre senza errori', errori.length === 0, errori.join(' | '))
  await page.click('#btn-salva-diario')
  await page.waitForTimeout(400)
  const inviati = await page.evaluate(() => window.__chiamate.rpc.filter(x => x.nome === 'save_diary_entry').map(x => x.args.p_data))
  const d = inviati[0] || {}
  check('il diario compilato a mano è manual', d.modalita === 'manual', String(d.modalita))
  check('i quattro cursori continuano ad arrivare (niente tolto)',
        typeof d.dolore === 'number' && typeof d.rigidita === 'number'
        && typeof d.equilibrio === 'number' && typeof d.energia === 'number', JSON.stringify(d).slice(0,200))
  await ctx.close()
}

sez('daily-context-v1 · anteprima del professionista: niente si salva')
{
  const { page, ctx } = await apriPagina(browser, datiPaziente(), 'rapida.html', '?token=' + TOK + '&preview=1')
  page.on('dialog', d => d.accept())
  await page.click('#btn-completa')
  await page.waitForTimeout(400)
  const inviati = await page.evaluate(() => window.__chiamate.rpc.filter(x => x.nome === 'save_diary_entry'))
  check('in anteprima non si salva nessuna seduta', inviati.length === 0, String(inviati.length))
  await ctx.close()
}

// ══════════════════════════════════════════════════════════════════════
// video-guida-v1 — LA SEZIONE CHE SPIEGA IL METODO
// ══════════════════════════════════════════════════════════════════════

sez('video-guida-v1 · il vocabolario dei video')
{
  const src = fs.readFileSync(path.join(ROOT,'js','video-guida.js'),'utf8')
  check('js/video-guida.js esiste e ha il marker', src.includes('video-guida-v1'))
  // Si contano gli id DENTRO l'elenco, non quello dell'esempio nel commento
  // in cima: contando tutto il file venivano 7 e il numero atteso mentiva.
  const elenco = senzaCommenti(src.slice(src.indexOf('gruppi:')))
  const ids = [...new Set((elenco.match(/id: '[A-Za-z0-9_-]{8,}'/g) || []))]
  check('ci sono i 5 video attivi', ids.length === 5, String(ids.length) + ' -> ' + ids.join(','))
  // Quello che e' stato messo da parte deve restare NEL FILE ma FUORI
  // dall'elenco. Si controlla dopo aver tolto i commenti, se no il conto
  // non tornerebbe mai (lezione del METODO sulle rimozioni).
  check('le tre lezioni sono messe da parte, non cancellate',
        src.includes('vmPyz39cvdo') && !elenco.includes('vmPyz39cvdo'))
  // ⚖️ Il controllo che conta: nessuno SCHEMA finisce nella card. Sono
  // esercizi, e in una sezione aperta a tutti sarebbero esercizi dati a
  // chi non li ha ricevuti da nessuno.
  for (const schema of ['mB7A5iJ68hI','gUeRn0nIheA','nRtbWXgxYos','A429Dfpz78g','wtH60FI6EWk']) {
    check('lo schema ' + schema + ' NON è nella card', !elenco.includes(schema))
  }
  check('e restano scritti nel file, per assegnarli al singolo paziente',
        ['mB7A5iJ68hI','gUeRn0nIheA','nRtbWXgxYos','A429Dfpz78g','wtH60FI6EWk'].every(x => src.includes(x)))
  check('l\'inquadramento posturale (materiale per professionisti) resta fuori',
        !elenco.includes('AjCXsu9uPyQ'))
  check('il primo è «Uso generale»', src.indexOf('4Rr9da0nrZQ') > 0 && src.indexOf('4Rr9da0nrZQ') < src.indexOf('y5QjsQDtjMw'))
  check('c\'è l\'avviso che il programma resta quello del professionista',
        src.includes('chiedi al tuo') && src.includes('fisioterapista'))
  const home = fs.readFileSync(path.join(ROOT,'protocollo.html'),'utf8')
  check('nessun id di YouTube scritto dentro protocollo.html (un elenco solo)',
        !/[?&]v=|youtu\.be\/[A-Za-z0-9_-]{8}|embed\/[A-Za-z0-9_-]{8}/.test(home.replace(/embed\/' \+ id/g,'')),
        'trovato un video scritto a mano nella pagina')
  check('protocollo.html carica js/video-guida.js', home.includes('src="js/video-guida.js"'))
}

sez('video-guida-v1 · la card nella home')
{
  const { page, ctx, errori } = await apriPagina(browser, datiPaziente(), 'protocollo.html', '?token=' + TOK)
  check('la home si apre senza errori', errori.length === 0, errori.join(' | '))
  check('la card c\'è', await page.isVisible('#btn-video-guida'))
  const testo = await page.textContent('.vg-card')
  check('dice quanti video sono', testo.includes('5 video'), testo.slice(0,90))

  // la prima azione della home resta il programma: la card dei video sta DOPO
  const yStart = await page.evaluate(() => document.querySelector('.btn-start').getBoundingClientRect().top + window.scrollY)
  const yVideo = await page.evaluate(() => document.querySelector('.vg-card').getBoundingClientRect().top + window.scrollY)
  check('la card dei video sta sotto «Inizia gli esercizi», non sopra', yVideo > yStart, yVideo + ' vs ' + yStart)

  check('il pannello parte chiuso', !(await page.isVisible('#vg-corpo')))
  await page.click('#btn-video-guida')
  await page.waitForTimeout(300)
  check('si apre', await page.isVisible('#vg-corpo'))
  const voci = await page.locator('.vg-voce').count()
  check('elenca i 5 video', voci === 5, String(voci))
  check('l\'avviso è dentro il pannello', await page.isVisible('.vg-avviso'))
  check('ogni video ha anche il link a YouTube', (await page.locator('.btn-vg-yt').count()) === 5)

  await page.click('#vg-play-4Rr9da0nrZQ')
  await page.waitForTimeout(300)
  const src1 = await page.getAttribute('#vg-media-4Rr9da0nrZQ iframe', 'src')
  check('parte il video giusto', (src1 || '').includes('embed/4Rr9da0nrZQ'), String(src1))
  check('senza video correlati di altri', (src1 || '').includes('rel=0'))

  await page.click('#vg-play-t1FelAlItF0')
  await page.waitForTimeout(300)
  check('aprendone un altro il primo si spegne',
        (await page.locator('#vg-media-4Rr9da0nrZQ iframe').count()) === 0)
  check('e parte il secondo', (await page.locator('#vg-media-t1FelAlItF0 iframe').count()) === 1)

  await page.click('#btn-vg-chiudi')
  await page.waitForTimeout(300)
  check('chiudendo non resta nessun video acceso dietro',
        (await page.locator('.vg-media iframe').count()) === 0)
  check('il pannello è chiuso', !(await page.isVisible('#vg-corpo')))
  await ctx.close()
}

sez('video-guida-v1 · se il file dei video non arriva, la home regge')
{
  const { page, ctx, errori } = await apriPagina(browser, datiPaziente(), 'protocollo.html', '?token=' + TOK, { blocca: ['**/js/video-guida.js'] })
  check('la home si apre lo stesso, senza errori', errori.length === 0, errori.join(' | '))
  check('il programma si vede comunque', await page.isVisible('.btn-start'))
  check('il diario si vede comunque', await page.isVisible('#btn-salva-diario'))
  check('la card dei video semplicemente non compare', (await page.locator('.vg-card').count()) === 0)
  await ctx.close()
}

sez('rapida-un-click-v1 · un click per finire, e l\'anteprima non blocca più')
{
  const { page, ctx } = await apriPagina(browser, datiPaziente(), 'rapida.html', '?token=' + TOK)
  let avvisi = 0
  page.on('dialog', d => { avvisi++; d.accept() })
  await page.click('#btn-completa')
  await page.waitForTimeout(400)
  check('nessun avviso da chiudere', avvisi === 0, String(avvisi))
  check('si vede la schermata del trofeo', await page.isVisible('#completed-overlay'))
  check('e dice che è stata registrata', (await page.textContent('#completed-sub')).includes('registrata'))
  await page.waitForTimeout(2800)
  check('dopo 2,5 secondi torna da sola al protocollo, senza cliccare',
        page.url().includes('protocollo.html'), page.url())
  await ctx.close()
}

sez('rapida-un-click-v1 · in anteprima si arriva in fondo e si legge come uscirne')
{
  const { page, ctx } = await apriPagina(browser, datiPaziente(), 'rapida.html', '?token=' + TOK + '&preview=1')
  let avvisi = 0
  page.on('dialog', d => { avvisi++; d.accept() })
  await page.click('#btn-completa')
  await page.waitForTimeout(400)
  check('niente avviso che blocca', avvisi === 0, String(avvisi))
  const sub = await page.textContent('#completed-sub')
  check('si vede la schermata finale, come la vede il paziente', await page.isVisible('#completed-overlay'))
  check('dice che è un\'anteprima', sub.includes('ANTEPRIMA'), sub.slice(0,80))
  check('e dice COME uscirne', sub.includes('preview=1'), sub.slice(0,120))
  const inviati = await page.evaluate(() => window.__chiamate.rpc.filter(x => x.nome === 'save_diary_entry'))
  check('e continua a non salvare niente', inviati.length === 0, String(inviati.length))
  await page.waitForTimeout(2800)
  check('in anteprima NON torna da sola: il professionista sta guardando',
        page.url().includes('rapida.html'), page.url())
  await ctx.close()
}

/* ═══════════════════════════════════════════════════════════════════════
   messaggio-professionista-v1
   ═══════════════════════════════════════════════════════════════════════ */

const MSG_VECCHIO = { id:'m-vecchio', patient_id:PID, professional_id:'prof-1',
  testo:'Il primo messaggio.', audio_url:null, autore:'Dott. Baron',
  creato_il:'2026-08-28T09:00:00Z', letto_il:'2026-08-28T18:30:00Z', archiviato:false }
const MSG_NUOVO = { id:'m-nuovo', patient_id:PID, professional_id:'prof-1',
  testo:'Ho aggiornato il programma: da oggi tre volte a settimana.', audio_url:null,
  autore:'Dott. Baron', creato_il:'2026-09-01T09:00:00Z', letto_il:null, archiviato:false }
const MSG_ARCH = { id:'m-arch', patient_id:PID, professional_id:'prof-1',
  testo:'Messaggio archiviato.', audio_url:null, autore:'Dott. Baron',
  creato_il:'2026-08-20T09:00:00Z', letto_il:null, archiviato:true }

function datiMessaggi(opts = {}) {
  const d = datiCartella(opts)
  d.patient_messages = opts.messaggi || [MSG_VECCHIO, MSG_NUOVO, MSG_ARCH]
  return d
}

/* Lato paziente il messaggio NON arriva da una tabella: arriva dalla chiave
   'messaggio' di get_daily_context, gia' scelta dal database. */
function datiPazienteMsg(opts = {}) {
  const d = datiPaziente(opts)
  d.rpc.get_daily_context = Object.prototype.hasOwnProperty.call(opts, 'contesto')
    ? opts.contesto
    : { oggi:'2026-09-02', nome:'Mario', stato:'attivo', reazione:null,
        messaggio: opts.messaggio === undefined ? MSG_NUOVO : opts.messaggio,
        manca_sql: opts.manca || null }
  d.rpc.segna_messaggio_letto = true
  return d
}

const rpcLette = (c) => c.filter(x => x.nome === 'segna_messaggio_letto')

sez('messaggio-professionista-v1 · il file condiviso e le sue parole')
{
  const src = fs.readFileSync(path.join(ROOT,'js','messaggio-paziente.js'),'utf8')
  check('js/messaggio-paziente.js esiste e ha il marker', src.includes('messaggio-professionista-v1'))
  check('le parole rivolte al paziente stanno in un punto solo', src.includes('var PAROLE = {'))
  check('non interroga il database da solo (nessun .from())', !senzaCommenti(src).includes('.from('))
  check('non rompe mai la home: ogni via d\'ingresso è protetta',
    (senzaCommenti(src).match(/catch/g) || []).length >= 3)
  check('protocollo.html lo carica', fs.readFileSync(path.join(ROOT,'protocollo.html'),'utf8').includes('src="js/messaggio-paziente.js"'))
  const mig = fs.readFileSync(path.join(ROOT,'db/migrations/041_daily_context.sql'),'utf8')
  check('⚠️ la tabella non ha nessuna colonna «risposta»: non e\' una chat',
    !/\brisposta\b\s+text/i.test(mig.split('create table if not exists public.patient_messages')[1].split(');')[0]))
}

sez('messaggio-professionista-v1 · il paziente lo vede, e sopra il programma')
{
  const { page, ctx, errori } = await apriPagina(browser, datiPazienteMsg(), 'protocollo.html', '?token=' + TOK)
  check('la home si apre senza errori', errori.length === 0, errori.join(' | '))
  check('la card c\'è', await page.isVisible('#mp-card'))
  const t = await page.textContent('#mp-card')
  check('si legge il messaggio', t.includes('tre volte a settimana'), t.slice(0,90))
  check('e si legge da CHI arriva', t.includes('Dott. Baron'), t.slice(0,90))

  /* 📏 «sopra» si misura. */
  const pos = await page.evaluate(() => {
    const c = document.getElementById('mp-card')
    const b = document.querySelector('.btn-start')
    const v = document.querySelector('.vg-card')
    return { card: c ? c.getBoundingClientRect().top : null,
             inizia: b ? b.getBoundingClientRect().top : null,
             video: v ? v.getBoundingClientRect().top : null }
  })
  check('il messaggio sta SOPRA «Inizia gli esercizi»', pos.card < pos.inizia, JSON.stringify(pos))
  check('e la card dei video resta sotto, dov\'era', pos.video > pos.inizia, JSON.stringify(pos))

  /* ⚠️ La regola di Giuliano e' «la prima AZIONE resta il programma». La card
     regge solo se non ha nessuna azione: nessun pulsante, nessun link. */
  const azioni = await page.evaluate(() => document.querySelectorAll('#mp-card button, #mp-card a').length)
  check('⚠️ la card non ha nessun pulsante: non compete con l\'unica azione gialla', azioni === 0, String(azioni))
  check('e «Inizia gli esercizi» e\' ancora l\'unico pulsante giallo della home',
    (await page.evaluate(() => document.querySelectorAll('.btn-start').length)) === 1)

  const lette = await page.evaluate(() => window.__chiamate.rpc.filter(x => x.nome === 'segna_messaggio_letto'))
  check('lo segna come letto una volta sola', lette.length === 1, JSON.stringify(lette))
  check('e segna QUEL messaggio', (lette[0] || {}).args?.p_message_id === 'm-nuovo', JSON.stringify(lette[0]))
  await ctx.close()
}

sez('messaggio-professionista-v1 · un messaggio gia\' letto non si rimarca')
{
  const { page, ctx } = await apriPagina(browser, datiPazienteMsg({ messaggio: MSG_VECCHIO }), 'protocollo.html', '?token=' + TOK)
  check('la card c\'è lo stesso', await page.isVisible('#mp-card'))
  const lette = await page.evaluate(() => window.__chiamate.rpc.filter(x => x.nome === 'segna_messaggio_letto'))
  check('⚠️ la prima volta e\' l\'unica che conta: non si riscrive la data', lette.length === 0, JSON.stringify(lette))
  await ctx.close()
}

sez('messaggio-professionista-v1 · in anteprima non si salva niente')
{
  const { page, ctx } = await apriPagina(browser, datiPazienteMsg(), 'protocollo.html', '?token=' + TOK + '&preview=1')
  check('il professionista lo vede come lo vede il paziente', await page.isVisible('#mp-card'))
  const lette = await page.evaluate(() => window.__chiamate.rpc.filter(x => x.nome === 'segna_messaggio_letto'))
  check('ma NON risulta letto: la barra gialla promette che non si salva niente', lette.length === 0, JSON.stringify(lette))
  await ctx.close()
}

sez('messaggio-professionista-v1 · niente messaggio, niente card')
{
  const { page, ctx, errori } = await apriPagina(browser, datiPazienteMsg({ messaggio: null }), 'protocollo.html', '?token=' + TOK)
  check('nessun errore', errori.length === 0, errori.join(' | '))
  check('nessuna card', (await page.locator('#mp-card').count()) === 0)
  check('e nessuno spazio vuoto lasciato lì',
    (await page.evaluate(() => document.getElementById('mp-card-paziente').getBoundingClientRect().height)) === 0)
  check('il programma resta al suo posto', await page.isVisible('.btn-start'))
  await ctx.close()
}

sez('messaggio-professionista-v1 · un messaggio senza testo non è un messaggio')
{
  const vuoto = Object.assign({}, MSG_NUOVO, { testo:'   ', audio_url:null })
  const { page, ctx, errori } = await apriPagina(browser, datiPazienteMsg({ messaggio: vuoto }), 'protocollo.html', '?token=' + TOK)
  check('nessun errore', errori.length === 0, errori.join(' | '))
  check('non compare una card vuota', (await page.locator('#mp-card').count()) === 0)
  const lette = await page.evaluate(() => window.__chiamate.rpc.filter(x => x.nome === 'segna_messaggio_letto'))
  check('e non si segna letto qualcosa che non si è visto', lette.length === 0)
  await ctx.close()
}

sez('messaggio-professionista-v1 · l\'audio, quando arriverà, si sente già')
{
  const conAudio = Object.assign({}, MSG_NUOVO, { testo:null, audio_url:'/mp3/x.mp3' })
  const { page, ctx } = await apriPagina(browser, datiPazienteMsg({ messaggio: conAudio }), 'protocollo.html', '?token=' + TOK)
  check('la card compare anche col solo audio', await page.isVisible('#mp-card'))
  check('e c\'è il lettore', (await page.locator('#mp-card audio').count()) === 1)
  await ctx.close()
}

sez('messaggio-professionista-v1 · il testo del messaggio non è markup')
{
  const cattivo = Object.assign({}, MSG_NUOVO, { testo:'<img src=x onerror="window.__bum=1">grassetto', autore:'<b>Dott.</b>' })
  const { page, ctx } = await apriPagina(browser, datiPazienteMsg({ messaggio: cattivo }), 'protocollo.html', '?token=' + TOK)
  check('non è finito niente in esecuzione', (await page.evaluate(() => window.__bum)) === undefined)
  check('nessun tag entrato nella pagina', (await page.locator('#mp-card img, #mp-card b').count()) === 0)
  check('il testo si legge com\'è stato scritto', (await page.textContent('#mp-card')).includes('grassetto'))
  await ctx.close()
}

sez('messaggio-professionista-v1 · se la SQL manca, lo legge il professionista e non il paziente')
{
  const q = { messaggio: null, manca: 'db/migrations/041_daily_context.sql' }
  const a = await apriPagina(browser, datiPazienteMsg(q), 'protocollo.html', '?token=' + TOK + '&preview=1')
  check('in anteprima si legge QUALE file .sql manca',
    (await a.page.textContent('#mp-manca')).includes('041_daily_context.sql'))
  await a.ctx.close()
  const b = await apriPagina(browser, datiPazienteMsg(q), 'protocollo.html', '?token=' + TOK)
  check('⚠️ al paziente non si mostra il nome di un file .sql', !(await b.page.isVisible('#mp-manca')))
  check('e la sua home resta intera', await b.page.isVisible('.btn-start'))
  await b.ctx.close()
}

sez('messaggio-professionista-v1 · se il contesto va storto, la home regge')
{
  const rotto = datiPazienteMsg()
  rotto.rpc.get_daily_context = { error:{ code:'42883', message:'function get_daily_context does not exist' } }
  const { page, ctx, errori } = await apriPagina(browser, rotto, 'protocollo.html', '?token=' + TOK)
  check('nessun errore JS', errori.length === 0, errori.join(' | '))
  check('il programma si vede comunque', await page.isVisible('.btn-start'))
  check('nessuna card a metà', (await page.locator('#mp-card').count()) === 0)
  await ctx.close()
}

sez('messaggio-professionista-v1 · se il file della card non arriva, la home regge')
{
  const { page, ctx, errori } = await apriPagina(browser, datiPazienteMsg(), 'protocollo.html', '?token=' + TOK,
    { blocca: ['**/js/messaggio-paziente.js'] })
  check('la home si apre lo stesso, senza errori', errori.length === 0, errori.join(' | '))
  check('il programma si vede comunque', await page.isVisible('.btn-start'))
  check('il diario si vede comunque', await page.isVisible('#btn-salva-diario'))
  await ctx.close()
}

sez('messaggio-professionista-v1 · il professionista scrive')
{
  const { page, ctx, errori } = await apriPagina(browser, datiMessaggi(), 'paziente.html', '?id=' + PID)
  await page.waitForTimeout(600)
  check('nessun errore JS', errori.length === 0, errori.join(' | '))
  check('il pannello c\'è', await page.isVisible('#sez-messaggi'))
  check('la firma arriva già scritta dal profilo',
    (await page.inputValue('#mp-firma')) === 'Giuliano Baron', await page.inputValue('#mp-firma'))
  check('e si dice a chiare lettere che il paziente non può rispondere',
    (await page.textContent('#sez-messaggi')).includes('Non può rispondere'))

  await page.fill('#mp-testo', 'Fermati se il dolore torna.')
  await page.click('#btn-mp-invia')
  await page.waitForTimeout(500)
  const ins = await page.evaluate(() => window.__chiamate.insert.filter(c => c.tabella === 'patient_messages').map(c => c.riga))
  check('scrive una riga in patient_messages', ins.length === 1, JSON.stringify(ins))
  const r = ins[0] || {}
  check('col paziente giusto', r.patient_id === PID, String(r.patient_id))
  check('col professionista giusto', r.professional_id === 'prof-1', String(r.professional_id))
  check('col testo scritto', r.testo === 'Fermati se il dolore torna.', String(r.testo))
  check('⚠️ e l\'autore per esteso, congelato adesso', r.autore === 'Giuliano Baron', String(r.autore))
  check('nessuna colonna «letto» o «risposta» scritta da qui',
    !('letto_il' in r) && !('risposta' in r), JSON.stringify(r))
  check('il campo si svuota, così non si manda due volte lo stesso',
    (await page.inputValue('#mp-testo')) === '')
  check('e si legge a schermo che è andata', (await page.textContent('#mp-esito')).includes('Inviato'))
  await ctx.close()
}

sez('messaggio-professionista-v1 · un messaggio vuoto non parte')
{
  const { page, ctx } = await apriPagina(browser, datiMessaggi(), 'paziente.html', '?id=' + PID)
  await page.waitForTimeout(600)
  await page.fill('#mp-testo', '    ')
  await page.click('#btn-mp-invia')
  await page.waitForTimeout(300)
  const ins = await page.evaluate(() => window.__chiamate.insert.filter(c => c.tabella === 'patient_messages'))
  check('non scrive niente', ins.length === 0, JSON.stringify(ins))
  check('e dice perché, a schermo', (await page.textContent('#mp-esito')).includes('Scrivi il messaggio'))
  await ctx.close()
}

sez('messaggio-professionista-v1 · doppio click, un messaggio solo')
{
  const { page, ctx } = await apriPagina(browser, datiMessaggi(), 'paziente.html', '?id=' + PID)
  await page.waitForTimeout(600)
  await page.fill('#mp-testo', 'Ci vediamo giovedì.')
  await page.evaluate(() => { const b = document.getElementById('btn-mp-invia'); b.click(); b.click(); b.click() })
  await page.waitForTimeout(600)
  const ins = await page.evaluate(() => window.__chiamate.insert.filter(c => c.tabella === 'patient_messages'))
  check('tre click, una riga sola', ins.length === 1, String(ins.length))
  await ctx.close()
}

sez('messaggio-professionista-v1 · l\'elenco dice QUALE messaggio vede davvero')
{
  const { page, ctx } = await apriPagina(browser, datiMessaggi(), 'paziente.html', '?id=' + PID)
  await page.waitForTimeout(700)
  const el = await page.textContent('#mp-elenco')
  check('⚠️ dice quale sta vedendo adesso', el.includes('lo vede adesso nella sua app'), el.slice(0,200))
  check('⚠️ e dice che gli altri non li vede più', el.includes('non lo vede più'), el.slice(0,200))
  check('uno solo è quello in evidenza',
    (el.match(/lo vede adesso nella sua app/g) || []).length === 1)
  check('di quello letto si legge quando', el.includes('letto il 28/08/2026'), el.slice(0,300))
  check('e di quello nuovo che non è ancora stato aperto', el.includes('non ancora letto'))
  check('l\'archiviato resta nell\'elenco, marcato', el.includes('archiviato'))
  await ctx.close()
}

sez('messaggio-professionista-v1 · «togli dall\'app» archivia, non riscrive e non cancella')
{
  const { page, ctx } = await apriPagina(browser, datiMessaggi(), 'paziente.html', '?id=' + PID)
  await page.waitForTimeout(700)
  await page.click('#mp-arch-m-nuovo')
  await page.waitForTimeout(500)
  const upd = await page.evaluate(() => window.__chiamate.update.filter(c => c.tabella === 'patient_messages').map(c => c.patch))
  check('scrive solo archiviato: true', upd.length === 1 && upd[0].archiviato === true, JSON.stringify(upd))
  check('⚠️ non tocca il testo: un messaggio letto che cambia parole è documentazione riscritta',
    !('testo' in (upd[0] || {})) && !('autore' in (upd[0] || {})), JSON.stringify(upd))
  const del = await page.evaluate(() => window.__chiamate.delete.filter(c => c.tabella === 'patient_messages'))
  check('e non cancella niente', del.length === 0, JSON.stringify(del))
  const el = await page.textContent('#mp-elenco')
  check('ora il paziente vede quello prima', el.includes('lo vede adesso nella sua app'))
  await ctx.close()
}

sez('messaggio-professionista-v1 · se manca la migration, si legge quale file lanciare')
{
  const { page, ctx, errori } = await apriPagina(browser, datiMessaggi({ senzaMessaggi:true }), 'paziente.html', '?id=' + PID)
  await page.waitForTimeout(700)
  check('la scheda non esplode', errori.length === 0, errori.join(' | '))
  check('⚠️ e si legge il nome del file .sql da lanciare',
    (await page.textContent('#mp-elenco')).includes('041_daily_context.sql'),
    await page.textContent('#mp-elenco'))
  await page.fill('#mp-testo', 'Prova.')
  await page.click('#btn-mp-invia')
  await page.waitForTimeout(500)
  check('e anche provando a inviare, il motivo resta scritto',
    (await page.textContent('#mp-esito')).includes('041_daily_context.sql'),
    await page.textContent('#mp-esito'))
  await ctx.close()
}

/* ═══════════════════════════════════════════════════════════════════════
   messaggio-scade-v1 — sette giorni, poi non arriva più
   ═══════════════════════════════════════════════════════════════════════ */

const giorniFa = (n) => new Date(Date.now() - n * 864e5).toISOString()

sez('messaggio-scade-v1 · chi decide è la RPC, non la pagina')
{
  const sql = fs.readFileSync(path.join(ROOT,'rpc_patient_functions.sql'),'utf8')
  const blocco = sql.split('IL MESSAGGIO DEL PROFESSIONISTA')[1].split('END;')[0]
  check('get_daily_context non manda più i messaggi vecchi',
    /creato_il\s*>\s*now\(\)\s*-\s*interval\s*'7 days'/.test(blocco), blocco.slice(-260))
  check('e la riga porta il marker', blocco.includes('messaggio-scade-v1'))
  const h = fs.readFileSync(path.join(ROOT,'paziente.html'),'utf8')
  check('⚠️ il numero sta in un punto solo nella pagina (una costante, non sparso)',
    (senzaCommentiHtml(h).match(/const MP_GIORNI = 7/g) || []).length === 1)
  check('e il professionista legge la regola prima di scrivere, non dopo',
    h.includes('per <strong>7 giorni</strong>; poi sparisce da solo'))
}

sez('messaggio-scade-v1 · il pannello dice quanti giorni restano')
{
  const dati = datiMessaggi({ messaggi: [
    Object.assign({}, MSG_NUOVO, { id:'m-fresco', creato_il: giorniFa(3), letto_il:null }),
    Object.assign({}, MSG_VECCHIO, { id:'m-scaduto', creato_il: giorniFa(9), letto_il:null })
  ] })
  const { page, ctx, errori } = await apriPagina(browser, dati, 'paziente.html', '?id=' + PID)
  await page.waitForTimeout(700)
  check('nessun errore JS', errori.length === 0, errori.join(' | '))
  const el = await page.textContent('#mp-elenco')
  check('di quello di 3 giorni fa dice che lo vede ancora', el.includes('lo vede adesso nella sua app'), el.slice(0,240))
  check('e quanti giorni gli restano', el.includes('ancora 4 giorni'), el.slice(0,240))
  check('⚠️ quello di 9 giorni fa è marcato scaduto', el.includes('scaduto dopo 7 giorni — non lo vede più'), el.slice(0,300))
  check('e su uno scaduto non si offre di toglierlo: è già sparito',
    (await page.locator('#mp-arch-m-scaduto').count()) === 0)
  check('mentre su quello vivo il pulsante c\'è',
    (await page.locator('#mp-arch-m-fresco').count()) === 1)
  await ctx.close()
}

sez('messaggio-scade-v1 · se il più recente è scaduto, non è «quello che vede»')
{
  const dati = datiMessaggi({ messaggi: [
    Object.assign({}, MSG_NUOVO, { id:'m-a', creato_il: giorniFa(8) }),
    Object.assign({}, MSG_VECCHIO, { id:'m-b', creato_il: giorniFa(20) })
  ] })
  const { page, ctx } = await apriPagina(browser, dati, 'paziente.html', '?id=' + PID)
  await page.waitForTimeout(700)
  const el = await page.textContent('#mp-elenco')
  check('⚠️ nessuno risulta «lo vede adesso»: il database non gli manda più niente',
    !el.includes('lo vede adesso nella sua app'), el.slice(0,300))
  check('e sono scaduti tutti e due', (el.match(/scaduto dopo 7 giorni/g) || []).length === 2, el.slice(0,300))
  await ctx.close()
}

sez('messaggio-scade-v1 · appena inviato, sette giorni pieni')
{
  const { page, ctx } = await apriPagina(browser, datiMessaggi({ messaggi: [] }), 'paziente.html', '?id=' + PID)
  await page.waitForTimeout(600)
  await page.fill('#mp-testo', 'Ci vediamo giovedì.')
  await page.click('#btn-mp-invia')
  await page.waitForTimeout(600)
  const el = await page.textContent('#mp-elenco')
  check('subito dopo l\'invio dice che lo vede', el.includes('lo vede adesso nella sua app'), el.slice(0,240))
  check('con sette giorni davanti', el.includes('ancora 7 giorni'), el.slice(0,240))
  await ctx.close()
}

sez('messaggio-professionista-v1 · quello che scrive il professionista non è markup')
{
  const dati = datiMessaggi({ messaggi: [Object.assign({}, MSG_NUOVO, { testo:'<img src=x onerror="window.__bum=1">ciao' })] })
  const { page, ctx } = await apriPagina(browser, dati, 'paziente.html', '?id=' + PID)
  await page.waitForTimeout(700)
  check('non è finito niente in esecuzione', (await page.evaluate(() => window.__bum)) === undefined)
  check('il testo si rilegge com\'è stato scritto', (await page.textContent('#mp-elenco')).includes('ciao'))
  await ctx.close()
}

} finally {
  await browser.close()
  server.close()
}

console.log('\n' + '═'.repeat(64))
console.log(ok + ' controlli passati, ' + ko + ' falliti')
if (ko) { console.log('\nFALLITI:'); fallite.forEach(f => console.log(' • ' + f)) }
process.exit(ko ? 1 : 0)
