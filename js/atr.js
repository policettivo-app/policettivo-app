/* js/atr.js — atr-v1 (30 settembre 2026)
 *
 * L'ATR COL TELEFONO: IL CALCOLO E LE PAROLE, IN UN FILE SOLO.
 *
 * ATR = Angle of Trunk Rotation. Test di Adam (flessione in avanti, braccia
 * sciolte), telefono DI TRAVERSO sulla schiena, a cavallo delle spinose: di
 * quanti gradi un lato del tronco sta più in alto dell'altro.
 * È uno SCREENING, NON una diagnosi: la diagnosi di scoliosi è l'angolo di
 * Cobb sulla radiografia. Qui si danno gradi, lato e (solo al professionista)
 * le fasce delle fonti.
 *
 * Perché basta il telefono: con il telefono di traverso, l'angolo «beta» del
 * sensore di orientamento è ESATTAMENTE l'inclinazione del suo lato lungo
 * rispetto all'orizzontale, qualunque sia la pendenza della schiena lungo la
 * colonna (quella è «gamma», che non la tocca). Quindi beta = ATR.
 *
 * Decisioni del 30 settembre (Giuliano: «scegli tu il meglio»):
 *  1A si fa scorrere il telefono e la pagina tiene per ogni zona il valore
 *     FERMO più alto (fermo = mezzo secondo senza muoversi più di 0,6°);
 *  2A fasce con le fonti, SOLO al professionista;
 *  3A al paziente gradi e lato, nessuna fascia, mai «scoliosi»;
 *  4A tre passate: l'errore della misura si calcola dalle passate stesse.
 *
 * ⚠️ NIENTE rete, NIENTE Supabase qui dentro.
 */
