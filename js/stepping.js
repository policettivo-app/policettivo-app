/* js/stepping.js — stepping-v1 (30 settembre 2026)
 *
 * LO STEPPING TEST (FUKUDA) COL TELEFONO: IL CALCOLO E LE PAROLE.
 *
 * 50 passi sul posto, occhi chiusi, braccia tese in avanti col telefono fra
 * le mani: di quanti gradi il corpo ruota. Il telefono lo misura col
 * giroscopio: la velocità di rotazione proiettata sulla verticale (la
 * gravità), sommata nel tempo. Funziona comunque si tenga il telefono.
 *
 * ⚠️ È un'OSSERVAZIONE, non un test diagnostico. Fonti verificate il 30/09/2026:
 *  · Fukuda 1959 (criterio originale, riportato dal Shirley Ryan AbilityLab):
 *    oltre 30° di rotazione in 50 passi (oltre 45° in 100) indicava asimmetria.
 *  · Honaker e coll. 2009 (736 pazienti con vertigine cronica), soglia 45°:
 *    sensibilità 0,43, specificità 0,65, area sotto la curva 0,54: quasi il caso.
 *  · Bonanni e Newton 1998: ripetibilità nei sani ICC 0,66 (50 passi).
 *  · Hemm e coll. 2023 (Front Neurol, 24 sani, sensori sul petto): deviazione
 *    assoluta media 58° ± 48,6°, variabilità fra prove 38,9°, ICC 0,61; solo
 *    11 su 24 ruotavano sempre dalla stessa parte.
 * Quindi: gradi e direzione, sì; «patologico / normale», no. Il confronto
 * prima/dopo ha un verdetto solo oltre l'errore misurato dalle prove ripetute.
 *
 * ⚠️ NIENTE rete, NIENTE Supabase qui dentro.
 */
