/* prova-feedback.mjs — feedback-v1 · migration 056
 * Card «Com'è andata la seduta?» del paziente + dettaglio seduta del professionista.
 *   node prova-feedback.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd(), PORT = 8531
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  const f = path.join(ROOT, u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f))
})
let ok = 0, ko = 0; const fallite = []
function check(n, c, x) { if (c) { ok++; console.log('  ✅ ' + n) } else { ko++; fallite.push(n); console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')) } }
function sez(t) { console.log('\n── ' + t) }

/* finto supabase: rpc per nome, from() concatenabile; registra le chiamate */
const FINTO = (opts) => {
  window.__chiamate = []
  const o = JSON.parse(opts)
  const q = (righe) => { const p = Promise.resolve({ data: righe, error: null }); const c = new Proxy(function () {}, {
    get: (t, k) => k === 'then' ? p.then.bind(p) : (k === 'catch' ? p.catch.bind(p) : (() => c)), apply: () => c }); return c }
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'prova@x.it' } } } }),
            getUser: async () => ({ data: { user: { id: 'u1', email: 'prova@x.it' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    rpc: async (nome, args) => {
      window.__chiamate.push({ nome, args })
      if (nome === 'get_protocol_data') return { data: { patient: { id: 'p1', nome: 'Mario', cognome: 'Prova' }, protocol: { id: 'pr1', nome: 'Protocollo prova', created_at: new Date().toISOString() }, exercises: [], custom_videos: [], elicoidali: [] }, error: null }
      if (nome === 'get_patient_sessions') return { data: o.sedute || [], error: null }
      if (nome === 'update_session_feedback') return o.erroreSalva ? { data: null, error: { message: 'boom' } } : { data: true, error: null }
      if (nome === 'save_therapy_session') return o.erroreSalva ? { data: null, error: { message: 'boom' } } : { data: 'nuova-id', error: null }
      return { data: null, error: null }
    },
    from: (t) => q(t === 'therapy_sessions' ? (o.righe || []) : (t === 'patients' ? [{ id: 'p1', nome: 'Mario', cognome: 'Prova' }] : [])),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), createSignedUrl: async () => ({ data: null }) }) },
    channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {}
  }) }
}

