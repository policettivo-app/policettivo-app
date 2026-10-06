/* prova-nav.mjs — nav-v1 · nav-v2 · partenza-v1
 * Il pulsante «‹ Indietro · ⌂ Home» su tutte le pagine del professionista,
 * e la schermata grande di partenza dei test.
 *   node prova-nav.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd(), PORT = 8497
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  if (u === '/prova-nav-pagina.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="margin:0">' +
      '<input id="campo"><div id="barra" style="position:fixed;left:0;right:0;bottom:0;height:70px;background:#eee"></div>' +
      '<div class="guard" id="guard"></div><script src="js/pol-nav.js?v=nav-v1" defer></script></body>'); return
  }
  // telefono-1 · una pagina con la barra VERA di console-nav.js, caricata come in visite.html:
  // prima console-nav.js, poi pol-nav.js con defer
  if (u === '/prova-nav-barra.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="margin:0"><p>pagina</p>' +
      '<script src="console-nav.js"></script><script src="js/pol-nav.js?v=nav-v1" defer></script></body>'); return
  }
  const f = path.join(ROOT, u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f))
})
let ok = 0, ko = 0; const fallite = []
function check(n, c, x) { if (c) { ok++; console.log('  ✅ ' + n) } else { ko++; fallite.push(n); console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')) } }
function sez(t) { console.log('\n── ' + t) }

// stepping-v1 · anche la pagina dello stepping
const PRO = 'prova-atr prova-stepping admin anamnesi assegna-protocollo cartella comparazione consenso contabile controindicazioni-revisione controllo diario-sedute diario disegno esporta-ts fattura fatture lettera-ai monitoraggio noleggi oscillazione-storico paziente profilo protocollo prova-gradi prova-oscillazione prova-squat rapida scheda-pdf schermo-paziente sospesi statistiche studio test tv-collega upgrade valutazione-posturale visita visite autotest esercizio pagella video-esercizio dpa'.split(' ')
const FUORI = 'index login registrazione reset-password privacy termini tv dashboard oscillazione-live consenso-paziente'.split(' ')

sez('⭐ nav-v1 · il pulsante è in tutte le pagine del professionista, una volta sola')
const senza = PRO.filter(p => (fs.readFileSync(p + '.html', 'utf8').match(/js\/pol-nav\.js\?v=nav-v1/g) || []).length !== 1)
check('⭐ ' + PRO.length + ' pagine caricano js/pol-nav.js una volta', senza.length === 0, senza)
const dove = PRO.filter(p => { const s = fs.readFileSync(p + '.html', 'utf8'); const i = s.lastIndexOf('pol-nav.js'); return !/^[^]*?<\/body>\s*<\/html>\s*$/.test(s.slice(i)) || s.slice(i).split('</body>').length !== 2 })
check('⭐ ed è in fondo, subito prima di </body> (non dentro gli script di stampa)', dove.length === 0, dove)
const dentro = FUORI.filter(p => fs.existsSync(p + '.html') && fs.readFileSync(p + '.html', 'utf8').includes('pol-nav.js'))
check('⛔ non c’è nelle pagine pubbliche, sulla TV, nella home e nel consenso del paziente', dentro.length === 0, dentro)
const src = fs.readFileSync('js/pol-nav.js', 'utf8')
check('⛔ il pulsante non legge e non scrive dati (niente supabase, fetch, setItem)', !/supabase|fetch\(|setItem|removeItem|XMLHttpRequest/.test(src.replace(/\/\*[^]*?\*\//g, '')))

sez('⭐ partenza-v1 · il marchio e la schermata di partenza')
const pa = fs.readFileSync('js/partenza.js', 'utf8')
check('⛔ la partenza non legge e non scrive dati', !/supabase|fetch\(|localStorage|XMLHttpRequest/.test(pa.replace(/\/\*[^]*?\*\//g, '')))

await new Promise(r => server.listen(PORT, r))
const browser = await chromium.launch({ executablePath: CHROME })
const B = 'http://localhost:' + PORT + '/'
try {
  async function pagina(conSessione, url, w = 390, h = 800) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    if (conSessione) await ctx.addInitScript(() => { try { localStorage.setItem('sb-kazlnoikvwdqwvxtigej-auth-token', '{}') } catch (e) {} })
    const p = await ctx.newPage(); const errori = []; p.on('pageerror', e => errori.push(e.message))
    await p.goto(B + url); await p.waitForTimeout(900)
    return { p, ctx, errori }
  }
  const vede = p => p.evaluate(() => { const d = document.getElementById('pn-pil'); return !!d && !d.classList.contains('via') && getComputedStyle(d).display !== 'none' })

  sez('⭐ chi lo vede')
  let { p, ctx, errori } = await pagina(true, 'prova-nav-pagina.html')
  check('⭐ professionista entrato → «‹ Indietro · ⌂ Home» in basso', await vede(p) && /Indietro/.test(await p.textContent('#pn-pil')) && /Home/.test(await p.textContent('#pn-pil')))
  const box = await p.evaluate(() => { const r = document.getElementById('pn-pil').getBoundingClientRect(); return { h: r.height, bottom: r.bottom, left: r.left } })
  check('⭐ grande da toccare col pollice (almeno 44 px)', box.h >= 44, box)
  check('⭐ si alza da sola sopra la barra fissa in fondo', box.bottom <= 800 - 70, box)
  // nav-v2 · più discreto sul telefono
  const largo = await p.evaluate(() => document.getElementById('pn-pil').getBoundingClientRect().width)
  check('⭐ nav-v2 · sul telefono solo le icone: larga meno di 130 px (prima più di 200)', largo < 130 && largo > 70, largo)
  check('⭐ nav-v2 · le parole restano per chi usa il lettore di schermo', await p.evaluate(() => document.querySelector('#pn-indietro .pn-t').textContent === 'Indietro' && document.getElementById('pn-home').getAttribute('aria-label') === 'Vai alla home'))
  await p.evaluate(() => { const x = document.createElement('div'); x.id = 'lungo'; x.style.height = '3000px'; document.body.appendChild(x); window.scrollTo(0, 600) }); await p.waitForTimeout(400)
  check('⭐ nav-v2 · scorrendo in giù va a riposo: piccola e trasparente', await p.evaluate(() => { const d = document.getElementById('pn-pil'), cs = getComputedStyle(d); return d.classList.contains('riposo') && Number(cs.opacity) < 0.5 && d.getBoundingClientRect().height < 40 }))
  check('⭐ nav-v2 · a riposo si tocca ancora (non sparisce)', await vede(p))
  await p.evaluate(() => window.scrollTo(0, 500)); await p.waitForTimeout(400)
  check('⭐ nav-v2 · scorrendo in su torna piena', await p.evaluate(() => { const d = document.getElementById('pn-pil'); return !d.classList.contains('riposo') && Number(getComputedStyle(d).opacity) === 1 }))
  await p.evaluate(() => { window.scrollTo(0, 0); document.getElementById('lungo').remove() }); await p.waitForTimeout(300)
  check('⭐ Home porta alla dashboard', (await p.getAttribute('#pn-home', 'href')) === 'dashboard.html')
  check('⭐ Indietro senza pagina precedente → la home', (await p.getAttribute('#pn-indietro', 'href')) === 'dashboard.html')
  await p.focus('#campo'); await p.waitForTimeout(200)
  check('⭐ mentre si scrive sparisce (la tastiera la coprirebbe)', !(await vede(p)))
  await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(300)
  check('⭐ e ricompare finito di scrivere', await vede(p))
  await p.evaluate(() => document.getElementById('guard').classList.add('on')); await p.waitForTimeout(900)
  check('⭐ durante un test (schermo bloccato) sparisce', !(await vede(p)))
  await p.evaluate(() => document.getElementById('guard').classList.remove('on')); await p.waitForTimeout(900)
  check('nessun errore JS', errori.length === 0, errori)
  await ctx.close()

  // atr-v1 · sopra il grande PARTI dei test (galleggia a 14 px dal fondo): prima ci finiva sopra
  ;({ p, ctx } = await pagina(true, 'prova-atr.html'))
  await p.waitForTimeout(800)
  const so = await p.evaluate(() => { const a = document.getElementById('pn-pil').getBoundingClientRect(), s = document.getElementById('btn-start').getBoundingClientRect(); return { pil: a.bottom, start: s.top } })
  check('⭐ atr-v1 · la pillola sta SOPRA il grande pulsante PARTI, non ci si sovrappone', so.pil <= so.start, so)
  await ctx.close()

  ;({ p, ctx } = await pagina(true, 'prova-nav-pagina.html?pid=11111111-2222-3333-4444-555555555555'))
  check('⭐ con ?pid= «Indietro» di riserva va alla scheda del paziente', (await p.getAttribute('#pn-indietro', 'href')) === 'paziente.html?id=11111111-2222-3333-4444-555555555555')
  await ctx.close()

  ;({ p, ctx } = await pagina(true, 'test.html'))
  await p.click('#pn-home'); await p.waitForTimeout(500)
  check('⭐ tocco su Home → dashboard', /dashboard\.html/.test(p.url()), p.url())
  await p.goBack(); await p.waitForTimeout(900)
  await p.click('#pn-indietro'); await p.waitForTimeout(600)
  check('⭐ tocco su Indietro → torna davvero alla pagina di prima', /dashboard\.html/.test(p.url()), p.url())
  await ctx.close()

  ;({ p, ctx } = await pagina(false, 'prova-nav-pagina.html'))
  check('⛔ senza account (il paziente, un estraneo) non si vede', !(await p.evaluate(() => !!document.getElementById('pn-pil'))))
  await ctx.close()
  ;({ p, ctx } = await pagina(true, 'prova-nav-pagina.html?token=abc'))
  check('⛔ pagina aperta col link del paziente (?token=) non si vede, anche sul telefono del professionista', !(await p.evaluate(() => !!document.getElementById('pn-pil'))))
  await ctx.close()
  ;({ p, ctx } = await pagina(true, 'prova-nav-pagina.html?token=abc&pro=1'))
  check('⭐ ma se l’ha aperta il professionista (&pro=1) sì', await vede(p))
  await ctx.close()
  ;({ p, ctx } = await pagina(true, 'prova-nav-pagina.html?tv=1'))
  check('⛔ sulla TV (?tv=1) non si vede', !(await p.evaluate(() => !!document.getElementById('pn-pil'))))
  await p.setContent('<iframe src="' + B + 'prova-nav-pagina.html" style="width:400px;height:500px"></iframe>'); await p.waitForTimeout(1200)
  check('⛔ dentro una finestra incorporata (iframe) non si vede', !(await p.frames()[1].evaluate(() => !!document.getElementById('pn-pil'))))
  await ctx.close()
  ;({ p, ctx } = await pagina(true, 'prova-nav-pagina.html'))
  await p.emulateMedia({ media: 'print' })
  check('⛔ in stampa non si vede', await p.evaluate(() => getComputedStyle(document.getElementById('pn-pil')).display === 'none'))
  await ctx.close()

  sez('⭐ telefono-1 · la barra in basso e la pillola')
  const statoBarra = pg => pg.evaluate(() => {
    const d = document.getElementById('pn-pil'), b = document.getElementById('cnav-bar')
    if (!d || !b) return { pil: !!d, barra: !!b }
    const r = d.getBoundingClientRect(), rb = b.getBoundingClientRect()
    const sopra = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { pil: true, barra: true, fondoPillola: Math.round(r.bottom), cimaBarra: Math.round(rb.top), siTocca: d.contains(sopra) }
  })
  ;({ p, ctx, errori } = await pagina(true, 'prova-nav-barra.html'))
  let sb = await statoBarra(p)
  check('⭐ telefono-1 · dopo 0,9 secondi la pillola è già SOPRA la barra in basso (prima: dopo 14 secondi)', sb.pil && sb.barra && sb.fondoPillola <= sb.cimaBarra, sb)
  check('⭐ telefono-1 · e si tocca davvero: sotto il dito c’è la pillola, non la barra', sb.siTocca === true, sb)
  await p.waitForTimeout(3000); sb = await statoBarra(p)
  check('⭐ telefono-1 · resta sopra la barra anche dopo', sb.fondoPillola <= sb.cimaBarra && sb.siTocca === true, sb)
  check('nessun errore JS', errori.length === 0, errori)
  await ctx.close()
  ;({ p, ctx } = await pagina(true, 'prova-nav-barra.html', 1280, 800))
  sb = await statoBarra(p)
  check('⭐ telefono-1 · vale anche sul computer', sb.fondoPillola <= sb.cimaBarra && sb.siTocca === true, sb)
  await ctx.close()
  ;({ p, ctx, errori } = await pagina(false, 'prova-nav-barra.html?token=abc'))
  check('⛔ telefono-1 · pagina aperta col link del paziente (?token=): la barra del professionista NON c’è', !(await p.evaluate(() => !!document.getElementById('cnav-bar'))))
  check('⛔ telefono-1 · e nemmeno i suoi pannelli (cerca, profilo)', !(await p.evaluate(() => !!document.getElementById('cnav-modal-search') || !!document.getElementById('cnav-overlay'))))
  check('nessun errore JS', errori.length === 0, errori)
  await ctx.close()
  ;({ p, ctx } = await pagina(true, 'prova-nav-barra.html?token=abc&preview=1'))
  check('⛔ telefono-1 · neanche nell’anteprima del professionista (&preview=1): vede quello che vede il paziente', !(await p.evaluate(() => !!document.getElementById('cnav-bar'))))
  await ctx.close()
  ;({ p, ctx } = await pagina(true, 'prova-nav-barra.html?token=abc&pro=1'))
  check('⭐ telefono-1 · se l’ha aperta il professionista (&pro=1) la barra c’è', await p.evaluate(() => !!document.getElementById('cnav-bar')))
  await ctx.close()
  ;({ p, ctx } = await pagina(true, 'prova-nav-barra.html'))
  check('⭐ telefono-1 · senza ?token= la barra c’è come prima, con le sue cinque voci', await p.evaluate(() => document.querySelectorAll('#cnav-bar .cnav-btn').length === 5))
  await ctx.close()
  ;({ p, ctx, errori } = await pagina(false, 'pagella.html?token=11111111-2222-3333-4444-555555555555'))
  check('⛔ telefono-1 · la pagella VERA aperta dal paziente: niente barra del professionista', !(await p.evaluate(() => !!document.getElementById('cnav-bar'))))
  await ctx.close()

  sez('⭐ partenza-v1 · la schermata di partenza')
  ;({ p, ctx } = await pagina(true, 'prova-nav-pagina.html'))
  await p.addScriptTag({ url: B + 'js/partenza.js?v=partenza-v1' })
  await p.evaluate(() => PolPartenza.apri({ titolo: 'Oscillazione Policettiva', sotto: 'Beccheggio · occhi chiusi', testo: 'Sali sulla tavola', avviso: '⚠️ Occhi chiusi: resta accanto', secondi: 10 }))
  await p.waitForTimeout(500)
  check('⭐ si apre a tutto schermo col marchio POLICETTIVO®', await p.evaluate(() => { const o = document.getElementById('pol-partenza'); const r = o.getBoundingClientRect(); return PolPartenza.aperta() && r.width === innerWidth && r.height === innerHeight && !!o.querySelector('svg.pp-parola path') }))
  check('⭐ titolo, «Il test sta per partire», il numero 10', /OSCILLAZIONE POLICETTIVA/i.test(await p.textContent('#pp-tit')) && /sta per partire/.test(await p.textContent('#pol-partenza')) && (await p.textContent('#pp-num')) === '10')
  check('⭐ l’avviso degli occhi chiusi si vede', await p.isVisible('#pp-avviso'))
  check('⭐ mentre c’è la partenza il pulsante di navigazione sparisce', await p.evaluate(() => new Promise(r => setTimeout(() => r(document.getElementById('pn-pil').classList.contains('via')), 900))))
  await p.evaluate(() => PolPartenza.numero(3))
  check('⭐ gli ultimi 3 secondi in giallo', await p.evaluate(() => document.getElementById('pp-num').classList.contains('ultimi')))
  const arco = await p.evaluate(() => [10, 5, 1].map(n => { PolPartenza.numero(n); return Number(document.getElementById('pp-arco').getAttribute('stroke-dashoffset')) }))
  check('⭐ l’anello si svuota man mano', arco[0] < arco[1] && arco[1] < arco[2], arco)
  await p.evaluate(() => PolPartenza.via()); await p.waitForTimeout(100)
  check('⭐ «VIA»', (await p.textContent('#pp-num')) === 'VIA')
  await p.waitForTimeout(1300)
  check('⭐ e poi si chiude da sola', await p.evaluate(() => !PolPartenza.aperta() && !document.getElementById('pol-partenza')))
  await ctx.close()
} finally { await browser.close(); server.close() }

console.log('\n' + '='.repeat(66))
if (ko) { console.log('FALLITI ' + ko + ':'); fallite.forEach(f => console.log('  - ' + f)); process.exit(1) }
console.log('TUTTO VERDE — ' + ok + ' controlli passati.')
