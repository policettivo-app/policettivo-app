/* js/oscillazione.js — oscillazione-live-v1
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

  global.PolOscillazione = {
    disegna: disegna,
    versoCuneo: versoCuneo,
    r1: r1, r2: r2
  }
})(typeof window !== 'undefined' ? window : this)
