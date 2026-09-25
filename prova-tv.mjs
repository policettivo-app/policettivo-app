/* prova-tv.mjs — tv-v1
 * La TV comandata dal telefono: collegamento, «Prima e dopo» dentro la TV,
 * test in diretta con i due omini, esito per il paziente.
 *   node prova-tv.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd(), PORT = 8496
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }
const STUB = `<!doctype html><meta charset="utf-8"><body style="background:#000;color:#fff"><h1 id="t">STUB</h1><script>
window.__applicati = []; window.__tvPronta = () => true
window.__tvApplica = st => { window.__applicati.push(st); document.getElementById('t').textContent = 'slide ' + st.slide }
</script>`
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  if (u === '/schermo-paziente.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(STUB); return }
  const f = path.join(ROOT, u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f))
})
let ok = 0, ko = 0; const fallite = []
function check(n, c, x) { if (c) { ok++; console.log('  ✅ ' + n) } else { ko++; fallite.push(n); console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')) } }
function sez(t) { console.log('\n── ' + t) }

const FINTO = (o) => {
  window.__fk = { canali: {}, rpc: [], entrate: 0 }
  let sessione = !!o.sessione
  window.supabase = { createClient() { return {
    auth: {
      getSession: async () => ({ data: { session: sessione ? { user: { id: 'u1' } } : null } }),
      signInWithPassword: async ({ email, password }) => { window.__fk.entrate++; if (password !== 'giusta') return { error: { message: 'no' } }; sessione = true; return { data: {}, error: null } }
    },
    rpc: async (nome) => {
      window.__fk.rpc.push(nome)
      if (nome === 'schermo_canale') return o.senza051 ? { data: null, error: { message: 'Could not find the function public.schermo_canale' } } : { data: 'TV1', error: null }
      if (nome === 'oscillazione_canale') return { data: 'OSC1', error: null }
      return { data: null, error: null }
    },
    channel(nome) { const h = {}; const c = { on(_t, f, cb) { h[f.event] = cb; return c }, subscribe() { return c } }; window.__fk.canali[nome] = h; return c },
    removeChannel() {}
  } } }
  window.__emetti = (can, ev, payload) => { const h = window.__fk.canali[can]; if (!h || !h[ev]) return false; h[ev]({ payload }); return true }
}

await new Promise(r => server.listen(PORT, r))
const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] })
async function apri(o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await ctx.newPage()
  const errori = []; page.on('pageerror', e => errori.push(String(e)))
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
  await page.addInitScript(FINTO, Object.assign({ sessione: true }, o))
  await page.goto('http://localhost:' + PORT + '/tv.html', { waitUntil: 'load' })
  await page.waitForTimeout(400)
  return { page, ctx, errori }
}
const vista = p => p.evaluate(() => window.__tv.vista())

try {
  sez('⛔ la TV non legge tabelle e non salva niente sul televisore')
  {
    const src = fs.readFileSync('tv.html', 'utf8')
    check('⛔ nessuna tabella letta da qui (le foto le legge «Prima e dopo», con le sue regole)', !/\.from\(/.test(src))
    check('⛔ niente memoria locale', !/localStorage|sessionStorage|indexedDB/.test(src))
    check('⭐ chiama solo i due canali', [...src.matchAll(/\.rpc\(\s*'([^']+)'/g)].map(m => m[1]).every(n => n === 'schermo_canale' || n === 'oscillazione_canale'))
    check('è noindex', /noindex/.test(src))
  }

  sez('⭐ collegare la TV: una volta sola, col proprio account')
  {
    const { page, ctx, errori } = await apri({ sessione: false })
    check('⭐ chiede di collegarla', await page.isVisible('#ingresso') && /Collega questa TV/.test(await page.textContent('#ingresso')))
    await page.fill('#ing-email', 'a@b.it'); await page.fill('#ing-pass', 'sbagliata'); await page.click('#ing-entra'); await page.waitForTimeout(200)
    check('credenziali sbagliate: lo dice', /non valide/.test(await page.textContent('#ing-err')))
    await page.fill('#ing-pass', 'giusta'); await page.click('#ing-entra'); await page.waitForTimeout(400)
    check('⭐ con quelle giuste è collegata', !(await page.isVisible('#ingresso')) && /Collegata/.test(await page.textContent('#att-stato')))
    check('nessun errore JS', errori.length === 0, errori)
    await ctx.close()
  }

  sez('⭐⭐ la schermata d’attesa e i due canali')
  {
    const { page, ctx, errori } = await apri()
    check('⭐ si parte dalla schermata d’attesa col marchio', (await vista(page)) === 'attesa' && /Sistema Policettivo®/.test(await page.textContent('#v-attesa')))
    check('⭐ con l’ora', /\d{2}:\d{2}/.test(await page.textContent('#att-ora')))
    const c = await page.evaluate(() => Object.keys(window.__fk.canali))
    check('⭐⭐ ascolta il canale della TV (051) e quello dei test (046)', c.includes('schermo:TV1') && c.includes('oscillazione:OSC1'), c)
    await page.screenshot({ path: '_schermate/tv-attesa.png' })

    sez('⭐⭐ «Prima e dopo» comandato dal telefono')
    const st = { tipo: 'prima-dopo', pid: 'P-1', giorno: 'g1', slide: 'foto:sagittale_dx', gradi: { sagittale_dx: true }, rif: {}, modo: {}, nm: 2 }
    await page.evaluate(s => window.__emetti('schermo:TV1', 'mostra', s), st); await page.waitForTimeout(700)
    check('⭐ la TV passa a «Prima e dopo»', (await vista(page)) === 'pd')
    const pd = await page.evaluate(() => window.__tv.pd())
    check('⭐ apre la pagina di sempre in modalità TV, per quel paziente', /schermo-paziente\.html\?id=P-1&tv=1/.test(pd.src), pd)
    const fr = page.frames().find(f => /schermo-paziente/.test(f.url()))
    const ap = fr ? await fr.evaluate(() => window.__applicati) : []
    check('⭐⭐ e la porta sulla pagina scelta, coi gradi accesi', ap.length >= 1 && ap[ap.length - 1].slide === 'foto:sagittale_dx' && ap[ap.length - 1].gradi.sagittale_dx === true, ap)
    await page.evaluate(s => window.__emetti('schermo:TV1', 'mostra', Object.assign({}, s, { slide: 'sintesi' })), st); await page.waitForTimeout(400)
    const fr2 = page.frames().find(f => /schermo-paziente/.test(f.url()))
    check('⭐ il telefono cambia pagina → la TV la segue, senza ricaricare', fr2 === fr && (await fr2.evaluate(() => window.__applicati.slice(-1)[0].slide)) === 'sintesi')
    await page.evaluate(s => window.__emetti('schermo:TV1', 'mostra', Object.assign({}, s, { nm: 4 })), st); await page.waitForTimeout(700)
    const fr3 = page.frames().find(f => /schermo-paziente/.test(f.url()))
    check('⭐ gradi misurati dopo → la TV ricarica per vederli', fr3 && fr3 !== fr)
    await page.evaluate(() => window.__emetti('schermo:TV1', 'mostra', { tipo: 'attesa' })); await page.waitForTimeout(300)
    check('⭐ «spegni» dal telefono → schermata d’attesa', (await vista(page)) === 'attesa')

    sez('⭐⭐ il test in diretta: gomitolo al centro, omini che si muovono')
    await page.evaluate(() => window.__emetti('oscillazione:OSC1', 'via', { evento: 'beccheggio', occhi: 'aperti', durata: 30, soglia: 2, zb: 1, zg: 0.5, vb: 1, vg: -1 }))
    await page.waitForTimeout(200)
    check('⭐ parte il test → la TV passa alla diretta da sola', (await vista(page)) === 'test')
    // grezzi: beta 2,2 (zero 1) → avanti 1,2 · gamma −0,3 (zero 0,5, verso −1) → destra 0,8
    await page.evaluate(() => { for (let k = 0; k < 4; k++) window.__emetti('oscillazione:OSC1', 'punti', { x: Array(8).fill(-0.3), y: Array(8).fill(2.2) }) })
    await page.waitForTimeout(900)
    check('⭐⭐ omino di profilo (a sinistra): IN AVANTI 1,2°', /1,2°/.test(await page.textContent('#val-ap')) && /IN AVANTI/.test(await page.textContent('#par-ap')), await page.textContent('#asse-ap'))
    check('⭐⭐ omino di fronte (a destra): A DESTRA 0,8° — col verso della taratura', /0,8°/.test(await page.textContent('#val-ds')) && /A DESTRA/.test(await page.textContent('#par-ds')), await page.textContent('#asse-ds'))
    check('⭐ l’asse del test (beccheggio) è evidenziato, l’altro attenuato', await page.$eval('#asse-ap', e => e.classList.contains('test')) && await page.$eval('#asse-ds', e => e.classList.contains('fuori')))
    check('⭐ l’omino si piega davvero', await page.$eval('#om-profilo g', g => /rotate\(\s*[1-9]/.test(g.getAttribute('transform'))))
    check('⭐ il tempo scorre grande', /SECONDI/.test(await page.textContent('#t-tempo')))
    await page.screenshot({ path: '_schermate/tv-test.png' })
    await page.evaluate(() => window.__emetti('oscillazione:OSC1', 'fine', { velocita: 1.8, osc_ap: 1.1, osc_ds: 0.4, carico_avanti: 1.9, carico_destra: 0.8, asse: 'beta', evento: 'beccheggio', occhi: 'aperti', colore: '#b07500', soglia: 2 }))
    await page.waitForTimeout(700)
    check('⭐⭐ finito → «Com’è andata»', (await vista(page)) === 'esito')
    const e = await page.textContent('#v-esito')
    check('⭐ dove sta il peso, in grande: «Più in avanti 1,9°»', /Più in avanti/.test(e) && /1,9°/.test(e), e.slice(0, 200))
    check('⭐ i tre omini', (await page.$$('#e-omini .omino')).length === 3)
    check('⭐ la spiegazione per il paziente', /Di profilo, il peso va più in AVANTI/.test(e) && /non chili/.test(e))
    await page.screenshot({ path: '_schermate/tv-esito.png' })
    check('nessun errore JS', errori.length === 0, errori)
    await ctx.close()
  }

  sez('⭐ senza la migration 051 i test vanno lo stesso, e lo dice')
  {
    const { page, ctx, errori } = await apri({ senza051: true })
    check('⭐ avviso con il nome del file', await page.isVisible('#avviso-051') && /051_schermo_tv\.sql/.test(await page.textContent('#avviso-051')))
    await page.evaluate(() => window.__emetti('oscillazione:OSC1', 'via', { evento: 'rollio', durata: 30 })); await page.waitForTimeout(200)
    check('⭐ i test in diretta funzionano', (await vista(page)) === 'test' && await page.$eval('#asse-ds', e => e.classList.contains('test')))
    check('nessun errore JS', errori.length === 0, errori)
    await ctx.close()
  }
} finally { await browser.close(); server.close() }
console.log('\n' + '='.repeat(66))
console.log(ko === 0 ? `TUTTO VERDE — ${ok} controlli passati.` : `ROSSO — ${ok} passati, ${ko} falliti:\n  - ` + fallite.join('\n  - '))
process.exit(ko === 0 ? 0 : 1)
