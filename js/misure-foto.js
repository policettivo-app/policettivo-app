/* js/misure-foto.js — gradi-foto-v1 (23 settembre 2026) · pdf-gradi-v1
 *
 * I GRADI SULLE FOTO POSTURALI, IN UN FILE SOLO.
 *
 * Il professionista conferma i punti (proposti da MediaPipe o messi a mano) e
 * da quei punti escono i gradi. Qui c'è SOLO la matematica e i nomi: niente
 * rete, niente disegno. Lo usano l'editor dei punti e lo schermo del paziente.
 *
 * Regole (decisioni 3A 4A del 23 settembre):
 *  - i nomi dicono cosa si misura DAVVERO sulla foto: «inclinazione orecchio-
 *    spalla», non «angolo cranio-vertebrale» (servirebbe C7, che MediaPipe non
 *    trova). L'anca è il centro dell'anca proposto: si può spostare su SIAS/SIPS;
 *  - il riferimento verticale è il FILO A PIOMBO della foto (due punti sul filo),
 *    non il bordo dell'immagine: un telefono storto non deve diventare postura;
 *  - finché l'errore di misura non è misurato (Fase 0: 5 persone × 3 foto), la
 *    differenza PRIMA/DOPO si mostra ma NON si giudica: esito «da confermare».
 *    Quando ci saranno i numeri, si scrivono in ERRORE e i verdetti si accendono.
 */
