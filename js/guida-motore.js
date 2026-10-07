/* js/guida-motore.js — guidato-v5 (7 ottobre 2026)
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

  var VERSIONE = 'guidato-v5'
  var RITMI = {
    lento: { inizio: 3000, giu: 3000, fondo: 1000, su: 3000, piedi: 1000 },
    medio: { inizio: 3000, giu: 2000, fondo: 1000, su: 2000, piedi: 1000 }
  }
  // Valori di lavoro, dichiarati: nessuno di questi è ancora misurato in mano.
  var SOGLIE = {
    mani: 5,          // gradi: oltre, una mano «è più bassa»
    braccia: 20,      // gradi: oltre, il telefono non è più all'altezza di partenza (nei tracciati veri uno squat normale lo inclina fino a 15°, quelli sbagliati apposta di 22-35°)
    movimento: 0.10   // metri stimati: sotto, la mezza ripetizione non si conta
  }
  var REAZIONE = 300        // ms: il corpo segue la voce con un piccolo ritardo
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

  /* ── guidato-v5 · dal terzo tracciato vero (7 ott sera, iPhone) ──
     Cinque squat fatti PIANO, come chiede la voce, e ne contava uno. Il conto
     di prima cercava i momenti in cui il telefono è «fermo» per chiudere ogni
     movimento: funziona con gli squat svelti (accelerazioni di 1-4 m/s²), ma
     con quelli lenti l'accelerazione è piccola quanto il tremolio della mano,
     e «fermo» e «in movimento» non si distinguono più. Contava peggio proprio
     chi faceva l'esercizio come chiesto.
     Adesso non si cerca più il fermo. Si ricostruisce la POSIZIONE (l'altezza
     del telefono nel tempo) e si contano le sue VALLI: giù di almeno 20 cm e
     poi di nuovo su. La deriva — l'errore fisso del sensore, che sommato due
     volte cresce come una parabola — si toglie sottraendo alla velocità la sua
     media su 8 secondi: chi parte da in piedi e torna in piedi ha velocità
     media zero, quindi quella media È la deriva.
     Per la pallina, che serve ADESSO, la media «centrata» degli ultimi 4
     secondi non esiste ancora: la deriva si prolunga in linea retta. */
  var FINESTRA = 8        // s: la finestra della media che toglie la deriva
  var VALLE_GIU = 0.20    // m: quanto bisogna scendere perché sia una discesa
  var VALLE_SU = 0.5      // quanta parte della discesa bisogna risalire perché lo squat sia chiuso
  var VALLE_VEL = 0.08    // m/s: una discesa più lenta di così non si distingue dalla deriva
  var VALLE_REL = 0.4     // una valle più piccola di così rispetto alle altre è deriva, non squat
  var CONFERMA_MS = 300   // dal vivo uno squat si conta 0,3 s dopo che è finito

  /* somma nel tempo (trapezi); i buchi dei sensori si attraversano in linea retta */
  function somma(t, x, da) {
    var n = t.length, out = new Array(n - da), s = 0
    out[0] = 0
    for (var i = da + 1; i < n; i++) { s += (x[i] + x[i - 1]) / 2 * (t[i] - t[i - 1]) / 1000; out[i - da] = s }
    return out
  }
  /* media mobile centrata su W secondi, troncata ai bordi */
  function mediaCentrata(t, x, W) {
    var n = t.length, out = new Array(n), c = new Array(n + 1), j0 = 0, j1 = 0, i
    c[0] = 0
    for (i = 0; i < n; i++) c[i + 1] = c[i] + x[i]
    for (i = 0; i < n; i++) {
      while (t[j0] < t[i] - W * 500) j0++
      while (j1 < n && t[j1] <= t[i] + W * 500) j1++
      out[i] = (c[j1] - c[j0]) / (j1 - j0)
    }
    return out
  }
  /* La posizione fino a adesso. Torna { t, p } (t in ms, p in metri; lo zero non
     conta, contano i dislivelli). vivo = true: l'ultimo tratto con la deriva
     prolungata in linea retta (per la pallina e per il conto in diretta). */
  function posizione(st, vivo) {
    var da = st.da
    if (da == null || st.t.length - da < 12) return null
    var t = st.t.slice(da), n = t.length, a = new Array(n), i
    var b0 = st.zero ? st.zero.av : 0
    for (i = 0; i < n; i++) a[i] = st.av[da + i] - b0
    var v = somma(t, a, 0), W = FINESTRA, H = W * 500
    var lungo = t[n - 1] - t[0]
    var base
    if (lungo < (W + 1) * 1000) {
      // troppo presto per stimare la deriva: ci si fida dello zero preso da fermi
      if (!vivo) { var m = media(v); base = v.map(function () { return m }) } else base = v.map(function () { return 0 })
    } else {
      base = mediaCentrata(t, v, W)
      if (vivo) {
        var j = n - 1, j2, k0 = 0, k1
        while (j > 0 && t[j] > t[n - 1] - H) j--          // l'ultimo punto con la finestra intera
        j2 = j; while (j2 > 0 && t[j2] > t[j] - 2000) j2--
        var sl = j > j2 ? (base[j] - base[j2]) / (t[j] - t[j2]) : 0
        for (i = j + 1; i < n; i++) base[i] = base[j] + sl * (t[i] - t[j])
        while (k0 < n - 1 && t[k0] < t[0] + H) k0++        // e il primo
        k1 = k0; while (k1 < n - 1 && t[k1] < t[k0] + 1000) k1++
        var sl0 = k1 > k0 ? (base[k1] - base[k0]) / (t[k1] - t[k0]) : 0
        for (i = 0; i < k0; i++) base[i] = base[k0] + sl0 * (t[i] - t[k0])
      }
    }
    for (i = 0; i < n; i++) v[i] -= base[i]
    return { t: t, p: somma(t, v, 0) }
  }
  /* Le valli: giù di almeno VALLE_GIU dal punto più alto, poi su di almeno metà. */
  function valli(P, segno) {
    var t = P.t, p = P.p, n = t.length, out = [], stato = 'su', top = p[0] * segno, itop = 0, pmin = 0, imin = 0, top0 = 0, itop0 = 0, i, x
    for (i = 0; i < n; i++) {
      x = p[i] * segno
      if (stato === 'su') {
        if (x > top) { top = x; itop = i }
        if (x < top - VALLE_GIU) { stato = 'giu'; pmin = x; imin = i; top0 = top; itop0 = itop }
      } else {
        if (x < pmin) { pmin = x; imin = i }
        if (x > pmin + Math.max(0.12, VALLE_SU * (top0 - pmin))) {
          out.push({ itop: itop0, imin: imin, ifine: i, metri: top0 - pmin, top: top0, min: pmin })
          stato = 'su'; top = x; itop = i
        }
      }
    }
    return { valli: out, aperta: stato === 'giu' ? { itop: itop0, imin: imin, metri: top0 - pmin, top: top0, min: pmin } : null, top: top }
  }
  /* Da una valle a uno squat coi suoi tempi (dal 10% al 90% del dislivello, riportati all'intero ÷ 0,6). */
  function misura(P, V, segno) {
    var t = P.t, p = P.p, D = V.metri, i
    var a10 = V.itop, a90 = V.imin, b90 = V.imin, b10 = V.ifine
    for (i = V.imin; i >= V.itop; i--) if (p[i] * segno >= V.top - 0.1 * D) { a10 = i; break }
    for (i = a10; i <= V.imin; i++) if (p[i] * segno <= V.min + 0.1 * D) { a90 = i; break }
    for (i = V.imin; i < p.length; i++) if (p[i] * segno >= V.min + 0.1 * D) { b90 = i; break }
    // la risalita finisce quando si torna al 90% del dislivello, o dove smette di salire
    // la risalita finisce quando si torna al 90% del dislivello; se non ci si torna
    // (si è risaliti meno), dove si è arrivati più in alto nei 2 secondi dopo
    var su = V.min + 0.9 * D, imax = V.ifine, trovato = false
    for (i = b90; i < p.length && t[i] - t[V.ifine] <= 2000; i++) {
      if (p[i] * segno > p[imax] * segno) imax = i
      if (p[i] * segno >= su) { b10 = i; trovato = true; break }
    }
    if (!trovato) b10 = imax
    return { t0: t[a10], tFondo: t[a90], tSu: t[b90], t1: t[b10], metri: D,
      giuS: (t[a90] - t[a10]) / 600, suS: (t[b10] - t[b90]) / 600, fondoS: Math.max(0, (t[b90] - t[a90]) / 1000) }
  }
  /* Lo spostamento fra due istanti in cui si è fermi (velocità zero ai due capi:
     tolta la media, un errore fisso del sensore sparisce) e quanto è durato
     (dal 10% al 90% del dislivello, riportato all'intero ÷ 0,6). */
  function profilo(st, tDa, tA) {
    var tt = [], aa = [], i
    for (i = 0; i < st.t.length; i++) if (st.t[i] >= tDa && st.t[i] <= tA) { tt.push(st.t[i] / 1000); aa.push(st.av[i]) }
    var n = tt.length
    if (n < 8) return null
    var T = tt[n - 1] - tt[0], area = 0
    for (i = 1; i < n; i++) area += (aa[i] + aa[i - 1]) / 2 * (tt[i] - tt[i - 1])
    var c0 = area / T, v = 0, d = 0, ds = [0]
    for (i = 1; i < n; i++) { var dt = tt[i] - tt[i - 1], vn = v + ((aa[i] - c0) + (aa[i - 1] - c0)) / 2 * dt; d += (v + vn) / 2 * dt; v = vn; ds.push(d) }
    var E = ds[n - 1], a10 = null, a90 = null
    if (Math.abs(E) < 0.02) return { metri: E, giuS: null }
    for (i = 0; i < n; i++) { var q = ds[i] / E; if (a10 == null && q >= 0.1) a10 = tt[i]; if (q >= 0.9) { a90 = tt[i]; break } }
    return { metri: E, giuS: a10 != null && a90 != null ? (a90 - a10) / 0.6 : null, t10: a10 != null ? a10 * 1000 : null, t90: a90 != null ? a90 * 1000 : null }
  }

  /* A prova finita, ora che si sa DOVE sono la discesa e la risalita, i loro
     secondi e i centimetri si rimisurano sui dati grezzi, da fermo a fermo
     (velocità zero ai due capi): la media che toglie la deriva arrotonda gli
     spigoli e farebbe sembrare i movimenti più lenti di quel che sono. */
  function affina(st, x) {
    var g = profilo(st, x.t0 - 700, x.tFondo + 600, 0), u = profilo(st, x.tSu - 600, x.t1 + 700, 0)
    var ok = function (p) { return p && p.giuS != null && Math.abs(p.metri) >= 0.5 * x.metri && Math.abs(p.metri) <= 1.8 * x.metri }
    var m = []
    // (anche gli istanti di partenza e di arrivo si prendono da qui: servono per dire «a tempo»)
    if (ok(g)) { x.giuS = g.giuS; m.push(Math.abs(g.metri)); x.t0 = g.t10; x.tFondo = g.t90 } else x.giuS = null   // se non torna, meglio nessun numero che uno sbagliato
    if (ok(u)) { x.suS = u.giuS; m.push(Math.abs(u.metri)); x.tSu = u.t10; x.t1 = u.t90 } else x.suS = null
    x.fondoS = Math.max(0, (x.tSu - x.tFondo) / 1000)
    if (m.length) x.metri = media(m)
    x.vero = m.length === 2 || (m.length === 1 && x.metri >= 0.35)   // discesa E risalita confermate (una sola basta se lo squat è profondo)
  }

  /* Gli squat visti finora. vivo = conto in diretta (solo quelli finiti da un po'). */
  function squatVisti(st, vivo) {
    var P = posizione(st, vivo)
    if (!P) return { P: null, squat: [], aperta: null, top: 0 }
    // il verso di «giù»: i telefoni non concordano sul segno. Il primo dislivello vero, da in piedi, è una discesa.
    // Si decide SOLO sulla posizione viva dei primi secondi, quella che parte dallo zero preso da fermi.
    if (!st.segno && !vivo) return { P: P, squat: [], aperta: null, top: 0 }
    if (!st.segno) {
      var p0 = P.p[0], i
      for (i = 0; i < P.p.length; i++) if (Math.abs(P.p[i] - p0) >= VALLE_GIU) { st.segno = P.p[i] < p0 ? 1 : -1; break }
      if (!st.segno) return { P: P, squat: [], aperta: null, top: 0 }
    }
    var R = valli(P, st.segno), adesso = P.t[P.t.length - 1], ultimaPiedi = tempi(st, st.n).piedi
    var q = R.valli.map(function (V) { return misura(P, V, st.segno) })
    // La prova del nove di ogni valle: rimisurata sui dati grezzi fra i suoi due capi fermi,
    // la discesa (o la risalita) deve esserci ancora. Una valle fatta solo di deriva lenta
    // del sensore lì sparisce, perché nel piccolo la deriva è un errore fisso e si toglie.
    q.forEach(function (x) { affina(st, x) })
    q = q.filter(function (x) { return x.vero })
    // e non dev'essere più lenta di VALLE_VEL, né a scendere né a salire: quella è deriva
    q = q.filter(function (x) { return (x.giuS == null || x.metri / x.giuS >= VALLE_VEL) && (x.suS == null || x.metri / x.suS >= VALLE_VEL) })
    q = q.filter(function (x) { return x.metri / Math.max(0.2, (x.tFondo - x.t0) / 1000 / 0.8) >= VALLE_VEL && x.t0 < ultimaPiedi })
    if (q.length >= 2) {
      var ord = q.map(function (x) { return x.metri }).sort(function (a, b) { return a - b }), med = ord[Math.floor(ord.length / 2)]
      q = q.filter(function (x) { return x.metri >= VALLE_REL * med })
    }
    if (vivo) q = q.filter(function (x) { return adesso - x.t1 >= CONFERMA_MS || adesso - P.t[0] > st.fine })
    return { P: P, squat: q, aperta: R.aperta, top: R.top }
  }
  function segnaTempo(st, lista) {   // a tempo? la discesa parte vicino a un «giù» e la risalita vicino al suo «su»
    var presi = {}
    lista.forEach(function (q) {
      q.rip = null
      var best = null
      for (var r = 1; r <= st.n; r++) {
        if (presi[r]) continue
        var T = tempi(st, r), dg = q.t0 - T.giu, ds = q.tSu - T.su
        if (dg >= -1000 && dg <= 2200 && ds >= -1500 && ds <= 2200 && (best == null || Math.abs(dg) < best.d)) best = { r: r, d: Math.abs(dg) }
      }
      if (best) { q.rip = best.r; presi[best.r] = true }
    })
    return lista
  }

  function crea(o) {
    o = o || {}
    var ritmo = o.ritmo || RITMI.lento, n = o.n || 5
    var s = o.soglie || {}
    return {
      ritmo: ritmo, n: n, prog: programma(ritmo, n), fine: durata(ritmo, n),
      soglie: { mani: s.mani || SOGLIE.mani, braccia: s.braccia || SOGLIE.braccia, movimento: s.movimento || SOGLIE.movimento },
      t: [], av: [], roll: [], pitch: [],
      G: null, zero: null, zeroAcc: { sx: 0, sy: 0, b: [], av: [] }, da: null,
      segno: 0, scala: 0.5, vivo: { n: 0, discese: 0, corpo: 0, prof: 0, ultima: null, aTempo: 0 }, giroCalcolo: 0,
      fuori: { destra: 0, sinistra: 0, braccia: 0, maxDestra: 0, maxSinistra: 0, maxBraccia: 0 },
      cadeDa: null, caduta: false, piattoN: 0, senzaLineare: false
    }
  }
  function tempi(st, r) {   // i tempi del programma della ripetizione r
    var R = st.ritmo, da = R.inizio + (r - 1) * (R.giu + R.fondo + R.su + R.piedi)
    return { giu: da, fondo: da + R.giu, su: da + R.giu + R.fondo, piedi: da + R.giu + R.fondo + R.su, fine: da + R.giu + R.fondo + R.su + R.piedi }
  }
  function piuGrande(v) { return v.length ? v.reduce(function (p, q) { return Math.abs(q) > Math.abs(p) ? q : p }, 0) : null }

  /* Un campione: { t (ms dall'inizio della misura), ag:{x,y,z}, a:{x,y,z}|null }.
     Torna cosa mostrare ADESSO. */
  function aggiungi(st, c) {
    var L = leggi(c.ag, c.a, st.G)
    st.G = L.G; if (L.senzaLineare) st.senzaLineare = true
    var b = bersaglio(st.prog, c.t)
    // la partenza: fermo, si prende lo zero (dopo il primo terzo, che è assestamento).
    // Si chiude 0,8 s PRIMA del primo «giù»: c'è chi parte in anticipo.
    if (!st.zero) {
      if (c.t >= st.ritmo.inizio / 3 && c.t < st.ritmo.inizio - 800) {
        var rad = L.volante * Math.PI / 180
        st.zeroAcc.sx += Math.cos(rad); st.zeroAcc.sy += Math.sin(rad); st.zeroAcc.b.push(L.becco); st.zeroAcc.av.push(L.av)
        if (st.da == null) st.da = st.t.length
      }
      if (c.t >= st.ritmo.inizio - 800 && st.zeroAcc.b.length >= 3) {
        var bs = st.zeroAcc.b.slice().sort(function (p, q) { return p - q })
        st.zero = { volante: Math.atan2(st.zeroAcc.sy, st.zeroAcc.sx) * 180 / Math.PI, becco: bs[Math.floor(bs.length / 2)], av: media(st.zeroAcc.av), t: c.t }
      }
    }
    var z = st.zero
    var roll = z ? giro(L.volante - z.volante) : 0, pitch = z ? L.becco - z.becco : 0
    if (L.piatto) { roll = 0; st.piattoN++ }
    var dtp = st.t.length ? (c.t - st.t[st.t.length - 1]) / 1000 : 0
    st.t.push(c.t); st.av.push(L.av); st.roll.push(roll); st.pitch.push(pitch)
    var lato = Math.abs(roll) < st.soglie.mani ? null : (roll > 0 ? 'destra' : 'sinistra')   // la mano PIÙ BASSA
    var braccia = Math.abs(pitch) >= st.soglie.braccia
    if (z && dtp > 0 && dtp < 0.25) {   // per quanto tempo, e fino a quanto
      if (lato === 'destra') { st.fuori.destra += dtp; st.fuori.maxDestra = Math.max(st.fuori.maxDestra, Math.abs(roll)) }
      if (lato === 'sinistra') { st.fuori.sinistra += dtp; st.fuori.maxSinistra = Math.max(st.fuori.maxSinistra, Math.abs(roll)) }
      if (braccia) { st.fuori.braccia += dtp; st.fuori.maxBraccia = Math.max(st.fuori.maxBraccia, Math.abs(pitch)) }
    }

    // la caduta del telefono
    if (L.modulo < CADUTA_G) { if (st.cadeDa == null) st.cadeDa = c.t; if (c.t - st.cadeDa >= CADUTA_MS) st.caduta = true } else st.cadeDa = null

    // il conto e la pallina: si ricalcolano una decina di volte al secondo su tutto quello che si è visto
    if (z && ++st.giroCalcolo % 6 === 0) {
      // il conto si fa sulla posizione «calma» (la stessa del riassunto finale); la pallina su quella viva
      var S = squatVisti(st, true), C = squatVisti(st, false), V = st.vivo
      S.squat = C.squat.filter(function (x) { return c.t - x.t1 >= CONFERMA_MS })
      if (S.P) {
        if (S.squat.length > V.n) {   // il conto in diretta non torna mai indietro
          V.n = S.squat.length
          var ult = S.squat[S.squat.length - 1]
          V.ultima = ult.giuS != null ? { id: Math.round(ult.t0), secondi: ult.giuS, chiesti: st.ritmo.giu / 1000 } : null
          V.aTempo = segnaTempo(st, S.squat).filter(function (x) { return x.rip != null }).length
          var ord = S.squat.map(function (x) { return x.metri }).sort(function (p, q) { return p - q })
          st.scala = ord[Math.floor(ord.length / 2)]
        }
        // la pallina: quanto si è sotto il punto più alto degli ultimi 6 secondi
        var p = S.P.p, t = S.P.t, k = p.length - 1, top = -Infinity, i
        for (i = k; i >= 0 && t[k] - t[i] <= 6000; i--) if (p[i] * (st.segno || 1) > top) top = p[i] * (st.segno || 1)
        V.prof = Math.max(0, top - p[k] * (st.segno || 1))
        if (!st.segno) V.prof = Math.abs(p[k] - p[0])   // prima discesa: il verso non si sa ancora, ma da in piedi si può solo scendere
        V.corpo = Math.max(0, Math.min(1, V.prof / Math.max(0.25, st.scala)))
        V.discese = V.n + (S.aperta && S.aperta.metri >= VALLE_GIU && S.squat.length <= V.n && V.corpo > 0.5 ? 1 : 0)
      }
    }
    var W = st.vivo
    return {
      fase: b.fase, rip: b.rip, p: b.p, dentro: b.dentro, finito: c.t >= st.fine,
      pronto: !!z, roll: roll, pitch: pitch, piatto: L.piatto, lato: lato, braccia: braccia,
      corpo: W.corpo, profondita: W.prof,
      ripetizioni: W.n, discese: Math.max(W.n, W.discese), mezze: W.n * 2 + (W.discese > W.n ? 1 : 0),
      aTempo: W.aTempo, caduta: st.caduta, ultimaDiscesa: W.ultima
    }
  }

  /* A fine esercizio: i numeri, squat per squat, e il confronto col ritmo. */
  function riassunto(st) {
    // a prova finita si ricalcola tutto con calma, con la deriva tolta anche in fondo
    if (st.zero && !st.segno) squatVisti(st, true)
    var S = st.zero ? squatVisti(st, false) : { P: null, squat: [] }
    var lista = segnaTempo(st, S.squat)
    lista.forEach(function (q) {
      var rr = [], pp = [], j
      for (j = 0; j < st.t.length; j++) if (st.t[j] >= q.t0 && st.t[j] <= q.t1) { rr.push(st.roll[j]); pp.push(st.pitch[j]) }
      q.mani = r1(media(rr)); q.maniMax = r1(piuGrande(rr)); q.braccia = r1(piuGrande(pp))
    })
    st.squat = lista
    var riga = function (q, i) {
      return { n: i + 1, rip: q.rip, aTempo: q.rip != null, da: r1(q.t0 / 1000), discesaCm: Math.round(q.metri * 100),
        giuS: r1(q.giuS), fondoS: r1(q.fondoS), suS: r1(q.suS), mani: q.mani, maniMax: q.maniMax, braccia: q.braccia }
    }
    var squat = st.squat.map(riga)
    var fatti = squat.length, aTempo = squat.filter(function (x) { return x.aTempo }).length
    var mancate = []
    for (var r = 1; r <= st.n; r++) if (!squat.some(function (x) { return x.rip === r })) mancate.push(r)
    var mani = squat.map(function (x) { return x.mani }).filter(function (x) { return x != null })
    var mm = media(mani)
    var disc = squat.map(function (x) { return x.discesaCm })
    var tg = squat.map(function (x) { return x.giuS }).filter(function (x) { return x != null })
    var ts = squat.map(function (x) { return x.suS }).filter(function (x) { return x != null })
    var br = squat.map(function (x) { return x.braccia }).filter(function (x) { return x != null })
    var F = st.fuori
    return {
      versione: VERSIONE, n: st.n, ritmo: st.ritmo, soglie: st.soglie,
      fatti: fatti, aTempo: aTempo, fuoriTempo: fatti - aTempo, mancate: mancate, intere: fatti, mezze: fatti * 2,
      discesaSola: false, squat: squat, inDiretta: st.vivo.n,
      mani: { media: r1(mm), sd: r1(sd(mani)), lato: mm == null || Math.abs(mm) < st.soglie.mani ? null : (mm > 0 ? 'destra' : 'sinistra') },
      braccia: { max: br.length ? r1(piuGrande(br)) : null },
      fuori: { destraS: r1(F.destra), sinistraS: r1(F.sinistra), bracciaS: r1(F.braccia), destraMax: r1(F.maxDestra), sinistraMax: r1(F.maxSinistra), bracciaMax: r1(F.maxBraccia) },
      discesaCm: { media: disc.length ? Math.round(media(disc)) : null, sd: disc.length > 1 ? Math.round(sd(disc)) : null },
      tempi: { giu: r1(media(tg)), su: r1(media(ts)), chiestiGiu: st.ritmo.giu / 1000, chiestiSu: st.ritmo.su / 1000 },
      caduta: st.caduta, pianoPct: st.t.length ? Math.round(st.piattoN / st.t.length * 100) : 0,
      senzaLineare: st.senzaLineare, zero: st.zero ? true : false, campioni: st.t.length
    }
  }

  /* Le frasi, da regole: stesso dato → stessa frase. Descrivono, non giudicano. */
  function frasi(r) {
    if (!r || !r.zero || r.campioni < 30) return ['Il telefono non ha dato abbastanza dati: rifai la prova.']
    var out = [], num = function (x) { return Math.abs(x).toFixed(1).replace('.', ',') }
    out.push('Squat contati: ' + r.fatti + ' (ne erano chiesti ' + r.n + '). A tempo con la voce: ' + r.aTempo + '.' +
      (r.fuoriTempo ? ' Fuori tempo: ' + r.fuoriTempo + '.' : ''))
    if (r.mancate.length && r.mancate.length < r.n) out.push((r.mancate.length === 1 ? 'Alla ripetizione ' : 'Alle ripetizioni ') + r.mancate.join(', ') + ' il telefono non ha visto uno squat a tempo.')
    if (r.discesaSola) out.push('L’ultima discesa non ha avuto la sua risalita.')
    var f = r.fuori
    if (f.destraS >= 0.5) out.push('La mano destra è rimasta più bassa per ' + num(f.destraS) + ' secondi, fino a ' + num(f.destraMax) + '°.')
    if (f.sinistraS >= 0.5) out.push('La mano sinistra è rimasta più bassa per ' + num(f.sinistraS) + ' secondi, fino a ' + num(f.sinistraMax) + '°.')
    if (f.destraS < 0.5 && f.sinistraS < 0.5) out.push('Le due mani sono rimaste alla stessa altezza (entro ' + num(r.soglie.mani) + '°).')
    out.push(f.bracciaS >= 0.5 ? 'Il telefono è rimasto inclinato oltre ' + num(r.soglie.braccia) + '° per ' + num(f.bracciaS) + ' secondi, fino a ' + num(f.bracciaMax) + '°.'
      : 'Il telefono è rimasto all’altezza di partenza (entro ' + num(r.soglie.braccia) + '°).')
    if (r.tempi && r.tempi.giu != null) out.push('In media sei sceso in ' + num(r.tempi.giu) + ' secondi (il ritmo ne chiedeva ' + r.tempi.chiestiGiu + ')' +
      (r.tempi.su != null ? ' e risalito in ' + num(r.tempi.su) + ' (' + r.tempi.chiestiSu + ').' : '.'))
    if (r.discesaCm.media != null) out.push('Discesa stimata: circa ' + r.discesaCm.media + ' cm. È una stima dall’accelerometro, non ancora verificata.')
    if (r.pianoPct > 20) out.push('Per il ' + r.pianoPct + '% del tempo il telefono era quasi in piano: lì l’altezza delle mani non si legge.')
    out.push('Sono i numeri del telefono. Cosa vogliono dire lo decide il professionista.')
    return out
  }

  /* guidato-v5 · «SPIEGAMI»: cosa è andato come chiesto e cosa guardare.
     Regole fisse sui numeri del riassunto: stesso esercizio → stesse frasi.
     Parla solo di quello che il telefono sente fra le mani (conto, tempo,
     altezza delle mani, inclinazione, regolarità). NON dice dove va il carico
     né com'è la schiena: non lo può sapere, e lo dichiara. */
  function spiega(r) {
    var bene = [], guarda = []
    if (!r || !r.zero || r.campioni < 30) return { apertura: '', bene: bene, guarda: ['Il telefono non ha dato abbastanza dati: rifai la prova.'], chiusura: '', nota: '' }
    var num = function (x) { return Math.abs(x).toFixed(1).replace('.', ',') }
    var q = r.squat, f = r.fuori, S = r.soglie, t = r.tempi
    // quanti
    if (r.fatti >= r.n) bene.push(r.n === 1 ? 'Hai fatto lo squat chiesto.' : 'Hai fatto tutti e ' + r.n + ' gli squat.')
    else guarda.push(r.fatti === 0 ? 'Il telefono non ha visto nessuno squat su ' + r.n + '.' : 'Ne hai fatti ' + r.fatti + ' su ' + r.n + '.')
    // a tempo
    if (r.fatti > 0 && r.fuoriTempo === 0) bene.push(r.fatti === 1 ? 'A tempo con la voce.' : 'Tutti a tempo con la voce.')
    else if (r.fuoriTempo > 0) guarda.push((r.fuoriTempo === 1 ? 'Uno squat è partito' : r.fuoriTempo + ' squat sono partiti') + ' fuori tempo: aspetta il «giù» e segui il suono.')
    // le mani
    var contaMano = function (segno) { return q.filter(function (x) { return x.maniMax != null && Math.abs(x.maniMax) >= S.mani && (x.maniMax > 0) === (segno > 0) }).length }
    var nd = contaMano(1), ns = contaMano(-1)
    if (f.destraS < 0.5 && f.sinistraS < 0.5) bene.push('Le due mani sono rimaste alla stessa altezza.')
    else {
      if (f.sinistraS >= 0.5) guarda.push('La mano sinistra scende: fino a ' + num(f.sinistraMax) + '°, per ' + num(f.sinistraS) + ' secondi' + (ns ? ' (in ' + ns + ' squat su ' + r.fatti + ')' : '') + '. Tienila alta come la destra.')
      if (f.destraS >= 0.5) guarda.push('La mano destra scende: fino a ' + num(f.destraMax) + '°, per ' + num(f.destraS) + ' secondi' + (nd ? ' (in ' + nd + ' squat su ' + r.fatti + ')' : '') + '. Tienila alta come la sinistra.')
    }
    // il telefono davanti agli occhi
    if (f.bracciaS < 0.5) bene.push('Il telefono è rimasto davanti agli occhi.')
    else guarda.push('Il telefono si inclina: fino a ' + num(f.bracciaMax) + '°, per ' + num(f.bracciaS) + ' secondi. Tieni le braccia tese all’altezza degli occhi.')
    // il ritmo
    if (t.giu != null) {
      if (t.giu < t.chiestiGiu * 0.66) guarda.push('Scendi in ' + num(t.giu) + ' secondi, il ritmo ne chiede ' + t.chiestiGiu + ': prova più lento.')
      else bene.push('Scendi al ritmo chiesto (' + num(t.giu) + ' secondi).')
    }
    if (t.su != null) {
      if (t.su < t.chiestiSu * 0.66) guarda.push('Risali in ' + num(t.su) + ' secondi, il ritmo ne chiede ' + t.chiestiSu + ': prova più lento anche a salire.')
      else bene.push('Risali al ritmo chiesto (' + num(t.su) + ' secondi).')
    }
    // la regolarità (confronto fra gli squat di QUESTA prova: non servono centimetri veri)
    if (q.length >= 3 && r.discesaCm.media) {
      var cv = r.discesaCm.sd / r.discesaCm.media
      if (cv < 0.15) bene.push('Gli squat sono regolari: scendi sempre più o meno uguale.')
      else if (cv >= 0.3) guarda.push('La discesa cambia molto da uno squat all’altro.')
      var a = q[0].giuS, z = q[q.length - 1].giuS
      if (a != null && z != null && a > 0.3 && z < a * 0.7) guarda.push('Verso la fine acceleri: l’ultimo squat scende in ' + num(z) + ' secondi, il primo in ' + num(a) + '.')
    }
    var nota = 'Il telefono sente solo come si muove fra le tue mani. Non vede ginocchia, schiena e piedi e non sa dove va il carico: per quello c’è l’Overhead squat sulla Tavola. Cosa vogliono dire questi numeri lo decide il professionista.'
    // guidato-v5 · prima di tutto un incoraggiamento (chiesto da Giuliano), poi il bene, poi cosa migliorare.
    // È proporzionato ai fatti: non loda quello che non c'è stato.
    var k = guarda.length, apertura, chiusura
    if (r.fatti === 0) { apertura = 'Nessun problema, capita. Rivediamo insieme come si fa e riprova con calma.'; chiusura = 'Parti quando senti «giù» e scendi seguendo il suono.' }
    else if (r.fatti >= r.n && k === 0) { apertura = 'Ottimo lavoro! Hai fatto l’esercizio proprio come chiesto.'; chiusura = 'Continua così.' }
    else if (r.fatti >= r.n && k <= 2) { apertura = 'Ben fatto! Li hai fatti tutti. ' + (k === 1 ? 'C’è una cosa sola da sistemare.' : 'Ci sono due cose da sistemare.'); chiusura = 'Alla prossima prova pensa solo alla prima: una cosa alla volta.' }
    else if (r.fatti >= r.n) { apertura = 'Bene, li hai fatti tutti e ' + r.n + ': è il primo passo. Adesso lavoriamo sulla qualità.'; chiusura = 'Non serve sistemare tutto insieme: alla prossima prova pensa solo alla prima cosa dell’elenco.' }
    else { apertura = 'Buon inizio: ne hai fatti ' + r.fatti + ' su ' + r.n + '. Vediamo cosa è andato bene e cosa migliorare.'; chiusura = 'Alla prossima prova pensa solo alla prima cosa dell’elenco: una alla volta.' }
    return { apertura: apertura, bene: bene, guarda: guarda, chiusura: chiusura, nota: nota }
  }

  global.PolGuida = {
    VERSIONE: VERSIONE, RITMI: RITMI, SOGLIE: SOGLIE, REAZIONE: REAZIONE,
    durata: durata, programma: programma, faseDi: faseDi, bersaglio: bersaglio,
    leggi: leggi, spostamento: spostamento, posizione: posizione, squatVisti: squatVisti, crea: crea, aggiungi: aggiungi, riassunto: riassunto, frasi: frasi, spiega: spiega, giro: giro
  }
})(typeof window !== 'undefined' ? window : globalThis)
