/* prova-foto-archivio.mjs — foto-archivio-v1
 *
 * Scheda paziente (paziente.html): le foto non si cancellano più, non si
 * sovrascrivono fra loro, hanno data e ora, e nello storage il nome del file
 * porta numero progressivo, data, ora e casella.
 * Il finto risponde alle tre RPC della migration 058 con le STESSE regole
 * provate in PostgreSQL, e sa anche fare il database dove la 058 non c'è.
 *
 *   npm i --no-save playwright && node prova-foto-archivio.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const PORT = 8491
const PID = '11111111-2222-3333-4444-555555555555'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.json':'application/json' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  if (u.startsWith('/foto/')) { res.writeHead(200, { 'Content-Type':'image/png' }); res.end(PNG); return }
  const f = path.join(ROOT, u === '/' ? 'index.html' : u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
  res.end(fs.readFileSync(f))
})

let ok = 0, ko = 0
const fallite = []
function check(nome, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + nome) }
  else { ko++; fallite.push(nome); console.log('  ❌ ' + nome + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 600) : '')) }
}
const sez = t => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 60 - t.length)))

const FINTO = (DB) => {
  window.__DB = DB
  window.__chiamate = { insert: [], update: [], upload: [], rimossi: [], rpc: [] }
  const lento = (v, ms) => new Promise(r => setTimeout(() => r(v), ms || 0))
  const err = (code, message) => ({ data: null, error: { code, message } })
  const manca058 = n => DB.opts.senza058 && (n === 'foto_storico' || /^foto_(registra|scheda_imposta|segna_sostituita)$/.test(n))

  function filtra(righe, filtri) {
    return righe.filter(r => filtri.every(f => {
      if (f.op === 'eq') return String(r[f.col]) === String(f.val)
      if (f.op === 'in') return f.val.map(String).indexOf(String(r[f.col])) >= 0
      if (f.op === 'is') return f.val === null ? r[f.col] == null : r[f.col] === f.val
      if (f.op === 'neq') return String(r[f.col]) !== String(f.val)
      return true
    }))
  }
  function tabella(nome) {
    const st = { filtri: [], op: 'select' }
    const q = {
      select() { return q },
      eq(c, v) { st.filtri.push({ op:'eq', col:c, val:v }); return q },
      neq(c, v) { st.filtri.push({ op:'neq', col:c, val:v }); return q },
      in(c, v) { st.filtri.push({ op:'in', col:c, val:v }); return q },
      is(c, v) { st.filtri.push({ op:'is', col:c, val:v }); return q },
      gte() { return q }, lte() { return q }, gt() { return q }, lt() { return q }, ilike() { return q }, or() { return q }, not() { return q },
      order(c, o) { st.ordine = { c, asc: !(o && o.ascending === false) }; return q },
      limit(n) { st.limite = n; return q },
      range() { return q },
      single() { return q.esegui(true) },
      maybeSingle() { return q.esegui(true) },
      esegui(single) {
        if (manca058(nome)) return Promise.resolve(err('42P01', 'relation "public.' + nome + '" does not exist'))
        if (st.op === 'update') {
          const righe = filtra(DB[nome] || [], st.filtri)
          righe.forEach(r => Object.assign(r, st.patch))
          return Promise.resolve({ data: righe, error: null })
        }
        let righe = filtra(DB[nome] || [], st.filtri)
        if (st.ordine) righe = righe.slice().sort((a, b) => (a[st.ordine.c] > b[st.ordine.c] ? 1 : -1) * (st.ordine.asc ? 1 : -1))
        if (st.limite != null) righe = righe.slice(0, st.limite)
        return Promise.resolve(single ? { data: righe[0] || null, error: null } : { data: righe, error: null })
      },
      then(res, rej) { return q.esegui(false).then(res, rej) },
      insert(riga) {
        window.__chiamate.insert.push({ tabella: nome, riga })
        const s = Object.assign({ id: 'new-' + Math.random() }, riga)
        ;(DB[nome] = DB[nome] || []).push(s)
        const p = Promise.resolve({ data: s, error: null })
        p.select = () => ({ maybeSingle: () => Promise.resolve({ data: s, error: null }), single: () => Promise.resolve({ data: s, error: null }) })
        return p
      },
      update(patch) {
        window.__chiamate.update.push({ tabella: nome, patch })
        st.op = 'update'; st.patch = patch
        return q
      },
      upsert(r) { return Promise.resolve({ data: r, error: null }) },
      delete() { st.op = 'delete'; return { eq: (c, v) => { DB[nome] = (DB[nome] || []).filter(r => String(r[c]) !== String(v)); return Promise.resolve({ data: null, error: null }) } } }
    }
    return q
  }

  // ── le tre RPC della 058, con le stesse regole provate in PostgreSQL ──
  function prossimo(pid) { return (DB.foto_storico || []).filter(r => r.patient_id === pid).reduce((m, r) => Math.max(m, r.numero), 0) + 1 }
  const RPC058 = {
    foto_registra(a) {
      const n = prossimo(a.p_patient)
      const r = { id: 'sto-' + n + '-' + Math.random().toString(36).slice(2, 6), patient_id: a.p_patient, numero: n, origine: a.p_origine, casella: a.p_casella,
        visit_id: a.p_visit, storage_path: null, scattata_il: a.p_scattata || new Date().toISOString(), sostituita_il: null, eliminata_il: null }
      ;(DB.foto_storico = DB.foto_storico || []).push(r)
      return { id: r.id, numero: n }
    },
    foto_scheda_imposta(a) {
      const p = DB.patients.find(x => x.id === a.p_patient)
      if (!p) return { error: { code: '42501', message: 'paziente non trovato o non autorizzato' } }
      let obj; try { obj = JSON.parse(p.foto_url || '{}') || {} } catch (e) { return { error: { code: 'P0001', message: 'foto_url del paziente non leggibile: non lo tocco' } } }
      const prima = obj[a.p_slot] === undefined ? null : obj[a.p_slot]
      if (a.p_valore == null) delete obj[a.p_slot]; else obj[a.p_slot] = a.p_valore
      p.foto_url = JSON.stringify(obj)
      return { foto_url: p.foto_url, prima }
    },
    foto_segna_sostituita(a) {
      const sto = DB.foto_storico = DB.foto_storico || []
      const libere = sto.filter(r => r.patient_id === a.p_patient && r.storage_path === a.p_path && !r.sostituita_il)
      if (libere.length) { libere.forEach(r => r.sostituita_il = new Date().toISOString()); return libere.length }
      if (sto.some(r => r.patient_id === a.p_patient && r.storage_path === a.p_path)) return 0
      sto.push({ id: 'sto-v-' + Math.random(), patient_id: a.p_patient, numero: prossimo(a.p_patient), origine: a.p_origine, casella: a.p_casella,
        storage_path: a.p_path, scattata_il: a.p_scattata, sostituita_il: new Date().toISOString(), eliminata_il: null })
      return 1
    }
  }

  window.supabase = {
    createClient() {
      return {
        rpc(nome, args) {
          window.__chiamate.rpc.push({ nome, args })
          if (manca058(nome)) return Promise.resolve(err('PGRST202', 'Could not find the function public.' + nome + ' in the schema cache'))
          if (RPC058[nome]) {
            const v = RPC058[nome](args)
            return lento(v && v.error ? { data: null, error: v.error } : { data: v, error: null }, DB.opts.rpcMs || 0)
          }
          const r = (DB.rpc || {})[nome]
          return Promise.resolve({ data: typeof r === 'function' ? r(args) : (r === undefined ? null : r), error: null })
        },
        auth: {
          getSession: () => Promise.resolve({ data: { session: { access_token: 'tok', user: { id: 'user-1', email: 'studio@esempio.it' } } } }),
          getUser: () => Promise.resolve({ data: { user: { id: 'user-1', email: 'studio@esempio.it' } } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: () => Promise.resolve({})
        },
        from: tabella,
        channel() { const c = { on() { return c }, subscribe() { return c } }; return c },
        removeChannel() {},
        functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
        storage: {
          from() {
            return {
              upload(p) {
                window.__chiamate.upload.push(p)
                if (DB.opts.uploadRotto) return lento({ data: null, error: { message: 'rete assente' } }, 10)
                DB.file[p] = true
                return lento({ data: { path: p }, error: null }, DB.opts.uploadMs || 0)
              },
              createSignedUrl(p) { return Promise.resolve({ data: { signedUrl: DB.file[p] ? '/foto/' + encodeURIComponent(p) + '.png' : null }, error: null }) },
              createSignedUrls(ps) { return Promise.resolve({ data: ps.map(p => ({ path: p, signedUrl: DB.file[p] ? '/foto/' + encodeURIComponent(p) + '.png' : null })), error: null }) },
              getPublicUrl(p) { return { data: { publicUrl: 'http://pubblico/clinical-docs/' + p } } },
              remove(ps) { [].concat(ps).forEach(p => { window.__chiamate.rimossi.push(p); delete DB.file[p] }); return Promise.resolve({ data: null, error: null }) },
              list() { return Promise.resolve({ data: [], error: null }) }
            }
          }
        }
      }
    }
  }
}

const VECCHIO = PID + '/iniziali/prima-sx_1751328000000.jpg'
const CONDIVISO = PID + '/iniziali/frontale_1751328000000.jpg'
function datiBase(opts = {}) {
  return {
    opts,
    file: { [VECCHIO]: true, [CONDIVISO]: true, 'visits/v1/frontale_1751400000000.jpg': true },
    patients: [{ id: PID, nome: 'Mario', cognome: 'Rossi', professional_id: 'prof-1', created_at: '2024-01-01T08:00:00Z',
      foto_url: JSON.stringify({ 'prima-sx': { storage_path: VECCHIO }, 'frontale': { storage_path: CONDIVISO } }) }],
    professionals: [{ id: 'prof-1', user_id: 'user-1', email: 'studio@esempio.it', nome: 'Studio', piano: 'premium' }],
    visits: [{ id: 'v1', patient_id: PID, data_visita: '2025-07-02T09:00:00Z', tipo: 'posturale' }],
    visit_photos: [
      { id: 'vp1', visit_id: 'v1', tipo: 'frontale_pre', storage_path: 'visits/v1/frontale_1751400000000.jpg', data_scatto: '2025-07-02T09:15:00Z' },
      { id: 'vp2', visit_id: 'v1', tipo: 'sagittale_pre', storage_path: CONDIVISO, data_scatto: null }
    ],
    foto_storico: [],
    rpc: {}
  }
}

async function apri(browser, dati, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  for (const p of (opts.blocca || [])) await ctx.route(p, r => r.abort())
  await ctx.route('**://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* finto */' }))
  await ctx.route('**://cdnjs.cloudflare.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* finto */' }))
  await ctx.route('**://unpkg.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* finto */' }))
  await ctx.route('**://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await ctx.route('**://fonts.gstatic.com/**', r => r.abort())
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  const page = await ctx.newPage()
  const errori = []
  page.on('pageerror', e => errori.push(String(e)))
  page.on('dialog', d => d.accept())
  await page.addInitScript(FINTO, dati)
  await page.goto('http://localhost:' + PORT + '/paziente.html?id=' + PID, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  return { page, ctx, errori }
}

const DATAURL = 'data:image/png;base64,' + PNG.toString('base64')
const db = page => page.evaluate(() => window.__DB)
const ch = page => page.evaluate(() => window.__chiamate)
const casella = (db, s) => { try { return JSON.parse(db.patients[0].foto_url || '{}')[s] } catch (e) { return 'ROTTO' } }
const percorso = v => v && typeof v === 'object' ? v.storage_path : v

server.listen(PORT)
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] })

