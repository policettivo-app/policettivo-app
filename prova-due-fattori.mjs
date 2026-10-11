/* prova-due-fattori.mjs — due-fattori-v1 (11 ottobre 2026)
 * Il codice sul telefono (secondo fattore, facoltativo) e «Esci dagli altri dispositivi».
 *   - il server: api/admin.js, azione mfa-reset (Supabase finto)
 *   - le pagine: login.html, profilo.html, admin.html in Chromium, con la libreria
 *     supabase-js VERA e un server di accesso (GoTrue) finto che risponde come quello vero
 *   npm i --no-save playwright @supabase/supabase-js
 *   node prova-due-fattori.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

const ROOT = process.cwd(), PORT = 8497, BASE = 'http://localhost:' + PORT
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(p => fs.existsSync(p))
const UMD = path.join(ROOT, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js')
if (!fs.existsSync(UMD)) { console.log('manca supabase-js: npm i --no-save @supabase/supabase-js'); process.exit(2) }
let ok = 0, ko = 0; const fallite = []
function check(n, c, x) { if (c) { ok++; console.log('  ✅ ' + n) } else { ko++; fallite.push(n); console.log('  ❌ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')) } }
function sez(t) { console.log('\n── ' + t) }
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222'
const F1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', F2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

// ═══ 1. IL SERVER: api/admin.js con Supabase finto ═══
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'duefattori-'))
fs.mkdirSync(path.join(tmp, 'api')); fs.mkdirSync(path.join(tmp, 'node_modules/@supabase/supabase-js'), { recursive: true })
fs.copyFileSync('api/admin.js', path.join(tmp, 'api/admin.js'))
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}')
fs.writeFileSync(path.join(tmp, 'node_modules/@supabase/supabase-js/package.json'), '{"name":"@supabase/supabase-js","type":"module","main":"index.js"}')
fs.writeFileSync(path.join(tmp, 'node_modules/@supabase/supabase-js/index.js'),
  'export function createClient(){ return { auth: { getUser: async (t) => ({ data: { user: globalThis.__utenti[t] || null }, error: globalThis.__utenti[t] ? null : { message: "no" } }) } } }')
fs.writeFileSync(path.join(tmp, 'api/_check-admin-auth.js'), 'export function createServiceClient(){ return Promise.resolve(globalThis.__svc) }')
globalThis.__utenti = { ADMIN: { id: 'A', email: 'appuntamentimft@gmail.com' }, ALTRO: { id: 'B', email: 'collega@studio.it' } }
function svcFinto(o = {}) {
  const S = { chiamate: [], fattori: o.fattori || [] }
  S.auth = { admin: { mfa: {
    listFactors: async (p) => { S.chiamate.push(['list', p]); return o.listaRotta ? { data: null, error: { message: 'boom' } } : { data: { factors: S.fattori.slice() }, error: null } },
    deleteFactor: async (p) => { S.chiamate.push(['delete', p]); if (o.rottoAl && S.chiamate.filter(c => c[0] === 'delete').length >= o.rottoAl) return { data: null, error: { message: 'no' } }; S.fattori = S.fattori.filter(f => f.id !== p.id); return { data: { id: p.id }, error: null } }
  } } }
  S.from = () => { S.chiamate.push(['from']); return {} }
  return S
}
const { default: handler } = await import(pathToFileURL(path.join(tmp, 'api/admin.js')).href)
async function chiama(token, body) {
  let stato = 0, js = null
  const res = { status(c) { stato = c; return res }, json(j) { js = j; return res } }
  await handler({ method: 'POST', headers: { authorization: 'Bearer ' + token }, body }, res)
  return { stato, js }
}
sez('⭐ il server · azione mfa-reset')
globalThis.__svc = svcFinto({ fattori: [{ id: F1 }, { id: F2 }] })
let r = await chiama('ALTRO', { action: 'mfa-reset', userId: U1 })
check('⛔ un professionista qualunque NON può togliere il codice a un altro (403) e non si tocca niente', r.stato === 403 && globalThis.__svc.chiamate.length === 0, r)
r = await chiama('NESSUNO', { action: 'mfa-reset', userId: U1 })
check('⛔ senza un accesso valido: 401', r.stato === 401, r)
r = await chiama('ADMIN', { action: 'mfa-reset' })
check('⛔ senza userId: 400, niente toccato', r.stato === 400 && globalThis.__svc.chiamate.length === 0, r)
r = await chiama('ADMIN', { action: 'mfa-reset', userId: U1 })
const del = globalThis.__svc.chiamate.filter(c => c[0] === 'delete')
check('⭐⭐ l’amministratore li toglie tutti: 200, tolti 2, ognuno con il suo id e l’utente giusto', r.stato === 200 && r.js.ok && r.js.tolti === 2 && del.length === 2 && del[0][1].id === F1 && del[0][1].userId === U1 && del[1][1].id === F2, r)
check('⛔ non tocca password, email né tabelle', !JSON.stringify(globalThis.__svc.chiamate).match(/password|email|from/))
globalThis.__svc = svcFinto({ fattori: [] })
r = await chiama('ADMIN', { action: 'mfa-reset', userId: U1 })
check('⭐ chi non lo aveva: 200, tolti 0, nessuna cancellazione', r.stato === 200 && r.js.tolti === 0 && !globalThis.__svc.chiamate.some(c => c[0] === 'delete'), r)
globalThis.__svc = svcFinto({ listaRotta: true })
r = await chiama('ADMIN', { action: 'mfa-reset', userId: U1 })
check('⛔ se la lettura fallisce: 500 col motivo, niente cancellato', r.stato === 500 && /leggere i fattori/.test(r.js.error) && !globalThis.__svc.chiamate.some(c => c[0] === 'delete'), r)
globalThis.__svc = svcFinto({ fattori: [{ id: F1 }, { id: F2 }], rottoAl: 2 })
r = await chiama('ADMIN', { action: 'mfa-reset', userId: U1 })
check('⛔ se una cancellazione fallisce: 500 e dice quanti ne aveva già tolti', r.stato === 500 && r.js.tolti === 1 && /Tolti 1 su 2/.test(r.js.error), r)
globalThis.__svc = svcFinto()
r = await chiama('ADMIN', { action: 'azione-che-non-esiste' })
check('⭐ le altre azioni restano com’erano (una sconosciuta dà ancora 400)', r.stato === 400 && /sconosciuta/.test(r.js.error), r)

// ═══ 2. LE PAGINE: Chromium + supabase-js vera + GoTrue finto ═══
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'application/javascript' }
const srv = http.createServer((q, s) => {
  const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'index.html' : p)
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); s.end('no'); return }
  s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); s.end(fs.readFileSync(f))
}).listen(PORT)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
/* Il server di accesso finto. Un account = { id, email, password, fattori:[{id,status}] }.
   Il codice giusto è sempre 123456. Risponde con le stesse forme di GoTrue. */
