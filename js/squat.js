/* js/squat.js — squat-v1 (24 settembre 2026)
 *
 * OVERHEAD SQUAT SULLA TAVOLA POLICETTIVA: IL CALCOLO, IN UN FILE SOLO.
 *
 * Il telefono sta sulla tavola come nell'Oscillazione e ne misura
 * l'inclinazione: dove va il carico. Lo squat lo dà a TEMPO la voce della
 * pagina (giù · fermo · su · in piedi), quindi ogni campione sa in che fase
 * cade senza sensori sul corpo.
 *
 * Cosa NON è: non sono chili né % del peso (servirebbe una taratura con pesi
 * noti), e la tavola non vede ginocchia, talloni, tronco, braccia.
 * Verdetti prima/dopo: SOLO quando l'errore della misura sarà misurato
 * (Fase 0 dello squat). Fino ad allora: «da confermare».
 *
 * Nessuna rete, nessun DOM: si prova in node.
 */
;(function (global) {
  'use strict'

  var VERSIONE = 'squat-v1'
  // Il ritmo: 3 s a scendere, 1 fermo in fondo, 3 a salire, 1 in piedi.
  // Prima della prima ripetizione, 2 s in piedi con le braccia in alto: è il
  // riferimento della persona ferma, nella stessa posizione di partenza.
  var RITMO = { inizio: 2000, giu: 3000, fondo: 1000, su: 3000, piedi: 1000 }
  var RIPETIZIONI = 5
  // Il corpo segue la voce con un piccolo ritardo: un campione appartiene alla
  // fase in cui cadeva 300 ms PRIMA. Valore di lavoro, dichiarato.
  var REAZIONE = 300
  // Sotto questo carico una direzione NON si legge. Viene dalle misure in
  // piedi fermi dell'11 settembre (rollio: due prove di fila cadute da parti
  // opposte con meno di 1,5°). Per lo squat non è ancora misurato: provvisorio.
  var LEGGIBILE = 1.5
  // La soglia prima/dopo dello squat (Fase 0): vuota finché non si misura.
  var ERRORE = {}

  var NOMI_FASE = { inizio: 'In piedi, braccia in alto', giu: 'Discesa', fondo: 'Fondo', su: 'Risalita', piedi: 'In piedi' }

  function durata(ritmo, n) {
    var r = ritmo || RITMO
    return r.inizio + (n || RIPETIZIONI) * (r.giu + r.fondo + r.su + r.piedi)
  }

  /* Il programma: gli intervalli di tempo (ms dall'inizio della misura) di ogni fase. */
  function programma(ritmo, n) {
    var r = ritmo || RITMO, out = [], t = 0, i
    out.push({ fase: 'inizio', rip: 0, da: 0, a: r.inizio }); t = r.inizio
    for (i = 1; i <= (n || RIPETIZIONI); i++) {
      ;['giu', 'fondo', 'su', 'piedi'].forEach(function (f) {
        out.push({ fase: f, rip: i, da: t, a: t + r[f] }); t += r[f]
      })
    }
    return out
  }

  function faseDi(prog, tMs) {
    for (var i = 0; i < prog.length; i++) if (tMs >= prog[i].da && tMs < prog[i].a) return prog[i]
    return null
  }

  function media(v) { if (!v.length) return null; var s = 0; for (var i = 0; i < v.length; i++) s += v[i]; return s / v.length }
  function sd(v) {
    if (v.length < 2) return null
    var m = media(v), s = 0
    for (var i = 0; i < v.length; i++) s += (v[i] - m) * (v[i] - m)
    return Math.sqrt(s / (v.length - 1))
  }
  function r2(x) { return x == null || isNaN(x) ? null : Math.round(x * 100) / 100 + 0 }

  function asseDi(asse) { return asse === 'rollio' ? 'gamma' : 'beta' }

  /* Le parole. Il segno è già quello tarato: + = destra (rollio) / avanti (beccheggio). */
  function parola(asse, v) {
    if (v == null || isNaN(v)) return '—'
    if (Math.abs(v) < LEGGIBILE) return 'al centro'
    if (asse === 'rollio') return v > 0 ? 'più a destra' : 'più a sinistra'
    return v > 0 ? 'più in avanti (punte)' : 'più indietro (talloni)'
  }
  function nomeAsse(asse) { return asse === 'rollio' ? 'destra-sinistra' : 'avanti-indietro' }

  /* IL CALCOLO.
     o = { t:[ms], b:[gradi grezzi beta], g:[gradi grezzi gamma],
           zero:{beta,gamma}, verso:{beta,gamma}, asse:'rollio'|'beccheggio',
           ritmo, n, reazione } */
  function calcola(o) {
    var ritmo = o.ritmo || RITMO, n = o.n || RIPETIZIONI
    var reaz = o.reazione != null ? o.reazione : REAZIONE
    var prog = programma(ritmo, n)
    var z = o.zero || { beta: 0, gamma: 0 }, vs = o.verso || { beta: 1, gamma: 1 }
    var asse = o.asse === 'rollio' ? 'rollio' : 'beccheggio'
    var princ = function (i) {
      return asse === 'rollio' ? (o.g[i] - z.gamma) * vs.gamma : (o.b[i] - z.beta) * vs.beta
    }
    var second = function (i) {
      return asse === 'rollio' ? (o.b[i] - z.beta) * vs.beta : (o.g[i] - z.gamma) * vs.gamma
    }
    // campioni per ripetizione e fase
    var cella = {}, i, k
    for (i = 0; i < (o.t || []).length; i++) {
      var f = faseDi(prog, o.t[i] - reaz)
      if (!f) continue
      k = f.rip + ':' + f.fase
      ;(cella[k] = cella[k] || { p: [], s: [] }).p.push(princ(i))
      cella[k].s.push(second(i))
    }
    var avvisi = []
    var rip = [], ri
    for (ri = 1; ri <= n; ri++) {
      var riga = { rip: ri }, tutti = []
      ;['giu', 'fondo', 'su', 'piedi'].forEach(function (fa) {
        var c = cella[ri + ':' + fa]
        riga[fa] = c ? r2(media(c.p)) : null
        if (fa === 'fondo') riga.fondo2 = c ? r2(media(c.s)) : null
        if (c && fa !== 'piedi') tutti = tutti.concat(c.p)
      })
      riga.escursione = tutti.length ? r2(Math.max.apply(null, tutti) - Math.min.apply(null, tutti)) : null
      rip.push(riga)
    }
    var valide = rip.filter(function (r) { return r.fondo != null })
    if (valide.length < n) avvisi.push('ripetizioni senza campioni: ' + (n - valide.length))
    var serie = function (fa) { return rip.map(function (r) { return r[fa] }).filter(function (x) { return x != null }) }
    var fasi = {}
    ;['giu', 'fondo', 'su'].forEach(function (fa) { var v = serie(fa); fasi[fa] = { media: r2(media(v)), sd: r2(sd(v)), n: v.length } })
    var ini = cella['0:inizio']
    fasi.inizio = { media: ini ? r2(media(ini.p)) : null }
    var fm = fasi.fondo.media
    var stessa = fm == null ? 0 : serie('fondo').filter(function (x) { return fm >= 0 ? x >= 0 : x < 0 }).length
    return {
      versione: VERSIONE, asse: asse, n: n, ritmo: ritmo, reazione: reaz,
      inizio: fasi.inizio.media,
      fasi: fasi,
      fondo: { media: fm, sd: fasi.fondo.sd, valori: serie('fondo'), parola: parola(asse, fm) },
      secondario: { fondo: r2(media(serie('fondo2'))) },
      escursione: r2(media(serie('escursione'))),
      coerenza: { stessa: stessa, di: valide.length },
      ripetizioni: rip,
      avvisi: avvisi
    }
  }

  /* Prima contro dopo (stessa seduta, stesso asse). Il verdetto c'è SOLO se
     l'errore dello squat è misurato; il «più al centro» è rispetto a 0. */
  function confronto(pre, post) {
    if (!pre || !post || pre.asse !== post.asse) return null
    var a = pre.fondo.media, b = post.fondo.media
    if (a == null || b == null) return null
    var delta = r2(Math.abs(b) - Math.abs(a)), err = ERRORE[pre.asse] != null ? ERRORE[pre.asse] : null
    var esito = 'daconfermare'
    if (err != null) esito = Math.abs(b - a) <= err ? 'uguale' : (delta < 0 ? 'meglio' : 'lavoro')
    return { asse: pre.asse, prima: a, dopo: b, delta: delta, errore: err, esito: esito,
      parolaPrima: parola(pre.asse, a), parolaDopo: parola(pre.asse, b) }
  }

  /* Le frasi, costruite da regole: stesso dato → stessa frase. Descrivono i
     numeri, mai un giudizio clinico (stessa regola dell'Oscillazione). */
  function frasi(r) {
    if (!r || r.fondo.media == null) return ['La misura non ha abbastanza campioni: rifai la prova.']
    var out = []
    var num = function (x) { return Math.abs(x).toFixed(1).replace('.', ',') }
    out.push('Asse ' + nomeAsse(r.asse) + '. Al fondo dello squat il carico è ' +
      (r.fondo.parola === 'al centro' ? 'al centro (entro ' + num(LEGGIBILE) + '°)' : r.fondo.parola + ', di ' + num(r.fondo.media) + '°') + '.')
    out.push('È andato dalla stessa parte in ' + r.coerenza.stessa + ' ripetizioni su ' + r.coerenza.di + '.' +
      (r.coerenza.di >= 4 && r.coerenza.stessa >= r.coerenza.di - 1 ? ' È uno schema che si ripete.' :
        (r.coerenza.di >= 4 && r.coerenza.stessa <= Math.ceil(r.coerenza.di / 2) ? ' Non c’è una parte costante.' : '')))
    if (r.inizio != null) out.push('In piedi, prima di scendere: ' + parola(r.asse, r.inizio) + (Math.abs(r.inizio) >= LEGGIBILE ? ' (' + num(r.inizio) + '°)' : '') + '.')
    out.push('Questi sono i numeri della misura. L’interpretazione clinica la scrivi tu.')
    return out
  }

  /* La traccia per il database, a 10 Hz come l'Oscillazione. */
  function decima(t, b, g, hz) {
    var passo = Math.max(1, Math.round((hz || 60) / 10)), out = { t: [], b: [], g: [] }, i
    for (i = 0; i < t.length; i += passo) { out.t.push(Math.round(t[i])); out.b.push(r2(b[i])); out.g.push(r2(g[i])) }
    return out
  }

  global.PolSquat = {
    VERSIONE: VERSIONE, RITMO: RITMO, RIPETIZIONI: RIPETIZIONI, REAZIONE: REAZIONE,
    LEGGIBILE: LEGGIBILE, ERRORE: ERRORE, NOMI_FASE: NOMI_FASE,
    durata: durata, programma: programma, faseDi: faseDi, asseDi: asseDi,
    calcola: calcola, confronto: confronto, frasi: frasi, parola: parola, nomeAsse: nomeAsse, decima: decima
  }
})(typeof window !== 'undefined' ? window : globalThis)
