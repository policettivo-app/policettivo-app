/* js/oscillazione.js — oscillazione-live-v1 · oscillazione-esito-v1
 *
 * IL DISEGNO DEL GOMITOLO, IN UN FILE SOLO.
 *
 * Perche' esiste: la pagina che misura e la pagina che guarda in diretta
 * devono disegnare la STESSA figura. Due punti che disegnano la stessa cosa
 * divergono sempre — e qui la divergenza sarebbe invisibile finche' qualcuno
 * non mette i due schermi uno accanto all'altro.
 *
 * ⚠️ Questo file e' matematica e pennello: NIENTE rete, NIENTE Supabase,
 *    NIENTE memoria del telefono. Un controllo automatico lo verifica, ed e'
 *    la ragione per cui la pagina di misura puo' caricarlo restando pulita.
 */
;(function(global){
  'use strict'

  function r2(x){ return Math.round(x*100)/100 }
  function r1(x){ return Math.round(x*10)/10 }

  // L'asse maggiore dell'ellisse, detto a parole
  function versoCuneo(m){
    var dx = Math.abs(Math.cos(m.angolo)), dy = Math.abs(Math.sin(m.angolo))
    return dy >= dx ? 'avanti e indietro' : 'a destra e sinistra'
  }

  function disegna(cv, xs, ys, semiScala, m, o){
    var ctx = cv.getContext('2d')
    var W = cv.width, H = cv.height, cx = W/2, cy = H/2
    ctx.clearRect(0,0,W,H)
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H)

    var s = semiScala || 5
    var k = (Math.min(W,H)/2 - 24) / s

    // griglia a 1 grado
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1
    for (var g = 1; g <= Math.ceil(s); g++){
      ctx.beginPath(); ctx.arc(cx, cy, g*k, 0, Math.PI*2); ctx.stroke()
    }
    ctx.strokeStyle = '#e4e4e4'
    ctx.beginPath(); ctx.moveTo(12,cy); ctx.lineTo(W-12,cy)
    ctx.moveTo(cx,12); ctx.lineTo(cx,H-12); ctx.stroke()

    // ── referto-v1 · IL CUNEO: da che parte si oscilla di piu' ───────────
    // Sta DIETRO la traccia e tiene un'opacita' bassa: deve farsi capire senza
    // farsi guardare. Punta nei due versi dell'asse maggiore dell'ellisse, ed
    // e' largo in proporzione a quanto quell'asse domina sull'altro: se la
    // persona oscilla in tondo il cuneo quasi sparisce, ed e' giusto cosi'.
    if (o && o.cuneo && m && m.semiA > 0){
      var rapp = m.semiB > 0 ? m.semiA/m.semiB : 3
      var forza = Math.max(0, Math.min(1, (rapp - 1) / 2))     // 1:1 -> 0, 3:1 -> 1
      if (forza > 0.05){
        var L  = m.semiA * k * 1.18
        var Wb = Math.max(7, m.semiB * k * 0.7)
        ctx.save()
        ctx.translate(cx + m.mx*k, cy - m.my*k)
        ctx.rotate(-m.angolo)
        ctx.fillStyle = 'rgba(40,90,220,' + (0.05 + 0.13*forza).toFixed(3) + ')'
        for (var d = -1; d <= 1; d += 2){
          ctx.beginPath()
          ctx.moveTo(d*L, 0)
          ctx.lineTo(d*L*0.3,  Wb)
          ctx.lineTo(d*L*0.3, -Wb)
          ctx.closePath(); ctx.fill()
        }
        ctx.restore()
      }
    }

    // la traccia, dal blu al rosso nel tempo
    var n = xs.length
    if (n > 1){
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      for (var i=1;i<n;i++){
        var t = i/(n-1)
        ctx.strokeStyle = 'rgb(' + Math.round(40 + 200*t) + ',' + Math.round(90 - 60*t) + ',' + Math.round(220 - 180*t) + ')'
        ctx.beginPath()
        ctx.moveTo(cx + xs[i-1]*k, cy - ys[i-1]*k)
        ctx.lineTo(cx + xs[i]*k,   cy - ys[i]*k)
        ctx.stroke()
      }
    }
    // l'ellisse al 95%: e' la misura, disegnata. Chi guarda il foglio vede
    // subito QUANTO grande e' e in che direzione oscilla.
    if (m && m.semiA > 0){
      ctx.save()
      ctx.translate(cx + m.mx*k, cy - m.my*k)
      ctx.rotate(-m.angolo)
      ctx.beginPath(); ctx.ellipse(0, 0, m.semiA*k, m.semiB*k, 0, 0, Math.PI*2)
      ctx.fillStyle = 'rgba(255,208,8,0.16)'; ctx.fill()
      ctx.strokeStyle = '#e0b400'; ctx.lineWidth = 2; ctx.setLineDash([7,5]); ctx.stroke()
      ctx.setLineDash([]); ctx.restore()
    }
    // dove comincia e dove finisce
    if (n > 1){
      ctx.fillStyle = '#2864dc'
      ctx.beginPath(); ctx.arc(cx + xs[0]*k, cy - ys[0]*k, 7, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = '#d9342b'
      ctx.beginPath(); ctx.arc(cx + xs[n-1]*k, cy - ys[n-1]*k, 7, 0, Math.PI*2); ctx.fill()
    }
    // il centro
    ctx.fillStyle = '#111'
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2); ctx.fill()

    ctx.fillStyle = '#999'; ctx.font = '20px sans-serif'
    ctx.fillText(r1(s) + '°', W - 62, H - 16)

    // prova-oscillazione-v5 — le parole sugli assi e il punto di carico.
    // Il centro e' la tavola SCARICA: cosi' il disegno si legge senza spiegazioni.
    if (o && o.parole){
      ctx.fillStyle = '#aaa'; ctx.font = 'bold 19px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('AVANTI', cx, 26)
      ctx.fillText('INDIETRO', cx, H - 34)
      ctx.textAlign = 'left';  ctx.fillText('SX', 12, cy - 8)
      ctx.textAlign = 'right'; ctx.fillText('DX', W - 12, cy - 8)
      ctx.textAlign = 'left'
      // referto-v1 — la parola del cuneo, piccola: dice in una riga cosa mostra
      if (o.cuneo && m && m.semiA > 0 && m.semiB > 0 && m.semiA/m.semiB > 1.15){
        ctx.fillStyle = '#8a9bd0'; ctx.font = '17px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText('oscilla soprattutto ' + versoCuneo(m), cx, 50)
        ctx.textAlign = 'left'
      }
    }
    if (o && o.soglia > 0){
      ctx.strokeStyle = '#0a7d33'; ctx.lineWidth = 2; ctx.setLineDash([8,6])
      ctx.beginPath(); ctx.arc(cx, cy, o.soglia * k, 0, Math.PI*2); ctx.stroke()
      ctx.setLineDash([])
    }
    if (o && o.carico){
      var px = cx + o.carico.x * k, py = cy - o.carico.y * k
      ctx.strokeStyle = o.colore || '#c0392b'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke()
      ctx.fillStyle = o.colore || '#c0392b'
      ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI*2); ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke()
    }
  }

  // ── i tre omini: si leggono in un colpo d'occhio sul referto ──────────
  // 1) di profilo: avanti / indietro   2) di fronte: destra / sinistra
  // 3) dall'alto: il punto di carico dentro i quattro quadranti
  function ominoProfilo(v, col){
    var d = v >= 0 ? 1 : -1, a = Math.min(1, Math.abs(v) / 4)
    var inc = d * a * 14
    return '<svg viewBox="0 0 100 120" width="100%" height="112">' +
      '<line x1="8" y1="108" x2="92" y2="108" stroke="#ddd" stroke-width="3"/>' +
      '<g transform="rotate(' + inc + ' 50 108)">' +
        '<circle cx="50" cy="22" r="11" fill="' + col + '"/>' +
        '<line x1="50" y1="33" x2="50" y2="72" stroke="' + col + '" stroke-width="7" stroke-linecap="round"/>' +
        '<line x1="50" y1="45" x2="66" y2="62" stroke="' + col + '" stroke-width="5" stroke-linecap="round"/>' +
        '<line x1="50" y1="72" x2="50" y2="104" stroke="' + col + '" stroke-width="7" stroke-linecap="round"/>' +
        '<line x1="50" y1="104" x2="66" y2="104" stroke="' + col + '" stroke-width="6" stroke-linecap="round"/>' +
      '</g>' +
      '<path d="' + (d > 0 ? 'M70 88 L86 88 M80 82 L86 88 L80 94' : 'M30 88 L14 88 M20 82 L14 88 L20 94') +
        '" stroke="' + col + '" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>'
  }
  function ominoFronte(v, col){
    var d = v >= 0 ? 1 : -1, a = Math.min(1, Math.abs(v) / 4)
    var inc = d * a * 14
    return '<svg viewBox="0 0 100 120" width="100%" height="112">' +
      '<line x1="8" y1="108" x2="92" y2="108" stroke="#ddd" stroke-width="3"/>' +
      '<g transform="rotate(' + inc + ' 50 108)">' +
        '<circle cx="50" cy="22" r="11" fill="' + col + '"/>' +
        '<line x1="50" y1="33" x2="50" y2="70" stroke="' + col + '" stroke-width="7" stroke-linecap="round"/>' +
        '<line x1="32" y1="46" x2="68" y2="46" stroke="' + col + '" stroke-width="5" stroke-linecap="round"/>' +
        '<line x1="50" y1="70" x2="38" y2="104" stroke="' + col + '" stroke-width="6" stroke-linecap="round"/>' +
        '<line x1="50" y1="70" x2="62" y2="104" stroke="' + col + '" stroke-width="6" stroke-linecap="round"/>' +
      '</g>' +
      '<path d="' + (d > 0 ? 'M74 60 L90 60 M84 54 L90 60 L84 66' : 'M26 60 L10 60 M16 54 L10 60 L16 66') +
        '" stroke="' + col + '" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>'
  }
  function ominoAlto(dx, dy, col, soglia){
    var k = 30 / Math.max(2, (soglia || 2) * 2)
    var px = Math.max(-32, Math.min(32, dx * k))
    var py = Math.max(-32, Math.min(32, -dy * k))
    var r  = (soglia || 0) > 0 ? (soglia * k) : 0
    return '<svg viewBox="0 0 100 120" width="100%" height="112">' +
      '<rect x="14" y="24" width="72" height="72" rx="8" fill="#fafafa" stroke="#ddd" stroke-width="2"/>' +
      '<line x1="50" y1="24" x2="50" y2="96" stroke="#e8e8e8" stroke-width="2"/>' +
      '<line x1="14" y1="60" x2="86" y2="60" stroke="#e8e8e8" stroke-width="2"/>' +
      '<ellipse cx="40" cy="60" rx="6" ry="13" fill="#eee" stroke="#ccc"/>' +
      '<ellipse cx="60" cy="60" rx="6" ry="13" fill="#eee" stroke="#ccc"/>' +
      (r > 0 ? '<circle cx="50" cy="60" r="' + r + '" fill="none" stroke="#0a7d33" stroke-width="1.5" stroke-dasharray="4 3"/>' : '') +
      '<circle cx="' + (50 + px) + '" cy="' + (60 + py) + '" r="7" fill="' + col + '"/>' +
      '<text x="50" y="16" font-size="9" text-anchor="middle" fill="#999">AVANTI</text>' +
      '<text x="50" y="112" font-size="9" text-anchor="middle" fill="#999">INDIETRO</text>' +
      '</svg>'
  }

  // I tre omini col numero e la parola, in una riga sola di HTML: li disegnano
  // tutte e due le pagine (il telefono e il computer della diretta) e devono
  // essere identici, se no due schermi affiancati raccontano due cose diverse.
  function omini(carB, carG, colore, soglia){
    var parola = function(asse, v){
      if (asse === 'gamma') return v >= 0 ? 'DESTRA' : 'SINISTRA'
      return v >= 0 ? 'AVANTI' : 'INDIETRO'
    }
    return '<div class="titolo-omini">Dove sta il carico</div><div class="omini">' +
      '<div class="omino">' + ominoProfilo(carB, colore) +
        '<div class="cap">' + parola('beta', carB) + '</div>' +
        '<div class="cap-num" style="color:' + colore + '">' + r2(Math.abs(carB)) + '°</div>' +
        '<div class="cap-min">di profilo</div></div>' +
      '<div class="omino">' + ominoFronte(carG, colore) +
        '<div class="cap">' + parola('gamma', carG) + '</div>' +
        '<div class="cap-num" style="color:' + colore + '">' + r2(Math.abs(carG)) + '°</div>' +
        '<div class="cap-min">di fronte</div></div>' +
      '<div class="omino">' + ominoAlto(carG, carB, colore, soglia) +
        '<div class="cap">DALL\u2019ALTO</div>' +
        '<div class="cap-num" style="color:' + colore + '">' + r2(Math.hypot(carB, carG)) + '°</div>' +
        '<div class="cap-min">dal centro</div></div>' +
      '</div>'
  }

  global.PolOscillazione = {
    omini: omini,
    ominoProfilo: ominoProfilo, ominoFronte: ominoFronte, ominoAlto: ominoAlto,
    disegna: disegna,
    versoCuneo: versoCuneo,
    r1: r1, r2: r2
  }
})(typeof window !== 'undefined' ? window : this)
