/* js/guida-motore.js — guidato-v2 (7 ottobre 2026)
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

  var VERSIONE = 'guidato-v2'
  var RITMI = {
    lento: { inizio: 3000, giu: 3000, fondo: 1000, su: 3000, piedi: 1000 },
    medio: { inizio: 3000, giu: 2000, fondo: 1000, su: 2000, piedi: 1000 }
  }
  // Valori di lavoro, dichiarati: nessuno di questi è ancora misurato in mano.
  var SOGLIE = {
    mani: 5,          // gradi: oltre, una mano «è più bassa»
    braccia: 25,      // gradi: oltre, il telefono non è più all'altezza di partenza (nel tracciato vero uno squat normale lo inclina di 15-20°)
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

  /* ── guidato-v2 · dal primo tracciato vero (7 ott, iPhone) ──
     Cosa ha insegnato: (1) chi fa l'esercizio ANTICIPA la voce anche di mezzo
     secondo e scende in poco più di un secondo, non in tre; (2) contare a
     mezze finestre fisse perde le discese anticipate; (3) chiudendo il conto
     sulla ripetizione INTERA — si parte fermi in piedi e si torna fermi in
     piedi, allo stesso punto — il profilo esce pulito: giù, fermo, su.
     Quindi: i confini fra una ripetizione e l'altra sono i momenti PIÙ FERMI
     trovati nei dati, non i tempi del programma. */

  /* Il momento più fermo fra tDa e tA: la finestra (350 ms) in cui
     l'accelerazione verticale balla meno E sta più vicina al suo valore di
     riposo. Il riposo è la media di tutto quello che si è visto finora: chi
     parte fermo e torna fermo ha, in media, accelerazione zero più l'errore
     fisso del sensore. Torna il centro della finestra e la sua media. */
  function quieto(st, tDa, tA) {
    var n = st.t.length, i = 0, best = null, LARG = 350
    var riposo = n ? st.avSomma / n : 0
    while (i < n && st.t[i] < tDa) i++
    for (; i < n && st.t[i] + LARG <= tA; i += 2) {
      var j = i, v = []
      while (j < n && st.t[j] - st.t[i] <= LARG) { v.push(st.av[j]); j++ }
      if (v.length < 5) continue
      var s = sd(v) + Math.abs(media(v) - riposo)
      if (!best || s < best.sd) best = { t: st.t[i] + LARG / 2, sd: s, bias: media(v), i: i, j: j - 1 }
    }
    return best
  }

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
      reazione: o.reazione != null ? o.reazione : REAZIONE,
      t: [], av: [], roll: [], pitch: [], avSomma: 0,
      G: null, zero: null, zeroAcc: { sx: 0, sy: 0, b: [], av: [] },
      segno: 0, bordi: [], rip: [], viva: null, scala: 0.4,
      cadeDa: null, caduta: false, piattoN: 0, senzaLineare: false
    }
  }
  function ripDi(st, r) {
    if (!st.rip[r]) st.rip[r] = { rip: r, a: false, b: false, giu: false, intera: false, metri: null, provv: null, giuS: null, suS: null, fondoS: null }
    return st.rip[r]
  }
  function tempi(st, r) {   // i tempi del programma della ripetizione r
    var R = st.ritmo, da = R.inizio + (r - 1) * (R.giu + R.fondo + R.su + R.piedi)
    return { giu: da, fondo: da + R.giu, su: da + R.giu + R.fondo, piedi: da + R.giu + R.fondo + R.su, fine: da + R.giu + R.fondo + R.su + R.piedi }
  }
  function bordo(st, r) {   // il momento fermo in piedi DOPO la ripetizione r (0 = prima della prima)
    if (st.bordi[r]) return st.bordi[r]
    var q
    if (r === 0) q = quieto(st, Math.max(0, st.ritmo.inizio - 1500), st.ritmo.inizio + 200) || { t: st.ritmo.inizio, bias: 0 }
    else { var T = tempi(st, r); q = quieto(st, T.piedi - 1000, T.fine - 200) || { t: T.fine - 300, bias: 0 } }
    st.bordi[r] = q
    return q
  }
  function verso(st, metri, discesa) {   // il verso di «giù» lo dice la prima discesa vista
    if (Math.abs(metri) < st.soglie.movimento) return false
    if (!st.segno) { if (!discesa) return false; st.segno = metri < 0 ? 1 : -1 }
    return metri * st.segno < 0
  }
  /* I due controlli di ogni ripetizione: A in fondo (la discesa c'è stata?),
     B in piedi (la ripetizione intera, a conti chiusi). */
  function controlli(st, adesso, tutto) {
    for (var r = 1; r <= st.n; r++) {
      var T = tempi(st, r), x = ripDi(st, r)
      if (!x.a && (tutto || adesso >= T.su - 150)) {
        if (adesso < T.fondo && tutto) { x.a = true; x.b = true; continue }   // fermato prima: questa non è nemmeno cominciata
        x.a = true
        var pa = profilo(st, bordo(st, r - 1).t, Math.min(adesso, T.su - 150), 0)
        if (pa) {
          x.provv = pa.metri
          if (verso(st, pa.metri, true)) { x.giu = true; x.giuS = pa.giuS }
        }
      }
      if (!x.b && (tutto || adesso >= T.fine - 200)) {
        if (tutto && adesso < T.piedi) { x.b = true; continue }               // fermato prima di risalire
        x.b = true
        var b0 = bordo(st, r - 1), b1 = bordo(st, r)
        var pb = profilo(st, b0.t, b1.t, 1)
        if (pb) {
          x.metri = pb.metri
          if (verso(st, pb.metri, true)) {
            x.giu = true; x.intera = true
            x.giuS = pb.giuS; x.suS = pb.suS; x.fondoS = pb.fondoS
          }
        }
        var rr = [], pp = [], aa = [], j
        for (j = 0; j < st.t.length; j++) if (st.t[j] >= b0.t && st.t[j] <= b1.t) { rr.push(st.roll[j]); pp.push(st.pitch[j]); aa.push(st.av[j]) }
        var piu = function (v) { return v.length ? v.reduce(function (p, q) { return Math.abs(q) > Math.abs(p) ? q : p }, 0) : null }
        x.mani = r1(media(rr)); x.maniMax = r1(piu(rr)); x.braccia = r1(piu(pp)); x.tremolio = r2(sd(aa))
        if (st.viva) { st.viva.d = 0; st.viva.v = 0 }   // di nuovo in piedi: la pallina torna in cima
      }
    }
  }

  /* Un campione: { t (ms dall'inizio della misura), ag:{x,y,z}, a:{x,y,z}|null }.
     Torna cosa mostrare ADESSO. */
  function aggiungi(st, c) {
    var L = leggi(c.ag, c.a, st.G)
    st.G = L.G; if (L.senzaLineare) st.senzaLineare = true
    var b = bersaglio(st.prog, c.t)
    // la partenza: fermo, si prende lo zero (dopo il primo terzo, che è assestamento)
    if (!st.zero) {
      if (c.t >= st.ritmo.inizio / 3 && c.t < st.ritmo.inizio) {
        var rad = L.volante * Math.PI / 180
        st.zeroAcc.sx += Math.cos(rad); st.zeroAcc.sy += Math.sin(rad); st.zeroAcc.b.push(L.becco); st.zeroAcc.av.push(L.av)
      }
      if (c.t >= st.ritmo.inizio && st.zeroAcc.b.length >= 3) {
        var bs = st.zeroAcc.b.slice().sort(function (p, q) { return p - q })
        st.zero = { volante: Math.atan2(st.zeroAcc.sy, st.zeroAcc.sx) * 180 / Math.PI, becco: bs[Math.floor(bs.length / 2)], av: media(st.zeroAcc.av), trema: sd(st.zeroAcc.av) || 0 }
      }
    }
    var z = st.zero
    var roll = z ? giro(L.volante - z.volante) : 0, pitch = z ? L.becco - z.becco : 0
    if (L.piatto) { roll = 0; st.piattoN++ }
    st.t.push(c.t); st.av.push(L.av); st.avSomma += L.av; st.roll.push(roll); st.pitch.push(pitch)

    // la caduta del telefono
    if (L.modulo < CADUTA_G) { if (st.cadeDa == null) st.cadeDa = c.t; if (c.t - st.cadeDa >= CADUTA_MS) st.caduta = true } else st.cadeDa = null

    // la stima VIVA per la pallina: una somma continua, tolto il valore di
    // riposo. La velocità si riazzera quando il telefono è fermo da mezzo
    // secondo E la velocità stimata è già piccola (a metà di una discesa lenta
    // l'accelerazione è quasi zero ma la velocità no: lì non si azzera).
    var n = st.t.length, riposo = st.avSomma / n, V = st.viva
    if (!V) V = st.viva = { v: 0, d: 0, tp: c.t, ap: 0 }
    if (c.t >= st.ritmo.inizio - 300) {
      var dt = (c.t - V.tp) / 1000, an = L.av - riposo, vp = V.v
      if (dt > 0 && dt < 0.25) { V.v += (an + V.ap) / 2 * dt; V.d += (V.v + vp) / 2 * dt }
      V.ap = an
      if (Math.abs(V.v) < 0.10) {
        // «fermo» è relativo a quanto trema la mano di chi tiene il telefono (misurato alla partenza)
        var k = n - 1, w = [], w2 = [], trema = st.zero ? st.zero.trema : 0.1
        while (k >= 0 && c.t - st.t[k] <= 500) { w.push(st.av[k]); if (c.t - st.t[k] <= 150) w2.push(st.av[k]); k-- }
        if (w.length >= 8 && w2.length >= 3 && sd(w) < 0.25 + 2 * trema && Math.abs(media(w) - riposo) < 0.12 &&
            Math.abs(media(w2) - riposo) < 0.06 + 2 * trema / Math.sqrt(w2.length)) V.v = 0
      }
    }
    V.tp = c.t
    controlli(st, c.t, false)

    // dove sta il corpo, da 0 (in piedi) a 1 (il più giù visto finora)
    var prof = Math.max(0, st.segno ? -V.d * st.segno : Math.abs(V.d))
    if (prof > st.scala) st.scala = prof
    var giuN = 0, intere = 0, ultima = null
    for (var r = 1; r <= st.n; r++) { var x = st.rip[r]; if (!x) continue; if (x.giu) giuN++; if (x.intera) intere++; if (x.a) ultima = x }
    return {
      fase: b.fase, rip: b.rip, p: b.p, finito: c.t >= st.fine,
      pronto: !!z, roll: roll, pitch: pitch, piatto: L.piatto,
      lato: Math.abs(roll) < st.soglie.mani ? null : (roll > 0 ? 'destra' : 'sinistra'),   // la mano PIÙ BASSA
      braccia: Math.abs(pitch) >= st.soglie.braccia,
      corpo: Math.max(0, Math.min(1, prof / st.scala)), profondita: prof,
      mezze: giuN + intere, ripetizioni: intere, discese: giuN, caduta: st.caduta,
      // la discesa appena vista: quanto è durata rispetto a quanto chiedeva il ritmo
      ultimaDiscesa: ultima && ultima.giu && ultima.giuS != null ? { rip: ultima.rip, secondi: ultima.giuS, chiesti: st.ritmo.giu / 1000 } : null
    }
  }

  /* A fine esercizio: i numeri, ripetizione per ripetizione. */
  function riassunto(st) {
    var ultimo = st.t.length ? st.t[st.t.length - 1] : 0
    controlli(st, ultimo, true)
    var rip = [], i
    for (i = 1; i <= st.n; i++) {
      var x = ripDi(st, i)
      rip.push({ rip: i, giu: x.giu, su: x.intera,
        discesaCm: x.intera ? Math.round(Math.abs(x.metri) * 100) : (x.giu && x.provv != null ? Math.round(Math.abs(x.provv) * 100) : null),
        giuS: r1(x.giuS), fondoS: r1(x.fondoS), suS: r1(x.suS),
        mani: x.mani != null ? x.mani : null, maniMax: x.maniMax != null ? x.maniMax : null,
        braccia: x.braccia != null ? x.braccia : null, tremolio: x.tremolio != null ? x.tremolio : null })
    }
    var intere = rip.filter(function (r) { return r.su }).length
    var mezze = intere + rip.filter(function (r) { return r.giu }).length
    var mani = rip.map(function (r) { return r.mani }).filter(function (x) { return x != null })
    var mm = media(mani)
    var stessa = mm == null ? 0 : mani.filter(function (x) { return Math.abs(x) >= st.soglie.mani && (mm >= 0 ? x > 0 : x < 0) }).length
    var disc = rip.filter(function (r) { return r.su }).map(function (r) { return r.discesaCm })
    var tg = rip.map(function (r) { return r.giuS }).filter(function (x) { return x != null })
    var ts = rip.map(function (r) { return r.suS }).filter(function (x) { return x != null })
    var br = rip.map(function (r) { return r.braccia }).filter(function (x) { return x != null })
    return {
      versione: VERSIONE, n: st.n, ritmo: st.ritmo, soglie: st.soglie,
      mezze: mezze, intere: intere, ripetizioni: rip,
      mani: { media: r1(mm), sd: r1(sd(mani)), stessaParte: stessa, lato: mm == null || Math.abs(mm) < st.soglie.mani ? null : (mm > 0 ? 'destra' : 'sinistra') },
      braccia: { max: br.length ? r1(br.reduce(function (p, q) { return Math.abs(q) > Math.abs(p) ? q : p }, 0)) : null },
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
    out.push('Movimenti contati: ' + r.intere + (r.intere === 1 ? ' ripetizione completa su ' : ' ripetizioni complete su ') + r.n + ' (' + r.mezze + ' mezze su ' + r.n * 2 + ').')
    if (r.mani.media != null) out.push(r.mani.lato
      ? 'In media la mano ' + r.mani.lato + ' è rimasta più bassa di ' + num(r.mani.media) + '°, in ' + r.mani.stessaParte + ' ripetizioni su ' + r.ripetizioni.filter(function (x) { return x.mani != null }).length + '.'
      : 'Le due mani sono rimaste alla stessa altezza (entro ' + num(r.soglie.mani) + '°).')
    if (r.braccia.max != null) out.push(Math.abs(r.braccia.max) >= r.soglie.braccia
      ? 'Il telefono si è inclinato fino a ' + num(r.braccia.max) + '° rispetto alla partenza.'
      : 'Il telefono è rimasto all’altezza di partenza (entro ' + num(r.soglie.braccia) + '°).')
    if (r.tempi && r.tempi.giu != null) out.push('Sei sceso in ' + num(r.tempi.giu) + ' secondi (il ritmo ne chiedeva ' + r.tempi.chiestiGiu + ')' +
      (r.tempi.su != null ? ' e risalito in ' + num(r.tempi.su) + ' (' + r.tempi.chiestiSu + ').' : '.'))
    if (r.discesaCm.media != null) out.push('Discesa stimata: circa ' + r.discesaCm.media + ' cm. È una stima dall’accelerometro, non ancora verificata.')
    if (r.pianoPct > 20) out.push('Per il ' + r.pianoPct + '% del tempo il telefono era quasi in piano: lì l’altezza delle mani non si legge.')
    out.push('Sono i numeri del telefono. Cosa vogliono dire lo decide il professionista.')
    return out
  }

  global.PolGuida = {
    VERSIONE: VERSIONE, RITMI: RITMI, SOGLIE: SOGLIE, REAZIONE: REAZIONE,
    durata: durata, programma: programma, faseDi: faseDi, bersaglio: bersaglio,
    leggi: leggi, spostamento: spostamento, quieto: quieto, profilo: profilo, crea: crea, aggiungi: aggiungi, riassunto: riassunto, frasi: frasi, giro: giro
  }
})(typeof window !== 'undefined' ? window : globalThis)
