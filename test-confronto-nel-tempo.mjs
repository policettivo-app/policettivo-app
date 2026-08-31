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
    professionals: [{ id:'prof-1', user_id:'user-1' }],
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

// ── il finto Supabase, iniettato PRIMA di ogni script della pagina ─────
const FINTO = (DB) => {
  window.__DB = DB
  window.__chiamate = { upsert: [], insert: [], update: [], delete: [], upload: [] }

  function filtra(righe, filtri) {
    return righe.filter(r => filtri.every(f => {
      if (f.op === 'eq') return String(r[f.col]) === String(f.val)
      if (f.op === 'in') return f.val.map(String).indexOf(String(r[f.col])) >= 0
      return true
    }))
  }

  function tabella(nome) {
    const stato = { filtri: [], op: 'select' }
    const q = {
      select() { stato.op = 'select'; return q },
      eq(col, val) { stato.filtri.push({ op:'eq', col, val }); return q },
      in(col, val) { stato.filtri.push({ op:'in', col, val }); return q },
      order() { return q },
      limit() { return q },
      maybeSingle() { return q.then0(true) },
      then0(single) {
        if (nome === 'foto_allineamenti' && DB.opts.erroreAllineamenti) {
          return Promise.resolve({ data:null, error:{ message:'relation "public.foto_allineamenti" does not exist', code:'42P01' } })
        }
        const righe = filtra(DB[nome] || [], stato.filtri)
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
        ;(DB[nome] = DB[nome] || []).push(Object.assign({ id:'new-'+Math.random() }, riga))
        return { select: () => ({ maybeSingle: () => Promise.resolve({ data:riga, error:null }) }),
                 then: (r) => r({ data:riga, error:null }) }
      },
      update(patch) {
        window.__chiamate.update.push({ tabella:nome, patch })
        return { eq: () => Promise.resolve({ data:null, error:null }) }
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

  window.supabase = {
    createClient() {
      return {
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
              remove() { return Promise.resolve({ data:null, error:null }) }
            }
          }
        }
      }
    }
  }
}

async function apri(browser, dati, query = '?id=' + PID) {
  const ctx = await browser.newContext({ viewport:{ width:1280, height:900 } })
  // niente rete verso l'esterno: font e supabase-js dal CDN non servono al test
  await ctx.route('**://cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'text/javascript', body:'/* finto */' }))
  await ctx.route('**://fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }))
  await ctx.route('**://fonts.gstatic.com/**', r => r.abort())
  const page = await ctx.newPage()
  const errori = []
  page.on('pageerror', e => errori.push(String(e)))
  await page.addInitScript(FINTO, dati)
  await page.goto('http://localhost:' + PORT + '/comparazione.html' + query, { waitUntil:'networkidle' })
  await page.waitForTimeout(400)
  return { page, ctx, errori }
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
  check('la scheda dice «caricata il», non «scattata il»', punti[0] && punti[0].n.includes('caricata il'), punti[0])
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

sez('Ingresso dalla valutazione posturale')
{
  const src = fs.readFileSync(path.join(ROOT,'valutazione-posturale.html'),'utf8')
  check('c\'è il pulsante «Confronto nel tempo»', src.includes('📈 Confronto nel tempo'))
  check('la funzione esiste e apre comparazione.html?id=', /function apriConfrontoNelTempo[\s\S]{0,400}comparazione\.html\?id=/.test(src))
  check('il PRE/POST della singola seduta resta dov\'era', src.includes('🔄 Confronto PRE/POST'))
  check('il marker è nel file', (src.match(/confronto-nel-tempo-v1/g) || []).length >= 1)
}

} finally {
  await browser.close()
  server.close()
}

console.log('\n' + '═'.repeat(64))
console.log(ok + ' controlli passati, ' + ko + ' falliti')
if (ko) { console.log('\nFALLITI:'); fallite.forEach(f => console.log(' • ' + f)) }
process.exit(ko ? 1 : 0)