await new Promise(r => server.listen(PORT, r))
const browser = await chromium.launch({ executablePath: CHROME })
const B = 'http://localhost:' + PORT + '/'
async function apri(url, opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' })
  await ctx.route(/^https?:\/\/(?!localhost)/, r => r.request().url().includes('supabase-js') ? r.fulfill({ body: '', contentType: 'text/javascript' }) : r.fulfill({ body: '', status: 200 }))
  await ctx.addInitScript(FINTO, JSON.stringify(opts))
  const p = await ctx.newPage(); const errori = []; const avvisi = []
  p.on('pageerror', e => errori.push(e.message))
  p.on('dialog', d => { avvisi.push(d.message()); d.accept() })
  await p.goto(B + url); await p.waitForTimeout(1200)
  return { p, ctx, errori, avvisi }
}
const TOK = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
try {
  sez('⭐ paziente · seduta di oggi senza feedback → stelle + nota → update_session_feedback')
  let { p, ctx, errori, avvisi } = await apri('protocollo.html?token=' + TOK, { sedute: [{ id: 's1', data_seduta: new Date().toISOString(), feedback_paziente: null }] })
  check('la card si vede', await p.isVisible('#feedback-card'))
  await p.click('.star:nth-child(4)'); await p.fill('#feedback-note', 'meglio <b>la schiena</b>'); await p.click('.btn-feedback'); await p.waitForTimeout(300)
  let ch = await p.evaluate(() => window.__chiamate.filter(c => c.nome === 'update_session_feedback'))
  check('chiama update_session_feedback una volta, con il testo che la 056 sa leggere', ch.length === 1 && ch[0].args.p_feedback === '4 stelle — meglio <b>la schiena</b>' && ch[0].args.p_session_id === 's1', ch)
  check('il paziente legge il ringraziamento', await p.isVisible('#feedback-success'))
  check('nessun avviso di errore', avvisi.length === 0, avvisi)
  check('nessun errore nella pagina', errori.length === 0, errori)
  await ctx.close()

  sez('⭐ paziente · il salvataggio va in errore → avviso, niente ringraziamento')
  ;({ p, ctx, errori, avvisi } = await apri('protocollo.html?token=' + TOK, { sedute: [{ id: 's1', data_seduta: new Date().toISOString(), feedback_paziente: null }], erroreSalva: true }))
  await p.click('.star:nth-child(2)'); await p.click('.btn-feedback'); await p.waitForTimeout(300)
  check('compare l\'avviso «non è stato salvato»', avvisi.some(a => a.includes('non è stato salvato')), avvisi)
  check('il ringraziamento NON compare', !(await p.isVisible('#feedback-success')))
  check('il pulsante resta, si può riprovare', await p.isVisible('.btn-feedback'))
  await ctx.close()

  sez('⭐ paziente · nessuna seduta → save_therapy_session')
  ;({ p, ctx, errori, avvisi } = await apri('protocollo.html?token=' + TOK, { sedute: [] }))
  await p.evaluate(() => { document.getElementById('feedback-card').style.display = 'block' })
  await p.click('.star:nth-child(5)'); await p.click('.btn-feedback'); await p.waitForTimeout(300)
  ch = await p.evaluate(() => window.__chiamate.filter(c => c.nome === 'save_therapy_session'))
  check('chiama save_therapy_session con «5 stelle»', ch.length === 1 && ch[0].args.p_data.feedback_paziente === '5 stelle', ch)
  check('ringraziamento visibile', await p.isVisible('#feedback-success'))
  await ctx.close()

  sez('⭐ paziente · feedback già dato (testo composto dalla 056) → la card non compare')
  ;({ p, ctx, errori, avvisi } = await apri('protocollo.html?token=' + TOK, { sedute: [{ id: 's1', data_seduta: new Date().toISOString(), feedback_paziente: '4 stelle — ok' }] }))
  check('card nascosta', !(await p.isVisible('#feedback-card')))
  await ctx.close()

  const riga = { id: 'r1', patient_id: 'p1', data_seduta: new Date().toISOString(), vas_inizio: 6, vas_fine: 3,
    note_cliniche: 'nota del fisioterapista', feedback_paziente_benessere: 4, feedback_paziente_esercizi: null, feedback_paziente_note: 'meglio <img src=x onerror="window.__xss=1">' }
  for (const pag of ['diario-sedute.html', 'diario.html']) {
    sez('⭐ professionista · ' + pag + ' mostra il feedback dalle colonne vere, senza eseguire HTML')
    ;({ p, ctx, errori, avvisi } = await apri(pag + '?pid=p1', { righe: [riga] }))
    await p.evaluate(() => { const el = document.querySelector('.session-item'); if (el) el.click() })
    await p.waitForTimeout(300)
    let testo = await p.evaluate(() => { const b = document.getElementById('det-body'); return b ? b.innerText : '' })
    if (!/feedback paziente/i.test(testo) && pag === 'diario.html') {
      testo = await p.evaluate((r) => { try { apriDet({ getAttribute: () => encodeURIComponent(JSON.stringify(r)) }) } catch (e) { return 'ERR ' + e.message } return document.getElementById('det-body').innerText }, riga)
    }
    check('compare «Feedback paziente»', /feedback paziente/i.test(testo), testo.slice(0, 300))
    check('con «4 stelle — meglio …»', testo.includes('4 stelle — meglio <img'), testo.slice(0, 300))
    check('l\'HTML scritto dal paziente non viene eseguito', await p.evaluate(() => !window.__xss && !document.querySelector('#det-body img')))
    check('nessun errore nella pagina', errori.length === 0, errori)
    if (pag === 'diario.html') {
      const r2 = await p.evaluate((r) => { try { diarioRenderBody(r); return document.getElementById('det-body').innerText } catch (e) { return 'ERR ' + e.message } }, riga)
      check('diarioRenderBody (dopo modifica) mostra lo stesso feedback', r2.includes('4 stelle — meglio <img'), r2.slice(0, 200))
      const pdf = await p.evaluate(async (r) => { let h = ''; window.open = () => ({ document: { write: x => { h += x }, close() {} } }); detSeduta = r; try { diarioPDFSeduta() } catch (e) { return 'ERR ' + e.message } return h }, riga)
      check('PDF della seduta: feedback presente e con escape', pdf.includes('4 stelle — meglio &lt;img'), pdf.slice(0, 120))
      check('fbPazTesto · 1 stella al singolare, vecchio testo come riserva, vuoto se niente',
        await p.evaluate(() => fbPazTesto({ feedback_paziente_benessere: 1 }) === '1 stella' && fbPazTesto({ feedback_paziente: 'vecchio' }) === 'vecchio' && fbPazTesto({}) === ''))
    }
    await ctx.close()
  }
} finally { await browser.close(); server.close() }
console.log('\n' + (ko === 0 ? 'TUTTO VERDE' : 'ROSSO') + ` — ${ok} ok, ${ko} ko` + (ko ? '\n' + fallite.join('\n') : ''))
process.exit(ko ? 1 : 0)
