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
window.__pkgVisto = (window.parent && window.parent.__tvPacchetto) || null
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
  window.__fk = { canali: {}, rpc: [], uscite: 0, collegata: !!o.collegata, pkg: o.pkg || null }
  let sessione = !!o.sessioneVecchia
  window.supabase = { createClient() { return {
    auth: {
      getSession: async () => ({ data: { session: sessione ? { user: { id: 'u1' } } : null } }),
      signOut: async () => { window.__fk.uscite++; sessione = false; return { error: null } }
    },
    rpc: async (nome, args) => {
      window.__fk.rpc.push([nome, args || null])
      if (o.senza052) return { data: null, error: { message: 'Could not find the function public.' + nome } }
      if (nome === 'tv_nuovo') return { data: 'K7P3MX', error: null }
      if (nome === 'tv_stato') return { data: window.__fk.collegata ? { collegata: true, schermo: 'TV1', oscillazione: 'OSC1' } : { collegata: false }, error: null }
      if (nome === 'tv_pacchetto') return { data: window.__fk.pkg, error: null }
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
  await page.addInitScript(FINTO, Object.assign({ collegata: true }, o))
  await page.goto('http://localhost:' + PORT + '/tv.html', { waitUntil: 'load' })
  await page.waitForTimeout(400)
  return { page, ctx, errori }
}
const vista = p => p.evaluate(() => window.__tv.vista())

try {
  sez('⛔ la TV non entra in nessun account e non legge tabelle')
  {
    const src = fs.readFileSync('tv.html', 'utf8')
    check('⛔ nessuna tabella letta da qui', !/\.from\(/.test(src))
    check('⛔ niente password: nessun campo, nessun signInWithPassword', !/type="password"|signInWithPassword/.test(src))
    const rpc = [...src.matchAll(/\.rpc\(\s*'([^']+)'/g)].map(m => m[1])
    check('⭐ chiama solo le tre funzioni della TV (052)', rpc.length > 0 && rpc.every(n => /^tv_(nuovo|stato|pacchetto)$/.test(n)), rpc)
    check('⭐ sul televisore resta solo il segreto della TV', (src.match(/localStorage\.\w+\(CHIAVE_SEGRETO/g) || []).length === 2 && (src.match(/localStorage/g) || []).length === 2)
    check('è noindex', /noindex/.test(src))
  }

  sez('⭐⭐ collegare la TV col codice, senza password')
  {
    const { page, ctx, errori } = await apri({ collegata: false, sessioneVecchia: true })
    check('⭐ mostra il codice in grande: «K7P 3MX»', await page.isVisible('#ingresso') && (await page.textContent('#ing-cod')).trim() === 'K7P 3MX')
    check('⭐ e dice dove scriverlo (🔗 TV sul telefono)', /🔗 TV/.test(await page.textContent('#ingresso')) && /vale ancora 10 minuti/.test(await page.textContent('#ing-scade')))
    const nuovo = (await page.evaluate(() => window.__fk.rpc)).find(r => r[0] === 'tv_nuovo')
    check('⭐ il segreto lo crea la TV: 64 caratteri casuali', nuovo && /^[0-9a-f]{64}$/.test(nuovo[1].p_segreto), nuovo)
    check('⭐⭐ se sul televisore c’era un account aperto (password), si esce', (await page.evaluate(() => window.__fk.uscite)) === 1)
    const seg = await page.evaluate(() => localStorage.getItem('policettivo.tv.segreto.v1'))
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400)
    const seg2 = (await page.evaluate(() => window.__fk.rpc)).find(r => r[0] === 'tv_stato')[1].p_segreto
    check('⭐ il segreto resta lo stesso se si ricarica (la TV resta collegata)', seg && seg === seg2)
    await page.evaluate(() => { window.__fk.collegata = true })       // il telefono conferma il codice
    await page.waitForTimeout(3600)
    check('⭐⭐ confermato dal telefono → la TV si collega da sola', !(await page.isVisible('#ingresso')) && /Collegata/.test(await page.textContent('#att-stato')))
    check('⭐ e ascolta i suoi due canali', await page.evaluate(() => !!window.__fk.canali['schermo:TV1'] && !!window.__fk.canali['oscillazione:OSC1']))
    await page.evaluate(() => { window.__fk.collegata = false })      // «Scollega» dal telefono
    await page.waitForTimeout(8600)
    check('⭐⭐ scollegata dal telefono → torna al codice', await page.isVisible('#ingresso'))
    check('nessun errore JS', errori.length === 0, errori)
    await ctx.close()
  }

  sez('⭐⭐ la schermata d’attesa')
  {
    const PKG = { v: 1, pid: 'P-1', premium: true, patient: { id: 'P-1', nome: 'Anna' } }
    const { page, ctx, errori } = await apri({ pkg: PKG })
    check('⭐ si parte dalla schermata d’attesa col marchio', (await vista(page)) === 'attesa' && /Sistema Policettivo®/.test(await page.textContent('#v-attesa')))
    check('⭐ con l’ora', /\d{2}:\d{2}/.test(await page.textContent('#att-ora')))
    await page.screenshot({ path: '_schermate/tv-attesa.png' })

    sez('⭐⭐ «Prima e dopo»: i dati li legge la TV col suo segreto, solo il paziente mostrato')
    const st = { tipo: 'prima-dopo', pid: 'P-1', giorno: 'g1', slide: 'foto:sagittale_dx', gradi: { sagittale_dx: true }, rif: {}, modo: {}, nm: 2, pv: 111 }
    await page.evaluate(s => window.__emetti('schermo:TV1', 'mostra', s), st); await page.waitForTimeout(800)
    check('⭐ la TV passa a «Prima e dopo»', (await vista(page)) === 'pd')
    const pk = (await page.evaluate(() => window.__fk.rpc)).filter(r => r[0] === 'tv_pacchetto')
    check('⭐ ha chiesto il pacchetto col suo segreto', pk.length === 1 && /^[0-9a-f]{64}$/.test(pk[0][1].p_segreto))
    const pd = await page.evaluate(() => window.__tv.pd())
    check('⭐ apre la pagina di sempre in modalità TV, per quel paziente', /schermo-paziente\.html\?id=P-1&tv=1/.test(pd.src), pd)
    const fr = page.frames().find(f => /schermo-paziente/.test(f.url()))
    check('⭐⭐ e la pagina dentro la TV riceve il pacchetto (non un account)', fr && (await fr.evaluate(() => window.__pkgVisto && window.__pkgVisto.pid)) === 'P-1')
    const ap = fr ? await fr.evaluate(() => window.__applicati) : []
    check('⭐⭐ va sulla pagina scelta, coi gradi accesi', ap.length >= 1 && ap[ap.length - 1].slide === 'foto:sagittale_dx' && ap[ap.length - 1].gradi.sagittale_dx === true, ap)
    await page.evaluate(s => window.__emetti('schermo:TV1', 'mostra', Object.assign({}, s, { slide: 'sintesi' })), st); await page.waitForTimeout(400)
    const fr2 = page.frames().find(f => /schermo-paziente/.test(f.url()))
    check('⭐ il telefono cambia pagina → la TV la segue, senza ricaricare né richiedere i dati', fr2 === fr &&
      (await fr2.evaluate(() => window.__applicati.slice(-1)[0].slide)) === 'sintesi' && (await page.evaluate(() => window.__fk.rpc.filter(r => r[0] === 'tv_pacchetto').length)) === 1)
    await page.evaluate(s => window.__emetti('schermo:TV1', 'mostra', Object.assign({}, s, { pv: 222 })), st); await page.waitForTimeout(800)
    const fr3 = page.frames().find(f => /schermo-paziente/.test(f.url()))
    check('⭐ pacchetto nuovo (gradi misurati) → la TV lo rilegge e ricarica', fr3 && fr3 !== fr && (await page.evaluate(() => window.__fk.rpc.filter(r => r[0] === 'tv_pacchetto').length)) === 2)
    await page.evaluate(() => { window.__fk.pkg = null })
    await page.evaluate(s => window.__emetti('schermo:TV1', 'mostra', Object.assign({}, s, { pv: 333 })), st); await page.waitForTimeout(600)
    check('⛔ se il pacchetto non c’è (scaduto o spento) la TV non mostra niente: attesa', (await vista(page)) === 'attesa')
    await page.evaluate(p => { window.__fk.pkg = p }, PKG)
    await page.evaluate(s => window.__emetti('schermo:TV1', 'mostra', Object.assign({}, s, { pid: 'P-ALTRO', pv: 444 })), st); await page.waitForTimeout(600)
    check('⛔ comando per un paziente diverso dal pacchetto: niente', (await vista(page)) === 'attesa')
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

  sez('⭐ senza la migration 052 lo dice, per nome di file')
  {
    const { page, ctx, errori } = await apri({ senza052: true, collegata: false })
    check('⭐ avviso con il nome del file', await page.isVisible('#avviso-051') && /052_tv_codice\.sql/.test(await page.textContent('#avviso-051')))
    check('nessun errore JS', errori.length === 0, errori)
    await ctx.close()
  }
} finally { await browser.close(); server.close() }
console.log('\n' + '='.repeat(66))
console.log(ko === 0 ? `TUTTO VERDE — ${ok} controlli passati.` : `ROSSO — ${ok} passati, ${ko} falliti:\n  - ` + fallite.join('\n  - '))
process.exit(ko === 0 ? 0 : 1)
