/* prova-guidato.mjs — guidato-v1
 * Lo squat guidato dal telefono: il calcolo (telefono simulato) e la pagina.
 *   node prova-guidato.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd(), PORT = 8497
const CHROME = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined
const FOTO = process.env.FOTO || ''
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  const f = path.join(ROOT, u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f))
})
let ok = 0, ko = 0; const fallite = []
function check(n, c, x) { if (c) { ok++; console.log('  ✅ ' + n) } else { ko++; fallite.push(n); console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')) } }
function sez(t) { console.log('\n── ' + t) }

globalThis.window = globalThis
await import('./js/guida-motore.js?x=' + Date.now())
const F = globalThis.PolGuida

// il telefono simulato: in orizzontale fra le mani, il corpo scende di `prof` metri seguendo il ritmo
function simula({ ritmo = F.RITMI.lento, n = 5, prof = 0.4, rollDeg = 0, pitchDeg = 0, rumore = 0.03, bias = 0.08, ios = false, ritardo = 250, salta = [], hz = 60, seme = 1, senzaA = false, cade = null }) {
  let s = seme; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5 }
  const gauss = () => (rnd() + rnd() + rnd() + rnd()) * 1.73
  const prog = F.programma(ritmo, n), fine = F.durata(ritmo, n) + 800, dt = 1000 / hz
  const z = (t) => { const b = F.bersaglio(prog, t - ritardo); return salta.includes(b.rip) ? 0 : -prof * b.p }
  const st = F.crea({ ritmo, n }); const vivi = []
  for (let t = 0; t <= fine; t += dt) {
    const h = dt / 1000, acc = (z(t + dt) - 2 * z(t) + z(t - dt)) / (h * h)
    const b = F.bersaglio(prog, t - ritardo), su = t > ritmo.inizio ? b.p : 0
    const roll = rollDeg * su * Math.PI / 180, pit = pitchDeg * su * Math.PI / 180
    const up = { x: Math.cos(roll) * Math.cos(pit), y: Math.sin(roll) * Math.cos(pit), z: Math.sin(pit) }
    const k = ios ? -1 : 1, g = (cade != null && t >= cade) ? 0.3 : 9.81
    const a = { x: k * (up.x * acc + gauss() * rumore), y: k * (up.y * acc + gauss() * rumore), z: k * (up.z * acc + bias + gauss() * rumore) }
    const ag = { x: a.x + k * up.x * g, y: a.y + k * up.y * g, z: a.z + k * up.z * g }
    vivi.push(F.aggiungi(st, { t, ag, a: senzaA ? null : a }))
  }
  return { st, r: F.riassunto(st), vivi }
}

sez('⭐ il calcolo (js/guida-motore.js) — telefono SIMULATO, non vero')
{
  check('⭐ il programma: 3 s fermo, poi giù · fondo · su · in piedi', F.durata(F.RITMI.lento, 5) === 43000 && F.programma(F.RITMI.lento, 5).length === 21)
  const pr = F.programma(F.RITMI.lento, 2)
  check('⭐ il bersaglio: 0 in piedi, 1 in fondo, a metà discesa 0,5', F.bersaglio(pr, 100).p === 0 && Math.abs(F.bersaglio(pr, 4500).p - 0.5) < 1e-9 && F.bersaglio(pr, 6500).p === 1 && F.bersaglio(pr, 6500).fase === 'fondo')
  let x = simula({})
  check('⭐ 5 squat di 40 cm: 5 contati, discesa stimata 40 cm', x.r.intere === 5 && x.r.mezze === 10 && Math.abs(x.r.discesaCm.media - 40) <= 2, x.r.discesaCm)
  x = simula({ ios: true })
  check('⭐ col segno rovesciato (iPhone): stesso conto', x.r.intere === 5 && Math.abs(x.r.discesaCm.media - 40) <= 2)
  x = simula({ prof: 0 })
  check('⛔ fermo in piedi: zero ripetizioni contate', x.r.mezze === 0 && x.r.discesaCm.media === null)
  let falsi = 0
  for (let i = 1; i <= 100; i++) falsi += simula({ prof: 0, rumore: 0.05, seme: i * 7919 }).r.mezze
  check('⛔ fermo con rumore, 100 prove: nessuna mezza contata per sbaglio', falsi === 0, falsi)
  x = simula({ salta: [3] })
  check('⭐ una ripetizione saltata non si conta (4 su 5) e si sa quale', x.r.intere === 4 && !x.r.ripetizioni[2].giu && x.r.ripetizioni[3].giu)
  x = simula({ prof: 0.06 })
  check('⛔ un accenno di 6 cm non è uno squat', x.r.mezze === 0)
  x = simula({ ritmo: F.RITMI.medio, n: 8 })
  check('⭐ ritmo medio, 8 ripetizioni: 8 contate', x.r.intere === 8)
  x = simula({ senzaA: true })
  check('⭐ telefono senza accelerazione «senza gravità»: conta lo stesso', x.r.intere === 5)
  x = simula({ rollDeg: 12 })
  const fondo = x.vivi.filter(v => v.fase === 'fondo' && v.rip === 2)
  check('⭐ mano DESTRA più bassa di 12° in fondo: lato «destra»', fondo.every(v => v.lato === 'destra') && x.r.mani.lato === 'destra' && x.r.mani.media > 5, x.r.mani)
  x = simula({ rollDeg: -12, ios: true })
  check('⭐ mano SINISTRA più bassa, anche su iPhone: lato «sinistra»', x.r.mani.lato === 'sinistra' && x.vivi.filter(v => v.fase === 'fondo').every(v => v.lato === 'sinistra'))
  x = simula({ rollDeg: 3 })
  check('⭐ sotto la soglia (3° con soglia 5°): nessun lato', x.r.mani.lato === null && x.vivi.every(v => v.lato === null))
  x = simula({ pitchDeg: 25 })
  check('⭐ telefono inclinato di 25°: «braccia» fuori', x.vivi.some(v => v.braccia) && Math.abs(x.r.braccia.max) >= 20, x.r.braccia)
  x = simula({ cade: 9000 })
  check('⭐ il telefono cade: se ne accorge', x.r.caduta === true && simula({}).r.caduta === false)
  x = simula({})
  const giu = x.vivi.filter(v => v.fase === 'giu' && v.rip === 3), fo = x.vivi.filter(v => v.fase === 'fondo' && v.rip === 3)
  check('⭐ la pallina del corpo scende durante la discesa e resta giù in fondo', giu[giu.length - 1].corpo > 0.7 && fo.every(v => v.corpo > 0.6) && x.vivi.filter(v => v.fase === 'piedi' && v.rip === 3).slice(30).every(v => v.corpo === 0), [giu[giu.length - 1].corpo, Math.min(...fo.map(v => v.corpo))])
  const fr = F.frasi(x.r).join(' ')
  check('⛔ le frasi descrivono, non giudicano', /stima/.test(fr) && /lo decide il professionista/.test(fr) && !/corrett|sbagliat|giust|bravo|bene|male/i.test(fr), fr)
  const src = fs.readFileSync('js/guida-motore.js', 'utf8').replace(/\/\*[^]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('⛔ js/guida-motore.js non parla con la rete e non scrive niente', !/supabase|fetch\(|localStorage|document\./.test(src))
}

// il telefono finto nella pagina: segue il programma della pagina
const TELEFONO = ({ prof, rollDeg, tenuto, nulla, cadeDopo }) => {
  if (window.__ivT) clearInterval(window.__ivT)
  window.__tel = { prof, rollDeg, tenuto, nulla, cadeDopo }
  const Fm = window.PolGuida
  window.__ivT = setInterval(() => {
    const o = window.__tel
    if (o.nulla) return
    const G = window.__guidato, st = G && G.stato()
    let acc = 0, roll = 0, g = 9.81
    if (st) {
      const t = performance.now() - G.t0() - 250, h = 0.016
      const z = (x) => -o.prof * Fm.bersaglio(st.prog, x).p
      acc = (z(t + h * 1000) - 2 * z(t) + z(t - h * 1000)) / (h * h)
      roll = (o.rollDeg || 0) * Fm.bersaglio(st.prog, t).p * Math.PI / 180
      if (o.cadeDopo != null && t > o.cadeDopo) g = 0.2
    }
    const up = o.tenuto === 'verticale' ? { x: 0, y: 1 } : { x: Math.cos(roll), y: Math.sin(roll) }
    const a = { x: up.x * acc, y: up.y * acc, z: 0.05 }
    const e = new Event('devicemotion')
    Object.defineProperty(e, 'accelerationIncludingGravity', { value: { x: a.x + up.x * g, y: a.y + up.y * g, z: a.z } })
    Object.defineProperty(e, 'acceleration', { value: a })
    Object.defineProperty(e, 'rotationRate', { value: { alpha: 0, beta: 0, gamma: 0 } })
    window.dispatchEvent(e)
  }, 16)
}
const SUPA = ({ email }) => {
  const q = () => { const api = { select() { return api }, eq() { return api }, order() { return api }, limit() { return api }, in() { return api }, gte() { return api }, not() { return api }, is() { return api },
    async maybeSingle() { return { data: null, error: null } }, then(r) { r({ data: [], error: null }) } }; return api }
  window.supabase = { createClient() { return { auth: { getSession: async () => ({ data: { session: email ? { user: { id: 'U1', email } } : null } }) }, from: q, rpc: async () => ({ data: null, error: null }) } } }
}

await new Promise(r => server.listen(PORT, r))
const browser = await chromium.launch({ executablePath: CHROME })
const B = 'http://localhost:' + PORT + '/'
async function apri(viewport, query, opz) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true })
  const page = await ctx.newPage(); const errori = []; page.on('pageerror', e => errori.push(String(e)))
  await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  if (opz && opz.blocca) await page.route(opz.blocca, r => r.abort())
  if (opz && opz.supa) await page.addInitScript(SUPA, opz.supa)
  await page.goto(B + (opz && opz.pagina || 'prova-guidato.html') + (query || ''), { waitUntil: 'load' }); await page.waitForTimeout(300)
  return { page, ctx, errori }
}
const finita = (page) => page.waitForFunction(() => !window.__guidato.inCorso() && window.__guidato.esito(), null, { timeout: 30000 })

try {
  sez('⭐⭐ la pagina, telefono in orizzontale (844×390): uno squat intero')
  {
    const { page, ctx, errori } = await apri({ width: 844, height: 390 }, '?via=1&n=1')
    check('⭐ dice che è una prova e che i numeri sono stime', /stime non ancora verificate/.test(await page.textContent('.avviso')) && /non salva niente/i.test(await page.textContent('.avviso')))
    check('⭐ quattro passi, due disegni, l’omino si muove', (await page.$$('.passi li')).length === 4 && (await page.$$('.disegni svg')).length === 2 && (await page.innerHTML('#omino')).length > 200)
    check('⭐ avviso di sicurezza e cosa il telefono NON vede', /niente cuscini/.test(await page.textContent('#c-setup')) && /non vede/.test(await page.textContent('#c-setup')))
    await page.click('#ritmo .chip[data-r="medio"]')
    await page.evaluate(TELEFONO, { prof: 0.4 })
    await page.click('#btn-start')
    await page.waitForFunction(() => window.__guidato.vivo() && window.__guidato.vivo().fase === 'giu', null, { timeout: 8000 })
    await page.waitForTimeout(1300)
    const box = await page.evaluate(() => { const r = document.getElementById('palco').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] })
    check('⭐ il palco copre tutto lo schermo, non ruotato', box.join() === '0,0,844,390' && await page.evaluate(() => window.__guidato.rot()) === 0, box)
    check('⭐ freccia in giù e scritta GIÙ durante la discesa', await page.textContent('#s-fase') === 'GIÙ' && !(await page.evaluate(() => document.getElementById('freccia').classList.contains('su'))))
    check('⭐ MI FERMO è dentro lo schermo e si può toccare', await page.evaluate(() => { const r = document.getElementById('btn-fermo').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= innerHeight && r.height >= 44 && !!e.closest('#btn-fermo') }))
    check('⭐ la pallina del corpo è scesa e sta dentro la pista', await page.evaluate(() => { const p = document.getElementById('p-corpo').getBoundingClientRect(), q = document.querySelector('.pista.corpo').getBoundingClientRect(); return p.top > q.top + q.height * 0.15 && p.bottom <= q.bottom + 1 && p.top >= q.top - 1 }))
    if (FOTO) await page.screenshot({ path: FOTO + '/palco-giu.png' })
    await page.waitForFunction(() => window.__guidato.vivo() && window.__guidato.vivo().fase === 'su', null, { timeout: 8000 })
    await page.waitForTimeout(700)
    check('⭐ in risalita la freccia si gira', await page.textContent('#s-fase') === 'SU' && await page.evaluate(() => document.getElementById('freccia').classList.contains('su')))
    if (FOTO) await page.screenshot({ path: FOTO + '/palco-su.png' })
    await finita(page)
    const e = await page.evaluate(() => window.__guidato.esito())
    check('⭐ a fine prova: 1 ripetizione contata su 1, circa 40 cm stimati', e.r.intere === 1 && Math.abs(e.r.discesaCm.media - 40) <= 6 && !e.fermato, e.r.discesaCm)
    check('⭐ il palco si chiude e compare l’esito', !(await page.evaluate(() => document.getElementById('palco').classList.contains('on'))) && await page.isVisible('#c-esito'))
    check('⭐ l’esito: tabella, gomitolo, frasi, «stima»', (await page.$$('table.rip tr')).length === 2 && !!(await page.$('svg.gomitolo')) && /stima/.test(await page.textContent('#esito')))
    check('⭐ la voce: fermo, giù, su, fatto', await page.evaluate(() => { const d = window.__guidato.dette().join('|'); return /Fermo\./.test(d) && /Giù\./.test(d) && /Su\./.test(d) && /Fatto\. 1 ripetizione contata/.test(d) }))
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-scarica')])
    const tr = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'))
    check('⭐ il tracciato si scarica: sensori grezzi, eventi, nome col giorno', /^squat-guidato-\d{8}-\d{4}\.json$/.test(dl.suggestedFilename()) && tr.t.length > 200 && tr.ag.length === tr.t.length && tr.a.length === tr.t.length && tr.eventi.length >= 5 && tr.riassunto.intere === 1, [dl.suggestedFilename(), tr.t.length])
    if (FOTO) { await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200); await page.screenshot({ path: FOTO + '/esito.png', fullPage: true }) }
    check('⛔ nessun errore JavaScript', errori.length === 0, errori)
    await ctx.close()
  }

  sez('⭐⭐ rotazione bloccata (pagina 390×844, telefono in orizzontale): il palco si gira da solo · mano destra più bassa')
  {
    const { page, ctx, errori } = await apri({ width: 390, height: 844 }, '?via=1&n=1')
    if (FOTO) await page.screenshot({ path: FOTO + '/setup.png', fullPage: true })
    check('⛔ la pagina di preparazione non sborda (390 px)', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.evaluate(TELEFONO, { prof: 0.4, rollDeg: 12 })
    await page.click('#btn-start')
    await page.waitForFunction(() => window.__guidato.vivo() && window.__guidato.vivo().fase === 'fondo', null, { timeout: 12000 })
    await page.waitForTimeout(400)
    const s = await page.evaluate(() => { const r = document.getElementById('palco').getBoundingClientRect(); return { rot: window.__guidato.rot(), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      dx: document.getElementById('m-dx').classList.contains('rossa'), sx: document.getElementById('m-sx').classList.contains('rossa'), bg: document.getElementById('m-dx').style.background, bgs: document.getElementById('m-sx').style.background } })
    check('⭐ il palco è ruotato di 90° e copre tutto lo schermo', s.rot === 90 && s.box.join() === '0,0,390,844', s)
    check('⭐ metà DESTRA rossa con «PIÙ BASSA», metà sinistra verde', s.dx && !s.sx && /225, 17, 17/.test(s.bg) && /10, 125, 51/.test(s.bgs), s)
    if (FOTO) await page.screenshot({ path: FOTO + '/palco-ruotato-rosso.png' })
    await finita(page)
    check('⭐ la voce lo dice una volta, descrivendo', await page.evaluate(() => window.__guidato.dette().filter(x => x === 'Mano destra più bassa.').length === 1))
    check('⭐ nell’esito: mano destra più bassa', /mano destra più bassa/.test(await page.textContent('#esito')))
    check('⛔ nessun errore JavaScript', errori.length === 0, errori)
    await ctx.close()
  }

  sez('⭐ MI FERMO a metà · telefono che cade')
  {
    const { page, ctx, errori } = await apri({ width: 844, height: 390 }, '?via=1&n=3')
    await page.click('#ritmo .chip[data-r="medio"]')
    await page.evaluate(TELEFONO, { prof: 0.4 })
    await page.click('#btn-start')
    await page.waitForFunction(() => window.__guidato.vivo() && window.__guidato.vivo().rip === 2 && window.__guidato.vivo().fase === 'giu', null, { timeout: 15000 })
    await page.click('#btn-fermo')
    await finita(page)
    const e = await page.evaluate(() => window.__guidato.esito())
    check('⭐ MI FERMO: si ferma subito, dice «fermato», tiene quello che ha visto (1 su 3)', e.fermato === 'mano' && e.r.intere === 1 && /Fermato prima della fine/.test(await page.textContent('#e-tit')), e.r.intere)
    await page.evaluate(TELEFONO, { prof: 0.4, cadeDopo: 4000 })
    await page.click('#btn-start')
    await finita(page)
    await page.waitForFunction(() => window.__guidato.esito().fermato === 'caduta', null, { timeout: 15000 })
    check('⭐ telefono caduto: si ferma da solo e lo dice', /telefono caduto/.test(await page.textContent('#e-tit')) && await page.evaluate(() => window.__guidato.dette().some(x => /il telefono è caduto/.test(x))))
    check('⛔ nessun errore JavaScript', errori.length === 0, errori)
    await ctx.close()
  }

  sez('⭐ telefono tenuto in verticale: chiede di girarlo · MI FERMO funziona anche lì')
  {
    const { page, ctx, errori } = await apri({ width: 390, height: 844 }, '?n=1')
    await page.evaluate(TELEFONO, { prof: 0.4, tenuto: 'verticale' })
    await page.click('#btn-start')
    await page.waitForFunction(() => window.__guidato.velo(), null, { timeout: 5000 })
    check('⭐ «Gira il telefono in orizzontale»', /Gira il telefono in orizzontale/.test(await page.textContent('#v-tit')))
    check('⭐ MI FERMO si tocca anche sopra l’avviso', await page.evaluate(() => { const r = document.getElementById('btn-fermo').getBoundingClientRect(); return !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).closest('#btn-fermo') }))
    if (FOTO) await page.screenshot({ path: FOTO + '/gira.png' })
    await page.evaluate(() => { window.__tel.tenuto = 'orizzontale' })
    await page.waitForFunction(() => /Braccia tese/.test(document.getElementById('v-tit').textContent), null, { timeout: 4000 })
    check('⭐ girato il telefono parte il conto alla rovescia', /^[1-5]$/.test(await page.textContent('#v-num')))
    if (FOTO) await page.screenshot({ path: FOTO + '/conto.png' })
    await page.evaluate(() => document.getElementById('btn-fermo').click())
    await page.waitForTimeout(300)
    check('⭐ fermato prima di partire: il palco si chiude, niente esito', !(await page.evaluate(() => document.getElementById('palco').classList.contains('on') || window.__guidato.inCorso())) && !(await page.isVisible('#c-esito')))
    check('⛔ nessun errore JavaScript', errori.length === 0, errori)
    await ctx.close()
  }

  sez('⛔ quando va storto: niente sensori · il file del calcolo non arriva')
  {
    let x = await apri({ width: 390, height: 844 }, '?via=1&n=1')
    await x.page.click('#btn-start')
    await x.page.waitForFunction(() => document.getElementById('err').style.display !== 'none', null, { timeout: 6000 })
    check('⭐ senza sensori lo dice a schermo e chiude il palco', /non manda i dati dei sensori/.test(await x.page.textContent('#err')) && !(await x.page.evaluate(() => document.getElementById('palco').classList.contains('on'))))
    check('⛔ nessun errore JavaScript', x.errori.length === 0, x.errori)
    await x.ctx.close()
    x = await apri({ width: 390, height: 844 }, '', { blocca: '**/js/guida-motore.js*' })
    check('⭐ senza js/guida-motore.js la pagina resta in piedi e dice cosa manca', /guida-motore\.js/.test(await x.page.textContent('#err')) && !(await x.page.isVisible('#btn-start')) && x.errori.length === 0, x.errori)
    await x.ctx.close()
    const src = fs.readFileSync('prova-guidato.html', 'utf8').replace(/<!--[^]*?-->/g, '')
    check('⛔ la pagina non parla col database e non manda niente in rete', !/supabase|fetch\(|XMLHttpRequest|sendBeacon/.test(src))
    check('⛔ sul telefono resta scritta solo la scelta «capovolto»', (src.match(/localStorage\.setItem/g) || []).length === 1 && /CHIAVE_GIRO/.test(src) && !/sessionStorage|indexedDB/.test(src))
    check('⛔ niente alert / confirm', !/\balert\(|\bconfirm\(/.test(src))
  }

  sez('⭐ Test: la riga si vede solo all’amministratore')
  {
    let x = await apri({ width: 390, height: 844 }, '', { pagina: 'test.html', supa: { email: 'altro@studio.it' } })
    await x.page.waitForTimeout(400)
    check('⛔ un altro professionista NON la vede (e gli altri test ci sono)', !(await x.page.$('#t-guidato')) && !!(await x.page.$('#t-squat')) && !!(await x.page.$('#t-stepping')))
    check('⛔ nessun errore JavaScript in Test', x.errori.length === 0, x.errori)
    await x.ctx.close()
    x = await apri({ width: 390, height: 844 }, '', { pagina: 'test.html', supa: { email: 'appuntamentimft@gmail.com' } })
    await x.page.waitForTimeout(400)
    check('⭐ l’amministratore la vede', !!(await x.page.$('#t-guidato')) && /in prova/.test(await x.page.textContent('#t-guidato')))
    await x.page.click('#t-guidato'); await x.page.waitForTimeout(400)
    check('⭐ e toccandola si apre lo squat guidato', /prova-guidato\.html$/.test(x.page.url()))
    await x.ctx.close()
  }
} finally {
  await browser.close(); server.close()
}
console.log('\n' + (ko ? '❌ ' + ko + ' ROSSI: ' + fallite.join(' · ') : '✅ tutti verdi') + ' — ' + ok + ' ok, ' + ko + ' ko')
process.exit(ko ? 1 : 0)