;(function (global) {
  'use strict'

  var VERSIONE = 'atr-v1'

  // Le zone, dall'alto in basso. I livelli vertebrali sono indicativi: la
  // zona si trova con le mani, non con i numeri.
  var LIVELLI = [
    { k: 'toracico_alto', nome: 'Toracico alto', dove: 'in alto, fra le scapole' },
    { k: 'toracico', nome: 'Toracico', dove: 'a metà delle scapole' },
    { k: 'toracolombare', nome: 'Toracolombare', dove: 'sotto le scapole, dove finiscono le coste' },
    { k: 'lombare', nome: 'Lombare', dove: 'la zona lombare, sopra il bacino' }
  ]

  // «Fermo»: mezzo secondo senza muoversi più di 0,6°. Valori di lavoro,
  // scelti per scartare l'appoggio e lo stacco del telefono.
  var FERMO_MS = 500, FERMO_SPAN = 0.6
  // Sotto questo valore il lato non si legge (in piano).
  var PIANO = 0.5
  // Oltre questo il telefono non è di traverso sulla schiena: il valore non vale.
  var FUORI = 30

  // LE FASCE — solo per il professionista. Fonti verificate il 30/09/2026:
  //  · Bunnell 1984 (J Bone Joint Surg Am 66:1381-7): 7° è il valore limite
  //    più usato per l'invio; 7° corrisponde a circa 20° di Cobb.
  //  · Amendt e coll. 1990 (Phys Ther 70:2): 5° è il criterio più sensibile.
  //  · AAFP 2014: sotto 5° in genere trascurabile; 5–9° almeno ricontrollo a
  //    6 mesi; da 10° valutazione radiografica.
  var FASCE = [
    { k: 'basso', da: 0, a: 5, parola: 'sotto 5°', colore: '#0a7d33' },
    { k: 'ricontrollo', da: 5, a: 7, parola: 'da ricontrollare', colore: '#b07500' },
    { k: 'invio', da: 7, a: 999, parola: 'da far valutare al medico', colore: '#c0392b' }
  ]
  var FONTI = 'Bunnell 1984 (7° ≈ 20° di Cobb, soglia d’invio più usata) · Amendt 1990 (5° il criterio più sensibile) · ' +
    'AAFP 2014 (5–9° ricontrollo, da 10° radiografia). È uno screening, non una diagnosi: la diagnosi richiede la radiografia (angolo di Cobb).'

  function fascia(v) {
    if (v == null || isNaN(v)) return null
    var a = Math.abs(v)
    for (var i = 0; i < FASCE.length; i++) if (a >= FASCE[i].da && a < FASCE[i].a) return FASCE[i]
    return FASCE[FASCE.length - 1]
  }
  function lato(v) {
    if (v == null || isNaN(v) || Math.abs(v) < PIANO) return 'in piano'
    return v > 0 ? 'più alto a destra' : 'più alto a sinistra'
  }
  function r2(x) { return x == null || isNaN(x) ? null : Math.round(x * 100) / 100 + 0 }
  function media(v) { if (!v.length) return null; var s = 0; for (var i = 0; i < v.length; i++) s += v[i]; return s / v.length }
  function varianza(v) { if (v.length < 2) return null; var m = media(v), s = 0; for (var i = 0; i < v.length; i++) s += (v[i] - m) * (v[i] - m); return s / (v.length - 1) }

  /* Il valore corretto: lo zero del telefono e il verso (taratura). */
  function corretto(beta, zero, verso) { return (beta - (zero || 0)) * (verso || 1) }

  /* Il «fermo»: sugli ultimi FERMO_MS di campioni [{t, v}], la media se
     l'escursione resta entro FERMO_SPAN; altrimenti null. */
  function fermo(buf, adesso) {
    var da = adesso - FERMO_MS, v = [], i
    for (i = buf.length - 1; i >= 0 && buf[i].t >= da; i--) v.push(buf[i].v)
    if (v.length < 5) return null
    var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v)
    if (mx - mn > FERMO_SPAN) return null
    var m = media(v)
    return Math.abs(m) > FUORI ? null : m
  }

  /* Tiene per ogni zona il valore fermo più lontano da zero (col suo segno). */
  function tieni(vecchio, nuovo) {
    if (nuovo == null) return vecchio
    if (vecchio == null) return nuovo
    return Math.abs(nuovo) > Math.abs(vecchio) ? nuovo : vecchio
  }

  /* Il riassunto delle passate: [{toracico_alto: v, ...}, ...]
     Per zona la media (col segno) e le singole; l'errore della misura è
     2,77 × Sw, con Sw la deviazione standard entro la zona, messa in comune
     fra le zone (servono almeno due passate). */
  function riassunto(passate) {
    passate = passate || []
    var per = {}, varz = [], gl = 0
    LIVELLI.forEach(function (L) {
      var v = passate.map(function (p) { return p ? p[L.k] : null }).filter(function (x) { return x != null && !isNaN(x) })
      var m = media(v)
      per[L.k] = { valore: r2(m), n: v.length, singole: v.map(r2), lato: lato(m), fascia: fascia(m) }
      var va = varianza(v)
      if (va != null) { varz.push(va * (v.length - 1)); gl += v.length - 1 }
    })
    var sw = gl > 0 ? Math.sqrt(varz.reduce(function (a, b) { return a + b }, 0) / gl) : null
    var max = null, livMax = null
    LIVELLI.forEach(function (L) { var x = per[L.k].valore; if (x != null && (max == null || Math.abs(x) > Math.abs(max))) { max = x; livMax = L.k } })
    return { livelli: per, errore: sw == null ? null : r2(2.77 * sw), sw: r2(sw), n: passate.length,
      massimo: max == null ? null : r2(Math.abs(max)), massimoSegno: r2(max), livelloMassimo: livMax }
  }

  /* Prima contro dopo, zona per zona. Riferimento: 0° (simmetria), quindi
     conta il valore ASSOLUTO. Il verdetto c'è solo se tutte e due le misure
     hanno il loro errore (tre passate): vale il più grande dei due. */
  function confronto(pre, post) {
    if (!pre || !post) return []
    var err = (pre.errore != null && post.errore != null) ? Math.max(pre.errore, post.errore) : null
    var out = []
    LIVELLI.forEach(function (L) {
      var a = pre[L.k], b = post[L.k]
      if (a == null || b == null || isNaN(a) || isNaN(b)) return
      var d = r2(Math.abs(b) - Math.abs(a))
      var esito = 'daconfermare'
      if (err != null) esito = Math.abs(d) <= err ? 'uguale' : (d < 0 ? 'meglio' : 'lavoro')
      out.push({ k: L.k, nome: L.nome, prima: Number(a), dopo: Number(b), delta: d, errore: err, esito: esito,
        latoPrima: lato(a), latoDopo: lato(b) })
    })
    return out
  }

  /* Le frasi per il professionista: numeri, mai un giudizio clinico. */
  function frasi(r) {
    if (!r || r.massimo == null) return ['Nessuna zona misurata: rifai la passata tenendo il telefono fermo mezzo secondo per zona.']
    var num = function (x) { return Math.abs(x).toFixed(1).replace('.', ',') }
    var nomeMax = (LIVELLI.filter(function (L) { return L.k === r.livelloMassimo })[0] || {}).nome || ''
    var out = ['Il valore più alto è nella zona ' + nomeMax.toLowerCase() + ': ' + num(r.massimo) + '°, ' + lato(r.massimoSegno) + '.']
    out.push(r.errore != null
      ? 'Ripetendo la misura ' + r.n + ' volte, il valore balla di ±' + num(r.errore) + '°: una differenza più piccola non si distingue dal rumore.'
      : 'Con una passata sola l’errore della misura non si conosce: il confronto prima/dopo resterà «da confermare».')
    out.push('È uno screening, non una diagnosi. L’interpretazione clinica la scrivi tu.')
    return out
  }

  global.PolAtr = {
    VERSIONE: VERSIONE, LIVELLI: LIVELLI, FASCE: FASCE, FONTI: FONTI,
    FERMO_MS: FERMO_MS, FERMO_SPAN: FERMO_SPAN, PIANO: PIANO, FUORI: FUORI,
    fascia: fascia, lato: lato, corretto: corretto, fermo: fermo, tieni: tieni,
    riassunto: riassunto, confronto: confronto, frasi: frasi
  }
})(typeof window !== 'undefined' ? window : globalThis)
