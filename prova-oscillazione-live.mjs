/* prova-oscillazione-live.mjs — oscillazione-live-v1
 *
 * Controlla il VISORE (oscillazione-live.html) dentro Chromium, con un finto
 * Supabase e un canale finto che si può pilotare da fuori.
 *
 * ⚠️ Il finto deve mentire il meno possibile: qui il canale consegna davvero
 *    i payload agli ascoltatori registrati dalla pagina, e `subscribe` chiama
 *    davvero il callback con lo stato. Un finto che accetta tutto e non
 *    consegna niente farebbe passare qualunque cosa.
 *
 *   node prova-oscillazione-live.mjs
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const PORT = 8493
const PAGINA = 'oscillazione-live.html'

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  const f = path.join(ROOT, u === '/' ? 'index.html' : u.replace(/^\/+/, ''))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
  res.end(fs.readFileSync(f))
})

let ok = 0, ko = 0
const fallite = []
function check(nome, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + nome) }
  else { ko++; fallite.push(nome); console.log('  ❌ ' + nome + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')) }
}
const sez = t => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length)))

// il finto: sessione e risposte delle funzioni si decidono prova per prova
const FINTO = ({ sessione, canale, risolvi }) => {
  window.__fk = { canali: {}, chiamate: [] }
  window.supabase = {
    createClient() {
      return {
        auth: { getSession: async () => ({ data: { session: sessione ? { user: { id: 'u1' } } : null } }) },
        rpc: async (nome, args) => {
          window.__fk.chiamate.push([nome, args || null])
          if (nome === 'oscillazione_canale')  return { data: canale || null, error: null }
          if (nome === 'oscillazione_risolvi') return { data: risolvi || null, error: null }
          return { data: null, error: null }
        },
        channel(nome) {
          const h = {}
          const c = {
            nome,
            on(_tipo, filtro, cb) { h[filtro.event] = cb; return c },
            subscribe(cb) { if (cb) cb('SUBSCRIBED'); return c }
          }
          window.__fk.canali[nome] = { c, h }
          return c
        },
        removeChannel() {}
      }
    }
  }
  // si spara un evento sul canale come se arrivasse dalla rete
  window.__emetti = (nomeCanale, evento, payload) => {
    const k = window.__fk.canali[nomeCanale]
    if (!k || !k.h[evento]) return false
    k.h[evento]({ payload })
    return true
  }
  window.__unicoCanale = () => Object.keys(window.__fk.canali)[0] || null
}

async function apri(browser, finto, query = '') {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } })
  const page = await ctx.newPage()
  const errori = []
  page.on('pageerror', e => errori.push(String(e)))
  await page.addInitScript(FINTO, finto)
  await page.goto('http://localhost:' + PORT + '/' + PAGINA + query, { waitUntil: 'load' })
  await page.waitForTimeout(250)
  return { page, ctx, errori }
}

server.listen(PORT)
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch(fs.existsSync(CHROME)
  ? { executablePath: CHROME, args: ['--no-sandbox'] }
  : { args: ['--no-sandbox'] })

try {

sez('Il visore non misura e non salva niente')
{
  const src = fs.readFileSync(path.join(ROOT, PAGINA), 'utf8')
  check('marker oscillazione-live-v1', src.includes('oscillazione-live-v1'))
  check('è noindex', /name="robots"[^>]*noindex/.test(src))
  check('⛔ non legge nessuna tabella', !/\.from\(/.test(src))
  const rpc = [...src.matchAll(/\.rpc\(\s*'([^']+)'/g)].map(m => m[1])
  check('⭐ chiama solo le due funzioni che gli servono',
    rpc.length === 2 && rpc.every(n => n === 'oscillazione_canale' || n === 'oscillazione_risolvi'), rpc)
  check('⛔ non chiede nessun permesso ai sensori',
    !/DeviceOrientation|DeviceMotion|requestPermission/.test(src))
  check('⛔ e non scrive sul telefono di chi guarda',
    !/localStorage|sessionStorage|indexedDB/i.test(src))
  check('usa il motore condiviso del disegno', /js\/oscillazione\.js/.test(src))
}

sez('⭐ Con lo stesso account si aggancia da solo, senza codici')
{
  const { page, ctx, errori } = await apri(browser, { sessione: true, canale: 'CAN-1' })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('⭐ non chiede nessun codice', !(await page.isVisible('#app-ingresso')))
  check('è già in ascolto', await page.isVisible('#app-visore'))
  const ch = await page.evaluate(() => window.__unicoCanale())
  check('⭐ ascolta il canale che gli ha dato il database', ch === 'oscillazione:CAN-1', ch)
  check('e lo dice: in attesa del telefono',
    /in attesa del telefono/.test(await page.textContent('#v-stato')))
  const ch2 = await page.evaluate(() => window.__fk.chiamate.map(c => c[0]))
  check('ha chiesto il canale, non altro', ch2.join() === 'oscillazione_canale', ch2)
  await ctx.close()
}

sez('Con l’account ma senza diretta accesa, dice cosa fare')
{
  const { page, ctx, errori } = await apri(browser, { sessione: true, canale: null })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('non entra in ascolto', !(await page.isVisible('#app-visore')))
  const t = await page.textContent('#ing-testo')
  check('⭐ spiega di accendere la condivisione sul telefono', /Mostra sul computer/.test(t), t)
  check('e che si può usare anche un codice ospite', /codice ospite/.test(t), t)
  await ctx.close()
}

sez('⭐ L’ospite col codice: guarda senza account e senza sapere chi c’è')
{
  const { page, ctx, errori } = await apri(browser, { sessione: false, risolvi: 'CAN-OSP' }, '?c=ABC234')
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('⭐ col codice nell’indirizzo entra da solo', await page.isVisible('#app-visore'))
  const ch = await page.evaluate(() => window.__unicoCanale())
  check('e ascolta il canale del codice', ch === 'oscillazione:CAN-OSP', ch)
  const arg = await page.evaluate(() => window.__fk.chiamate[0])
  check('ha risolto proprio quel codice', arg[0] === 'oscillazione_risolvi' && arg[1].p_codice === 'ABC234', arg)
  check('⛔ e sullo schermo non c’è nessun nome di paziente',
    !/paziente|nome|cognome/i.test(await page.textContent('#app-visore')),
    await page.textContent('#app-visore'))
  await ctx.close()
}

sez('⛔ Un codice sbagliato non fa entrare, e lo dice')
{
  const { page, ctx, errori } = await apri(browser, { sessione: false, risolvi: null })
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('chiede il codice', await page.isVisible('#app-ingresso'))
  await page.fill('#cod', 'ZZZ999')
  await page.click('#btn-guarda')
  await page.waitForTimeout(150)
  check('⛔ non entra', !(await page.isVisible('#app-visore')))
  check('e spiega perché', /non valido o scaduto/.test(await page.textContent('#ing-err')))
  await page.fill('#cod', 'AB1')
  await page.click('#btn-guarda')
  await page.waitForTimeout(120)
  check('un codice troppo corto non parte nemmeno', /sei caratteri/.test(await page.textContent('#ing-err')))
  await ctx.close()
}

sez('⭐ La misura in diretta: si disegna mentre arriva')
{
  const { page, ctx, errori } = await apri(browser, { sessione: true, canale: 'C' })
  const emetti = (ev, p) => page.evaluate(([ev, p]) => window.__emetti('oscillazione:C', ev, p), [ev, p])

  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('la consegna funziona davvero', await emetti('via', { evento: 'beccheggio', occhi: 'chiusi', durata: 30, soglia: 2 }))
  await page.waitForTimeout(80)
  check('⭐ parte: misura in corso', /misura in corso/.test(await page.textContent('#v-stato')))
  check('e scrive che test è', /beccheggio/.test(await page.textContent('#v-sub')) &&
        /occhi chiusi/.test(await page.textContent('#v-sub')), await page.textContent('#v-sub'))

  await emetti('punti', { x: [0.2, 0.5, 1.1], y: [-0.4, -1.2, -2.6] })
  await emetti('punti', { x: [1.6, 2.0], y: [-3.4, -4.1] })
  await page.waitForTimeout(80)
  const st = await page.evaluate(() => window.__live.stato())
  check('⭐ ha accumulato tutti i punti arrivati', st.xs.length === 5, st.xs.length)
  check('⭐ e la scala si è allargata da sola sul più lontano', st.scala >= 4.1, st.scala)

  // il disegno c'è davvero: si contano i pixel non bianchi
  const dipinti = await page.evaluate(() => {
    const c = document.getElementById('v-canvas'), d = c.getContext('2d').getImageData(0,0,c.width,c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] < 245 || d[i+1] < 245 || d[i+2] < 245) n++
    return n
  })
  check('⭐ e sul canvas c’è disegnato qualcosa', dipinti > 2000, dipinti)

  await emetti('fine', { velocita: 3.4, carico: -2.5, parola: 'INDIETRO', osc_ap: 2.5,
                         osc_ds: 0.6, ellisse: 20, deriva: 1.1, cicli: 7 })
  await page.waitForTimeout(80)
  check('a fine misura lo dice', /finito/.test(await page.textContent('#v-stato')))
  await ctx.close()
}

sez('⭐ I numeri stanno nascosti finché non li chiedi (scelta A)')
{
  const { page, ctx, errori } = await apri(browser, { sessione: true, canale: 'C' })
  const emetti = (ev, p) => page.evaluate(([ev, p]) => window.__emetti('oscillazione:C', ev, p), [ev, p])
  await emetti('via', { evento: 'beccheggio', occhi: 'aperti', durata: 30, soglia: 2 })
  await emetti('punti', { x: [1], y: [1] })
  await emetti('fine', { velocita: 3.4, carico: -2.5, parola: 'INDIETRO', osc_ap: 2.5,
                         osc_ds: 0.6, ellisse: 20, deriva: 1.1, cicli: 7 })
  await page.waitForTimeout(100)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('⭐ di default i numeri NON si vedono: lo schermo è per il paziente',
    !(await page.isVisible('#v-numeri')))
  await page.click('#btn-numeri')
  await page.waitForTimeout(100)
  check('⭐ premendo il pulsante compaiono', await page.isVisible('#v-numeri'))
  const n = await page.textContent('#v-numeri')
  check('c’è la velocità, che è la misura di testa', /Velocità media/.test(n) && /3\.4/.test(n), n)
  check('e il carico con la parola', /INDIETRO/.test(n), n)
  await page.click('#btn-numeri')
  await page.waitForTimeout(100)
  check('e si rinascondono', !(await page.isVisible('#v-numeri')))
  await ctx.close()
}

sez('⭐⭐ Se il telefono si blocca, la pagina lo DICE invece di restare ferma')
{
  const { page, ctx, errori } = await apri(browser, { sessione: true, canale: 'C' })
  const emetti = (ev, p) => page.evaluate(([ev, p]) => window.__emetti('oscillazione:C', ev, p), [ev, p])
  await emetti('via', { evento: 'rollio', occhi: 'chiusi', durata: 30, soglia: 2 })
  await emetti('punti', { x: [1, 1.2], y: [0.5, 0.7] })
  await page.waitForTimeout(100)
  check('nessun errore JS in pagina', errori.length === 0, errori)
  check('la misura risulta in corso', /misura in corso/.test(await page.textContent('#v-stato')))
  const sil = await page.evaluate(() => window.__live.silenzio)
  check('la soglia di silenzio è dichiarata', sil >= 2000 && sil <= 5000, sil)
  await page.waitForTimeout(sil + 1200)
  const t = await page.textContent('#v-stato')
  check('⭐⭐ dopo il silenzio dice che la diretta è interrotta', /interrotta/.test(t), t)
  check('e dice cosa guardare', /telefono/.test(t), t)
  await ctx.close()
}

} finally {
  await browser.close()
  server.close()
}

console.log('\n' + '='.repeat(66))
console.log(ko === 0 ? `TUTTO VERDE — ${ok} controlli passati.` : `ROSSO — ${ok} passati, ${ko} falliti:\n  - ` + fallite.join('\n  - '))
process.exit(ko === 0 ? 0 : 1)