function GoTrue(conti, o = {}) {
  const G = { conti, chiamate: [], sessioni: {}, n: 0, o }
  const utente = (c) => ({ id: c.id, aud: 'authenticated', role: 'authenticated', email: c.email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
    factors: c.fattori.map(f => ({ id: f.id, factor_type: 'totp', status: f.status, friendly_name: f.nome || '', created_at: '2026-10-11T07:00:00Z', updated_at: '2026-10-11T07:00:00Z' })) })
  const gettoni = (c, aal) => { const sid = 'sess-' + (++G.n); G.sessioni[sid] = { conto: c.id, aal }
    const exp = Math.floor(Date.now() / 1000) + 3600
    return { access_token: b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: c.id, email: c.email, role: 'authenticated', aal, amr: [{ method: 'password', timestamp: exp - 3600 }].concat(aal === 'aal2' ? [{ method: 'totp', timestamp: exp - 3600 }] : []), session_id: sid, exp, iat: exp - 3600 }) + '.' + Buffer.from('firma-finta-della-prova').toString('base64url'),
      token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-' + sid, user: utente(c) } }
  const chi = (req) => { try { const p = JSON.parse(Buffer.from((req.headers()['authorization'] || '').replace('Bearer ', '').split('.')[1], 'base64url').toString()); return G.conti.find(c => c.id === p.sub) || null } catch (e) { return null } }
  G.gestisci = async (route) => {
    const req = route.request(), u = new URL(req.url()), m = req.method(), p = u.pathname.replace(/^\/auth\/v1/, '')
    let body = {}; try { body = JSON.parse(req.postData() || '{}') } catch (e) {}
    G.chiamate.push(m + ' ' + p + (u.search || ''))
    const J = (st, o) => route.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) })
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (p === '/token' && u.searchParams.get('grant_type') === 'password') {
      const c = G.conti.find(x => x.email === body.email && x.password === body.password)
      return c ? J(200, gettoni(c, 'aal1')) : J(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
    }
    const c = chi(req)
    if (!c) return J(401, { code: 'no_authorization', msg: 'no' })
    if (p === '/user' && m === 'GET') return G.o.utenteRotto ? J(500, { code: 'unexpected_failure', msg: 'Database error' }) : J(200, utente(c))
    if (p === '/factors' && m === 'POST') { const id = 'f0000000-0000-4000-8000-00000000000' + (c.fattori.length + 1); c.fattori.push({ id, status: 'unverified', nome: body.friendly_name })
      return J(200, { id, type: 'totp', friendly_name: body.friendly_name, totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>', secret: 'JBSWY3DPEHPK3PXPABCDEFGH', uri: 'otpauth://totp/Policettivo' } }) }
    let mm = p.match(/^\/factors\/([^/]+)\/challenge$/)
    if (mm && m === 'POST') return J(200, { id: 'c0000000-0000-4000-8000-000000000001', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 })
    mm = p.match(/^\/factors\/([^/]+)\/verify$/)
    if (mm && m === 'POST') {
      if (G.o.troppi) return J(429, { code: 'over_request_rate_limit', msg: 'Request rate limit reached' })
      const f = c.fattori.find(x => x.id === mm[1])
      if (!f || body.code !== '123456') return J(422, { code: 'mfa_verification_failed', error_code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' })
      f.status = 'verified'; return J(200, gettoni(c, 'aal2'))
    }
    mm = p.match(/^\/factors\/([^/]+)$/)
    if (mm && m === 'DELETE') { c.fattori = c.fattori.filter(x => x.id !== mm[1]); return J(200, { id: mm[1] }) }
    if (p === '/logout' && m === 'POST') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
    return J(404, { msg: 'non previsto dal finto: ' + m + ' ' + p })
  }
  return G
}
const PROF = { id: 'P1', user_id: U1, studio_id: 'S1', ruolo: 'master', piano: 'free', nome: 'Mario', cognome: 'Rossi', profiles: { nome: 'Mario', cognome: 'Rossi' } }
async function apri(browser, G, o = {}) {
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1100, height: 900 } })
  const page = await ctx.newPage(); page.errori = []; page.viste = []; page.apiAdmin = []; page.dialoghi = []
  page.on('pageerror', e => page.errori.push(String(e.message || e)))
  page.on('dialog', async d => { page.dialoghi.push(d.type() + ': ' + d.message()); if (d.type() === 'confirm' && o.rifiutaConferme) await d.dismiss(); else await d.accept() })
  await ctx.route('**/*', async (route) => {
    const u = route.request().url()
    if (u.startsWith(BASE + '/api/admin')) { let b = {}; try { b = JSON.parse(route.request().postData() || '{}') } catch (e) {}
      page.apiAdmin.push(b)
      if (b.action === 'mfa-reset') return route.fulfill({ status: o.resetStato || 200, contentType: 'application/json', body: JSON.stringify(o.resetCorpo || { ok: true, tolti: 1 }) })
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) }
    if (u.startsWith(BASE + '/js/pol-2fa.js') && o.senzaFile) return route.fulfill({ status: 404, body: 'no' })
    if (u.startsWith(BASE + '/dashboard.html')) { page.viste.push('dashboard'); return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>finta dashboard</title><p id="dash">dashboard</p>' }) }
    if (u.startsWith(BASE)) return route.continue()
    if (u.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(UMD, 'utf8') })
    if (u.includes('supabase.co/auth/v1')) return G.gestisci(route)
    if (u.includes('supabase.co/rest/v1/professionals')) { const uno = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object')
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(uno ? PROF : [PROF]) }) }
    if (u.includes('supabase.co/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: 'null' })
    if (u.includes('supabase.co/')) { if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }) }
    return route.abort()
  })
  return { ctx, page }
}
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' }, sel)
const sessione = (page) => page.evaluate(() => { const k = Object.keys(localStorage).find(x => /^sb-.*-auth-token$/.test(x)); if (!k) return null; try { const s = JSON.parse(localStorage.getItem(k)); return JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) } catch (e) { return 'rotta' } })
async function entra(page, email, password) {
  await page.goto(BASE + '/login.html'); await page.waitForFunction(() => window.supabase && typeof doLogin === 'function')
  await page.fill('#email', email); await page.fill('#password', password); await page.click('#login-btn')
}
const conto = (id, email, fattori) => ({ id, email, password: 'giusta', fattori: fattori || [] })