;(function (global) {
  'use strict'

  var VERSIONE = 'stepping-v1'
  var PASSI = 50
  // Il ritmo del metronomo: valore di lavoro NOSTRO (non preso da una fonte),
  // uguale per tutti così le prove si confrontano. 90 al minuto = 33 secondi.
  var RITMO_BPM = 90
  var FERMO_MS = 2000          // prima di partire: 2 s fermi per la deriva del giroscopio
  var DRITTO = 10              // sotto 10° si dice «quasi dritto» (valore di lavoro)
  var FONTI = 'Fukuda 1959: oltre 30° in 50 passi indicava asimmetria · Honaker 2009 (736 pazienti, soglia 45°): ' +
    'sensibilità 43%, specificità 65% · Hemm 2023 (sani): deviazione media 58°, variabilità fra prove 39°. ' +
    'È un’osservazione, non un test diagnostico.'

  function r1(x) { return x == null || isNaN(x) ? null : Math.round(x * 10) / 10 + 0 }
  function media(v) { if (!v.length) return null; var s = 0; for (var i = 0; i < v.length; i++) s += v[i]; return s / v.length }
  function sd(v) { if (v.length < 2) return null; var m = media(v), s = 0; for (var i = 0; i < v.length; i++) s += (v[i] - m) * (v[i] - m); return Math.sqrt(s / (v.length - 1)) }
  function durataMs(bpm, passi) { return Math.round((passi || PASSI) * 60000 / (bpm || RITMO_BPM)) }

  /* La velocità di rotazione attorno alla VERTICALE, in unità del sensore.
     rr: rotationRate {alpha (asse z), beta (asse x), gamma (asse y)};
     g: la gravità nel telefono {x, y, z} (lisciata). */
  function velocitaVerticale(rr, g) {
    if (!rr || !g) return null
    var n = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z)
    if (!(n > 1)) return null
    return ((rr.beta || 0) * g.x + (rr.gamma || 0) * g.y + (rr.alpha || 0) * g.z) / n
  }

  /* La somma nel tempo: campioni [{t (ms), w}] → angolo accumulato, in gradi,
     già corretto per scala, verso e deriva (w − deriva). */
  function integra(camp, scala, verso, deriva) {
    var a = 0, serie = [{ t: camp.length ? camp[0].t : 0, a: 0 }]
    for (var i = 1; i < camp.length; i++) {
      var dt = (camp[i].t - camp[i - 1].t) / 1000
      if (dt <= 0 || dt > 0.5) continue
      a += ((camp[i].w + camp[i - 1].w) / 2 - (deriva || 0)) * dt
      serie.push({ t: camp[i].t, a: a * (scala || 1) * (verso || 1) })
    }
    return { angolo: a * (scala || 1) * (verso || 1), serie: serie }
  }

  /* La taratura: mezzo giro a destra sul tavolo. Dice l'unità (gradi o
     radianti: alcuni browser danno i radianti) e il verso. */
  function taratura(angoloGrezzo) {
    var a = Math.abs(angoloGrezzo)
    var scala = null
    if (a >= 120 && a <= 240) scala = 1
    else if (a >= 2.1 && a <= 4.2) scala = 180 / Math.PI
    if (!scala) return { ok: false, angolo: angoloGrezzo }
    return { ok: true, scala: scala, verso: angoloGrezzo >= 0 ? 1 : -1, angolo: r1(a * scala) }
  }

  /* I passi, dall'accelerazione: picchi del modulo sopra la media, a più di
     0,3 s l'uno dall'altro. Serve solo come controllo («ne ho contati 48»). */
  function contaPassi(acc) {
    if (!acc || acc.length < 10) return 0
    var m = media(acc.map(function (s) { return s.m })), s0 = sd(acc.map(function (s) { return s.m })) || 0
    var soglia = m + Math.max(0.8, 0.6 * s0), n = 0, ultimo = -1e9
    for (var i = 1; i < acc.length - 1; i++) {
      var s = acc[i]
      if (s.m > soglia && s.m >= acc[i - 1].m && s.m >= acc[i + 1].m && s.t - ultimo > 300) { n++; ultimo = s.t }
    }
    return n
  }

  function direzione(v) {
    if (v == null || isNaN(v)) return '—'
    if (Math.abs(v) < DRITTO) return 'quasi dritto'
    return v > 0 ? 'verso destra' : 'verso sinistra'
  }

  /* Le prove ripetute: [{rotazione}] → media col segno, errore = 2,77 × SD
     fra le prove (servono almeno due prove). */
  function riassunto(prove) {
    var v = (prove || []).map(function (p) { return p.rotazione }).filter(function (x) { return x != null && !isNaN(x) })
    var m = media(v), s = sd(v)
    var stessa = v.length ? v.filter(function (x) { return m >= 0 ? x >= 0 : x < 0 }).length : 0
    return { rotazione: r1(m), n: v.length, sd: r1(s), errore: s == null ? null : r1(2.77 * s),
      direzione: direzione(m), stessaParte: stessa, singole: v.map(r1) }
  }

  /* Prima contro dopo: conta la rotazione ASSOLUTA (0° = dritto). */
  function confronto(pre, post) {
    if (!pre || !post || pre.rotazione == null || post.rotazione == null) return null
    var a = Number(pre.rotazione), b = Number(post.rotazione)
    var err = (pre.errore != null && post.errore != null) ? Math.max(Number(pre.errore), Number(post.errore)) : null
    var d = r1(Math.abs(b) - Math.abs(a))
    var esito = 'daconfermare'
    if (err != null) esito = Math.abs(d) <= err ? 'uguale' : (d < 0 ? 'meglio' : 'lavoro')
    return { prima: a, dopo: b, delta: d, errore: err, esito: esito, dirPrima: direzione(a), dirDopo: direzione(b) }
  }

  function frasi(r) {
    if (!r || r.rotazione == null) return ['Nessuna prova valida: rifai il test.']
    var num = function (x) { return Math.abs(x).toFixed(0) }
    var out = ['In ' + PASSI + ' passi a occhi chiusi ' + (Math.abs(r.rotazione) < DRITTO ? 'è rimasto quasi dritto (' + num(r.rotazione) + '°).'
      : 'ha ruotato di ' + num(r.rotazione) + '° ' + direzione(r.rotazione) + (r.n > 1 ? ' (media di ' + r.n + ' prove)' : '') + '.')]
    if (r.n > 1) out.push('Le prove sono andate dalla stessa parte ' + r.stessaParte + ' volte su ' + r.n + '; fra una prova e l’altra il valore balla di ±' + num(r.errore) + '°.')
    else out.push('Con una prova sola non si sa quanto balla la misura: nei sani varia molto da una prova all’altra.')
    out.push('È un’osservazione, non un test diagnostico. L’interpretazione clinica la scrivi tu.')
    return out
  }

  global.PolStepping = {
    VERSIONE: VERSIONE, PASSI: PASSI, RITMO_BPM: RITMO_BPM, FERMO_MS: FERMO_MS, DRITTO: DRITTO, FONTI: FONTI,
    durataMs: durataMs, velocitaVerticale: velocitaVerticale, integra: integra, taratura: taratura,
    contaPassi: contaPassi, direzione: direzione, riassunto: riassunto, confronto: confronto, frasi: frasi
  }
})(typeof window !== 'undefined' ? window : globalThis)