;(function (global) {
  'use strict'

  // Fase 0 posturale: gradi entro cui una differenza è rumore di misura.
  // ⚠️ VUOTO FINCHÉ NON È MISURATO. Non si inventa.
  var ERRORE = {}

  // I punti di ogni vista, nell'ordine in cui l'editor li chiede.
  // x, y normalizzati 0-1 sull'immagine.
  var PUNTI = {
    sagittale: [
      { k: 'filo_alto',  nome: 'Filo a piombo, in alto' },
      { k: 'filo_basso', nome: 'Filo a piombo, in basso' },
      { k: 'orecchio',   nome: 'Orecchio (trago)' },
      { k: 'spalla',     nome: 'Spalla (acromion)' },
      { k: 'anca',       nome: 'Anca (grande trocantere)' },
      { k: 'ginocchio',  nome: 'Ginocchio' },
      { k: 'caviglia',   nome: 'Caviglia (malleolo)' }
    ],
    frontale: [
      { k: 'filo_alto',    nome: 'Filo a piombo, in alto' },
      { k: 'filo_basso',   nome: 'Filo a piombo, in basso' },
      { k: 'spalla_dx',    nome: 'Spalla destra' },
      { k: 'spalla_sx',    nome: 'Spalla sinistra' },
      { k: 'anca_dx',      nome: 'Anca destra' },
      { k: 'anca_sx',      nome: 'Anca sinistra' },
      { k: 'ginocchio_dx', nome: 'Ginocchio destro' },
      { k: 'ginocchio_sx', nome: 'Ginocchio sinistro' },
      { k: 'caviglia_dx',  nome: 'Caviglia destra' },
      { k: 'caviglia_sx',  nome: 'Caviglia sinistra' }
    ]
  }
  PUNTI.posteriore = PUNTI.frontale

  // Da piano della foto a vista
  function vistaDi(plane) {
    var p = String(plane || '')
    if (p.indexOf('sagittale') === 0) return 'sagittale'
    if (p === 'frontale') return 'frontale'
    if (p === 'posteriore') return 'posteriore'
    return null
  }
  // Verso predefinito del profilo: nel sagittale DESTRO il paziente mostra il
  // fianco destro e guarda verso la DESTRA dell'immagine (+1); nel sinistro, a
  // sinistra (−1). Si può correggere nell'editor.
  function versoPredefinito(plane) { return String(plane).indexOf('_sx') > 0 ? -1 : 1 }

  // Proposta dai punti di MediaPipe (indici del modello Pose, 33 punti).
  // MediaPipe dice destra/sinistra DEL PAZIENTE.
  var MP = { orecchioSx: 7, orecchioDx: 8, spallaSx: 11, spallaDx: 12, ancaSx: 23, ancaDx: 24,
             ginocchioSx: 25, ginocchioDx: 26, cavigliaSx: 27, cavigliaDx: 28 }
  function daMediaPipe(vista, lm, plane) {
    if (!lm || lm.length < 29) return null
    var p = function (i) { return { x: lm[i].x, y: lm[i].y } }
    var vis = function (i) { return lm[i].visibility == null ? 1 : lm[i].visibility }
    var out = {}
    if (vista === 'sagittale') {
      // il lato verso la fotocamera è quello più visibile
      var dx = vis(MP.spallaDx) + vis(MP.ancaDx) + vis(MP.ginocchioDx) >= vis(MP.spallaSx) + vis(MP.ancaSx) + vis(MP.ginocchioSx)
      out.orecchio  = p(dx ? MP.orecchioDx : MP.orecchioSx)
      out.spalla    = p(dx ? MP.spallaDx : MP.spallaSx)
      out.anca      = p(dx ? MP.ancaDx : MP.ancaSx)
      out.ginocchio = p(dx ? MP.ginocchioDx : MP.ginocchioSx)
      out.caviglia  = p(dx ? MP.cavigliaDx : MP.cavigliaSx)
    } else {
      out.spalla_dx = p(MP.spallaDx); out.spalla_sx = p(MP.spallaSx)
      out.anca_dx = p(MP.ancaDx); out.anca_sx = p(MP.ancaSx)
      out.ginocchio_dx = p(MP.ginocchioDx); out.ginocchio_sx = p(MP.ginocchioSx)
      out.caviglia_dx = p(MP.cavigliaDx); out.caviglia_sx = p(MP.cavigliaSx)
    }
    return out
  }
  // Senza MediaPipe: una sagoma standard da spostare col dito
  function predefiniti(vista, plane) {
    var o = { filo_alto: { x: 0.5, y: 0.06 }, filo_basso: { x: 0.5, y: 0.94 } }
    if (vista === 'sagittale') {
      o.orecchio = { x: 0.5, y: 0.14 }; o.spalla = { x: 0.5, y: 0.25 }; o.anca = { x: 0.5, y: 0.5 }
      o.ginocchio = { x: 0.5, y: 0.7 }; o.caviglia = { x: 0.5, y: 0.9 }
    } else {
      // di fronte la destra del paziente sta a SINISTRA dell'immagine; di spalle a destra
      var s = vista === 'frontale' ? -1 : 1
      var lato = function (d, y) { return { x: 0.5 + s * d, y: y } }
      o.spalla_dx = lato(0.11, 0.25); o.spalla_sx = lato(-0.11, 0.25)
      o.anca_dx = lato(0.07, 0.5); o.anca_sx = lato(-0.07, 0.5)
      o.ginocchio_dx = lato(0.07, 0.7); o.ginocchio_sx = lato(-0.07, 0.7)
      o.caviglia_dx = lato(0.07, 0.9); o.caviglia_sx = lato(-0.07, 0.9)
    }
    return o
  }

  // ── la geometria, in PIXEL (normalizzato × dimensioni: un'immagine non è quadrata)
  function px(p, W, H) { return { x: p.x * W, y: p.y * H } }
  function assiDaFilo(punti, W, H) {
    var a = punti.filo_alto && px(punti.filo_alto, W, H), b = punti.filo_basso && px(punti.filo_basso, W, H)
    var up = (a && b) ? { x: a.x - b.x, y: a.y - b.y } : { x: 0, y: -1 }
    var l = Math.hypot(up.x, up.y)
    if (l < 1e-6) up = { x: 0, y: -1 }; else up = { x: up.x / l, y: up.y / l }
    // «destra dell'immagine» perpendicolare al filo
    return { su: up, destra: { x: -up.y, y: up.x } }
  }
  function componenti(v, assi) { return { alto: v.x * assi.su.x + v.y * assi.su.y, lato: v.x * assi.destra.x + v.y * assi.destra.y } }
  function gradi(r) { return r * 180 / Math.PI }
  // inclinazione del segmento da→a rispetto al filo, con segno verso la destra dell'immagine
  function inclinazione(da, a, W, H, assi) {
    var v = componenti({ x: (a.x - da.x) * W, y: (a.y - da.y) * H }, assi)
    return gradi(Math.atan2(v.lato, v.alto))
  }
  // inclinazione di una linea rispetto all'orizzontale del filo, e quale capo è più alto
  function dislivello(p1, p2, W, H, assi) {
    var v = componenti({ x: (p2.x - p1.x) * W, y: (p2.y - p1.y) * H }, assi)
    var ang = gradi(Math.atan2(v.alto, Math.abs(v.lato) || 1e-9))
    return { gradi: Math.abs(ang), piuAlto: ang > 0 ? 2 : (ang < 0 ? 1 : 0) }
  }
  // deviazione dal dritto al ginocchio: 180 − angolo anca-ginocchio-caviglia, col verso
  function asseGinocchio(anca, gin, cav, medialeX, W, H) {
    var A = px(anca, W, H), K = px(gin, W, H), C = px(cav, W, H)
    var a1 = Math.atan2(A.y - K.y, A.x - K.x), a2 = Math.atan2(C.y - K.y, C.x - K.x)
    var d = Math.abs(gradi(a1 - a2)); if (d > 180) d = 360 - d
    var dev = 180 - d
    // da che parte sta il ginocchio rispetto alla linea anca-caviglia
    var t = ((K.y - A.y) * (C.y - A.y) + (K.x - A.x) * (C.x - A.x)) / (Math.pow(C.y - A.y, 2) + Math.pow(C.x - A.x, 2) || 1)
    var sx = A.x + t * (C.x - A.x)
    var versoMediale = (medialeX * W - sx) >= 0 ? 1 : -1
    var interno = (K.x - sx) * versoMediale > 0
    return { gradi: dev, interno: interno }
  }

  function r1(x) { return Math.round(x * 10) / 10 + 0 }   // + 0: niente «-0» a schermo
  function numIt(x, dec) { return (x == null || isNaN(x)) ? '—' : Number(x).toFixed(dec == null ? 1 : dec).replace('.', ',') }

  /* Le misure di UNA foto. W, H: dimensioni vere dell'immagine.
     verso: +1 se (sagittale) il paziente guarda verso la destra dell'immagine.
     Ogni misura: { k, nome, gradi (con segno: + = in avanti / valgo / destra più alta),
                    valore (assoluto), parola } — 0 è il riferimento. */
  function misure(vista, punti, W, H, verso) {
    if (!punti || !W || !H) return []
    var assi = assiDaFilo(punti, W, H), out = []
    var ok = function () { for (var i = 0; i < arguments.length; i++) if (!punti[arguments[i]]) return false; return true }
    if (vista === 'sagittale') {
      var v = verso === -1 ? -1 : 1
      var seg = function (k, nome, da, a) {
        if (!ok(da, a)) return
        var g = inclinazione(punti[da], punti[a], W, H, assi) * v
        out.push({ k: k, nome: nome, gradi: r1(g), valore: r1(Math.abs(g)),
          parola: Math.abs(g) < 0.05 ? 'sul filo' : (g > 0 ? 'in avanti' : 'indietro') })
      }
      seg('testa',   'Orecchio rispetto alla spalla', 'spalla', 'orecchio')
      seg('tronco',  'Spalla rispetto all’anca', 'anca', 'spalla')
      seg('gamba',   'Anca rispetto alla caviglia', 'caviglia', 'anca')
      seg('globale', 'Orecchio rispetto alla caviglia', 'caviglia', 'orecchio')
      return out
    }
    if (vista === 'frontale' || vista === 'posteriore') {
      // di fronte la destra del paziente sta a sinistra dell'immagine
      var coppia = function (k, nome, pdx, psx) {
        if (!ok(pdx, psx)) return
        var d = dislivello(punti[pdx], punti[psx], W, H, assi)   // p1 = destra, p2 = sinistra
        out.push({ k: k, nome: nome, gradi: r1(d.piuAlto === 1 ? d.gradi : -d.gradi), valore: r1(d.gradi),
          parola: d.gradi < 0.05 ? 'in piano' : (d.piuAlto === 1 ? 'più alta a destra' : 'più alta a sinistra') })
      }
      coppia('spalle', 'Linea delle spalle', 'spalla_dx', 'spalla_sx')
      coppia('bacino', 'Linea del bacino', 'anca_dx', 'anca_sx')
      var gamba = function (k, nome, a, g, c, altraC) {
        if (!ok(a, g, c, altraC)) return
        var mediale = (punti[c].x + punti[altraC].x) / 2
        var r = asseGinocchio(punti[a], punti[g], punti[c], mediale, W, H)
        out.push({ k: k, nome: nome, gradi: r1(r.interno ? r.gradi : -r.gradi), valore: r1(r.gradi),
          parola: r.gradi < 0.05 ? 'dritto' : (r.interno ? 'verso l’interno' : 'verso l’esterno') })
      }
      gamba('ginocchio_dx', 'Anca-ginocchio-caviglia destra', 'anca_dx', 'ginocchio_dx', 'caviglia_dx', 'caviglia_sx')
      gamba('ginocchio_sx', 'Anca-ginocchio-caviglia sinistra', 'anca_sx', 'ginocchio_sx', 'caviglia_sx', 'caviglia_dx')
      return out
    }
    return out
  }

  /* Prima contro dopo, misura per misura. Si avvicina al riferimento (0) chi ha
     il valore assoluto più piccolo. Il verdetto c'è SOLO se l'errore è misurato. */
  function confronto(prima, dopo) {
    var perK = {}
    ;(dopo || []).forEach(function (m) { perK[m.k] = m })
    return (prima || []).filter(function (m) { return perK[m.k] }).map(function (a) {
      var b = perK[a.k], delta = r1(b.valore - a.valore), err = ERRORE[a.k]
      var esito = 'daconfermare'
      if (err != null) esito = Math.abs(delta) <= err ? 'uguale' : (delta < 0 ? 'meglio' : 'lavoro')
      return { k: a.k, nome: a.nome, a: a, b: b, delta: delta, errore: err == null ? null : err, esito: esito }
    })
  }

  /* La linea di riferimento PERSONALE (4A): costruita sui punti del paziente.
     Sagittale: la verticale del filo che passa per la SUA caviglia, e su quella
     linea, alla stessa altezza, dove starebbero i suoi punti se fossero allineati.
     Frontale/posteriore: le orizzontali del filo che passano per il centro di
     spalle e bacino. Restituisce coordinate normalizzate. */
  function riferimento(vista, punti, W, H) {
    if (!punti || !W || !H) return null
    var assi = assiDaFilo(punti, W, H)
    var norm = function (p) { return { x: p.x / W, y: p.y / H } }
    if (vista === 'sagittale') {
      if (!punti.caviglia) return null
      var C = px(punti.caviglia, W, H), fantasmi = []
      ;['orecchio', 'spalla', 'anca', 'ginocchio'].forEach(function (k) {
        if (!punti[k]) return
        var v = componenti({ x: px(punti[k], W, H).x - C.x, y: px(punti[k], W, H).y - C.y }, assi)
        fantasmi.push({ k: k, reale: punti[k], ideale: norm({ x: C.x + assi.su.x * v.alto, y: C.y + assi.su.y * v.alto }) })
      })
      var L = Math.max(W, H) * 1.5
      return { tipo: 'verticale', fantasmi: fantasmi,
        linea: [norm({ x: C.x - assi.su.x * L * 0.1, y: C.y - assi.su.y * L * 0.1 }), norm({ x: C.x + assi.su.x * L, y: C.y + assi.su.y * L })] }
    }
    var righe = []
    ;[['spalla_dx', 'spalla_sx'], ['anca_dx', 'anca_sx']].forEach(function (c) {
      if (!punti[c[0]] || !punti[c[1]]) return
      var A = px(punti[c[0]], W, H), B = px(punti[c[1]], W, H), M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }
      var mezza = Math.hypot(B.x - A.x, B.y - A.y) * 0.75
      righe.push({ reale: [punti[c[0]], punti[c[1]]],
        ideale: [norm({ x: M.x - assi.destra.x * mezza, y: M.y - assi.destra.y * mezza }), norm({ x: M.x + assi.destra.x * mezza, y: M.y + assi.destra.y * mezza })] })
    })
    return { tipo: 'orizzontali', righe: righe }
  }

  /* ═══ pdf-gradi-v1 · IL DISEGNO, UNA FUNZIONE SOLA ══════════════════
     Punti, linee, gradi e riferimento come SVG (una stringa), in coordinate
     dell'IMMAGINE (0..larghezza, 0..altezza). Lo usano lo schermo del paziente
     (viewBox + «xMidYMid meet», che è l'object-fit: contain) e i PDF (viewBox
     sopra l'immagine). Due punti che disegnano la stessa cosa divergono sempre.
     Le misure delle linee sono in proporzione alla foto, così un file da 4000
     pixel e uno da 600 si vedono uguali. Niente DOM, niente rete. */
  function escS(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function svgMisura(m, opz) {
    opz = opz || {}
    var W = (m && m.larghezza) || opz.W, H = (m && m.altezza) || opz.H   // righe senza dimensioni: quelle della foto
    if (!m || !W || !H) return ''
    var u = Math.max(W, H) / 100, pt = m.punti || {}, vista = m.vista, h = []
    var P = function (q) { return { x: q.x * W, y: q.y * H } }
    var n = function (x) { return Math.round(x * 10) / 10 }
    var linea = function (a, b, col, w, tratt) { if (!a || !b) return; var A = P(a), B = P(b)
      h.push('<line x1="' + n(A.x) + '" y1="' + n(A.y) + '" x2="' + n(B.x) + '" y2="' + n(B.y) + '" stroke="' + col + '" stroke-width="' + n(w * u) + '"' +
        (tratt ? ' stroke-dasharray="' + tratt.map(function (t) { return n(t * u) }).join(' ') + '"' : '') + ' stroke-linecap="round"/>') }
    var punto = function (a, col, r, vuoto) { if (!a) return; var A = P(a)
      h.push('<circle cx="' + n(A.x) + '" cy="' + n(A.y) + '" r="' + n(r * u) + '" fill="' + (vuoto ? 'none' : col) + '" stroke="' + (vuoto ? col : '#0B0B0B') + '" stroke-width="' + n((vuoto ? 0.45 : 0.35) * u) + '"/>') }
    var etichetta = function (a, testo, verso) { if (!a || !testo) return; var A = P(a)
      var w = (testo.length * 2.25 + 3.2) * u, hh = 6.4 * u, x = verso < 0 ? A.x - 2.2 * u - w : A.x + 2.2 * u
      h.push('<g><rect x="' + n(x) + '" y="' + n(A.y - hh / 2) + '" width="' + n(w) + '" height="' + n(hh) + '" rx="' + n(1.6 * u) + '" fill="rgba(0,0,0,.78)" stroke="#FFD008" stroke-width="' + n(0.28 * u) + '"/>' +
        '<text x="' + n(x + w / 2) + '" y="' + n(A.y + 1.35 * u) + '" fill="#fff" font-size="' + n(3.9 * u) + '" font-weight="800" text-anchor="middle" font-family="Montserrat,Helvetica,Arial,sans-serif">' + escS(testo) + '</text></g>') }
    var med = function (a, b) { return (a && b) ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null }
    if (opz.rif) {
      var rf = riferimento(vista, pt, W, H)
      if (rf && rf.tipo === 'verticale') {
        linea(rf.linea[0], rf.linea[1], '#00C48C', 0.45, [1.6, 1.1])
        rf.fantasmi.forEach(function (fm) { linea(fm.reale, fm.ideale, 'rgba(0,196,140,.7)', 0.3, [0.6, 0.7]); punto(fm.ideale, '#00C48C', 1.25, true) })
      } else if (rf) rf.righe.forEach(function (r) { linea(r.ideale[0], r.ideale[1], '#00C48C', 0.45, [1.6, 1.1]) })
    }
    if (opz.gradi) {
      linea(pt.filo_alto, pt.filo_basso, '#FFD008', 0.3, [1.4, 1.1])
      var gr = {}; (m.gradi || []).forEach(function (x) { gr[x.k] = x })
      var g1 = function (k) { return gr[k] ? numIt(gr[k].valore) + '°' : '' }
      if (vista === 'sagittale') {
        var cat = ['orecchio', 'spalla', 'anca', 'ginocchio', 'caviglia']
        for (var i = 0; i < cat.length - 1; i++) linea(pt[cat[i]], pt[cat[i + 1]], '#FFFFFF', 0.7)
        cat.forEach(function (k) { punto(pt[k], '#FFFFFF', 1.3) })
        // l'etichetta va dalla parte della schiena: davanti c'è il viso
        var dietro = m.verso === -1 ? 1 : -1
        etichetta(med(pt.spalla, pt.orecchio), g1('testa'), dietro)
        etichetta(med(pt.anca, pt.spalla), g1('tronco'), dietro)
        etichetta(med(pt.caviglia, pt.anca), g1('gamba'), dietro)
      } else {
        linea(pt.spalla_dx, pt.spalla_sx, '#FFFFFF', 0.55); linea(pt.anca_dx, pt.anca_sx, '#FFFFFF', 0.55)
        ;['dx', 'sx'].forEach(function (l) { linea(pt['anca_' + l], pt['ginocchio_' + l], '#FFFFFF', 0.4); linea(pt['ginocchio_' + l], pt['caviglia_' + l], '#FFFFFF', 0.4) })
        Object.keys(pt).filter(function (k) { return !/^filo/.test(k) }).forEach(function (k) { punto(pt[k], '#FFFFFF', 0.95) })
        var destraPiuADestra = pt.spalla_dx && pt.spalla_sx ? pt.spalla_dx.x > pt.spalla_sx.x : true
        etichetta(pt.spalla_dx && pt.spalla_sx ? (destraPiuADestra ? pt.spalla_dx : pt.spalla_sx) : null, g1('spalle'), 1)
        etichetta(pt.anca_dx && pt.anca_sx ? (destraPiuADestra ? pt.anca_dx : pt.anca_sx) : null, g1('bacino'), 1)
        var gdx = pt.ginocchio_dx, gsx = pt.ginocchio_sx
        etichetta(gdx, g1('ginocchio_dx'), (gdx && gsx && gdx.x < gsx.x) ? -1 : 1)
        etichetta(gsx, g1('ginocchio_sx'), (gdx && gsx && gsx.x < gdx.x) ? -1 : 1)
      }
    }
    return h.join('')
  }

  global.PolMisure = {
    svgMisura: svgMisura,
    ERRORE: ERRORE, PUNTI: PUNTI, VERSIONE: 'gradi-foto-v1',
    vistaDi: vistaDi, versoPredefinito: versoPredefinito, daMediaPipe: daMediaPipe, predefiniti: predefiniti,
    misure: misure, confronto: confronto, riferimento: riferimento, numIt: numIt
  }
})(typeof window !== 'undefined' ? window : globalThis)
