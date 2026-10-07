/* prova-guidato.mjs — guidato-v3
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
function simula({ ritmo = F.RITMI.lento, n = 5, prof = 0.4, rollDeg = 0, pitchDeg = 0, rumore = 0.03, bias = 0.08, ios = false, ritardo = 250, salta = [], hz = 60, seme = 1, senzaA = false, cade = null, svelto = { anticipo: -250, dura: 1800 }, dolce = false }) {
  if (dolce) svelto = null
  let s = seme; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5 }
  const gauss = () => (rnd() + rnd() + rnd() + rnd()) * 1.73
  const prog = F.programma(ritmo, n), fine = F.durata(ritmo, n) + 800, dt = 1000 / hz
  // svelto = { anticipo (ms prima della voce), dura (ms del movimento) }: come nei tracciati veri (di base: parte 0,25 s
  // dopo la voce e scende in 1,8 s). dolce = segue il ritmo alla perfezione, 3 s senza uno scatto: il caso più difficile.
  const per = ritmo.giu + ritmo.fondo + ritmo.su + ritmo.piedi
  const rampa = (x) => x <= 0 ? 0 : x >= 1 ? 1 : (1 - Math.cos(Math.PI * x)) / 2
  const z = (t) => {
    if (!svelto) { const b = F.bersaglio(prog, t - ritardo); return salta.includes(b.rip) ? 0 : -prof * b.p }
    const k = Math.floor((t + svelto.anticipo - ritmo.inizio) / per); if (k < 0 || k >= n || salta.includes(k + 1)) return 0
    const u = t + svelto.anticipo - ritmo.inizio - k * per
    return -prof * (rampa(u / svelto.dura) - rampa((u - ritmo.giu - ritmo.fondo) / svelto.dura))
  }
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
  check('⭐ 5 squat di 40 cm, giù in 1,8 s: 5 contati, 5 a tempo, discesa stimata 40 cm', x.r.fatti === 5 && x.r.aTempo === 5 && x.r.mancate.length === 0 && Math.abs(x.r.discesaCm.media - 40) <= 4, [x.r.fatti, x.r.aTempo, x.r.discesaCm])
  check('⭐ e i secondi tornano: scende in circa 1,8, risale in circa 1,8 (chiesti 3)', Math.abs(x.r.tempi.giu - 1.8) <= 0.3 && Math.abs(x.r.tempi.su - 1.8) <= 0.3 && x.r.tempi.chiestiGiu === 3, x.r.tempi)
  x = simula({ dolce: true })
  console.log('  ⚠️  LIMITE NOTO · squat perfettamente dolce in 3 s (accelerazione sotto 0,25 m/s²): contati ' + x.r.fatti + ' su 5. L’accelerometro quasi non lo sente.')
  check('⛔ nel caso dolce, se non li vede non ne inventa (mai più di 5, nessun fondo oltre il metro)', x.r.fatti <= 5 && x.r.squat.every(q => q.discesaCm < 100), [x.r.fatti, x.r.squat.map(q => q.discesaCm)])
  x = simula({ svelto: { anticipo: 500, dura: 1300 }, prof: 0.6, rumore: 0.2 })
  check('⭐⭐ come nel primo tracciato vero: anticipa di mezzo secondo, scende in 1,3 s, mano che trema → 5 su 5, a tempo', x.r.fatti === 5 && x.r.aTempo === 5 && Math.abs(x.r.discesaCm.media - 60) <= 8, [x.r.fatti, x.r.aTempo, x.r.discesaCm])
  check('⭐ e si vede che è sceso svelto: 1,3 s contro 3 chiesti', Math.abs(x.r.tempi.giu - 1.3) <= 0.35 && x.vivi.some(v => v.ultimaDiscesa && v.ultimaDiscesa.secondi < v.ultimaDiscesa.chiesti * 0.66), x.r.tempi)
  x = simula({ svelto: { anticipo: -600, dura: 1500 }, prof: 0.5 })
  check('⭐ chi invece parte in ritardo di 0,6 s: 5 su 5 lo stesso', x.r.fatti === 5 && x.r.aTempo === 5, [x.r.fatti, x.r.aTempo])
  x = simula({ svelto: { anticipo: -3000, dura: 1200 }, prof: 0.5, n: 3 })
  check('⭐⭐ tre squat fatti tutti in ritardo di 3 secondi: contati 3, a tempo 0', x.r.fatti === 3 && x.r.aTempo === 0 && x.r.fuoriTempo === 3, [x.r.fatti, x.r.aTempo])
  x = simula({ ios: true })
  check('⭐ col segno rovesciato (iPhone): stesso conto', x.r.fatti === 5 && x.r.aTempo === 5 && Math.abs(x.r.discesaCm.media - 40) <= 4, [x.r.fatti, x.r.discesaCm])
  x = simula({ prof: 0 })
  check('⛔ fermo in piedi: zero squat contati', x.r.fatti === 0 && x.r.discesaCm.media === null && x.st.mov.length === 0)
  let falsi = 0
  for (let i = 1; i <= 100; i++) { const y = simula({ prof: 0, rumore: 0.05, seme: i * 7919 }); falsi += y.r.fatti + y.st.mov.length }
  check('⛔ fermo con rumore, 100 prove: nessun movimento contato per sbaglio', falsi === 0, falsi)
  falsi = 0
  for (let i = 1; i <= 100; i++) falsi += simula({ prof: 0, rumore: 0.2, seme: i * 104729 }).r.fatti
  check('⛔ fermo con la mano che trema forte, 100 prove: nessuno squat contato per sbaglio', falsi === 0, falsi)
  x = simula({ salta: [3] })
  check('⭐ una ripetizione saltata non si conta (4 su 5) e si sa quale', x.r.fatti === 4 && x.r.mancate.join() === '3', [x.r.fatti, x.r.mancate])
  x = simula({ prof: 0.06 })
  check('⛔ un accenno di 6 cm non è uno squat', x.r.fatti === 0)
  x = simula({ ritmo: F.RITMI.medio, n: 8 })
  check('⭐ ritmo medio, 8 ripetizioni: 8 contate', x.r.fatti === 8 && x.r.aTempo === 8, [x.r.fatti, x.r.aTempo])
  x = simula({ senzaA: true })
  check('⭐ telefono senza accelerazione «senza gravità»: conta lo stesso', x.r.fatti === 5, x.r.fatti)
  x = simula({ rollDeg: 12 })
  const fondo = x.vivi.filter(v => v.fase === 'fondo' && v.rip === 2)
  check('⭐ mano DESTRA più bassa di 12° in fondo: lato «destra», e si sa per quanti secondi', fondo.every(v => v.lato === 'destra') && x.r.fuori.destraS > 5 && x.r.fuori.sinistraS === 0 && x.r.fuori.destraMax > 11, x.r.fuori)
  x = simula({ rollDeg: -12, ios: true })
  check('⭐ mano SINISTRA più bassa, anche su iPhone: lato «sinistra»', x.r.fuori.sinistraS > 5 && x.r.fuori.destraS === 0 && x.vivi.filter(v => v.fase === 'fondo').every(v => v.lato === 'sinistra'))
  x = simula({ rollDeg: 3 })
  check('⭐ sotto la soglia (3° con soglia 5°): nessun lato', x.r.fuori.destraS === 0 && x.vivi.every(v => v.lato === null))
  x = simula({ pitchDeg: 35 })
  check('⭐ telefono inclinato di 35°: «braccia» fuori · di 15° (uno squat normale) no', x.vivi.some(v => v.braccia) && x.r.fuori.bracciaMax >= 30 && !simula({ pitchDeg: 15 }).vivi.some(v => v.braccia), x.r.fuori)
  x = simula({ cade: 9000 })
  check('⭐ il telefono cade: se ne accorge', x.r.caduta === true && simula({}).r.caduta === false)
  x = simula({ svelto: { anticipo: 0, dura: 1300 }, prof: 0.5 })
  const giu = x.vivi.filter(v => v.fase === 'giu' && v.rip === 3), fo = x.vivi.filter(v => v.fase === 'fondo' && v.rip === 3), pi = x.vivi.filter(v => v.fase === 'piedi' && v.rip === 3)
  check('⭐ la pallina del corpo scende durante la discesa, resta giù in fondo, torna in cima in piedi', giu[giu.length - 1].corpo > 0.6 && fo.every(v => v.corpo > 0.5) && pi.slice(-10).every(v => v.corpo < 0.1), [giu[giu.length - 1].corpo, Math.min(...fo.map(v => v.corpo)), pi[pi.length - 1].corpo])
  let conto = 0, indietro = false
  for (const v of x.vivi) { if (v.ripetizioni < conto) indietro = true; conto = v.ripetizioni }
  check('⭐ il conto sale appena finito lo squat e non torna mai indietro', !indietro && x.vivi.filter(v => v.fase === 'piedi' && v.rip === 2).slice(-1)[0].ripetizioni === 2)
  x = simula({})
  const fr = F.frasi(x.r).join(' ')
  check('⛔ le frasi descrivono, non giudicano', /stima/.test(fr) && /lo decide il professionista/.test(fr) && /Squat contati: 5/.test(fr) && !/corrett|sbagliat|giust|bravo|bene|male/i.test(fr), fr)

  // ⭐⭐ I TRACCIATI VERI (Giuliano, iPhone, 7 ottobre). Sono i due su cui il conto è stato costruito:
  // dicono che non si rompe, non che è giusto su un telefono o una persona nuovi.
  const rigioca = (file) => {
    const tr = JSON.parse(fs.readFileSync(file, 'utf8'))
    const sv = F.crea({ ritmo: F.RITMI[tr.scelte.ritmo], n: tr.scelte.n, soglie: { mani: tr.scelte.sogliaMani } })
    let max = 0, ordinato = true
    for (let i = 0; i < tr.t.length; i++) {
      const v = F.aggiungi(sv, { t: tr.t[i], ag: { x: tr.ag[i][0], y: tr.ag[i][1], z: tr.ag[i][2] }, a: { x: tr.a[i][0], y: tr.a[i][1], z: tr.a[i][2] } })
      if (v.ripetizioni < max) ordinato = false; max = Math.max(max, v.ripetizioni)
    }
    return { r: F.riassunto(sv), ordinato }
  }
  let v1 = rigioca('prova-guidato-traccia-1.json')
  check('⭐⭐ tracciato vero 1 (5 squat normali; la prima versione ne contava 4): 5 contati, 5 a tempo', v1.r.fatti === 5 && v1.r.aTempo === 5 && v1.ordinato, [v1.r.fatti, v1.r.aTempo])
  check('⭐ tracciato vero 1: mani pari, nessun allarme, discese più svelte del ritmo', v1.r.fuori.destraS < 0.5 && v1.r.fuori.sinistraS < 0.5 && v1.r.fuori.bracciaS < 0.5 && v1.r.tempi.giu > 1 && v1.r.tempi.giu < 3, [v1.r.fuori, v1.r.tempi])
  let v2 = rigioca('prova-guidato-traccia-2.json')
  check('⭐⭐ tracciato vero 2 (errori apposta; la seconda versione ne contava 3 con un fondo di 3 metri): 5 squat, 4 a tempo, 1 fuori tempo', v2.r.fatti === 5 && v2.r.aTempo === 4 && v2.r.fuoriTempo === 1 && v2.ordinato, [v2.r.fatti, v2.r.aTempo])
  check('⭐ tracciato vero 2: lo squat fuori tempo è il secondo, e la ripetizione 2 risulta mancata', v2.r.squat[1].aTempo === false && v2.r.mancate.join() === '2', [v2.r.squat.map(q => q.rip), v2.r.mancate])
  check('⭐ tracciato vero 2: mano sinistra giù per più di 3 secondi (oltre 40°), telefono inclinato oltre 30°', v2.r.fuori.sinistraS > 3 && v2.r.fuori.sinistraMax > 40 && v2.r.fuori.bracciaMax > 30, v2.r.fuori)
  check('⛔ tracciato vero 2: nessun fondo assurdo (tutti sotto il metro e mezzo) e il telefono abbassato a fine prova non conta', v2.r.squat.every(q => q.discesaCm < 150) && !v2.r.discesaSola, v2.r.squat.map(q => q.discesaCm))
  const src = fs.readFileSync('js/guida-motore.js', 'utf8').replace(/\/\*[^]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('⛔ js/guida-motore.js non parla con la rete e non scrive niente', !/supabase|fetch\(|localStorage|document\./.test(src))
}

// il telefono finto nella pagina: segue il programma della pagina
const TELEFONO = ({ prof, rollDeg, tenuto, nulla, cadeDopo, ruota }) => {
  if (window.__ivT) clearInterval(window.__ivT)
  window.__tel = { prof, rollDeg, tenuto, nulla, cadeDopo, ruota }
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
    Object.defineProperty(e, 'rotationRate', { value: { alpha: o.ruota || 0, beta: 0, gamma: 0 } })
    window.dispatchEvent(e)
  }, 16)
}
const SUPA = ({ email }) => {
  const q = () => { const api = { select() { return api }, eq() { return api }, order() { return api }, limit() { return api }, in() { return api }, gte() { return api }, not() { return api }, is() { return api },
    async maybeSingle() { return { data: null, error: null } }, then(r) { r({ data: [], error: null }) } }; return api }
  window.supabase = { createClient() { return { auth: { getSession: async () => ({ data: { session: email ? { user: { id: 'U1', email } } : null } }) }, from: q, rpc: async () => ({ data: null, error: null }) } } }
}

// il Supabase finto del TELEFONO quando la TV è collegata: una sessione, il canale dei test aperto, e si vede cosa parte
const SUPA_TV = () => {
  window.__inv = []; window.__rpc = []
  window.supabase = { createClient() { return {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'U1', email: 'appuntamentimft@gmail.com' } } } }) },
    rpc: async (nome) => { window.__rpc.push(nome); return { data: nome === 'oscillazione_canale' ? 'OSC1' : null, error: null } },
    channel(nome) { const c = { on() { return c }, subscribe() { return c }, send(m) { window.__inv.push([nome, m.event, m.payload, performance.now()]) } }; return c },
    from() { window.__from = true; const a = { select() { return a }, eq() { return a }, maybeSingle: async () => ({ data: null, error: null }) }; return a }
  } } }
}
// il Supabase finto della TV (come in prova-tv.mjs): già collegata, in ascolto sul canale dei test
const FINTO_TV = () => {
  window.__fk = { canali: {} }
  window.supabase = { createClient() { return {
    auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => ({ error: null }) },
    rpc: async (nome) => {
      if (nome === 'tv_nuovo') return { data: 'K7P3MX', error: null }
      if (nome === 'tv_stato') return { data: { collegata: true, schermo: 'TV1', oscillazione: 'OSC1' }, error: null }
      return { data: null, error: null }
    },
    channel(nome) { const h = {}; const c = { on(_t, f, cb) { h[f.event] = cb; return c }, subscribe() { return c }, send() {} }; window.__fk.canali[nome] = h; return c },
    removeChannel() {}
  } } }
  window.__emetti = (can, ev, payload) => { const h = window.__fk.canali[can]; if (!h || !h[ev]) return false; h[ev]({ payload }); return true }
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
  if (opz && opz.script) await page.addInitScript(opz.script)
  // una voce finta che «parla» per un tempo vero: si vede chi taglia chi
  if (opz && opz.voceFinta) await page.addInitScript((ms) => {
    const V = window.__voce = { log: [], fino: 0 }
    const finta = { get speaking() { return performance.now() < V.fino }, get pending() { return false },
      cancel() { if (performance.now() < V.fino) V.log.push(['taglia', '', performance.now()]); V.fino = 0 },
      speak(u) { if (!u.text || !u.text.trim()) return; V.log.push(['parla', u.text, performance.now()]); V.fino = performance.now() + (u.text.length > 6 ? ms : 350) } }
    Object.defineProperty(window, 'speechSynthesis', { get() { return finta }, configurable: true })
    window.SpeechSynthesisUtterance = function (t) { this.text = t }
  }, opz.voceFinta)
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
    check('⭐ freccia in giù e scritta GIÙ durante la discesa', await page.textContent('[data-gs="fase"]') === 'GIÙ' && !(await page.evaluate(() => document.querySelector('[data-gs="freccia"]').classList.contains('su'))))
    check('⭐ MI FERMO è dentro lo schermo e si può toccare', await page.evaluate(() => { const r = document.getElementById('btn-fermo').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= innerHeight && r.height >= 44 && !!e.closest('#btn-fermo') }))
    check('⭐ la pallina del corpo è scesa e sta dentro la pista', await page.evaluate(() => { const p = document.querySelector('[data-gs="corpo"]').getBoundingClientRect(), q = document.querySelector('[data-gs="pista-corpo"]').getBoundingClientRect(); return p.top > q.top + q.height * 0.15 && p.bottom <= q.bottom + 1 && p.top >= q.top - 1 }))
    if (FOTO) await page.screenshot({ path: FOTO + '/palco-giu.png' })
    await page.waitForFunction(() => window.__guidato.vivo() && window.__guidato.vivo().fase === 'su', null, { timeout: 8000 })
    await page.waitForTimeout(700)
    check('⭐ in risalita la freccia si gira', await page.textContent('[data-gs="fase"]') === 'SU' && await page.evaluate(() => document.querySelector('[data-gs="freccia"]').classList.contains('su')))
    if (FOTO) await page.screenshot({ path: FOTO + '/palco-su.png' })
    await finita(page)
    const e = await page.evaluate(() => window.__guidato.esito())
    check('⭐ a fine prova: 1 squat contato su 1, a tempo, circa 40 cm stimati', e.r.fatti === 1 && e.r.aTempo === 1 && Math.abs(e.r.discesaCm.media - 40) <= 6 && !e.fermato, [e.r.fatti, e.r.aTempo, e.r.discesaCm])
    check('⭐ il palco si chiude e compare l’esito', !(await page.evaluate(() => document.getElementById('palco').classList.contains('on'))) && await page.isVisible('#c-esito'))
    check('⭐ l’esito: tabella coi secondi, gomitolo, frasi, «stima non ancora verificata»', (await page.$$('table.rip tr')).length === 2 && /\d,\d s/.test(await page.textContent('table.rip')) && !!(await page.$('svg.gomitolo')) && /stima non ancora verificata/.test(await page.textContent('#esito')) && /per scendere/.test(await page.textContent('.grandi')) && /a tempo · 1ª/.test(await page.textContent('table.rip')))
    check('⭐ la voce: fermo, giù, su, fatto', await page.evaluate(() => { const d = window.__guidato.dette().join('|'); return /Fermo\./.test(d) && /Giù\./.test(d) && /Su\./.test(d) && /Fatto\. 1 squat contato, a tempo\./.test(d) }))
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-scarica')])
    const tr = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'))
    check('⭐ il tracciato si scarica: sensori grezzi, eventi, nome col giorno', /^squat-guidato-\d{8}-\d{4}\.json$/.test(dl.suggestedFilename()) && tr.t.length > 200 && tr.ag.length === tr.t.length && tr.a.length === tr.t.length && tr.eventi.length >= 5 && tr.riassunto.fatti === 1, [dl.suggestedFilename(), tr.t.length])
    if (FOTO) { await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200); await page.screenshot({ path: FOTO + '/esito.png', fullPage: true }) }
    check('⛔ nessun errore JavaScript', errori.length === 0, errori)
    await ctx.close()
  }

  sez('⭐⭐ rotazione bloccata (pagina 390×844, telefono in orizzontale): il palco si gira da solo · mano destra più bassa')
  {
    const { page, ctx, errori } = await apri({ width: 390, height: 844 }, '?via=1&n=1', { voceFinta: 1500 })
    if (FOTO) await page.screenshot({ path: FOTO + '/setup.png', fullPage: true })
    check('⛔ la pagina di preparazione non sborda (390 px)', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.evaluate(TELEFONO, { prof: 0.4, rollDeg: 12 })
    await page.click('#btn-start')
    await page.waitForFunction(() => window.__guidato.vivo() && window.__guidato.vivo().fase === 'fondo', null, { timeout: 12000 })
    await page.waitForTimeout(400)
    const s = await page.evaluate(() => { const r = document.getElementById('palco').getBoundingClientRect(); return { rot: window.__guidato.rot(), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      dx: document.querySelector('[data-gs="dx"]').classList.contains('rossa'), sx: document.querySelector('[data-gs="sx"]').classList.contains('rossa'), bg: document.querySelector('[data-gs="dx"]').style.background, bgs: document.querySelector('[data-gs="sx"]').style.background } })
    check('⭐ il palco è ruotato di 90° e copre tutto lo schermo', s.rot === 90 && s.box.join() === '0,0,390,844', s)
    check('⭐ metà DESTRA rossa con «PIÙ BASSA», metà sinistra verde', s.dx && !s.sx && /225, 17, 17/.test(s.bg) && /10, 125, 51/.test(s.bgs), s)
    if (FOTO) await page.screenshot({ path: FOTO + '/palco-ruotato-rosso.png' })
    await finita(page)
    check('⭐ la voce lo dice una volta: «Alza la mano destra.»', await page.evaluate(() => window.__guidato.dette().filter(x => x === 'Alza la mano destra.').length === 1))
    const vv = await page.evaluate(() => window.__voce)
    const iCorr = vv.log.findIndex(x => x[0] === 'parla' && x[1] === 'Alza la mano destra.')
    const dopo = vv.log.slice(iCorr + 1).filter(x => x[2] - vv.log[iCorr][2] < 1500)
    check('⭐⭐ la correzione NON viene tagliata: nel secondo e mezzo in cui parla nessuno la interrompe e nessun «Giù / Su» le si accoda', iCorr >= 0 && dopo.every(x => x[0] !== 'taglia' && x[0] !== 'parla'), dopo)
    const parlate = vv.log.filter(x => x[0] === 'parla'), sopra = parlate.filter((x, i) => i > 0 && x[2] < parlate[i - 1][2] + (parlate[i - 1][1].length > 6 ? 1500 : 350) && !vv.log.some(y => y[0] === 'taglia' && y[2] > parlate[i - 1][2] && y[2] <= x[2]))
    check('⭐ durante l’esercizio nessuna frase parte sopra un’altra: quella che cadrebbe in mezzo si salta', sopra.length === 0 && vv.log.filter(x => x[0] === 'taglia').length <= 1, [sopra, await page.evaluate(() => window.__guidato.saltate())])
    check('⭐ nell’esito: «La mano destra è rimasta più bassa per … secondi»', /La mano destra è rimasta più bassa per \d/.test(await page.textContent('#esito')))
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
    check('⭐ MI FERMO: si ferma subito, dice «fermato», tiene quello che ha visto (1 su 3)', e.fermato === 'mano' && e.r.fatti === 1 && /Fermato prima della fine/.test(await page.textContent('#e-tit')), e.r.intere)
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
    // guidato-v2 · finché il telefono si muove non si parte
    await page.evaluate(() => { window.__tel.ruota = 120 })
    await page.click('#btn-start')
    await page.waitForFunction(() => /Fermo così/.test(document.getElementById('v-tit').textContent) && window.__guidato.velo(), null, { timeout: 9000 })
    await page.waitForTimeout(600)
    check('⭐⭐ finito il conto alla rovescia, se il telefono si muove ancora aspetta: «Fermo così»', await page.evaluate(() => window.__guidato.stato() === null && window.__guidato.velo()))
    await page.evaluate(() => { window.__tel.ruota = 0 })
    await page.waitForFunction(() => window.__guidato.stato() !== null && !window.__guidato.velo(), null, { timeout: 3000 })
    check('⭐ appena è fermo, parte', true)
    await page.evaluate(() => document.getElementById('btn-fermo').click())
    await finita(page)
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
    x = await apri({ width: 390, height: 844 }, '', { blocca: '**/js/guida-schermo.js*' })
    check('⭐ senza js/guida-schermo.js la pagina resta in piedi e dice cosa manca', /guida-schermo\.js/.test(await x.page.textContent('#err')) && !(await x.page.isVisible('#btn-start')) && x.errori.length === 0, x.errori)
    await x.ctx.close()
    const rpc = (src.match(/\.rpc\('([a-z_]+)'/g) || []).join(' ')
    check('⛔ la pagina non legge e non scrive tabelle: solo il canale della TV (2 RPC del canale, nessun .from, nessun fetch)', !/\.from\(|fetch\(|XMLHttpRequest|sendBeacon|storage\./.test(src) && /oscillazione_canale/.test(rpc) && /oscillazione_apri_canale/.test(rpc) && (src.match(/\.rpc\(/g) || []).length === 2, rpc)
    check('⛔ sul telefono resta scritta solo la scelta «capovolto»', (src.match(/localStorage\.setItem/g) || []).length === 1 && /CHIAVE_GIRO/.test(src) && !/sessionStorage|indexedDB/.test(src))
    check('⛔ niente alert / confirm', !/\balert\(|\bconfirm\(/.test(src))
  }

  sez('⭐⭐ LA TV · il telefono manda il palco sul canale dei test')
  {
    const { page, ctx, errori } = await apri({ width: 844, height: 390 }, '?via=1&n=1', { script: SUPA_TV })
    await page.waitForFunction(() => window.__guidato.tv(), null, { timeout: 4000 })
    check('⭐ con la TV collegata lo dice in cima («TV collegata») e si aggancia al canale già aperto, senza aprirne', await page.isVisible('#tv-stato') && (await page.evaluate(() => window.__rpc.join())) === 'oscillazione_canale')
    await page.click('#ritmo .chip[data-r="medio"]')
    await page.evaluate(TELEFONO, { prof: 0.4, rollDeg: 12 })
    await page.click('#btn-start')
    await finita(page)
    const inv = await page.evaluate(() => window.__inv)
    const vivi = inv.filter(x => x[1] === 'gd-vivo'), fine = inv.filter(x => x[1] === 'gd-fine')
    check('⭐ parte «gd-via», poi il palco in diretta, poi «gd-fine», tutto su oscillazione:OSC1', inv[0][1] === 'gd-via' && inv[0][2].n === 1 && vivi.length > 30 && fine.length === 1 && inv.every(x => x[0] === 'oscillazione:OSC1'), [inv.length, vivi.length])
    const durata = (vivi[vivi.length - 1][3] - vivi[0][3]) / 1000
    check('⭐ non più di 10 messaggi al secondo', vivi.length / durata <= 10, vivi.length / durata)
    const chiavi = [...new Set(vivi.flatMap(x => Object.keys(x[2])))].sort().join()
    check('⛔ sul canale passano solo fasi, angoli e conti (nessun nome, nessun paziente)', chiavi === 'braccia,corpo,discese,fase,lato,n,p,pitch,ripetizioni,roll,sogliaBraccia,sogliaMani' && vivi.some(x => x[2].lato === 'destra') && vivi.some(x => x[2].fase === 'su'), chiavi)
    check('⭐ l’esito che va alla TV: squat contati, a tempo, secondi, frasi', fine[0][2].fatti === 1 && fine[0][2].aTempo === 1 && fine[0][2].n === 1 && fine[0][2].tempi.giu > 0 && fine[0][2].frasi.length >= 4 && fine[0][2].fuori.destraS > 0, fine[0][2])
    check('⛔ la pagina non ha letto nessuna tabella', !(await page.evaluate(() => window.__from)))
    check('⛔ nessun errore JavaScript', errori.length === 0, errori)
    await ctx.close()
    const x = await apri({ width: 844, height: 390 }, '?via=1&n=1')
    check('⭐ senza account o senza TV: nessun avviso, nessun canale, e la prova si fa lo stesso', !(await x.page.isVisible('#tv-stato')) && !(await x.page.evaluate(() => window.__guidato.tv())))
    await x.ctx.close()
  }

  sez('⭐⭐ LA TV · lo Schermo TV mostra il palco e l’esito')
  {
    const { page, ctx, errori } = await apri({ width: 1920, height: 1080 }, '', { pagina: 'tv.html', script: FINTO_TV })
    await page.waitForFunction(() => window.__tv && window.__tv.collegata() && window.__fk.canali['oscillazione:OSC1'], null, { timeout: 8000 })
    check('⭐ la TV è collegata e in attesa', await page.evaluate(() => window.__tv.vista()) === 'attesa')
    await page.evaluate(() => window.__emetti('oscillazione:OSC1', 'gd-via', { n: 5, sogliaMani: 5, sogliaBraccia: 20 }))
    await page.waitForTimeout(700)
    check('⭐⭐ parte lo squat guidato → la TV passa al palco da sola: FERMO, 0/5', await page.evaluate(() => window.__tv.vista()) === 'gd' && await page.textContent('#v-gd [data-gs="fase"]') === 'FERMO' && /^0\/5$/.test(await page.textContent('#v-gd [data-gs="conta"]')))
    await page.evaluate(() => window.__emetti('oscillazione:OSC1', 'gd-vivo', { fase: 'giu', n: 5, ripetizioni: 2, discese: 3, p: 0.6, corpo: 0.7, roll: 14, pitch: 3, lato: 'destra', braccia: false, sogliaMani: 5, sogliaBraccia: 20 }))
    await page.waitForTimeout(500)
    const t = await page.evaluate(() => { const q = k => document.querySelector('#v-gd [data-gs="' + k + '"]'), r = q('corpo').getBoundingClientRect(), pr = q('pista-corpo').getBoundingClientRect(), pal = document.getElementById('v-gd').getBoundingClientRect()
      return { fase: q('fase').textContent, conta: q('conta').textContent, dx: q('dx').classList.contains('rossa'), sx: q('sx').classList.contains('rossa'), mezze: q('mezze').textContent,
        giu: (r.top - pr.top) / pr.height, dentro: pal.width > 1900 && pal.height > 1070, alza: q('dx').textContent } })
    check('⭐⭐ in diretta: GIÙ, 2/5, «discesa contata», metà DESTRA rossa con «ALZA LA MANO», pallina del corpo a due terzi', t.fase === 'GIÙ' && t.conta === '2/5' && t.dx && !t.sx && /discesa contata/.test(t.mezze) && /ALZA/.test(t.alza) && t.giu > 0.4 && t.giu < 0.75, t)
    check('⭐ il palco riempie la TV (1920×1080)', t.dentro)
    if (FOTO) await page.screenshot({ path: FOTO + '/tv-palco.png' })
    await page.evaluate(() => window.__emetti('oscillazione:OSC1', 'gd-fine', { fatti: 5, aTempo: 4, n: 5, tempi: { giu: 1.1, su: 1, chiestiGiu: 3, chiestiSu: 3 }, fuori: { destraS: 1, sinistraS: 3.8, bracciaS: 4.8, destraMax: 17.4, sinistraMax: 43.1, bracciaMax: 35.6 }, fermato: null,
      frasi: ['Squat contati: 5 (ne erano chiesti 5). A tempo con la voce: 4. Fuori tempo: 1.', 'La mano sinistra è rimasta più bassa per 3,8 secondi, fino a 43,1°.', 'Sono i numeri del telefono. Cosa vogliono dire lo decide il professionista.'] }))
    await page.waitForTimeout(800)
    const e = await page.textContent('#v-gde')
    check('⭐⭐ finito → l’esito in grande: 5/5 contati, 4 a tempo, 1,1 s, mano sinistra 43,1°, le frasi', await page.evaluate(() => window.__tv.vista()) === 'gde' && /5\/5/.test(e) && /a tempo con la voce/.test(e) && /1,1/.test(e) && /43,1°/.test(e) && /mano sinistra più bassa/.test(e) && /stime in prova/.test(e) && /lo decide il professionista/.test(e), e)
    check('⛔ l’esito sta dentro lo schermo', await page.evaluate(() => { const f = document.querySelector('#v-gde .gse-frasi').getBoundingClientRect(); return f.bottom <= innerHeight && f.right <= innerWidth }))
    if (FOTO) await page.screenshot({ path: FOTO + '/tv-esito.png' })
    await page.evaluate(() => window.__emetti('oscillazione:OSC1', 'sq-via', { asse: 'rollio', n: 5, durata: 42, zb: 1, zg: 0.5, vb: 1, vg: 1 }))
    await page.waitForTimeout(300)
    check('⭐ e poi un altro test (lo squat sulla tavola) prende la TV come prima', await page.evaluate(() => window.__tv.vista()) === 'sq')
    check('⛔ nessun errore JavaScript sulla TV', errori.length === 0, errori)
    await ctx.close()
    const x = await apri({ width: 1920, height: 1080 }, '', { pagina: 'tv.html', script: FINTO_TV, blocca: '**/js/guida-schermo.js*' })
    await x.page.waitForFunction(() => window.__tv && window.__tv.collegata() && window.__fk.canali['oscillazione:OSC1'], null, { timeout: 8000 })
    await x.page.evaluate(() => { window.__emetti('oscillazione:OSC1', 'gd-via', { n: 5 }); window.__emetti('oscillazione:OSC1', 'gd-vivo', { fase: 'giu' }); window.__emetti('oscillazione:OSC1', 'gd-fine', {}) })
    await x.page.waitForTimeout(300)
    check('⛔ se js/guida-schermo.js non arriva, la TV resta in piedi (attesa) e non dà errori', await x.page.evaluate(() => window.__tv.vista()) === 'attesa' && x.errori.length === 0, x.errori)
    await x.page.evaluate(() => window.__emetti('oscillazione:OSC1', 'sq-via', { asse: 'rollio', n: 5, durata: 42, zb: 1, zg: 0.5, vb: 1, vg: 1 }))
    await x.page.waitForTimeout(300)
    check('⛔ e gli altri test sulla TV vanno lo stesso', await x.page.evaluate(() => window.__tv.vista()) === 'sq')
    await x.ctx.close()
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
