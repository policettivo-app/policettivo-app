/* prova-email-prof.mjs — email-prof-v1 (8 ottobre 2026)
 * Dall'admin si può cambiare l'email di accesso di un professionista:
 * il server (api/admin.js, azione update-email) e la pagina (admin.html).
 *   node prova-email-prof.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd(), PORT = 8496
const CHROME = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined
let ok = 0, ko = 0; const fallite = []
function check(n, c, x) { if (c) { ok++; console.log('  ✅ ' + n) } else { ko++; fallite.push(n); console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')) } }
function sez(t) { console.log('\n── ' + t) }

// ═══ IL SERVER: api/admin.js con Supabase finto (copiato in una cartella a parte) ═══
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emailprof-'))
fs.mkdirSync(path.join(tmp, 'api')); fs.mkdirSync(path.join(tmp, 'node_modules/@supabase/supabase-js'), { recursive: true })
fs.copyFileSync('api/admin.js', path.join(tmp, 'api/admin.js'))
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}')
fs.writeFileSync(path.join(tmp, 'node_modules/@supabase/supabase-js/package.json'), '{"name":"@supabase/supabase-js","type":"module","main":"index.js"}')
fs.writeFileSync(path.join(tmp, 'node_modules/@supabase/supabase-js/index.js'),
  'export function createClient(){ return { auth: { getUser: async (t) => ({ data: { user: globalThis.__utenti[t] || null }, error: globalThis.__utenti[t] ? null : { message: "no" } }) } } }')
fs.writeFileSync(path.join(tmp, 'api/_check-admin-auth.js'), 'export function createServiceClient(){ return Promise.resolve(globalThis.__svc) }')
globalThis.__utenti = { ADMIN: { id: 'A', email: 'appuntamentimft@gmail.com' }, ALTRO: { id: 'B', email: 'collega@studio.it' } }
function svcFinto(o = {}) {
  const S = { chiamate: [], conti: { 'U1': { email: 'mario@rossi2.com' }, 'UADM': { email: 'appuntamentimft@gmail.com' } } }
  S.auth = { admin: {
    getUserById: async (id) => { S.chiamate.push(['get', id]); return S.conti[id] ? { data: { user: { id, email: S.conti[id].email } }, error: null } : { data: { user: null }, error: { message: 'User not found' } } },
    updateUserById: async (id, att) => { S.chiamate.push(['update', id, att]); if (o.doppia) return { data: null, error: { message: 'A user with this email address has already been registered' } }; S.conti[id].email = att.email; return { data: { user: { id } }, error: null } }
  } }
  S.from = (t) => ({ update(r) { return { eq: async (c, v) => { S.chiamate.push(['tab', t, r, c, v]); return o.senzaColonna ? { error: { code: '42703', message: 'column "email" does not exist' } } : { error: null } } } } })
  return S
}
const { default: handler, validaEmail } = await import(pathToFileURL(path.join(tmp, 'api/admin.js')).href)
async function chiama(token, body) {
  let stato = 0, js = null
  const res = { status(c) { stato = c; return res }, json(j) { js = j; return res } }
  await handler({ method: 'POST', headers: { authorization: 'Bearer ' + token }, body }, res)
  return { stato, js }
}
try {
  sez('⭐ il server · azione update-email')
  check('⭐ validaEmail: spazi e maiuscole tolti; vuota, senza @, senza dominio → no', validaEmail('  Mario@Rossi.IT ').email === 'mario@rossi.it' && !validaEmail('').ok && !validaEmail('mario.rossi.it').ok && !validaEmail('mario@rossi').ok && !validaEmail('ma rio@rossi.it').ok)
  globalThis.__svc = svcFinto()
  let r = await chiama('ALTRO', { action: 'update-email', userId: 'U1', email: 'nuova@rossi.it' })
  check('⛔ un professionista qualunque NON può cambiare l’email di un altro (403) e non si tocca niente', r.stato === 403 && globalThis.__svc.chiamate.length === 0, r)
  r = await chiama('ADMIN', { action: 'update-email', userId: 'U1', email: 'non-email' })
  check('⛔ email non valida: 400 con il motivo, niente cambiato', r.stato === 400 && /non sembra un’email valida/.test(r.js.error) && !globalThis.__svc.chiamate.some(c => c[0] === 'update'), r)
  r = await chiama('ADMIN', { action: 'update-email', email: 'nuova@rossi.it' })
  check('⛔ senza userId: 400', r.stato === 400)
  r = await chiama('ADMIN', { action: 'update-email', userId: 'U1', email: ' Nuova@Rossi.IT ' })
  const up = globalThis.__svc.chiamate.find(c => c[0] === 'update'), tab = globalThis.__svc.chiamate.find(c => c[0] === 'tab')
  check('⭐⭐ l’amministratore la cambia: account di accesso aggiornato, già confermato (niente email di conferma), minuscole', r.stato === 200 && r.js.ok && r.js.email === 'nuova@rossi.it' && r.js.vecchia === 'mario@rossi2.com' && up[1] === 'U1' && up[2].email === 'nuova@rossi.it' && up[2].email_confirm === true && Object.keys(up[2]).sort().join() === 'email,email_confirm', [r, up])
  check('⭐ e si allinea la copia in professionals (per user_id), senza toccare altro', tab && tab[1] === 'professionals' && JSON.stringify(tab[2]) === '{"email":"nuova@rossi.it"}' && tab[3] === 'user_id' && tab[4] === 'U1' && r.js.tabella === 'aggiornata')
  check('⛔ la password non si tocca', !JSON.stringify(globalThis.__svc.chiamate).includes('password'))
  globalThis.__svc = svcFinto({ doppia: true })
  r = await chiama('ADMIN', { action: 'update-email', userId: 'U1', email: 'gia@usata.it' })
  check('⭐ email già di un altro account: 409 detto in italiano, e professionals non toccato', r.stato === 409 && /Esiste già un account con l’email gia@usata\.it/.test(r.js.error) && !globalThis.__svc.chiamate.some(c => c[0] === 'tab'), r)
  globalThis.__svc = svcFinto({ senzaColonna: true })
  r = await chiama('ADMIN', { action: 'update-email', userId: 'U1', email: 'nuova@rossi.it' })
  check('⭐ se professionals non ha la colonna email: l’accesso è cambiato lo stesso e lo dice', r.stato === 200 && r.js.tabella === 'senza colonna', r)
  globalThis.__svc = svcFinto()
  r = await chiama('ADMIN', { action: 'update-email', userId: 'U1', email: 'mario@rossi2.com' })
  check('⭐ stessa email di prima: niente da fare, nessuna modifica', r.stato === 200 && r.js.invariata && !globalThis.__svc.chiamate.some(c => c[0] === 'update'))
  r = await chiama('ADMIN', { action: 'update-email', userId: 'U1', email: 'appuntamentimft@gmail.com' })
  check('⛔ l’email dell’amministratore non si dà a un professionista', r.stato === 400 && !globalThis.__svc.chiamate.some(c => c[0] === 'update'))
  r = await chiama('ADMIN', { action: 'update-email', userId: 'UADM', email: 'altra@x.it' })
  check('⛔ e l’account dell’amministratore non si cambia da qui', r.stato === 403 && !globalThis.__svc.chiamate.some(c => c[0] === 'update'))
  r = await chiama('ADMIN', { action: 'update-email', userId: 'NESSUNO', email: 'a@b.it' })
  check('⛔ account inesistente: 404', r.stato === 404)
  r = await chiama('ADMIN', { action: 'update-profile', profileId: 'U1', nome: 'X' })
  check('⭐ le azioni vecchie rispondono come prima (update-profile)', r.stato !== 400 || !/sconosciuta/.test(JSON.stringify(r.js)))
} finally { fs.rmSync(tmp, { recursive: true, force: true }) }

// ═══ LA PAGINA: admin.html ═══
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(ROOT, u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f))
})
const SUPA = () => {
  const PROF = { id: 'P1', user_id: 'U1', attivo: true, piano: 'free', qualifica: 'Fisioterapista', centro: 'Studio X', citta: 'Milano', created_at: '2026-10-01', profiles: { id: 'U1', nome: 'Mario', cognome: 'Rossi2' } }
  window.__reset = []
  const q = (tab) => { const st = {}; const api = {
    select() { return api }, eq() { return api }, order() { return api }, limit() { return api }, in() { return api }, gte() { return api }, not() { return api }, is() { return api }, neq() { return api }, or() { return api },
    update(r) { (window.__upd = window.__upd || []).push([tab, r]); st.u = true; return api },
    async maybeSingle() { return { data: tab === 'professionals' ? PROF : null, error: null } },
    async single() { return { data: tab === 'professionals' ? PROF : null, error: null } },
    then(ok) { ok({ data: st.u ? null : (tab === 'professionals' ? [PROF] : []), error: null }) } }; return api }
  window.supabase = { createClient() { return {
    auth: { getSession: async () => ({ data: { session: { access_token: 'TOK', user: { id: 'A', email: 'appuntamentimft@gmail.com' } } } }),
      resetPasswordForEmail: async (e) => { window.__reset.push(e); return { error: null } } },
    from: q, rpc: async () => ({ data: null, error: null }),
    storage: { from() { return { upload: async () => ({}), getPublicUrl: () => ({ data: {} }) } } }
  } } }
}
await new Promise(r => server.listen(PORT, r))
const browser = await chromium.launch({ executablePath: CHROME })
async function apri(api) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage(); const errori = [], dialoghi = [], chiamate = []
  page.on('pageerror', e => errori.push(String(e)))
  page.on('dialog', d => { dialoghi.push([d.type(), d.message()]); d.accept() })
  await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }))
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await page.route('**/api/admin', async r => {
    const b = JSON.parse(r.request().postData() || '{}'); chiamate.push(b)
    const out = api(b) || { s: 200, j: {} }
    await r.fulfill({ status: out.s, contentType: 'application/json', body: JSON.stringify(out.j) })
  })
  await page.addInitScript(SUPA)
  await page.goto('http://localhost:' + PORT + '/admin.html', { waitUntil: 'load' }); await page.waitForTimeout(700)
  return { page, ctx, errori, dialoghi, chiamate }
}
const API = (o = {}) => (b) => {
  if (b.action === 'list-user-emails') return { s: 200, j: { emails: { U1: 'mario@rossi2.com' } } }
  if (b.action === 'list-invites') return { s: 200, j: { inviti: [] } }
  if (b.action === 'update-email') return o.doppia ? { s: 409, j: { error: 'Esiste già un account con l’email ' + b.email + '.' } } : { s: 200, j: { ok: true, email: b.email, vecchia: 'mario@rossi2.com' } }
  if (b.action === 'update-profile') return { s: 200, j: { ok: true } }
  return { s: 200, j: {} }
}
try {
  sez('⭐⭐ la pagina · l’email si cambia dal pannello')
  {
    const { page, ctx, errori, dialoghi, chiamate } = await apri(API())
    await page.evaluate(() => apriPannello('P1')); await page.waitForTimeout(500)
    check('⭐ il campo email ha l’email di accesso ed è modificabile', (await page.inputValue('#p-email')) === 'mario@rossi2.com' && !(await page.$eval('#p-email', e => e.readOnly)))
    await page.screenshot({ path: '/tmp/claude-0/-home-claude/7d47ce12-7627-5223-9e5c-e91c21c789a4/scratchpad/foto/admin-pannello.png' })
    check('⭐⭐ il pannello sta sopra la barra in basso: in fondo allo schermo si tocca il pannello, non la barra', await page.evaluate(() => { const p = document.getElementById('side-panel').getBoundingClientRect(), e = document.elementFromPoint(p.left + p.width / 2, innerHeight - 20); return !!(e && e.closest('#side-panel')) }))
    check('⭐ «💾 Salva modifiche» resta visibile in fondo al pannello senza scorrere', await page.evaluate(() => { const b = document.querySelector('#tab-dati .btn-save').getBoundingClientRect(); return b.bottom <= innerHeight && b.top >= 0 }))
    await page.fill('#p-email', '  Mario.Rossi@Studio.IT ')
    check('⭐ sotto il campo: «Nuova email non ancora salvata (prima era mario@rossi2.com)»', /Nuova email non ancora salvata \(prima era mario@rossi2\.com\)/.test(await page.textContent('#p-email-hint')))
    await page.evaluate(() => resetAccessoProf()); await page.waitForTimeout(200)
    check('⛔ reset password con l’email nuova non salvata: si ferma e lo spiega (non parte verso la vecchia)', /non l’hai ancora salvata/.test((dialoghi.slice(-1)[0] || [])[1] || '') && (await page.evaluate(() => window.__reset.length)) === 0, dialoghi)
    await page.evaluate(() => salvaProfessionista()); await page.waitForTimeout(600)
    const ue = chiamate.findIndex(c => c.action === 'update-email'), upf = chiamate.findIndex(c => c.action === 'update-profile')
    check('⭐⭐ salva: chiede conferma (da → a), manda update-email con userId e l’email pulita, PRIMA del resto', dialoghi.some(d => d[0] === 'confirm' && /Da:  mario@rossi2\.com/.test(d[1]) && /A:     mario\.rossi@studio\.it/.test(d[1])) && ue >= 0 && chiamate[ue].userId === 'U1' && chiamate[ue].email === 'mario.rossi@studio.it' && upf > ue, [ue, upf, dialoghi])
    check('⭐ poi dice «salvate» e che il reset ora arriva al nuovo indirizzo', dialoghi.some(d => d[0] === 'alert' && /Modifiche salvate/.test(d[1]) && /ora è mario\.rossi@studio\.it/.test(d[1])))
    await page.evaluate(() => resetAccessoProf()); await page.waitForTimeout(200)
    check('⭐ e il reset password adesso parte verso la nuova email', (await page.evaluate(() => window.__reset)).join() === 'mario.rossi@studio.it')
    check('⛔ nessun errore JavaScript', errori.length === 0, errori)
    await ctx.close()
  }
  sez('⛔ la pagina · quando il server dice di no')
  {
    const { page, ctx, errori, dialoghi, chiamate } = await apri(API({ doppia: true }))
    await page.evaluate(() => apriPannello('P1')); await page.waitForTimeout(500)
    await page.fill('#p-email', 'gia@usata.it')
    await page.evaluate(() => salvaProfessionista()); await page.waitForTimeout(500)
    check('⭐ email già usata: alert col motivo, e NON salva il resto', dialoghi.some(d => d[0] === 'alert' && /Email NON cambiata: Esiste già un account con l’email gia@usata\.it/.test(d[1])) && !chiamate.some(c => c.action === 'update-profile'), [dialoghi, chiamate.map(c => c.action)])
    check('⭐ e il campo resta col valore scritto (da correggere), l’email salvata resta la vecchia', (await page.inputValue('#p-email')) === 'gia@usata.it' && (await page.evaluate(() => _panelProfData.email)) === 'mario@rossi2.com')
    await ctx.close()
    const x = await apri(API())
    await x.page.evaluate(() => apriPannello('P1')); await x.page.waitForTimeout(500)
    await x.page.fill('#edit-citta', 'Bassano')
    await x.page.evaluate(() => salvaProfessionista()); await x.page.waitForTimeout(500)
    check('⭐ se l’email non cambia: nessuna conferma, nessun update-email, il resto si salva come prima', !x.chiamate.some(c => c.action === 'update-email') && !x.dialoghi.some(d => d[0] === 'confirm') && x.chiamate.some(c => c.action === 'update-profile') && (await x.page.evaluate(() => window.__upd.some(u => u[0] === 'professionals' && u[1].citta === 'Bassano'))))
    check('⛔ nessun errore JavaScript', x.errori.length === 0 && errori.length === 0, [x.errori, errori])
    await x.ctx.close()
  }
} finally { await browser.close(); server.close() }
console.log('\n' + (ko ? '❌ ' + ko + ' ROSSI: ' + fallite.join(' · ') : '✅ tutti verdi') + ' — ' + ok + ' ok, ' + ko + ' ko')
process.exit(ko ? 1 : 0)
