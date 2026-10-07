/* js/guida-motore.js — guidato-v1 (7 ottobre 2026)
 *
 * ESERCIZI GUIDATI DAL TELEFONO: IL CALCOLO, IN UN FILE SOLO.
 * Primo esercizio: lo squat col telefono fra le due mani, in orizzontale,
 * braccia tese in avanti all'altezza degli occhi.
 *
 * Cosa legge il telefono (solo i sensori di movimento, niente fotocamera):
 *  - MANI: se una mano è più bassa dell'altra (il telefono ruota come un
 *    volante). È la parte più solida: è un angolo letto dalla gravità.
 *  - BRACCIA: se il telefono si inclina avanti/indietro rispetto alla partenza.
 *  - DISCESA e RISALITA: una STIMA in centimetri, fatta sommando due volte
 *    l'accelerazione dentro ogni mezza ripetizione e azzerando la velocità
 *    all'inizio e alla fine. NON è validata: quanto sbaglia si saprà solo
 *    dalle tracce vere. Serve a contare, non a misurare la profondità.
 *
 * Il ritmo lo dà la pagina (giù · fermo · su · in piedi): il motore sa in che
 * fase cade ogni campione e controlla se il movimento c'è stato davvero.
 *
 * Cosa NON è: non vede ginocchia, talloni, schiena, bacino. Non dice mai
 * «giusto» o «sbagliato»: descrive («mano destra più bassa»). Le soglie le
 * sceglie il professionista.
 *
 * Nessuna rete, nessun DOM, niente salvato: si prova in node.
 */
