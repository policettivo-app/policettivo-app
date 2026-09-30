/* js/sintesi-policettiva.js — sintesi-v1 (30 settembre 2026)
 *
 * LA SINTESI POLICETTIVA: LE REGOLE DEL METODO, IN UN FILE SOLO.
 *
 * Propone NPL o GPL a partire da quello che il professionista ha già segnato
 * nella valutazione posturale, e SCRIVE LE RAGIONI. Non decide: il
 * professionista preme «Usa questa» oppure sceglie diversamente.
 *
 * Le regole sono di Giuliano Baron (Sistema Policettivo®):
 *   · piano scapolare ANTERIORE → NPL · POSTERIORE → GPL   (criterio principale)
 *   · piede PIATTO o VALGO → GPL · CAVO o VARO → NPL        (criterio secondario)
 *   · monopodalico: INVERSIONE → NPL · EVERSIONE → GPL
 * Decisioni del 30 settembre 2026 (tutte A):
 *   1A conta il piano scapolare PRIMA dei 3 Respiri (il dopo si mostra e basta)
 *   2A scapola e piede discordi: vince la scapola, e il contrasto resta scritto
 *   3A scapola in asse: decide il piede
 *   4A il piede: assetto (retropiede) → arco → monopodalico, il primo che indica
 *   5A i test (Oscillazione, squat, ATR, stepping) si mostrano accanto, NON
 *      entrano nella regola (le loro soglie sono ancora provvisorie)
 *   6A niente progressione né protocolli: solo NPL / GPL
 *
 * ⚠️ Una regola nuova = una riga qui + REGOLE_VERSIONE che cambia: ogni
 *    proposta salvata porta la versione con cui è stata fatta.
 * ⚠️ NIENTE rete, NIENTE Supabase qui dentro.
 */
;(function (global) {
  'use strict'

  var REGOLE_VERSIONE = 'sp-regole-v1 · 30/09/2026'

  var SCAPOLA = { anteriore: 'NPL', posteriore: 'GPL', in_asse: null }
  var ASSETTO = { varo: 'NPL', valgo: 'GPL', misto: null }
  var ARCO = { cavo: 'NPL', piatto: 'GPL', normale: null }
  var MONO = { inversione: 'NPL', eversione: 'GPL', neutro: null }
  var PAROLA = {
    anteriore: 'anteriore', posteriore: 'posteriore', in_asse: 'in asse',
    varo: 'varo', valgo: 'valgo', misto: 'misto',
    cavo: 'cavo', piatto: 'piatto', normale: 'normale',
    inversione: 'inversione', eversione: 'eversione', neutro: 'neutro'
  }
  function p(v) { return PAROLA[v] || v }

  /* Il monopodalico dei due lati: se indicano la stessa cosa (o uno solo
     indica e l'altro è neutro/vuoto) quella; se sono opposti, niente. */
  function monopodalico(dx, sx) {
    var a = MONO[dx] || null, b = MONO[sx] || null
    if (a && b && a !== b) return { verso: null, opposti: true }
    return { verso: a || b || null, opposti: false }
  }

  /* dati: { scapola_pre, scapola_post, assetto, arco, mono_dx, mono_sx }
     (i valori dei chip della valutazione posturale) */
  function proponi(dati) {
    dati = dati || {}
    var criteri = []
    var scap = dati.scapola_pre ? { k: 'scapola', nome: 'Piano scapolare (prima dei 3 Respiri)', valore: p(dati.scapola_pre),
      verso: SCAPOLA[dati.scapola_pre] || null, principale: true } : null
    if (scap) criteri.push(scap)
    var piede = []
    if (dati.assetto) piede.push({ k: 'assetto', nome: 'Assetto podalico (retropiede)', valore: p(dati.assetto), verso: ASSETTO[dati.assetto] || null })
    if (dati.arco) piede.push({ k: 'arco', nome: 'Arco plantare', valore: p(dati.arco), verso: ARCO[dati.arco] || null })
    if (dati.mono_dx || dati.mono_sx) {
      var m = monopodalico(dati.mono_dx, dati.mono_sx)
      piede.push({ k: 'mono', nome: 'Monopodalico', valore: 'destro ' + (dati.mono_dx ? p(dati.mono_dx) : '—') + ' · sinistro ' + (dati.mono_sx ? p(dati.mono_sx) : '—'),
        verso: m.verso, nota: m.opposti ? 'i due lati indicano cose opposte' : '' })
    }
    piede.forEach(function (c) { criteri.push(c) })
    // il piede: il primo che indica (4A)
    var piedeUsato = piede.filter(function (c) { return c.verso })[0] || null

    var proposta = null, perche = '', contrasti = []
    if (scap && scap.verso) {
      proposta = scap.verso; scap.usato = true
      perche = 'Piano scapolare ' + scap.valore + ' → ' + proposta
      if (piedeUsato && piedeUsato.verso !== scap.verso) {
        contrasti.push(piedeUsato.nome + ' ' + piedeUsato.valore + ' → ' + piedeUsato.verso + ': vince la scapola, che è il criterio principale.')
      } else if (piedeUsato) {
        piedeUsato.usato = true
        perche += ' · ' + piedeUsato.nome.toLowerCase() + ' ' + piedeUsato.valore + ' → ' + piedeUsato.verso + ' (concorda)'
      }
    } else if (piedeUsato) {
      proposta = piedeUsato.verso; piedeUsato.usato = true
      perche = (scap ? 'Piano scapolare in asse: decide il piede. ' : 'Piano scapolare non segnato: decide il piede. ') +
        piedeUsato.nome + ' ' + piedeUsato.valore + ' → ' + proposta
    }
    // gli altri criteri del piede che dicono il contrario, scritti
    piede.forEach(function (c) {
      if (c.verso && proposta && c.verso !== proposta && c !== piedeUsato) contrasti.push(c.nome + ' ' + c.valore + ' indicherebbe ' + c.verso + '.')
    })
    var manca = !proposta ? (criteri.length ? 'Nessun criterio indica una configurazione (valori neutri o opposti).'
      : 'Mancano i dati: segna il piano scapolare prima dei 3 Respiri o il piede.') : ''
    var post = dati.scapola_post ? 'Dopo i 3 Respiri il piano scapolare è ' + p(dati.scapola_post) + ' (si mostra, non entra nella regola).' : ''
    return { proposta: proposta, perche: perche, contrasti: contrasti, criteri: criteri, manca: manca, post: post, versione: REGOLE_VERSIONE }
  }

  /* Quello che si salva insieme alla visita: la proposta, le ragioni, la
     versione delle regole e la scelta del professionista. */
  function daSalvare(r, scelta) {
    if (!r) return null
    return { versione: r.versione, proposta: r.proposta, perche: r.perche, contrasti: r.contrasti,
      scelta: scelta || null, concorda: !!(scelta && r.proposta && scelta === r.proposta) }
  }

  global.PolSintesi = { REGOLE_VERSIONE: REGOLE_VERSIONE, proponi: proponi, daSalvare: daSalvare, monopodalico: monopodalico }
})(typeof window !== 'undefined' ? window : globalThis)
