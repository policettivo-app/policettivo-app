/* prova-squat.mjs — squat-v1
 * L'overhead squat sulla Tavola, provato davvero in Chromium: sensore finto
 * che SEGUE la voce (una persona che scende, si ferma, risale), finto
 * Supabase, taratura letta dall'Oscillazione, salvataggio in squat_test.
 *   node prova-squat.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd(), PORT = 8495
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PID = '33333333-3333-4333-8333-333333333333'
const MIME = { '.html': 'text/html', '.js': 'text/javascript' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  const f = path.join(ROOT, u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f))
})
let ok = 0, ko = 0; const fallite = []
function check(n, c, x) { if (c) { ok++; console.log('  ✅ ' + n) } else { ko++; fallite.push(n); console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')) } }
function sez(t) { console.log('\n── ' + t) }

// il finto Supabase: sessione, professionista, paziente, test_sessioni, squat_test
const SUPA = (o) => {
  window.__db = { inserite: [] }
  const q = (tab) => {
    const st = { riga: null }
    const api = {
      select() { return api }, eq() { return api }, order() { return api }, limit() { return api },
      insert(r) { st.riga = r; return api },
      maybeSingle() {
        if (st.riga) {
          if (tab === 'squat_test' && o.senza050) return Promise.resolve({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.squat_test' in the schema cache" } })
          window.__db.inserite.push({ tab, d: st.riga })
          return Promise.resolve({ data: { id: tab + '-' + window.__db.inserite.length, quando: new Date().toISOString() }, error: null })
        }
        if (tab === 'professionals') return Promise.resolve({ data: { id: 'PROF1' }, error: null })
        if (tab === 'patients') return Promise.resolve({ data: { nome: 'Mario', cognome: 'Rossi' }, error: null })
        if (tab === 'test_sessioni') return Promise.resolve({ data: null, error: null })
        return Promise.resolve({ data: null, error: null })
      }
    }
    return api
  }
  window.supabase = { createClient() { return {
    auth: { getSession: async () => ({ data: { session: o.sessione ? { user: { id: 'U1', email: o.admin ? 'appuntamentimft@gmail.com' : 'collega@studio.it' } } : null } }) },
    from: q
  } } }
}

// il sensore finto: la tavola vuota allo zero, poi una persona che segue la voce.
// Il corpo segue con lo STESSO ritardo che la pagina mette in conto (REAZ).
const SENSORE = (o) => {
  const zb = 1, zg = 0.5
  setInterval(() => {
    const S = window.__squat
    let v = 0, sec = 0
    const fase = S ? S.fase() : null
    if (fase === 'zero') { v = o.mossoAlloZero ? Math.sin(performance.now() / 50) * 1.2 : 0 }
    else if (fase === 'attesa' || (fase && S.t0() == null)) { v = o.inizio }
    else if (fase && fase !== 'fine') {
      const f = window.PolSquat.faseDi(S.PROG, performance.now() - S.t0() - S.REAZ)
      const k = f ? f.fase : 'piedi'
      v = k === 'fondo' ? (f.rip === 3 && o.rip3 != null ? o.rip3 : o.fondo) : (k === 'giu' || k === 'su') ? o.passaggio : o.inizio
      sec = k === 'fondo' ? o.secondario : 0
    }
    const e = new Event('deviceorientation')
    // v è il carico VERO: il telefono lo vede col segno della taratura (verso)
    const b = zb + (o.asse === 'beccheggio' ? v * o.vb : sec * o.vb)
    const g = zg + (o.asse === 'rollio' ? v * o.vg : sec * o.vg)
    Object.defineProperty(e, 'beta', { value: b }); Object.defineProperty(e, 'gamma', { value: g })
    window.dispatchEvent(e)
  }, 16)
}

await new Promise(r => server.listen(PORT, r))
const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] })

async function apri(opz = {}) {
  const o = Object.assign({ sessione: true, admin: false, tarato: true, vb: 1, vg: 1, asse: 'rollio', fondo: 3, rip3: null, passaggio: 1.5, inizio: 0.2, secondario: 0.4, pid: true }, opz)
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } })
  const page = await ctx.newPage()
  const errori = []; page.on('pageerror', e => errori.push(String(e)))
  await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await page.addInitScript(SUPA, o)
  if (o.tarato) await page.addInitScript(([vb, vg]) => { localStorage.setItem('policettivo.oscillazione.verso.v1', JSON.stringify({ beta: vb, gamma: vg, quando: '2026-09-20' })) }, [o.vb, o.vg])
  await page.addInitScript(SENSORE, o)
  await page.goto('http://localhost:' + PORT + '/prova-squat.html?via=1&veloce=1' + (o.pid ? '&pid=' + PID : ''), { waitUntil: 'load' })
  await page.waitForTimeout(300)
  return { page, ctx, errori, o }
}
async function squat(page) {
  const prima = await page.evaluate(() => window.__squat.prove().length)
  await page.click('#btn-start')
  await page.waitForFunction(n => window.__squat.prove().length > n || document.getElementById('err').style.display === '', prima, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(300)
}

try {
  sez('⭐ la pagina')
  {
    const { page, ctx, errori } = await apri()
    const t = await page.textContent('body')
    check('nessun errore JS', errori.length === 0, errori)
    check('⭐ dice cosa misura e cosa NO (non sono chili, non vede ginocchia…)', /non sono chili/.test(t) && /ginocchia, talloni, tronco e braccia/.test(t))
    check('⭐ destra–sinistra spiega il cuscino col giallo ai lati', /GIALLO ai lati/.test(await page.textContent('#spiega')))
    await page.click('#assi .chip[data-a="beccheggio"]')
    check('   avanti–indietro: giallo davanti e dietro, punte o talloni', /GIALLO davanti e dietro/.test(await page.textContent('#spiega')) && /TALLONI/.test(await page.textContent('#spiega')))
    check('⭐ il pulsante dice cosa fa partire', /avanti – indietro/.test(await page.textContent('#pf-cosa')))
    check('⭐ telefono tarato (letto dall’Oscillazione): PARTI acceso', /Telefono tarato/.test(await page.textContent('#stato-taratura')) && !(await page.$eval('#btn-start', b => b.disabled)))
    check('⭐ paziente in alto', /Mario Rossi/.test(await page.textContent('#paz-banda')))
    check('⭐ «stai accanto al paziente»', /Stai accanto al paziente/.test(t))
    check('⛔ «Copia i dati per Claude» nascosto a un collega', await page.$eval('#strumenti-sviluppo', e => getComputedStyle(e).display === 'none'))
    await ctx.close()
  }

  sez('⛔ telefono NON tarato: niente squat, e dice dove tararlo')
  {
    const { page, ctx } = await apri({ tarato: false })
    const t = await page.textContent('#stato-taratura')
    check('⭐ lo dice in rosso, con il link all’Oscillazione', /non è tarato/.test(t) && await page.$eval('#stato-taratura a', a => /prova-oscillazione\.html\?pid=/.test(a.getAttribute('href'))))
    check('⛔ PARTI spento', await page.$eval('#btn-start', b => b.disabled))
    await ctx.close()
  }

  sez('⭐⭐ destra–sinistra: carico a destra al fondo, 5 ripetizioni su 5')
  {
    const { page, ctx, errori } = await apri()
    await squat(page)
    check('nessun errore JS', errori.length === 0, errori)
    const r = await page.evaluate(() => window.__squat.prove()[0].r)
    check('⭐⭐ al fondo +3,0° = «più a destra»', Math.abs(r.fondo.media - 3) < 0.05 && r.fondo.parola === 'più a destra', r.fondo)
    check('⭐ discesa e risalita +1,5°', Math.abs(r.fasi.giu.media - 1.5) < 0.05 && Math.abs(r.fasi.su.media - 1.5) < 0.05, r.fasi)
    check('⭐ in piedi prima di scendere: al centro (0,2°)', Math.abs(r.inizio - 0.2) < 0.05 && /al centro/.test(await page.textContent('#esito')), r.inizio)
    check('⭐ dalla stessa parte 5 su 5', r.coerenza.stessa === 5 && r.coerenza.di === 5, r.coerenza)
    check('⭐ l’altro asse al fondo (+0,4°) si riporta', Math.abs(r.secondario.fondo - 0.4) < 0.05, r.secondario)
    const e = await page.textContent('#esito')
    check('⭐ a schermo: «più a destra» e 3,0°', /più a destra/.test(e) && /3,0°/.test(e))
    check('⭐ cinque barre, una per ripetizione', (await page.$$('#esito svg rect')).length === 5)
    check('⭐ il gomitolo è disegnato', await page.$eval('#cv-esito', c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > 1000 }))
    check('⭐ le frasi: «schema che si ripete», e chiudono sull’interpretazione tua', /schema che si ripete/.test(e) && /L’interpretazione clinica la scrivi tu/.test(e))
    check('⛔ nessuna parola clinica', !/deficit|diagnosi|patologic|nella norma/i.test(e))
    check('⭐ si torna alla preparazione, con l’esito sotto', await page.isVisible('#c-setup') && await page.isVisible('#c-esito') && !(await page.isVisible('#c-misura')))
    const ins = await page.evaluate(() => window.__db.inserite)
    const sq = ins.filter(x => x.tab === 'squat_test')
    check('⭐⭐ si salva UNA riga in squat_test', sq.length === 1, ins.map(x => x.tab))
    const d = sq[0] ? sq[0].d : {}
    check('⭐ nella cartella del paziente e nella sessione dei test', d.patient_id === PID && d.sessione_id === 'test_sessioni-1' && ins[0].tab === 'test_sessioni', [d.patient_id, d.sessione_id])
    check('⭐ con asse, fondo, fasi, coerenza, verso, zero, taratura', d.asse === 'rollio' && Math.abs(d.fondo - 3) < 0.05 && d.coerenza === 5 && d.verso_gamma === 1 && d.tarato === true && Math.abs(d.zero_gamma - 0.5) < 0.01 && d.dettagli.ripetizioni.length === 5, d)
    check('⭐ con la traccia grezza a 10 Hz', d.traccia && d.traccia.t.length > 10 && d.traccia_hz === 10)
    check('⭐ lo dice: «Salvato nella cartella di Mario Rossi, nella sessione»', /Salvato nella cartella di Mario Rossi, nella sessione/.test(await page.textContent('#salva-stato')))
    await page.screenshot({ path: '_schermate/squat-esito.png', fullPage: true })
    await ctx.close()
  }

  sez('⭐⭐ la taratura conta: stesso movimento, telefono girato → il verso lo raddrizza')
  {
    const { page, ctx } = await apri({ vg: -1 })
    await squat(page)
    const r = await page.evaluate(() => window.__squat.prove()[0].r)
    check('⭐⭐ con verso −1 il carico vero a destra resta «più a destra»', Math.abs(r.fondo.media - 3) < 0.05 && r.fondo.parola === 'più a destra', r.fondo)
    await ctx.close()
  }

  sez('⭐ avanti–indietro: sui talloni, e una ripetizione che va dall’altra parte')
  {
    const { page, ctx } = await apri({ asse: 'beccheggio', fondo: -2.5, rip3: 1 })
    await page.click('#assi .chip[data-a="beccheggio"]')
    await squat(page)
    const r = await page.evaluate(() => window.__squat.prove()[0].r)
    check('⭐ «più indietro (talloni)»', r.fondo.parola === 'più indietro (talloni)', r.fondo)
    check('⭐ dalla stessa parte 4 su 5', r.coerenza.stessa === 4, r.coerenza)
    const d = (await page.evaluate(() => window.__db.inserite)).find(x => x.tab === 'squat_test').d
    check('salvato come beccheggio', d.asse === 'beccheggio')
    await ctx.close()
  }

  sez('⭐⭐ prima e dopo i 3 Respiri, stessa seduta')
  {
    const { page, ctx } = await apri()
    await page.click('#momento .chip[data-m="pre"]')
    check('il pulsante dice «prima dei 3 Respiri»', /prima dei 3 Respiri/.test(await page.textContent('#pf-cosa')))
    await ctx.close()
  }
  {
    // due pagine non servono: si prova il confronto sui risultati veri di due squat
    const { page, ctx } = await apri()
    await page.click('#momento .chip[data-m="pre"]'); await squat(page)
    await page.click('#momento .chip[data-m="post"]'); await squat(page)
    const vis = await page.isVisible('#c-confronto')
    await page.evaluate(() => { const p = window.__squat.prove(); p[1].r.fondo.media = 1.0; p[1].r.fondo.parola = window.PolSquat.parola('rollio', 1.0) })
    check('⭐ con un «prima» e un «dopo» compare il confronto', vis)
    const c = await page.evaluate(() => { const p = window.__squat.prove(); return window.PolSquat.confronto(p[0].r, p[1].r) })
    check('⭐ prima 3,0° a destra → dopo 1,0°: distanza dal centro −2,0°', Math.abs(c.delta + 2) < 0.05 && c.parolaDopo === 'al centro', c)
    check('⭐⭐ senza Fase 0 l’esito è «da confermare»', c.esito === 'daconfermare')
    const t = await page.textContent('#confronto')
    check('⭐ a schermo: «da confermare» e «Dopo non vuol dire grazie a»', /da confermare/.test(t) && /non vuol dire «grazie a»/.test(t), t)
    const c2 = await page.evaluate(() => { window.PolSquat.ERRORE.rollio = 0.8; const p = window.__squat.prove(); return window.PolSquat.confronto(p[0].r, p[1].r) })
    check('⭐ con la soglia misurata (0,8°): «meglio», cioè più al centro', c2.esito === 'meglio' && c2.errore === 0.8, c2)
    const righe = (await page.evaluate(() => window.__db.inserite)).filter(x => x.tab === 'squat_test').map(x => x.d.momento)
    check('⭐ salvati con il momento: pre e post', righe.join(',') === 'pre,post', righe)
    check('una sessione sola per i due squat', (await page.evaluate(() => window.__db.inserite)).filter(x => x.tab === 'test_sessioni').length === 1)
    await ctx.close()
  }

  sez('⛔ qualcuno era già sulla tavola allo zero: la prova si rifiuta')
  {
    const { page, ctx } = await apri({ mossoAlloZero: true })
    await squat(page)
    check('⭐ lo dice', /La tavola si è mossa/.test(await page.textContent('#err')))
    check('⛔ nessuno squat e niente salvato', (await page.evaluate(() => window.__squat.prove().length)) === 0 && (await page.evaluate(() => window.__db.inserite.length)) === 0)
    check('si torna alla preparazione', await page.isVisible('#c-setup'))
    await ctx.close()
  }

  sez('⭐ senza la migration 050 lo dice per nome, e i numeri restano a schermo')
  {
    const { page, ctx } = await apri({ senza050: true })
    await squat(page)
    check('⭐ «manca la migration 050_squat_test.sql»', /050_squat_test\.sql/.test(await page.textContent('#salva-stato')))
    check('i numeri ci sono lo stesso', /più a destra/.test(await page.textContent('#esito')))
    await ctx.close()
  }

  sez('senza account: si misura, non si salva; amministratore: strumenti visibili')
  {
    const a = await apri({ sessione: false })
    check('⭐ «gli squat non si salvano»', /non si salvano/.test(await a.page.textContent('#paz-banda')))
    await squat(a.page)
    check('⛔ nessuna scrittura', (await a.page.evaluate(() => window.__db.inserite.length)) === 0)
    check('   ma il risultato c’è', /più a destra/.test(await a.page.textContent('#esito')))
    await a.ctx.close()
    const b = await apri({ admin: true })
    check('⭐ amministratore: «Copia i dati per Claude» c’è', await b.page.$eval('#strumenti-sviluppo', e => getComputedStyle(e).display !== 'none'))
    await b.ctx.close()
  }

  sez('test.html e il motore')
  {
    const th = fs.readFileSync('test.html', 'utf8')
    check('⭐ la casella «Overhead squat» porta a prova-squat.html', /id: 'squat'/.test(th) && /prova-squat\.html/.test(th))
    const src = fs.readFileSync('js/squat.js', 'utf8')
    check('⛔ il motore non usa la rete né il DOM', !/fetch\(|supabase|document\./.test(src))
    check('⭐ il ritmo dura 42 secondi', /inizio: 2000, giu: 3000, fondo: 1000, su: 3000, piedi: 1000/.test(src))
  }
} finally { await browser.close(); server.close() }
console.log('\n' + '='.repeat(66))
console.log(ko === 0 ? `TUTTO VERDE — ${ok} controlli passati.` : `ROSSO — ${ok} passati, ${ko} falliti:\n  - ` + fallite.join('\n  - '))
process.exit(ko === 0 ? 0 : 1)