;(function (global) {
  'use strict'

  var VERSIONE = 'guidato-v1'
  var RITMI = {
    lento: { inizio: 3000, giu: 3000, fondo: 1000, su: 3000, piedi: 1000 },
    medio: { inizio: 3000, giu: 2000, fondo: 1000, su: 2000, piedi: 1000 }
  }
  // Valori di lavoro, dichiarati: nessuno di questi è ancora misurato in mano.
  var SOGLIE = {
    mani: 5,          // gradi: oltre, una mano «è più bassa»
    braccia: 15,      // gradi: oltre, il telefono non è più all'altezza di partenza
    movimento: 0.10   // metri stimati: sotto, la mezza ripetizione non si conta
  }
  var REAZIONE = 300        // ms: il corpo segue la voce con un piccolo ritardo
  var CODA = 600            // ms dopo la fine della fase: il movimento può finire tardi
  var TESTA = 200           // ms prima dell'inizio della fase
  var CADUTA_G = 3          // m/s²: sotto, per CADUTA_MS, il telefono è in caduta libera
  var CADUTA_MS = 120
  var PIATTO = 0.9          // |z| della gravità oltre cui il telefono è «in piano»: le mani non si leggono

  function durata(ritmo, n) { return ritmo.inizio + n * (ritmo.giu + ritmo.fondo + ritmo.su + ritmo.piedi) }

  function programma(ritmo, n) {
    var out = [], t = 0, i
    out.push({ fase: 'inizio', rip: 0, da: 0, a: ritmo.inizio }); t = ritmo.inizio
    for (i = 1; i <= n; i++) {
      ;['giu', 'fondo', 'su', 'piedi'].forEach(function (f) {
        out.push({ fase: f, rip: i, da: t, a: t + ritmo[f] }); t += ritmo[f]
      })
    }
    return out
  }
  function faseDi(prog, tMs) {
    for (var i = 0; i < prog.length; i++) if (tMs >= prog[i].da && tMs < prog[i].a) return prog[i]
    return null
  }
  /* Dove «dovrebbe» essere il corpo in quel momento: 0 = in piedi, 1 = in fondo. */
  function bersaglio(prog, tMs) {
    var f = faseDi(prog, tMs)
    if (!f) return { fase: null, rip: 0, p: 0, dentro: 0 }
    var x = (tMs - f.da) / (f.a - f.da), dolce = (1 - Math.cos(Math.PI * x)) / 2
    var p = f.fase === 'giu' ? dolce : f.fase === 'fondo' ? 1 : f.fase === 'su' ? 1 - dolce : 0
    return { fase: f.fase, rip: f.rip, p: p, dentro: x }
  }

  function r1(x) { return x == null || isNaN(x) ? null : Math.round(x * 10) / 10 + 0 }
  function r2(x) { return x == null || isNaN(x) ? null : Math.round(x * 100) / 100 + 0 }
  function media(v) { if (!v.length) return null; var s = 0; for (var i = 0; i < v.length; i++) s += v[i]; return s / v.length }
  function sd(v) {
    if (v.length < 2) return null
    var m = media(v), s = 0
    for (var i = 0; i < v.length; i++) s += (v[i] - m) * (v[i] - m)
    return Math.sqrt(s / (v.length - 1))
  }
  function giro(a) { while (a > 180) a -= 360; while (a < -180) a += 360; return a }

  /* Da un campione dei sensori: la gravità, i due angoli e l'accelerazione verticale.
     ag = accelerationIncludingGravity, a = acceleration (può mancare).
     gPrec = la gravità stimata al campione prima (serve se «a» manca). */
  function leggi(ag, a, gPrec) {
    var G
    if (a && a.x != null) G = { x: ag.x - a.x, y: ag.y - a.y, z: ag.z - a.z }
    else G = gPrec ? { x: gPrec.x * 0.96 + ag.x * 0.04, y: gPrec.y * 0.96 + ag.y * 0.04, z: gPrec.z * 0.96 + ag.z * 0.04 } : { x: ag.x, y: ag.y, z: ag.z }
    var m = Math.sqrt(G.x * G.x + G.y * G.y + G.z * G.z) || 1
    var haLin = !!(a && a.x != null)
    var modulo = Math.sqrt(ag.x * ag.x + ag.y * ag.y + ag.z * ag.z)
    return {
      G: G,
      volante: Math.atan2(G.y, G.x) * 180 / Math.PI,          // l'angolo «da volante», grezzo
      becco: Math.asin(Math.max(-1, Math.min(1, G.z / m))) * 180 / Math.PI,
      piatto: Math.abs(G.z / m) > PIATTO,
      // accelerazione lungo la verticale. Se il telefono non dà quella «senza
      // gravità», si usa quanto pesa in più o in meno del solito (meno preciso).
      av: haLin ? (a.x * G.x + a.y * G.y + a.z * G.z) / m : modulo - 9.81,
      senzaLineare: !haLin,
      modulo: modulo
    }
  }

  /* Di quanto ci si è spostati in una finestra, sapendo che si parte e si
     arriva fermi: tolta la media (così la velocità finale è zero e un errore
     fisso del sensore sparisce), si somma due volte. */
  function spostamento(t, av) {
    var n = t.length
    if (n < 5) return null
    var T = (t[n - 1] - t[0]) / 1000
    if (T <= 0) return null
    var area = 0, i
    for (i = 1; i < n; i++) area += (av[i] + av[i - 1]) / 2 * (t[i] - t[i - 1]) / 1000
    var m = area / T, v = 0, d = 0, vp = 0
    for (i = 1; i < n; i++) {
      var dt = (t[i] - t[i - 1]) / 1000
      v += ((av[i] - m) + (av[i - 1] - m)) / 2 * dt
      d += (v + vp) / 2 * dt; vp = v
    }
    return d
  }

  function crea(o) {
    o = o || {}
    var ritmo = o.ritmo || RITMI.lento, n = o.n || 5
    var s = o.soglie || {}
    return {
      ritmo: ritmo, n: n, prog: programma(ritmo, n), fine: durata(ritmo, n),
      soglie: { mani: s.mani || SOGLIE.mani, braccia: s.braccia || SOGLIE.braccia, movimento: s.movimento || SOGLIE.movimento },
      reazione: o.reazione != null ? o.reazione : REAZIONE,
      t: [], av: [], roll: [], pitch: [], fz: [],
      G: null, zero: null, zeroAcc: { sx: 0, sy: 0, b: [], av: [] },
      segno: 0, mezze: [], chiuse: {}, viva: null, ultimaProf: 0, scala: 0.4,
      cadeDa: null, caduta: false, piattoN: 0
    }
  }

  /* Un campione: { t (ms dall'inizio della misura), ag:{x,y,z}, a:{x,y,z}|null }.
     Torna cosa mostrare ADESSO. */
  function aggiungi(st, c) {
    var L = leggi(c.ag, c.a, st.G)
    st.G = L.G
    var b = bersaglio(st.prog, c.t), fr = faseDi(st.prog, c.t - st.reazione)
    // la partenza: fermo, si prende lo zero (dopo il primo secondo, che è assestamento)
    if (!st.zero) {
      if (c.t >= Math.min(1000, st.ritmo.inizio / 3) && c.t < st.ritmo.inizio) {
        var rad = L.volante * Math.PI / 180
        st.zeroAcc.sx += Math.cos(rad); st.zeroAcc.sy += Math.sin(rad); st.zeroAcc.b.push(L.becco); st.zeroAcc.av.push(L.av)
      }
      if (c.t >= st.ritmo.inizio && st.zeroAcc.b.length >= 3) {
        st.zero = { volante: Math.atan2(st.zeroAcc.sy, st.zeroAcc.sx) * 180 / Math.PI, becco: media(st.zeroAcc.b), av: media(st.zeroAcc.av) }
      }
    }
    var z = st.zero
    var roll = z ? giro(L.volante - z.volante) : 0, pitch = z ? L.becco - z.becco : 0
    if (L.piatto) { roll = 0; st.piattoN++ }
    st.t.push(c.t); st.av.push(L.av); st.roll.push(roll); st.pitch.push(pitch); st.fz.push(fr ? fr.rip + ':' + fr.fase : '')

    // la caduta del telefono
    if (L.modulo < CADUTA_G) { if (st.cadeDa == null) st.cadeDa = c.t; if (c.t - st.cadeDa >= CADUTA_MS) st.caduta = true } else st.cadeDa = null

    // la stima viva dentro la mezza ripetizione in corso (parte da ferma)
    // (si comincia a sommare un attimo PRIMA che il corpo parta: da fermi)
    var fv = faseDi(st.prog, c.t - st.reazione + TESTA)
    var mov = fv && (fv.fase === 'giu' || fv.fase === 'su')
    var chiave = mov ? fv.rip + ':' + fv.fase : null
    if (chiave && (!st.viva || st.viva.k !== chiave)) {
      // l'errore fisso del sensore: la media dell'ultimo mezzo secondo fermo
      var bias = 0, k = st.t.length - 2, acc = []
      while (k >= 0 && c.t - st.t[k] <= 700) { if (c.t - st.t[k] >= 100) acc.push(st.av[k]); k-- }
      if (acc.length >= 3) bias = media(acc)
      st.viva = { k: chiave, v: 0, d: 0, bias: bias, tp: c.t, ap: L.av - bias }
    } else if (chiave && st.viva) {
      var dt = (c.t - st.viva.tp) / 1000, an = L.av - st.viva.bias, vp = st.viva.v
      st.viva.v += (an + st.viva.ap) / 2 * dt
      st.viva.d += (st.viva.v + vp) / 2 * dt
      st.viva.tp = c.t; st.viva.ap = an
    }
    // la chiusura delle mezze ripetizioni: appena la loro finestra è passata
    chiudi(st, c.t)

    // dove sta il corpo, da 0 (in piedi) a 1 (il più giù visto finora)
    var prof = st.ultimaProf
    if (chiave && st.viva) {
      var d = st.segno ? st.viva.d * st.segno : -Math.abs(st.viva.d)   // giù = negativo
      prof = fv.fase === 'giu' ? Math.max(0, -d) : Math.max(0, st.ultimaProf - Math.max(0, d))
      if (fv.fase === 'giu') st.ultimaProf = prof   // in fondo la pallina resta dov'è arrivata
    } else if (fv && (fv.fase === 'piedi' || fv.fase === 'inizio')) prof = 0
    var fatte = st.mezze.filter(function (m) { return m.contata }).length
    return {
      fase: b.fase, rip: b.rip, p: b.p, finito: c.t >= st.fine,
      pronto: !!z, roll: roll, pitch: pitch, piatto: L.piatto,
      lato: Math.abs(roll) < st.soglie.mani ? null : (roll > 0 ? 'destra' : 'sinistra'),   // la mano PIÙ BASSA
      braccia: Math.abs(pitch) >= st.soglie.braccia,
      corpo: Math.max(0, Math.min(1, prof / st.scala)), profondita: prof,
      mezze: fatte, ripetizioni: Math.floor(fatte / 2), caduta: st.caduta
    }
  }

  function chiudi(st, adesso) {
    for (var i = 0; i < st.prog.length; i++) {
      var f = st.prog[i]
      if (f.fase !== 'giu' && f.fase !== 'su') continue
      var k = f.rip + ':' + f.fase
      if (st.chiuse[k]) continue
      var da = f.da + st.reazione - TESTA, a = f.a + st.reazione + CODA
      if (adesso < a) break
      st.chiuse[k] = true
      var tt = [], aa = [], rr = [], pp = [], j
      for (j = 0; j < st.t.length; j++) if (st.t[j] >= da && st.t[j] <= a) { tt.push(st.t[j]); aa.push(st.av[j]); rr.push(st.roll[j]); pp.push(st.pitch[j]) }
      var d = spostamento(tt, aa)
      var m = { rip: f.rip, fase: f.fase, metri: d, contata: false, campioni: tt.length,
        mani: r1(media(rr)), maniMax: r1(rr.length ? rr.reduce(function (x, y) { return Math.abs(y) > Math.abs(x) ? y : x }, 0) : null),
        braccia: r1(pp.length ? pp.reduce(function (x, y) { return Math.abs(y) > Math.abs(x) ? y : x }, 0) : null),
        tremolio: r2(sd(aa)) }
      if (d != null && Math.abs(d) >= st.soglie.movimento) {
        // il verso di «giù» lo dice la prima discesa: i telefoni non concordano sul segno
        if (!st.segno && f.fase === 'giu') st.segno = d < 0 ? 1 : -1
        if (st.segno) {
          var giu = d * st.segno < 0
          m.contata = (f.fase === 'giu') === giu
        }
      }
      if (m.contata) {
        var cm = Math.abs(d)
        if (f.fase === 'giu') { st.ultimaProf = cm; if (cm > st.scala) st.scala = cm } else st.ultimaProf = 0
      } else st.ultimaProf = 0
      st.mezze.push(m)
    }
  }

  /* A fine esercizio: i numeri, ripetizione per ripetizione. */
  function riassunto(st) {
    chiudi(st, Infinity)
    var rip = [], i
    for (i = 1; i <= st.n; i++) {
      var g = st.mezze.filter(function (m) { return m.rip === i && m.fase === 'giu' })[0] || null
      var s = st.mezze.filter(function (m) { return m.rip === i && m.fase === 'su' })[0] || null
      rip.push({ rip: i,
        giu: !!(g && g.contata), su: !!(s && s.contata),
        discesaCm: g && g.contata ? Math.round(Math.abs(g.metri) * 100) : null,
        risalitaCm: s && s.contata ? Math.round(Math.abs(s.metri) * 100) : null,
        mani: g || s ? r1(media([g, s].filter(Boolean).map(function (m) { return m.mani }))) : null,
        maniMax: g || s ? [g, s].filter(Boolean).map(function (m) { return m.maniMax }).reduce(function (x, y) { return Math.abs(y) > Math.abs(x) ? y : x }, 0) : null,
        braccia: g || s ? [g, s].filter(Boolean).map(function (m) { return m.braccia }).reduce(function (x, y) { return Math.abs(y) > Math.abs(x) ? y : x }, 0) : null,
        tremolio: g || s ? r2(media([g, s].filter(Boolean).map(function (m) { return m.tremolio }))) : null })
    }
    var mezze = st.mezze.filter(function (m) { return m.contata }).length
    var intere = rip.filter(function (r) { return r.giu && r.su }).length
    var mani = rip.map(function (r) { return r.mani }).filter(function (x) { return x != null })
    var mm = media(mani)
    var stessa = mm == null ? 0 : mani.filter(function (x) { return Math.abs(x) >= st.soglie.mani && (mm >= 0 ? x > 0 : x < 0) }).length
    var disc = rip.map(function (r) { return r.discesaCm }).filter(function (x) { return x != null })
    return {
      versione: VERSIONE, n: st.n, ritmo: st.ritmo, soglie: st.soglie,
      mezze: mezze, intere: intere, ripetizioni: rip,
      mani: { media: r1(mm), sd: r1(sd(mani)), stessaParte: stessa, lato: mm == null || Math.abs(mm) < st.soglie.mani ? null : (mm > 0 ? 'destra' : 'sinistra') },
      braccia: { max: r1(rip.map(function (r) { return r.braccia }).filter(function (x) { return x != null }).reduce(function (x, y) { return Math.abs(y) > Math.abs(x) ? y : x }, 0)) },
      discesaCm: { media: disc.length ? Math.round(media(disc)) : null, sd: disc.length > 1 ? Math.round(sd(disc)) : null },
      caduta: st.caduta, pianoPct: st.t.length ? Math.round(st.piattoN / st.t.length * 100) : 0,
      zero: st.zero ? true : false, campioni: st.t.length
    }
  }

  /* Le frasi, da regole: stesso dato → stessa frase. Descrivono, non giudicano. */
  function frasi(r) {
    if (!r || !r.zero || r.campioni < 30) return ['Il telefono non ha dato abbastanza dati: rifai la prova.']
    var out = [], num = function (x) { return Math.abs(x).toFixed(1).replace('.', ',') }
    out.push('Movimenti contati: ' + r.intere + (r.intere === 1 ? ' ripetizione completa su ' : ' ripetizioni complete su ') + r.n + ' (' + r.mezze + ' mezze su ' + r.n * 2 + ').')
    if (r.mani.media != null) out.push(r.mani.lato
      ? 'In media la mano ' + r.mani.lato + ' è rimasta più bassa di ' + num(r.mani.media) + '°, in ' + r.mani.stessaParte + ' ripetizioni su ' + r.ripetizioni.filter(function (x) { return x.mani != null }).length + '.'
      : 'Le due mani sono rimaste alla stessa altezza (entro ' + num(r.soglie.mani) + '°).')
    if (r.braccia.max != null) out.push(Math.abs(r.braccia.max) >= r.soglie.braccia
      ? 'Il telefono si è inclinato fino a ' + num(r.braccia.max) + '° rispetto alla partenza.'
      : 'Il telefono è rimasto all’altezza di partenza (entro ' + num(r.soglie.braccia) + '°).')
    if (r.discesaCm.media != null) out.push('Discesa stimata: circa ' + r.discesaCm.media + ' cm. È una stima dall’accelerometro, non ancora verificata.')
    if (r.pianoPct > 20) out.push('Per il ' + r.pianoPct + '% del tempo il telefono era quasi in piano: lì l’altezza delle mani non si legge.')
    out.push('Sono i numeri del telefono. Cosa vogliono dire lo decide il professionista.')
    return out
  }

  global.PolGuida = {
    VERSIONE: VERSIONE, RITMI: RITMI, SOGLIE: SOGLIE, REAZIONE: REAZIONE,
    durata: durata, programma: programma, faseDi: faseDi, bersaglio: bersaglio,
    leggi: leggi, spostamento: spostamento, crea: crea, aggiungi: aggiungi, riassunto: riassunto, frasi: frasi, giro: giro
  }
})(typeof window !== 'undefined' ? window : globalThis)