try {
  sez('Funzioni pure di js/foto-archivio.js')
  {
    const { page, ctx, errori } = await apri(browser, datiBase())
    check('la pagina si apre senza errori JS', errori.length === 0, errori)
    const r = await page.evaluate(() => {
      const A = window.PolFotoArchivio
      const ms = new Date(2026, 9, 15, 17, 42, 3).getTime()
      return {
        nome: A.nomeFile(42, 'prima-sx', ms, 'jpg'),
        senza: A.nomeFile(null, 'prima-sx', ms, 'jpg'),
        sporca: A.nomeFile(7, '../Prima SX!', ms, 'JPG'),
        ms,
        data: A.dataDaPercorso(A.nomeFile(42, 'prima-sx', ms, 'jpg')),
        num: A.numeroDaPercorso('pid/iniziali/' + A.nomeFile(42, 'prima-sx', ms, 'jpg')),
        numVecchio: A.numeroDaPercorso('pid/iniziali/prima-sx_1751328000000.jpg'),
        dataVecchia: A.dataDaPercorso('pid/iniziali/prima-sx.jpg'),
        dataOra: A.dataOra(new Date(ms).toISOString()),
        giorno: A.dataOra(new Date(ms).toISOString(), true),
        nulla: A.dataOra(null),
        rotta: A.dataOra('boh'),
        versione: A.versione
      }
    })
    check('nome file = n0042_2026-10-15_17-42_prima-sx_<ms>.jpg', r.nome === 'n0042_2026-10-15_17-42_prima-sx_' + r.ms + '.jpg', r.nome)
    check('senza numero (058 mancante) = prima-sx_<ms>.jpg, come prima', r.senza === 'prima-sx_' + r.ms + '.jpg', r.senza)
    check('una casella strana non esce dalla cartella (niente / né spazi)', !/[\/ !]/.test(r.sporca) && r.sporca.endsWith('_' + r.ms + '.jpg'), r.sporca)
    check('la data si rilegge dal nome nuovo come dal vecchio (_dataDaPercorso)', r.data === new Date(r.ms).toISOString(), r.data)
    check('il numero si rilegge dal nome', r.num === 42 && r.numVecchio === null, [r.num, r.numVecchio])
    check('un nome vecchio senza numero → data null, non inventata', r.dataVecchia === null)
    check('dataOra = «15/10/2026 · 17:42»', r.dataOra === '15/10/2026 · 17:42', r.dataOra)
    check('solo giorno quando l\'ora non è della foto', r.giorno === '15/10/2026', r.giorno)
    check('«data non registrata» se manca o è rotta', r.nulla === 'data non registrata' && r.rotta === 'data non registrata')
    check('marker foto-archivio-v1 nel file js', r.versione === 'foto-archivio-v1')
    await ctx.close()
  }

  sez('Scatto nella scheda: nome, numero, ora, foto vecchia NON persa')
  {
    const { page, ctx, errori } = await apri(browser, datiBase())
    const t0 = Date.now()
    const esito = await page.evaluate(d => salvaFotoScheda('prima-sx', d), DATAURL)
    const D = await db(page), C = await ch(page)
    const nuovo = percorso(casella(D, 'prima-sx'))
    check('salvataggio riuscito', esito === true)
    check('il file è nella cartella iniziali col numero 1', /\/iniziali\/n0001_\d{4}-\d\d-\d\d_\d\d-\d\d_prima-sx_\d{13}\.png$/.test(nuovo || ''), nuovo)
    check('il nome finisce coi millisecondi dello scatto', Number(/_(\d{13})\./.exec(nuovo)[1]) >= t0)
    check('caricato con upsert:false (mai sopra un altro file)', C.upload.length === 1)
    check('la casella frontale NON è stata toccata', percorso(casella(D, 'frontale')) === CONDIVISO)
    const reg = D.foto_storico.find(r => r.storage_path === nuovo)
    check('nel registro: numero 1, origine scheda, ora dello scatto', reg && reg.numero === 1 && reg.origine === 'scheda' && !!reg.scattata_il, reg)
    const vecchia = D.foto_storico.find(r => r.storage_path === VECCHIO)
    check('la foto vecchia è nel registro come «sostituita», col numero 2', vecchia && vecchia.sostituita_il && vecchia.numero === 2, vecchia)
    check('la data della foto vecchia viene dal suo nome (01/07/2025)', vecchia && vecchia.scattata_il === new Date(1751328000000).toISOString(), vecchia && vecchia.scattata_il)
    check('nessun file cancellato', C.rimossi.length === 0, C.rimossi)
    check('nessun base64 nel database', D.patients[0].foto_url.indexOf('data:') < 0)
    check('nessun errore JS', errori.length === 0, errori)

    sez('Archivio della scheda: ora e foto sostituite')
    await page.evaluate(() => { _fotoLoaded = false; return caricaFoto() })
    await page.waitForTimeout(300)
    const carte = await page.$$eval('#foto-grid > div', els => els.map(e => ({ t: e.textContent, op: e.getAttribute('style') })))
    const testo = carte.map(c => c.t).join(' | ')
    check('la foto vecchia si vede in archivio', carte.some(c => /sostituita il/.test(c.t)), testo)
    check('…più chiara', carte.some(c => /sostituita il/.test(c.t) && /opacity:\.6/.test(c.op)))
    check('…con la sua data e ora: 01/07/2025 · hh:mm', carte.some(c => /sostituita il/.test(c.t) && /01\/07\/2025 · \d\d:\d\d/.test(c.t)), testo)
    check('la foto nuova ha data e ora di oggi', carte.some(c => c.t.indexOf(new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' · ') >= 0), testo)
    check('la data di creazione del paziente (01/01/2024) non compare più', testo.indexOf('01/01/2024') < 0, testo)
    check('foto di visita con data_scatto → data e ora', /02\/07\/2025 · \d\d:\d\d/.test(testo), testo)
    await ctx.close()
  }

  sez('Due scatti ravvicinati su due caselle: nessuno si perde')
  {
    const dati = datiBase({ uploadMs: 120, rpcMs: 30 })
    const { page, ctx, errori } = await apri(browser, dati)
    await page.evaluate(d => Promise.all([salvaFotoScheda('prima-dx', d), salvaFotoScheda('dopo-sx', d), salvaFotoScheda('dopo-dx', d)]), DATAURL)
    const D = await db(page)
    check('ci sono tutte e tre le caselle nuove', ['prima-dx', 'dopo-sx', 'dopo-dx'].every(s => percorso(casella(D, s))), D.patients[0].foto_url)
    check('le caselle di prima sono rimaste', percorso(casella(D, 'prima-sx')) === VECCHIO && percorso(casella(D, 'frontale')) === CONDIVISO)
    const nums = D.foto_storico.map(r => r.numero).sort((a, b) => a - b)
    check('numeri 1, 2, 3 senza doppioni', JSON.stringify(nums) === '[1,2,3]', nums)
    check('nessun errore JS', errori.length === 0, errori)
    await ctx.close()
  }

  sez('Il vecchio guasto, rifatto: copia in pagina vecchia (PC + telefono)')
  {
    const { page, ctx } = await apri(browser, datiBase())
    // il telefono ha salvato prima-dx direttamente nel database; questa pagina non lo sa
    await page.evaluate(() => {
      const p = window.__DB.patients[0]; const o = JSON.parse(p.foto_url); o['prima-dx'] = { storage_path: 'x/iniziali/dal-telefono_1760000000000.jpg' }; p.foto_url = JSON.stringify(o)
    })
    await page.evaluate(d => salvaFotoScheda('dopo-sx', d), DATAURL)
    const D = await db(page)
    check('la foto fatta dal telefono è ancora nella sua casella', percorso(casella(D, 'prima-dx')) === 'x/iniziali/dal-telefono_1760000000000.jpg', D.patients[0].foto_url)
    await ctx.close()
  }

  sez('«Elimina» sulla casella: esce dalla casella, resta in archivio')
  {
    const { page, ctx, errori } = await apri(browser, datiBase())
    await page.evaluate(() => polFotoElimina('prima-sx'))
    await page.waitForTimeout(300)
    const D = await db(page), C = await ch(page)
    check('la casella prima-sx è vuota', casella(D, 'prima-sx') === undefined)
    check('il file NON è stato cancellato', C.rimossi.length === 0 && D.file[VECCHIO] === true)
    check('nel registro come sostituita', D.foto_storico.some(r => r.storage_path === VECCHIO && r.sostituita_il))
    check('la casella a schermo è tornata vuota', !(await page.$eval('#slot-prima-sx', e => e.classList.contains('has-photo'))))
    check('nessun errore JS', errori.length === 0, errori)
    await ctx.close()
  }

  sez('Archivio: eliminare la copia «visita» di una foto della scheda')
  {
    const { page, ctx } = await apri(browser, datiBase())
    await page.evaluate(() => { _fotoLoaded = false; return caricaFoto() })
    await page.evaluate(() => _fotoEliminaUno(_allFoto.find(f => f.id === 'vp2')))
    const D = await db(page), C = await ch(page)
    check('la riga della visita è tolta', !D.visit_photos.some(r => r.id === 'vp2'))
    check('il file della scheda NON è cancellato (prima lo era)', C.rimossi.indexOf(CONDIVISO) < 0 && D.file[CONDIVISO] === true, C.rimossi)
    await page.evaluate(() => _fotoEliminaUno(_allFoto.find(f => f.id === 'vp1')))
    const C2 = await ch(page)
    check('un file usato solo dalla visita si cancella ancora (eliminazione voluta)', C2.rimossi.indexOf('visits/v1/frontale_1751400000000.jpg') >= 0, C2.rimossi)
    await ctx.close()
  }

  sez('Caricamento che non riesce (F4A)')
  {
    const { page, ctx, errori } = await apri(browser, datiBase({ uploadRotto: true }))
    await page.evaluate(d => { showFotoPreview('dopo-dx', d); return salvaFotoScheda('dopo-dx', d) }, DATAURL)
    await page.waitForTimeout(200)
    const D = await db(page)
    check('niente nel database: la casella resta vuota', casella(D, 'dopo-dx') === undefined)
    check('niente base64 nel database', D.patients[0].foto_url.indexOf('data:') < 0)
    check('sulla foto c\'è «Foto non salvata — riprova»', (await page.textContent('#slot-dopo-dx')).indexOf('Foto non salvata') >= 0)
    check('le altre caselle intatte', percorso(casella(D, 'prima-sx')) === VECCHIO)
    check('nessun errore JS', errori.length === 0, errori)
    await ctx.close()
  }

  sez('Database SENZA la migration 058: si salva come prima, niente si rompe')
  {
    const { page, ctx, errori } = await apri(browser, datiBase({ senza058: true }))
    const esito = await page.evaluate(d => salvaFotoScheda('dopo-sx', d), DATAURL)
    const D = await db(page)
    const p = percorso(casella(D, 'dopo-sx'))
    check('salvata lo stesso', esito === true && !!p, D.patients[0].foto_url)
    check('nome come prima, senza numero: dopo-sx_<ms>.png', /\/iniziali\/dopo-sx_\d{13}\.png$/.test(p || ''), p)
    check('le altre caselle rilette dal database e tenute', percorso(casella(D, 'prima-sx')) === VECCHIO && percorso(casella(D, 'frontale')) === CONDIVISO)
    check('la pagina sa che manca la 058', await page.evaluate(() => PolFotoArchivio.mancaMigrazione === true))
    await page.evaluate(() => { _fotoLoaded = false; return caricaFoto() })
    check('l\'archivio si apre lo stesso', (await page.$$('#foto-grid > div')).length >= 3)
    check('nessun errore JS', errori.length === 0, errori)
    await ctx.close()
  }

  sez('Se js/foto-archivio.js non arriva: la scheda funziona come prima')
  {
    const { page, ctx, errori } = await apri(browser, datiBase(), { blocca: ['**/js/foto-archivio.js*'] })
    check('PolFotoArchivio assente', await page.evaluate(() => typeof window.PolFotoArchivio === 'undefined'))
    await page.evaluate(d => salvaFotoScheda('dopo-sx', d), DATAURL)
    const D = await db(page)
    check('la foto si salva col percorso di prima', /\/iniziali\/dopo-sx_\d{13}\.png$/.test(percorso(casella(D, 'dopo-sx')) || ''), D.patients[0].foto_url)
    await page.evaluate(() => { _fotoLoaded = false; return caricaFoto() })
    check('l\'archivio si apre', (await page.$$('#foto-grid > div')).length >= 3)
    check('nessun errore JS', errori.length === 0, errori)
    await ctx.close()
  }

  sez('Nel codice: niente più quattro copie del salvataggio')
  {
    const html = fs.readFileSync(path.join(ROOT, 'paziente.html'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const n = (html.match(/polUploadFotoIniziale\(/g) || []).length
    check('polUploadFotoIniziale resta solo nella riserva (1 punto)', n === 1, n)
    check('salvaFotoScheda chiamata dai 4 punti di scatto', (html.match(/await salvaFotoScheda\(slot, dataUrl\)/g) || []).length === 4)
    check('la data di creazione del paziente non è più la data delle foto', html.indexOf('_data: patient.created_at') < 0)
  }
} finally {
  await browser.close(); server.close()
}
console.log('\n' + (ko === 0 ? '✅ TUTTI VERDI' : '❌ ROSSI: ' + ko) + ' — ' + ok + ' ok, ' + ko + ' ko')
if (ko) { console.log(fallite.join('\n')); process.exit(1) }
