/* js/guida-motore.js — guidato-v3 (7 ottobre 2026)
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

  var VERSIONE = 'guidato-v3'
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

  /* ── guidato-v3 · dai primi due tracciati veri (7 ott, iPhone) ──
     Primo tracciato: chi fa l'esercizio ANTICIPA la voce e scende in 2 secondi,
     non in 3. Secondo (errori fatti apposta): due squat dentro il tempo di uno,
     una ripetizione saltata, telefono inclinato, una mano giù. Contando «a
     finestre» sul ritmo ne uscivano 3 su 5 e un fondo di 3 metri.
     Quindi il conto NON guarda più il programma: guarda i dati. Ogni volta che
     il telefono torna fermo si chiude un MOVIMENTO (da fermo a fermo: velocità
     finale zero) e si vede di quanto è sceso o salito. Una discesa seguita da
     una risalita è uno squat, in qualunque momento sia stato fatto. Solo DOPO
     lo si confronta col ritmo: a tempo, oppure fuori tempo. */

  /* Il profilo dello spostamento fra due istanti. ordine 0: si arriva fermi
     (velocità finale zero). ordine 1: si arriva fermi E allo stesso punto. */
  function profilo(st, tDa, tA, ordine) {
    var tt = [], aa = [], i
    for (i = 0; i < st.t.length; i++) if (st.t[i] >= tDa && st.t[i] <= tA) { tt.push(st.t[i] / 1000); aa.push(st.av[i]) }
    var n = tt.length
    if (n < 8) return null
    var T = tt[n - 1] - tt[0]
    var somma = function (c0, c1) {
      var v = 0, d = 0, ds = [0]
      for (var j = 1; j < n; j++) {
        var dt = tt[j] - tt[j - 1]
        var x0 = aa[j - 1] - c0 - c1 * (tt[j - 1] - tt[0]), x1 = aa[j] - c0 - c1 * (tt[j] - tt[0])
        var vn = v + (x0 + x1) / 2 * dt
        d += (v + vn) / 2 * dt; v = vn; ds.push(d)
      }
      return { ds: ds, v: v, d: d }
    }
    var g = somma(0, 0), c0, c1 = 0
    if (ordine === 0) c0 = g.v / T
    else {
      var det = T * (T * T * T / 6) - (T * T / 2) * (T * T / 2)
      c0 = (g.v * (T * T * T / 6) - (T * T / 2) * g.d) / det
      c1 = (T * g.d - (T * T / 2) * g.v) / det
    }
    var r = somma(c0, c1), ds = r.ds, im = 0
    for (i = 1; i < n; i++) if (Math.abs(ds[i]) > Math.abs(ds[im])) im = i
    var E = ds[im], out = { metri: E, tt: tt, ds: ds, im: im, giuS: null, suS: null, fondoS: null }
    if (Math.abs(E) > 0.02) {
      // quanto è durata la discesa: si cronometra dal 10% al 90% del fondo (gli estremi
      // sono lenti e incerti) e si riporta al movimento intero dividendo per 0,6:
      // un movimento dolce passa in quel tratto circa il 60% del suo tempo.
      var a10 = null, a90 = null, b90 = null, b10 = null
      for (i = 0; i <= im; i++) { var q = ds[i] / E; if (a10 == null && q >= 0.1) a10 = tt[i]; if (a90 == null && q >= 0.9) { a90 = tt[i]; break } }
      for (i = n - 1; i >= im; i--) { var q2 = ds[i] / E; if (b10 == null && q2 >= 0.1) b10 = tt[i]; if (b90 == null && q2 >= 0.9) { b90 = tt[i]; break } }
      if (a10 != null && a90 != null) out.giuS = (a90 - a10) / 0.6
      if (ordine === 1 && b10 != null && b90 != null) { out.suS = (b10 - b90) / 0.6; if (a90 != null) out.fondoS = Math.max(0, b90 - a90) }
    }
    return out
  }

  function crea(o) {
    o = o || {}
    var ritmo = o.ritmo || RITMI.lento, n = o.n || 5
    var s = o.soglie || {}
    return {
      ritmo: ritmo, n: n, prog: programma(ritmo, n), fine: durata(ritmo, n),
      soglie: { mani: s.mani || SOGLIE.mani, braccia: s.braccia || SOGLIE.braccia, movimento: s.movimento || SOGLIE.movimento },
      t: [], av: [], roll: [], pitch: [], avSomma: 0,
      G: null, zero: null, zeroAcc: { sx: 0, sy: 0, b: [], av: [] },
      segno: 0, viva: null, scala: 0.4,
      inMoto: false, tFermo: null, tPartenza: null, mov: [], squat: [], attesa: null,
      fuori: { destra: 0, sinistra: 0, braccia: 0, maxDestra: 0, maxSinistra: 0, maxBraccia: 0 },
      cadeDa: null, caduta: false, piattoN: 0, senzaLineare: false
    }
  }
  function tempi(st, r) {   // i tempi del programma della ripetizione r
    var R = st.ritmo, da = R.inizio + (r - 1) * (R.giu + R.fondo + R.su + R.piedi)
    return { giu: da, fondo: da + R.giu, su: da + R.giu + R.fondo, piedi: da + R.giu + R.fondo + R.su, fine: da + R.giu + R.fondo + R.su + R.piedi }
  }
  function piuGrande(v) { return v.length ? v.reduce(function (p, q) { return Math.abs(q) > Math.abs(p) ? q : p }, 0) : null }

  /* Quieto adesso? Negli ultimi 350 ms l'accelerazione verticale balla poco e
     sta vicina al suo valore di riposo. «Poco» è relativo a quanto trema la
     mano di chi tiene il telefono. */
  var FERMO_MS = 350
  var ALFA = 0.03            // quanto in fretta si aggiorna il valore di riposo, da fermi
  var QUIETE_ACC = 0.15      // m/s²: quanto può stare lontana dal riposo la media della finestra
  var QUIETE_VEL = 0.15      // m/s: sotto, la velocità stimata vale «fermo»
  var QUIETE_LUNGA = 900     // ms di quiete continua: fermo comunque (la stima della velocità deriva)
  var RIPARTI_MS = 4000      // mai fermo da tanto: il valore di riposo era sbagliato, lo si riprende
  function fermoAdesso(st, adesso) {
    var n = st.t.length, k = n - 1, w = []
    while (k >= 0 && adesso - st.t[k] <= FERMO_MS) { w.push(st.av[k]); k-- }
    if (w.length < 6) return false
    var s = sd(w), riposo = st.bias != null ? st.bias : st.avSomma / n
    st.mediaW = media(w)
    // quanto trema la mano: il doppio della finestra più ferma vista finora (fra 0,05 e 0,3)
    if (adesso > 600 && (st.sdMin == null || s < st.sdMin)) st.sdMin = s
    var trema = Math.min(0.3, Math.max(0.05, (st.sdMin == null ? 0.1 : st.sdMin) * 2))
    st.trema = trema
    // la finestra più ferma da quando ci si muove: serve se il valore di riposo è sbagliato
    if (st.cand == null || s < st.cand.sd) st.cand = { sd: s, media: st.mediaW }
    return s < 0.22 + 1.5 * trema && Math.abs(st.mediaW - riposo) < QUIETE_ACC + trema / 2
  }

  /* Un movimento è finito (da tDa a tA, fermo ai due capi): cos'era? */
  function chiudiMovimento(st, tDa, tA) {
    if (tA - tDa < 250) return
    var p0 = profilo(st, tDa, tA, 0)
    if (!p0) return
    var netto = p0.ds[p0.ds.length - 1], S = st.soglie.movimento
    if (st.debug) st.debug.push([Math.round(tDa), Math.round(tA), r2(netto)])
    // giù e subito su senza un vero fermo in fondo: alla fine si è (quasi) dove
    // si era, ma in mezzo si è scesi parecchio. È uno squat intero in un movimento solo.
    var p1 = profilo(st, tDa, tA, 1)
    if (p1 && !st.attesa && Math.abs(p1.metri) >= S * 1.5 && Math.abs(netto) < 0.4 * Math.abs(p1.metri)) {
      if (!st.segno) st.segno = p1.metri < 0 ? 1 : -1
      if (p1.metri * st.segno < 0) {
        nuovoSquat(st, { t0: tDa, tFondo: p1.tt[p1.im] * 1000, tSu: p1.tt[p1.im] * 1000, t1: tA, metri: Math.abs(p1.metri), giuS: p1.giuS, suS: p1.suS, fondoS: p1.fondoS })
        return
      }
    }
    if (Math.abs(netto) < S) return
    if (!st.segno) st.segno = netto < 0 ? 1 : -1          // il primo movimento, da in piedi, è una discesa
    var giu = netto * st.segno < 0
    var m = { t0: tDa, t1: tA, metri: Math.abs(netto), giu: giu, secondi: p0.giuS }
    st.mov.push(m)
    if (giu) {
      if (tDa >= tempi(st, st.n).piedi) return              // dopo l'ultima risalita: è il telefono che viene abbassato
      if (st.attesa) { st.attesa.metri += m.metri; st.attesa.t1 = tA }   // discesa in due tempi: è la stessa
      else st.attesa = { t0: tDa, t1: tA, metri: m.metri, secondi: m.secondi, id: st.mov.length }
    } else if (st.attesa) {
      nuovoSquat(st, { t0: st.attesa.t0, tFondo: st.attesa.t1, tSu: tDa, t1: tA, metri: (st.attesa.metri + m.metri) / 2,
        giuS: st.attesa.secondi, suS: m.secondi, fondoS: Math.max(0, (tDa - st.attesa.t1) / 1000) })
      st.attesa = null
    }
  }
  function nuovoSquat(st, q) {
    var rr = [], pp = [], j
    for (j = 0; j < st.t.length; j++) if (st.t[j] >= q.t0 && st.t[j] <= q.t1) { rr.push(st.roll[j]); pp.push(st.pitch[j]) }
    q.mani = r1(media(rr)); q.maniMax = r1(piuGrande(rr)); q.braccia = r1(piuGrande(pp))
    // a tempo? la discesa parte vicino a un «giù» e la risalita vicino al suo «su»
    q.rip = null
    var best = null
    for (var r = 1; r <= st.n; r++) {
      if (st.squat.some(function (x) { return x.rip === r })) continue
      var T = tempi(st, r), dg = q.t0 - T.giu, ds = q.tSu - T.su
      if (dg >= -1000 && dg <= 2000 && ds >= -1500 && ds <= 2000 && (best == null || Math.abs(dg) < best.d)) best = { r: r, d: Math.abs(dg) }
    }
    if (best) q.rip = best.r
    st.squat.push(q)
    if (st.viva) { st.viva.d = 0; st.viva.v = 0 }   // di nuovo in piedi: la pallina torna in cima
  }

  /* Un campione: { t (ms dall'inizio della misura), ag:{x,y,z}, a:{x,y,z}|null }.
     Torna cosa mostrare ADESSO. */
  function aggiungi(st, c) {
    var L = leggi(c.ag, c.a, st.G)
    st.G = L.G; if (L.senzaLineare) st.senzaLineare = true
    var b = bersaglio(st.prog, c.t)
    // la partenza: fermo, si prende lo zero (dopo il primo terzo, che è assestamento)
    if (!st.zero) {
      if (c.t >= st.ritmo.inizio / 3 && c.t < st.ritmo.inizio - 800) {
        var rad = L.volante * Math.PI / 180
        st.zeroAcc.sx += Math.cos(rad); st.zeroAcc.sy += Math.sin(rad); st.zeroAcc.b.push(L.becco); st.zeroAcc.av.push(L.av)
      }
      // lo zero si chiude 0,8 s PRIMA del primo «giù»: c'è chi parte in anticipo
      if (c.t >= st.ritmo.inizio - 800 && st.zeroAcc.b.length >= 3) {
        var bs = st.zeroAcc.b.slice().sort(function (p, q) { return p - q })
        st.zero = { volante: Math.atan2(st.zeroAcc.sy, st.zeroAcc.sx) * 180 / Math.PI, becco: bs[Math.floor(bs.length / 2)], av: media(st.zeroAcc.av), trema: sd(st.zeroAcc.av) || 0, t: c.t }
      }
    }
    var z = st.zero
    var roll = z ? giro(L.volante - z.volante) : 0, pitch = z ? L.becco - z.becco : 0
    if (L.piatto) { roll = 0; st.piattoN++ }
    var dtp = st.t.length ? (c.t - st.t[st.t.length - 1]) / 1000 : 0
    st.t.push(c.t); st.av.push(L.av); st.avSomma += L.av; st.roll.push(roll); st.pitch.push(pitch)
    var lato = Math.abs(roll) < st.soglie.mani ? null : (roll > 0 ? 'destra' : 'sinistra')   // la mano PIÙ BASSA
    var braccia = Math.abs(pitch) >= st.soglie.braccia
    if (z && dtp > 0 && dtp < 0.25) {   // per quanto tempo, e fino a quanto
      if (lato === 'destra') { st.fuori.destra += dtp; st.fuori.maxDestra = Math.max(st.fuori.maxDestra, Math.abs(roll)) }
      if (lato === 'sinistra') { st.fuori.sinistra += dtp; st.fuori.maxSinistra = Math.max(st.fuori.maxSinistra, Math.abs(roll)) }
      if (braccia) { st.fuori.braccia += dtp; st.fuori.maxBraccia = Math.max(st.fuori.maxBraccia, Math.abs(pitch)) }
    }

    // la caduta del telefono
    if (L.modulo < CADUTA_G) { if (st.cadeDa == null) st.cadeDa = c.t; if (c.t - st.cadeDa >= CADUTA_MS) st.caduta = true } else st.cadeDa = null

    // la stima VIVA: una somma continua dell'accelerazione, tolto il valore di
    // riposo. Muove la pallina e dice se la velocità è davvero vicina a zero.
    // Il valore di riposo (l'errore fisso del sensore) si impara SOLO da fermi:
    // la media di tutto, presa a metà di un movimento, è sbagliata.
    if (z && st.bias == null) st.bias = z.av
    var n = st.t.length, riposo = st.bias != null ? st.bias : st.avSomma / n
    var V = st.viva
    if (!V) V = st.viva = { v: 0, d: 0, tp: c.t, ap: 0 }
    if (z) {
      var dt = (c.t - V.tp) / 1000, an = L.av - riposo, vp = V.v
      // (l'iPhone ogni tanto tace per 0,3 s: il buco si attraversa in linea retta, non si salta)
      if (dt > 0 && dt < 0.6) { V.v += (an + V.ap) / 2 * dt; V.d += (V.v + vp) / 2 * dt }
      V.ap = an
    }
    V.tp = c.t

    // fermo o in movimento: quando torna fermo, il movimento si chiude.
    // «Fermo» = l'accelerazione è quieta E la velocità stimata è piccola: a metà
    // di una salita a velocità costante l'accelerazione è quieta ma ci si muove
    // (nel secondo tracciato vero una risalita veniva spezzata in due e persa).
    // Se la quiete dura quasi un secondo, è fermo comunque (la stima deriva).
    var quieto = fermoAdesso(st, c.t)
    if (quieto) { if (st.quietoDa == null) st.quietoDa = c.t } else st.quietoDa = null
    var fermo = quieto && (Math.abs(V.v) < QUIETE_VEL || c.t - st.quietoDa >= QUIETE_LUNGA)
    if (z && c.t >= st.ritmo.inizio - 1000) {
      if (fermo) {
        if (st.inMoto) { st.inMoto = false; chiudiMovimento(st, st.tPartenza, c.t) }
        st.tFermo = c.t
      } else if (!st.inMoto) { st.inMoto = true; st.tPartenza = (st.tFermo != null ? st.tFermo : c.t) - FERMO_MS }
    } else if (fermo) st.tFermo = c.t
    if (fermo) {   // da fermi la velocità si riazzera; in piedi la pallina torna in cima
      V.v = 0; if (!st.attesa) V.d = 0
      if (st.bias != null) st.bias += ALFA * (st.mediaW - st.bias)
      st.cand = null; st.fermoVisto = c.t
    } else if (z && st.fermoVisto == null && st.cand && c.t - st.zero.t > RIPARTI_MS && st.cand.sd < 0.22 + 1.5 * (st.trema || 0.1)) {
      // MAI fermo nei primi 4 secondi: il valore di riposo è partito sbagliato (partenza agitata).
      // Si riparte dalla finestra più ferma vista finora; il movimento in corso si butta.
      st.bias = st.cand.media; st.cand = null; st.fermoVisto = c.t; st.inMoto = false; st.tFermo = null; V.v = 0
    }
    var prof = Math.max(0, st.segno ? -V.d * st.segno : Math.abs(V.d))
    if (prof > st.scala) st.scala = prof

    var ud = st.attesa ? st.attesa : (st.squat.length ? st.squat[st.squat.length - 1] : null)
    return {
      fase: b.fase, rip: b.rip, p: b.p, finito: c.t >= st.fine,
      pronto: !!z, roll: roll, pitch: pitch, piatto: L.piatto, lato: lato, braccia: braccia,
      corpo: Math.max(0, Math.min(1, prof / st.scala)), profondita: prof, fermo: fermo,
      ripetizioni: st.squat.length, discese: st.squat.length + (st.attesa ? 1 : 0), mezze: st.squat.length * 2 + (st.attesa ? 1 : 0),
      aTempo: st.squat.filter(function (x) { return x.rip != null }).length, caduta: st.caduta,
      // la discesa appena vista: quanto è durata rispetto a quanto chiedeva il ritmo
      ultimaDiscesa: ud && (ud.secondi != null || ud.giuS != null) ? { id: Math.round(ud.t0), secondi: ud.secondi != null ? ud.secondi : ud.giuS, chiesti: st.ritmo.giu / 1000 } : null
    }
  }

  /* A fine esercizio: i numeri, squat per squat, e il confronto col ritmo. */
  function riassunto(st) {
    var ultimo = st.t.length ? st.t[st.t.length - 1] : 0
    if (st.inMoto) { st.inMoto = false; chiudiMovimento(st, st.tPartenza, ultimo) }
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
      fatti: fatti, aTempo: aTempo, fuoriTempo: fatti - aTempo, mancate: mancate, intere: fatti, mezze: fatti * 2 + (st.attesa ? 1 : 0),
      discesaSola: !!st.attesa, squat: squat,
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

  global.PolGuida = {
    VERSIONE: VERSIONE, RITMI: RITMI, SOGLIE: SOGLIE, REAZIONE: REAZIONE,
    durata: durata, programma: programma, faseDi: faseDi, bersaglio: bersaglio,
    leggi: leggi, spostamento: spostamento, profilo: profilo, crea: crea, aggiungi: aggiungi, riassunto: riassunto, frasi: frasi, giro: giro
  }
})(typeof window !== 'undefined' ? window : globalThis)