const browser = await chromium.launch({ executablePath: CHROME })
try {
  sez('funzioni pure di js/pol-2fa.js')
  { const { page, ctx } = await apri(browser, GoTrue([]))
    await page.goto(BASE + '/login.html'); await page.waitForFunction(() => window.PolDueFattori)
    const p = await page.evaluate(() => { const D = PolDueFattori; return {
      cifre: D.soloCifre(' 123 456 '), v1: D.codiceValido('123 456'), v2: D.codiceValido('12345'), v3: D.codiceValido('1234567'), v4: D.codiceValido(null), v5: D.codiceValido('12a456'),
      e1: D.parole({ message: 'Invalid TOTP code entered', code: 'mfa_verification_failed' }), e2: D.parole({ status: 429, message: 'x' }), e3: D.parole({ code: 'mfa_totp_enroll_not_enabled', message: 'MFA enroll is disabled for TOTP' }), e4: D.parole({ message: 'Qualcosa' }), e5: D.parole(null), T: D.TESTI } })
    check('⭐ il codice: spazi tolti; valido solo con 6 cifre esatte', p.cifre === '123456' && p.v1 && !p.v2 && !p.v3 && !p.v4 && !p.v5, p)
    check('⭐ gli errori diventano frasi: codice sbagliato, troppi tentativi, funzione spenta, altro', p.e1 === p.T.codiceErrato && p.e2 === p.T.troppi && p.e3 === p.T.nonAcceso && /Qualcosa/.test(p.e4) && /errore sconosciuto/.test(p.e5), p)
    await ctx.close() }

  sez('⭐⭐ login.html · chi NON ha attivato il codice entra esattamente come prima')
  { const G = GoTrue([conto(U1, 'mario@rossi.it')]); const { page, ctx } = await apri(browser, G)
    await page.goto(BASE + '/login.html'); await page.waitForFunction(() => window.supabase && typeof doLogin === 'function')
    check('la pagina si apre col modulo di sempre; il passo del codice non si vede', await vis(page, '#email') && await vis(page, '#password') && await vis(page, '#login-btn') && !(await vis(page, '#passo-codice')))
    check('restano «Password dimenticata?» e «Registrati»', await page.evaluate(() => !!document.querySelector('button[onclick="mostraResetPassword()"]') && !!document.querySelector('a[href="registrazione.html"]')))
    await page.fill('#email', 'mario@rossi.it'); await page.fill('#password', 'sbagliata'); await page.click('#login-btn')
    await page.waitForFunction(() => document.getElementById('error-msg').style.display === 'block')
    check('password sbagliata: l’errore di sempre, il pulsante torna «Accedi», nessun passo del codice', /Credenziali non valide/.test(await page.textContent('#error-msg')) && (await page.textContent('#login-btn')) === 'Accedi' && !(await vis(page, '#passo-codice')) && page.viste.length === 0)
    await page.fill('#password', 'giusta'); await page.click('#login-btn')
    await page.waitForSelector('#dash')
    check('⭐⭐ password giusta: dritto alla dashboard, senza che il codice sia mai stato chiesto', page.viste.length === 1 && !G.chiamate.some(c => /factors/.test(c)), G.chiamate)
    check('nessun errore JavaScript', page.errori.length === 0, page.errori)
    await ctx.close() }

  sez('⭐⭐ login.html · chi ha attivato il codice')
  { const G = GoTrue([conto(U1, 'mario@rossi.it', [{ id: F1, status: 'verified' }])]); const { page, ctx } = await apri(browser, G)
    await entra(page, 'mario@rossi.it', 'giusta')
    await page.waitForFunction(() => document.getElementById('passo-codice').style.display === 'block')
    check('⭐⭐ dopo la password NON si entra: compare il passo del codice e il modulo della password sparisce', page.viste.length === 0 && await vis(page, '#codice-2fa') && !(await vis(page, '#email')) && !(await vis(page, '#login-btn')))
    check('il campo è pensato per il codice (tastiera numerica, riempimento automatico)', await page.evaluate(() => { const c = document.getElementById('codice-2fa'); return c.inputMode === 'numeric' && c.autocomplete === 'one-time-code' && document.activeElement === c }))
    const prima = G.chiamate.length
    await page.fill('#codice-2fa', '12'); await page.click('#codice-btn')
    await page.waitForFunction(() => document.getElementById('error-msg').style.display === 'block')
    check('⛔ codice corto: lo dice subito, senza nemmeno chiamare il server', /6 cifre/.test(await page.textContent('#error-msg')) && G.chiamate.length === prima && page.viste.length === 0)
    await page.fill('#codice-2fa', '000000'); await page.click('#codice-btn')
    await page.waitForFunction(() => /non valido/.test(document.getElementById('error-msg').textContent))
    check('⛔ codice sbagliato: frase chiara, si resta fuori, il pulsante torna «Conferma», il campo si svuota', page.viste.length === 0 && (await page.textContent('#codice-btn')) === 'Conferma' && (await page.inputValue('#codice-2fa')) === '' && !(await page.isDisabled('#codice-btn')))
    check('⛔ e la sessione è ancora al primo livello (aal1)', (await sessione(page)).aal === 'aal1')
    await page.fill('#codice-2fa', '123 456'); await page.press('#codice-2fa', 'Enter')
    await page.waitForSelector('#dash')
    check('⭐⭐ codice giusto (anche scritto con lo spazio, anche con Invio): si entra', page.viste.length === 1)
    check('⭐ e la sessione sale al secondo livello (aal2)', (await sessione(page)).aal === 'aal2')
    check('nessun errore JavaScript', page.errori.length === 0, page.errori)
    // riaprire la pagina di accesso a metà strada
    await ctx.close() }
  { const G = GoTrue([conto(U1, 'mario@rossi.it', [{ id: F1, status: 'verified' }])]); const { page, ctx } = await apri(browser, G)
    await entra(page, 'mario@rossi.it', 'giusta')
    await page.waitForFunction(() => document.getElementById('passo-codice').style.display === 'block')
    await page.reload(); await page.waitForFunction(() => window.supabase && typeof doLogin === 'function')
    await page.waitForFunction(() => document.getElementById('passo-codice').style.display === 'block')
    check('⭐ chi ricarica la pagina dopo la password riparte dal codice, non dalla password', await vis(page, '#codice-2fa') && !(await vis(page, '#email')))
    await page.click('button[onclick="annullaCodice()"]')
    await page.waitForFunction(() => document.getElementById('passo-password').style.display === 'block')
    check('⭐ «Torna all’accesso»: torna il modulo, password vuota, pulsante «Accedi» attivo, sessione chiusa SOLO qui', await vis(page, '#email') && (await page.inputValue('#password')) === '' && !(await page.isDisabled('#login-btn')) && (await sessione(page)) === null && G.chiamate.some(c => /logout\?scope=local/.test(c)) && !G.chiamate.some(c => /scope=global/.test(c)), G.chiamate.slice(-3))
    await ctx.close() }
  { const G = GoTrue([conto(U1, 'mario@rossi.it', [{ id: F1, status: 'verified' }])], { troppi: true }); const { page, ctx } = await apri(browser, G)
    await entra(page, 'mario@rossi.it', 'giusta'); await page.waitForFunction(() => document.getElementById('passo-codice').style.display === 'block')
    await page.fill('#codice-2fa', '123456'); await page.click('#codice-btn')
    await page.waitForFunction(() => document.getElementById('error-msg').style.display === 'block')
    check('⛔ troppi tentativi: lo dice in chiaro', /Troppi tentativi/.test(await page.textContent('#error-msg')), await page.textContent('#error-msg'))
    await ctx.close() }
  { const G = GoTrue([conto(U1, 'mario@rossi.it', [{ id: F1, status: 'unverified' }])]); const { page, ctx } = await apri(browser, G)
    await entra(page, 'mario@rossi.it', 'giusta'); await page.waitForSelector('#dash')
    check('⭐ un’attivazione lasciata a metà (mai confermata) NON chiude fuori: si entra con la sola password', page.viste.length === 1)
    await ctx.close() }
  { const G = GoTrue([conto(U1, 'mario@rossi.it', [{ id: F1, status: 'verified' }])]); const { page, ctx } = await apri(browser, G, { senzaFile: true })
    await entra(page, 'mario@rossi.it', 'giusta'); await page.waitForSelector('#dash')
    check('🛟 se js/pol-2fa.js non si carica, l’accesso NON si rompe: si entra come prima', page.viste.length === 1)
    await ctx.close() }
  { const G = GoTrue([conto(U1, 'mario@rossi.it', [{ id: F1, status: 'verified' }])]); const { page, ctx } = await apri(browser, G, { viewport: { width: 320, height: 640 } })
    await entra(page, 'mario@rossi.it', 'giusta'); await page.waitForFunction(() => document.getElementById('passo-codice').style.display === 'block')
    const m = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, v: innerWidth, c: document.getElementById('codice-2fa').getBoundingClientRect(), b: document.getElementById('codice-btn').getBoundingClientRect() }))
    check('📏 su un telefono stretto (320 px) il passo del codice sta nello schermo', m.w <= m.v && m.c.left >= 0 && m.c.right <= m.v && m.b.right <= m.v, m)
    await ctx.close() }

  sez('⭐⭐ profilo.html · il riquadro «Sicurezza dell’accesso»')
  { const G = GoTrue([conto(U1, 'mario@rossi.it')]); const { page, ctx } = await apri(browser, G)
    await entra(page, 'mario@rossi.it', 'giusta'); await page.waitForSelector('#dash')
    await page.goto(BASE + '/profilo.html'); await page.waitForSelector('#sic-attiva')
    check('il riquadro c’è, dopo la password e prima del resto; le altre schede del profilo ci sono tutte', await page.evaluate(() => { const t = [...document.querySelectorAll('.card-title')].map(e => e.textContent.trim()); const i = t.findIndex(x => /Password di accesso/.test(x)); return /Sicurezza/.test(t[i + 1] || '') && t.some(x => /Dati personali/.test(x)) && t.some(x => /Blocco schermo/.test(x)) && t.some(x => /Logo studio/.test(x)) }))
    check('spento: spiega cos’è e che è facoltativo; un pulsante per attivarlo', /facoltativo/.test(await page.textContent('#sic-corpo')) && await vis(page, '#sic-attiva'))
    await page.click('#sic-attiva'); await page.waitForSelector('#sic-qr')
    const q = await page.evaluate(() => ({ src: document.getElementById('sic-qr').src.slice(0, 26), nat: document.getElementById('sic-qr').naturalWidth, chiave: document.getElementById('sic-chiave').textContent, t: document.getElementById('sic-corpo').textContent }))
    check('⭐ attiva: compare il riquadro da inquadrare (un’immagine vera) e la chiave scritta', q.src === 'data:image/svg+xml;utf-8,<' && q.nat > 0 && q.chiave === 'JBSWY3DPEHPK3PXPABCDEFGH', q)
    check('⭐ e l’avviso di mettersi al sicuro prima di confermare (secondo telefono o chiave su un foglio)', /secondo telefono/.test(q.t) && /foglio/.test(q.t))
    await page.fill('#sic-codice', '999999'); await page.click('#sic-conferma')
    await page.waitForFunction(() => /non valido/.test(document.getElementById('sic-esito').textContent))
    check('⛔ codice sbagliato: NON si attiva, resta sul riquadro, il pulsante torna premibile', G.conti[0].fattori[0].status === 'unverified' && await vis(page, '#sic-qr') && !(await page.isDisabled('#sic-conferma')))
    await page.click('#sic-annulla'); await page.waitForSelector('#sic-attiva')
    check('⭐ «Annulla»: il tentativo a metà viene tolto, si torna allo stato spento', G.conti[0].fattori.length === 0 && G.chiamate.some(c => /^DELETE \/factors\//.test(c)))
    G.conti[0].fattori.push({ id: F2, status: 'unverified', nome: 'vecchio tentativo' })
    await page.click('#sic-attiva'); await page.waitForSelector('#sic-qr')
    check('⭐ un tentativo vecchio rimasto a metà viene ripulito prima di cominciarne uno nuovo', G.conti[0].fattori.length === 1 && G.conti[0].fattori[0].id !== F2, G.conti[0].fattori)
    await page.fill('#sic-codice', '123456'); await page.click('#sic-conferma')
    await page.waitForSelector('#sic-acceso')
    check('⭐⭐ codice giusto: attivo. Lo dice, e il fattore è confermato', G.conti[0].fattori[0].status === 'verified' && /dopo la password/.test(await page.textContent('#sic-esito')) && !(await page.$('#sic-qr')))
    check('⭐ la sessione di questo dispositivo sale ad aal2 (non viene buttato fuori)', (await sessione(page)).aal === 'aal2')
    await page.reload(); await page.waitForSelector('#sic-acceso')
    check('⭐ ricaricando il profilo risulta attivo', await vis(page, '#sic-acceso') && !(await page.$('#sic-attiva')))
    // disattivare
    await page.click('#sic-disattiva'); await page.waitForSelector('#sic-codice-spegni')
    await page.fill('#sic-codice-spegni', '000000'); await page.click('#sic-conferma-spegni')
    await page.waitForFunction(() => /non valido/.test(document.getElementById('sic-esito').textContent))
    check('⛔ per disattivare serve un codice giusto: con uno sbagliato resta attivo', G.conti[0].fattori.length === 1 && G.conti[0].fattori[0].status === 'verified')
    await page.fill('#sic-codice-spegni', '123456'); await page.click('#sic-conferma-spegni')
    await page.waitForSelector('#sic-attiva')
    check('⭐⭐ con quello giusto si disattiva: nessun fattore rimasto, torna lo stato spento e lo dice', G.conti[0].fattori.length === 0 && /sola password/.test(await page.textContent('#sic-esito')))
    check('nessun errore JavaScript in tutta la sequenza', page.errori.length === 0, page.errori)
    await ctx.close() }

  sez('⭐ profilo.html · «Esci da tutti gli altri dispositivi»')
  { const G = GoTrue([conto(U1, 'mario@rossi.it')]); const { page, ctx } = await apri(browser, G, { rifiutaConferme: true })
    await entra(page, 'mario@rossi.it', 'giusta'); await page.waitForSelector('#dash')
    await page.goto(BASE + '/profilo.html'); await page.waitForSelector('#sic-altri')
    await page.click('#sic-altri'); await page.waitForTimeout(300)
    check('⛔ chiede conferma; se dici di no non succede niente', page.dialoghi.some(d => /^confirm: Scollego tutti gli altri/.test(d)) && !G.chiamate.some(c => /logout/.test(c)))
    await ctx.close() }
  { const G = GoTrue([conto(U1, 'mario@rossi.it')]); const { page, ctx } = await apri(browser, G)
    await entra(page, 'mario@rossi.it', 'giusta'); await page.waitForSelector('#dash')
    await page.goto(BASE + '/profilo.html'); await page.waitForSelector('#sic-altri')
    await page.click('#sic-altri')
    await page.waitForFunction(() => /altri dispositivi dovranno/.test(document.getElementById('sic-esito').textContent))
    const out = G.chiamate.filter(c => /logout/.test(c))
    check('⭐⭐ se dici di sì: UNA chiamata, con scope=others (mai «global», che chiuderebbe anche questo)', out.length === 1 && /scope=others/.test(out[0]), out)
    check('⭐ questo dispositivo resta collegato', (await sessione(page)) && (await sessione(page)).sub === U1 && !(await page.isDisabled('#sic-altri')))
    await ctx.close() }

  sez('🛟 profilo.html · se il riquadro va storto, il resto del profilo non se ne accorge')
  { const G = GoTrue([conto(U1, 'mario@rossi.it')]); const { page, ctx } = await apri(browser, G)
    await entra(page, 'mario@rossi.it', 'giusta'); await page.waitForSelector('#dash')
    G.o.utenteRotto = true
    await page.goto(BASE + '/profilo.html')
    await page.waitForFunction(() => /Non ci sono riuscito/.test((document.getElementById('sic-corpo') || {}).textContent || ''))
    check('il server di accesso risponde errore: il riquadro lo scrive dentro di sé', true)
    check('e le altre schede (password, dati personali) ci sono e la pagina non ha errori JavaScript', await vis(page, '#pw-vecchia') && await page.evaluate(() => [...document.querySelectorAll('.card-title')].length >= 8) && page.errori.length === 0, page.errori)
    await ctx.close() }
  { const G = GoTrue([conto(U1, 'mario@rossi.it')]); const { page, ctx } = await apri(browser, G, { senzaFile: true })
    await entra(page, 'mario@rossi.it', 'giusta'); await page.waitForSelector('#dash')
    await page.goto(BASE + '/profilo.html'); await page.waitForSelector('#pw-vecchia'); await page.waitForTimeout(400)
    check('se js/pol-2fa.js non si carica: il profilo funziona lo stesso, senza errori JavaScript', await vis(page, '#pw-vecchia') && page.errori.length === 0, page.errori)
    await ctx.close() }
  { const G = GoTrue([conto(U1, 'mario@rossi.it')]); const { page, ctx } = await apri(browser, G, { viewport: { width: 320, height: 700 } })
    await entra(page, 'mario@rossi.it', 'giusta'); await page.waitForSelector('#dash')
    await page.goto(BASE + '/profilo.html'); await page.waitForSelector('#sic-attiva'); await page.click('#sic-attiva'); await page.waitForSelector('#sic-qr')
    const m = await page.evaluate(() => { const c = document.getElementById('sic-card').getBoundingClientRect(); return { w: document.documentElement.scrollWidth, v: innerWidth, dentro: [...document.querySelectorAll('#sic-card *')].every(e => { const r = e.getBoundingClientRect(); return r.width === 0 || (r.left >= c.left - 1 && r.right <= c.right + 1) }) } })
    check('📏 su un telefono stretto (320 px) riquadro, chiave e pulsanti stanno dentro la scheda', m.w <= m.v && m.dentro, m)
    await ctx.close() }

  sez('⭐ admin.html · «Togli il codice sul telefono»')
  { const ADM = { id: U2, email: 'appuntamentimft@gmail.com', password: 'giusta', fattori: [] }
    for (const caso of [{ nome: 'conferma rifiutata', o: { rifiutaConferme: true } }, { nome: 'tolto', o: {} }, { nome: 'non lo aveva', o: { resetCorpo: { ok: true, tolti: 0 } } }, { nome: 'errore del server', o: { resetStato: 500, resetCorpo: { error: 'boom' } } }]) {
      const G = GoTrue([ADM]); const { page, ctx } = await apri(browser, G, caso.o)
      await entra(page, ADM.email, 'giusta'); await page.waitForSelector('#dash')
      await page.goto(BASE + '/admin.html'); await page.waitForFunction(() => typeof togliSecondoFattore === 'function')
      if (caso.nome === 'tolto') check('il pulsante c’è nel pannello del professionista, sotto il reset della password', await page.evaluate(() => { const b = document.getElementById('btn-togli-2fa'); return !!b && /resetAccessoProf/.test(b.previousElementSibling.getAttribute('onclick')) && /Togli il codice sul telefono/.test(b.textContent) }))
      await page.waitForTimeout(300); page.apiAdmin.length = 0; page.dialoghi.length = 0
      await page.evaluate((u) => { _panelProfData = { id: 'P1', user_id: u, email: 'mario@rossi.it', nome: 'Mario', cognome: 'Rossi' }; return togliSecondoFattore() }, U1)
      const chi = page.apiAdmin.filter(b => b.action === 'mfa-reset')
      if (caso.nome === 'conferma rifiutata') check('⛔ chiede conferma col nome dell’account; se dici di no non parte niente', page.dialoghi.length === 1 && /mario@rossi\.it/.test(page.dialoghi[0]) && chi.length === 0, page.dialoghi)
      if (caso.nome === 'tolto') check('⭐⭐ se dici di sì: chiama il server con mfa-reset e l’utente giusto, e conferma «tolto»', chi.length === 1 && chi[0].userId === U1 && page.dialoghi.some(d => /^alert: Codice sul telefono tolto/.test(d)), { chi, d: page.dialoghi })
      if (caso.nome === 'non lo aveva') check('⭐ se non lo aveva, lo dice (niente «tolto»)', page.dialoghi.some(d => /non aveva il codice attivo/.test(d)) && !page.dialoghi.some(d => /tolto ✓/.test(d)), page.dialoghi)
      if (caso.nome === 'errore del server') check('⛔ se il server dà errore, lo dice e NON dice «tolto»', page.dialoghi.some(d => /Non tolto: boom/.test(d)) && !page.dialoghi.some(d => /tolto ✓/.test(d)), page.dialoghi)
      if (caso.nome === 'tolto') { await page.evaluate(() => { _panelProfData = null; return togliSecondoFattore() }); check('⛔ senza un professionista aperto non chiama il server', page.apiAdmin.filter(b => b.action === 'mfa-reset').length === 1) }
      await ctx.close()
    } }
} catch (e) { ko++; fallite.push('ECCEZIONE: ' + (e && e.message)); console.log('\n💥 ' + (e && e.stack || e)) }
await browser.close(); srv.close()
console.log('\n════════════════════════════════════════')
console.log(ko === 0 ? '✅ TUTTO VERDE: ' + ok + ' controlli' : '❌ ' + ko + ' ROSSI su ' + (ok + ko) + ':\n   - ' + fallite.join('\n   - '))
process.exit(ko === 0 ? 0 : 1)
