/* js/oscillazione.js — oscillazione-live-v1 · oscillazione-esito-v1 · oscillazione-app-v1 · test-sessioni-v1 · schermo-paziente-v1
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

  // ═══ oscillazione-app-v1 · IL CONFRONTO, IN UN POSTO SOLO ═══════════
  // Lo usano la pagina del test (prove della stessa sessione) e lo storico
  // (prove salvate in giorni diversi). Due confronti scritti in due posti
  // avrebbero finito per dire due cose diverse sullo stesso paziente.
  //
  // ⚠️ LE BANDE sono MISURATE, non scelte: dal giro da 5+5 dell'11 settembre
  // 2026 la velocità ripete con un CV del 13%. La differenza fra DUE prove
  // singole ha uno scarto di 13·√2 ≈ 18%, e il 95% sta entro ±36%.
  // Con la media di tre prove per parte si scende a circa il 20%.
  // Il carico ripete a ±0,5°: la differenza fra due prove sta entro ±1,4°,
  // arrotondato a 1,5 e dichiarato. Misurate su UNA persona: provvisorie.
  var BANDA_SINGOLA = 35, BANDA_TRE = 20, BANDA_CARICO = 1.5

  function numIt(x, dec){
    var v = Math.round(x * Math.pow(10,dec)) / Math.pow(10,dec)
    return v.toFixed(dec).replace('.', ',')
  }
  function parolaAsse(asse, v){
    if (asse === 'gamma') return v >= 0 ? 'DESTRA' : 'SINISTRA'
    return v >= 0 ? 'AVANTI' : 'INDIETRO'
  }
  function quandoCorto(a, b){
    var da = new Date(a), db = new Date(b)
    var ora = { hour: '2-digit', minute: '2-digit' }
    if (da.toDateString() === db.toDateString()) {
      return ['delle ' + da.toLocaleTimeString('it-IT', ora), 'delle ' + db.toLocaleTimeString('it-IT', ora)]
    }
    var gg = { day: '2-digit', month: '2-digit', year: 'numeric' }
    return ['del ' + da.toLocaleDateString('it-IT', gg), 'del ' + db.toLocaleDateString('it-IT', gg)]
  }

  // A e B hanno questa forma (la costruisce chi chiama):
  //   { quando, condizione, velocita, osc, raggio, ellisse, deriva, carico, asse }
  // opz.nPrima = quante prove ci sono nella condizione di A (per la banda ridotta)
  function confronto(A, B, opz){
    opz = opz || {}
    var stessa = A.condizione === B.condizione
    var banda = (stessa && (opz.nPrima || 0) >= 3) ? BANDA_TRE : BANDA_SINGOLA
    var righe = [
      ['⭐ Velocità media', A.velocita, B.velocita, '°/s'],
      ['Oscillazione asse del test', A.osc, B.osc, '°'],
      ['Raggio medio', A.raggio, B.raggio, '°'],
      ['Ellisse 95%', A.ellisse, B.ellisse, '°²'],
      ['Deriva del carico', A.deriva, B.deriva, '°']
    ]
    var html = (!stessa
      ? '<div class="warn">⚠️ Le due prove <b>non sono nella stessa condizione</b> (' +
        A.condizione + ' contro ' + B.condizione + '). È un confronto fra ' +
        'situazioni diverse, <b>non</b> un cambiamento nel tempo.</div>' : '') +
      '<div class="cfr">'
    righe.forEach(function(r){
      var d = r[1] > 0 ? 100*(r[2]-r[1])/r[1] : 0
      var oltre = Math.abs(d) >= banda
      var col = !oltre ? '#999' : (d < 0 ? '#0a7d33' : '#c0392b')
      html += '<div class="cfr-riga"><span>' + r[0] + '</span>' +
              '<span class="cfr-val">' + r2(r[1]) + ' → ' + r2(r[2]) + ' ' + r[3] + '</span>' +
              '<span class="cfr-d" style="color:' + col + '">' + (d >= 0 ? '+' : '−') +
              Math.round(Math.abs(d)) + '%</span></div>'
    })
    var haCarico = A.carico != null && B.carico != null
    if (haCarico){
      var dc = B.carico - A.carico
      html += '<div class="cfr-riga"><span>CARICO (asse del test)</span>' +
              '<span class="cfr-val">' + r2(A.carico) + ' → ' + r2(B.carico) + ' °</span>' +
              '<span class="cfr-d" style="color:' + (Math.abs(dc) >= BANDA_CARICO ? '#111' : '#999') + '">' +
              (dc >= 0 ? '+' : '−') + numIt(Math.abs(dc),1) + '°</span></div>'
    }
    html += '</div>' +
      '<div class="nota" style="margin-top:8px">Sotto il <b>' + banda + '%</b> (e sotto <b>' +
      numIt(BANDA_CARICO,1) + '°</b> di carico) la differenza <b>non si distingue dal rumore ' +
      'della misura</b>: è grigia. ' +
      (banda === BANDA_SINGOLA
        ? 'Con almeno tre prove per parte la soglia scende al ' + BANDA_TRE + '%.'
        : 'Qui vale la soglia ridotta perché ci sono tre prove o più.') +
      ' Valori misurati su una persona sola: provvisori.</div>'

    var f = [], q = quandoCorto(A.quando, B.quando)
    f.push('Confronto fra la prova ' + q[0] + ' e quella ' + q[1] + '.')
    if (!stessa){
      f.push('Attenzione: le due prove NON sono nella stessa condizione. ' +
             'Questo è un confronto fra situazioni diverse, non un cambiamento nel tempo.')
    }
    var dv = A.velocita > 0 ? 100*(B.velocita - A.velocita)/A.velocita : 0
    f.push('La velocità media è passata da ' + numIt(A.velocita,1) + ' a ' +
           numIt(B.velocita,1) + ' gradi al secondo: ' +
           (dv >= 0 ? 'più ' : 'meno ') + numIt(Math.abs(dv),0) + ' per cento.')
    f.push(Math.abs(dv) >= banda
      ? 'È una differenza più grande della variabilità della misura, che su questo confronto vale ' +
        banda + ' per cento.'
      : 'Ma sotto il ' + banda + ' per cento non si distingue dal rumore della misura: ' +
        'due prove uguali possono ballare di tanto. Per leggere una differenza più piccola ' +
        'servono almeno tre prove per parte.')
    if (haCarico){
      var dc2 = B.carico - A.carico
      f.push('Il carico si è spostato di ' + numIt(Math.abs(dc2),1) + ' gradi verso ' +
             parolaAsse(A.asse, dc2).toLowerCase() + '.')
      if (Math.abs(dc2) < BANDA_CARICO){
        f.push('Anche qui però siamo sotto il grado e mezzo, che è quanto il carico si sposta ' +
               'da solo ripetendo la stessa prova.')
      }
    }
    f.push('Questi sono i numeri del confronto. L’interpretazione clinica la scrivi tu.')
    return { stessa: stessa, banda: banda, html: html, frasi: f }
  }


  // ═══ test-sessioni-v1 · IL CONFRONTO FRA SESSIONI ═══════════════════
  // Decisioni del 22 set 2026: 1=A (la sessione è una riga a sé),
  // 2=A (si confrontano SESSIONI, condizione per condizione, sulle medie),
  // 3=A (le parole sono «più stabile / meno stabile / invariato»: dicono
  // cosa ha fatto la misura, il giudizio clinico resta del professionista).
  //
  // ⚠️ LE SOGLIE NON SI SCELGONO: si ricavano dalla ripetibilità misurata
  // l'11 settembre 2026 (5+5 prove, UNA persona, valori provvisori):
  //   velocità CV 13% · oscillazione 27% · raggio 35% · ellisse 42%
  // La differenza fra due medie di n prove sta al 95% entro
  //   1,96 · √2 · CV / √n  =  2,77 · CV / √n
  // Per la velocità: n=1 → 36% (dichiarato 35), n=3 → 21% (dichiarato 20):
  // sono le stesse bande che la pagina usa da confronto-v1. Qui la regola
  // vale per tutte le misure, con n = le prove della sessione più povera.
  // Il carico ripete a ±0,5°: 1,5° su prove singole, 1,0° con tre o più
  // (il calcolo darebbe 0,8: si arrotonda in su, per prudenza).
  var CV = { velocita: 13, osc: 27, raggio: 35, ellisse: 42 }
  function bandaDi(cv, n){
    if (cv === CV.velocita) return n >= 3 ? BANDA_TRE : BANDA_SINGOLA
    return Math.round(2.77 * cv / Math.sqrt(Math.max(1, Math.min(n, 3))))
  }
  function bandaCarico(n){ return n >= 3 ? 1.0 : BANDA_CARICO }

  function numeroO(x){ return (x == null || x === '' || isNaN(Number(x))) ? null : Number(x) }

  // la chiave della condizione: la stessa della pagina del test
  // schermo-paziente-v1 · una prova segnata «prima» o «dopo i 3 Respiri» è
  // un'ALTRA condizione: mediarla con le altre mescolerebbe il prima col dopo.
  // Le prove senza momento (tutte quelle di prima) restano come erano.
  function condizioneDi(r){
    return (r.configurazione || '(non indicata)') + ' · ' + r.evento +
           (r.occhi && r.occhi !== '-' ? ' · occhi ' + r.occhi : '') +
           (r.momento === 'pre' ? ' · prima dei 3R' : r.momento === 'post' ? ' · dopo i 3R' : '')
  }
  function asseDi(r){ return r.evento === 'rollio' ? 'gamma' : 'beta' }
  // come si legge: senza «(non indicata)» davanti, che è solo rumore sul foglio
  function nomeCond(k){ return String(k).replace(/^\(non indicata\) · /, '') }

  // La serie in gradi, dalla traccia salvata (10 Hz), col verso e lo zero
  // USATI in quel test: un test di sei mesi fa si legge come allora.
  function serieDaRiga(r){
    var xs = [], ys = [], tr = r && r.traccia
    if (!tr || !tr.b || !tr.g) return { xs: xs, ys: ys }
    var zb = numeroO(r.zero_beta) || 0, zg = numeroO(r.zero_gamma) || 0
    var vb = numeroO(r.verso_beta) || 1, vg = numeroO(r.verso_gamma) || 1
    for (var i = 0; i < tr.b.length; i++){ xs.push((tr.g[i] - zg) * vg); ys.push((tr.b[i] - zb) * vb) }
    return { xs: xs, ys: ys }
  }
  function ellisseDi(xs, ys){
    var n = xs.length; if (n < 3) return null
    var mx = 0, my = 0, i
    for (i = 0; i < n; i++){ mx += xs[i]; my += ys[i] }
    mx /= n; my /= n
    var sxx = 0, syy = 0, sxy = 0
    for (i = 0; i < n; i++){ var dx = xs[i]-mx, dy = ys[i]-my; sxx += dx*dx; syy += dy*dy; sxy += dx*dy }
    sxx /= n; syy /= n; sxy /= n
    var mez = (sxx+syy)/2, dif = Math.sqrt(Math.pow((sxx-syy)/2, 2) + sxy*sxy)
    return { mx: mx, my: my, semiA: Math.sqrt(5.991*Math.max(0, mez+dif)),
             semiB: Math.sqrt(5.991*Math.max(0, mez-dif)), angolo: 0.5*Math.atan2(2*sxy, sxx-syy) }
  }
  function percentile(v, p){
    if (!v.length) return 0
    var s = v.slice().sort(function(a, b){ return a - b })
    var k = (s.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)
  }

  // ⚠️ DESCRITTIVE: la ripetibilità di queste misure NON è ancora misurata.
  //  - tempo: quanta parte della prova la tavola sta da ciascun lato dello
  //    ZERO (la tavola scarica). È il «dove sta», e somiglia al carico.
  //  - escursione: fin dove si spinge in ciascuna direzione rispetto al
  //    SUO centro (percentili 95 e 5: un picco solo non conta). È il
  //    «da che parte si sbilancia».
  function direzioni(xs, ys){
    var n = xs.length
    if (n < 10) return null
    var av = 0, ind = 0, dx = 0, sx = 0, mx = 0, my = 0, i
    for (i = 0; i < n; i++){
      if (ys[i] > 0) av++; else if (ys[i] < 0) ind++
      if (xs[i] > 0) dx++; else if (xs[i] < 0) sx++
      mx += xs[i]; my += ys[i]
    }
    mx /= n; my /= n
    var cy = ys.map(function(y){ return y - my }), cx = xs.map(function(x){ return x - mx })
    return {
      tempoAvanti: 100*av/n, tempoIndietro: 100*ind/n, tempoDestra: 100*dx/n, tempoSinistra: 100*sx/n,
      escAvanti: Math.max(0, percentile(cy, 0.95)), escIndietro: Math.max(0, -percentile(cy, 0.05)),
      escDestra: Math.max(0, percentile(cx, 0.95)), escSinistra: Math.max(0, -percentile(cx, 0.05))
    }
  }

  function mediaDi(lista, f){
    var v = lista.map(f).filter(function(x){ return x != null && !isNaN(x) })
    return v.length ? v.reduce(function(a, b){ return a + b }, 0) / v.length : null
  }

  // Le medie di una condizione dentro una sessione
  function riassuntoCondizione(righe){
    var dir = righe.map(function(r){ var s = serieDaRiga(r); return direzioni(s.xs, s.ys) })
                   .filter(function(d){ return d })
    var md = function(k){ return mediaDi(dir, function(d){ return d[k] }) }
    var a = asseDi(righe[0])
    return {
      n: righe.length, asse: a, evento: righe[0].evento, occhi: righe[0].occhi,
      configurazione: righe[0].configurazione || null,
      velocita: mediaDi(righe, function(r){ return numeroO(r.velocita) }),
      osc_ap: mediaDi(righe, function(r){ return numeroO(r.osc_ap) }),
      osc_ds: mediaDi(righe, function(r){ return numeroO(r.osc_ds) }),
      raggio: mediaDi(righe, function(r){ return numeroO(r.raggio) }),
      ellisse: mediaDi(righe, function(r){ return numeroO(r.ellisse) }),
      deriva: mediaDi(righe, function(r){ return numeroO(r.deriva) }),
      carico_avanti: mediaDi(righe, function(r){ return numeroO(r.carico_avanti) }),
      carico_destra: mediaDi(righe, function(r){ return numeroO(r.carico_destra) }),
      tarati: righe.every(function(r){ return !!r.tarato }),
      dir: dir.length ? {
        n: dir.length,
        tempoAvanti: md('tempoAvanti'), tempoIndietro: md('tempoIndietro'),
        tempoDestra: md('tempoDestra'), tempoSinistra: md('tempoSinistra'),
        escAvanti: md('escAvanti'), escIndietro: md('escIndietro'),
        escDestra: md('escDestra'), escSinistra: md('escSinistra')
      } : null
    }
  }

  function perCondizione(righe){
    var g = {}, ordine = []
    righe.forEach(function(r){
      if (r.velocita == null) return
      var k = condizioneDi(r)
      if (!g[k]){ g[k] = []; ordine.push(k) }
      g[k].push(r)
    })
    return { gruppi: g, ordine: ordine }
  }

  function pct(a, b){ return a > 0 ? 100 * (b - a) / a : 0 }
  function segno(d){ return (d >= 0 ? '+' : '−') + Math.round(Math.abs(d)) + '%' }
  function lato(asse, v){ return parolaAsse(asse, v).toLowerCase() }

  // Le quattro domande per UNA condizione
  function confrontaCondizione(k, A, B){
    var n = Math.min(A.n, B.n)
    var out = { condizione: k, a: A, b: B, n: n, righe: [], frasi: [] }

    // 1) È più stabile? — la velocità
    var bv = bandaDi(CV.velocita, n), dv = pct(A.velocita, B.velocita)
    var verdetto = Math.abs(dv) < bv ? 'INVARIATO' : (dv < 0 ? 'PIÙ STABILE' : 'MENO STABILE')
    out.verdetto = verdetto; out.dv = dv; out.bandaVel = bv
    out.frasi.push(nomeCond(k) + ': ' + verdetto.toLowerCase() + '. La velocità media è passata da ' +
      numIt(A.velocita, 1) + ' a ' + numIt(B.velocita, 1) + ' gradi al secondo, ' +
      (dv >= 0 ? 'più ' : 'meno ') + numIt(Math.abs(dv), 0) + ' per cento' +
      (verdetto === 'INVARIATO' ? ', dentro la variabilità della misura, che qui vale ' + bv + ' per cento.' :
       ', oltre la variabilità della misura, che qui vale ' + bv + ' per cento.'))

    // 2) Dove oscilla di più?
    var bo = bandaDi(CV.osc, n)
    var dom = function(S){
      if (S.osc_ap == null || S.osc_ds == null) return null
      var r = S.osc_ap / Math.max(0.01, S.osc_ds)
      return r > 1.15 ? 'avanti-indietro' : (r < 1/1.15 ? 'destra-sinistra' : 'in modo simile sui due assi')
    }
    out.oscDomA = dom(A); out.oscDomB = dom(B)
    out.dAp = pct(A.osc_ap, B.osc_ap); out.dDs = pct(A.osc_ds, B.osc_ds); out.bandaOsc = bo
    if (out.oscDomB){
      out.frasi.push('Oscilla di più ' + out.oscDomB + (out.oscDomA && out.oscDomA !== out.oscDomB ?
        ' (prima: ' + out.oscDomA + ')' : '') + '. Avanti-indietro ' + segno(out.dAp) +
        ', destra-sinistra ' + segno(out.dDs) + (Math.abs(out.dAp) < bo && Math.abs(out.dDs) < bo ?
        ': dentro la variabilità dell’oscillazione (' + bo + ' per cento).' : '.'))
    }

    // 3) Dove tende ad avere più carico?
    var bc = bandaCarico(n)
    out.bandaCar = bc
    out.dCarAv = (A.carico_avanti != null && B.carico_avanti != null) ? B.carico_avanti - A.carico_avanti : null
    out.dCarDx = (A.carico_destra != null && B.carico_destra != null) ? B.carico_destra - A.carico_destra : null
    if (B.carico_avanti != null){
      var f = 'Il carico adesso sta ' + numIt(Math.abs(B.carico_avanti), 1) + '° ' + lato('beta', B.carico_avanti) +
              ' e ' + numIt(Math.abs(B.carico_destra || 0), 1) + '° a ' + lato('gamma', B.carico_destra || 0) + '.'
      var mosse = []
      if (out.dCarAv != null && Math.abs(out.dCarAv) >= bc) mosse.push(numIt(Math.abs(out.dCarAv), 1) + '° verso ' + lato('beta', out.dCarAv))
      if (out.dCarDx != null && Math.abs(out.dCarDx) >= bc) mosse.push(numIt(Math.abs(out.dCarDx), 1) + '° verso ' + lato('gamma', out.dCarDx))
      f += mosse.length ? ' Rispetto a prima si è spostato di ' + mosse.join(' e di ') + '.' :
           ' Rispetto a prima non si è spostato più di ' + numIt(bc, 1) + '°, che è quanto si sposta da solo ripetendo la prova.'
      out.frasi.push(f)
    }

    // 4) Da che parte si sbilancia? (descrittivo)
    if (A.dir && B.dir){
      var d = B.dir
      // sotto un decimo di grado di differenza non si dice «di più»
      var parte = function(a, b, pa, pb){
        if (Math.abs(a - b) < 0.1) return 'tanto ' + pa + ' quanto ' + pb + ' (' + numIt(a, 1) + '°)'
        return 'di più ' + (a > b ? pa : pb) + ' (' + numIt(Math.max(a, b), 1) + '° contro ' + numIt(Math.min(a, b), 1) + '°)'
      }
      out.frasi.push('Si spinge ' + parte(d.escAvanti, d.escIndietro, 'in avanti', 'indietro') + ', e ' +
        parte(d.escDestra, d.escSinistra, 'a destra', 'a sinistra') +
        '. Misura descrittiva: la sua ripetibilità non è ancora misurata.')
    }
    return out
  }

  function coloreVerdetto(v){ return v === 'PIÙ STABILE' ? '#0a7d33' : (v === 'MENO STABILE' ? '#c0392b' : '#777') }
  function riga3(nome, a, b, u, dec, delta, col){
    return '<div class="cfr-riga"><span>' + nome + '</span><span class="cfr-val">' +
      (a == null ? '—' : numIt(a, dec)) + ' → ' + (b == null ? '—' : numIt(b, dec)) + ' ' + u + '</span>' +
      '<span class="cfr-d" style="color:' + (col || '#999') + '">' + (delta || '') + '</span></div>'
  }

  function htmlCondizione(c){
    var A = c.a, B = c.b, oltre = function(d, b){ return Math.abs(d) >= b }
    var colD = function(d, b){ return !oltre(d, b) ? '#999' : (d < 0 ? '#0a7d33' : '#c0392b') }
    var h = '<div class="cond-card"><div class="cond-testa"><b>' + escH(nomeCond(c.condizione)) + '</b>' +
      '<span class="verdetto" style="background:' + coloreVerdetto(c.verdetto) + '">' + c.verdetto + '</span></div>' +
      '<div class="cond-n">' + (A.n === 1 ? '1 prova' : A.n + ' prove') + ' prima · ' +
        (B.n === 1 ? '1 prova' : B.n + ' prove') + ' dopo · ' +
        (c.n >= 3 ? 'medie di tre o più: soglie ridotte' : 'meno di tre prove per parte: soglie larghe') + '</div>'
    h += '<div class="domanda">1 · È più stabile?</div><div class="cfr">' +
      riga3('⭐ Velocità media', A.velocita, B.velocita, '°/s', 1, segno(c.dv), colD(c.dv, c.bandaVel)) + '</div>'
    h += '<div class="domanda">2 · Dove oscilla di più?</div><div class="cfr">' +
      riga3('Avanti-indietro', A.osc_ap, B.osc_ap, '°', 2, segno(c.dAp), colD(c.dAp, c.bandaOsc)) +
      riga3('Destra-sinistra', A.osc_ds, B.osc_ds, '°', 2, segno(c.dDs), colD(c.dDs, c.bandaOsc)) +
      '</div><div class="nota">Oscilla di più: <b>' + (c.oscDomB || '—') + '</b>' +
      (c.oscDomA && c.oscDomA !== c.oscDomB ? ' (prima: ' + c.oscDomA + ')' : '') + '</div>'
    var dc = function(d){
      if (d == null) return ''
      return (d >= 0 ? '+' : '−') + numIt(Math.abs(d), 1) + '°'
    }
    var colC = function(d){ return d != null && Math.abs(d) >= c.bandaCar ? '#111' : '#999' }
    h += '<div class="domanda">3 · Dove tende ad avere più carico?</div><div class="cfr">' +
      riga3('Avanti (+) / indietro (−)', A.carico_avanti, B.carico_avanti, '°', 1, dc(c.dCarAv), colC(c.dCarAv)) +
      riga3('Destra (+) / sinistra (−)', A.carico_destra, B.carico_destra, '°', 1, dc(c.dCarDx), colC(c.dCarDx)) + '</div>'
    if (A.dir && B.dir){
      var t = function(S){ return S.dir }
      h += '<div class="domanda">4 · Da che parte si sbilancia? <span class="descr">descrittivo</span></div><div class="cfr">' +
        riga3('Si spinge in avanti', t(A).escAvanti, t(B).escAvanti, '°', 1) +
        riga3('Si spinge indietro', t(A).escIndietro, t(B).escIndietro, '°', 1) +
        riga3('Si spinge a destra', t(A).escDestra, t(B).escDestra, '°', 1) +
        riga3('Si spinge a sinistra', t(A).escSinistra, t(B).escSinistra, '°', 1) +
        riga3('Tempo in avanti', t(A).tempoAvanti, t(B).tempoAvanti, '%', 0) +
        riga3('Tempo a destra', t(A).tempoDestra, t(B).tempoDestra, '%', 0) +
        '</div><div class="nota">Escursione: fin dove si spinge rispetto al suo centro (95% del tempo). ' +
        'Tempo: quanta parte della prova la tavola sta da quel lato. <b>La ripetibilità di queste due misure non è ' +
        'ancora misurata</b>: si leggono, non si giudicano.</div>'
    }
    h += '<div class="nota">Soglie di questa condizione: velocità ' + c.bandaVel + '%, oscillazione ' +
      c.bandaOsc + '%, carico ' + numIt(c.bandaCar, 1) + '°. Sotto la soglia la differenza è grigia: ' +
      'non si distingue dalla variabilità della misura. Ricavate da una persona sola: provvisorie.</div>'
    if (!A.tarati || !B.tarati){
      h += '<div class="warn">⚠️ Qui c’è almeno una prova fatta <b>senza la taratura del verso</b>: ' +
        'il verso del carico potrebbe essere invertito. Velocità e oscillazione non ne risentono.</div>'
    }
    return h + '</div>'
  }

  // Dipendenza dalla vista: velocità a occhi chiusi / occhi aperti,
  // nella stessa sessione, stessa tavola e stessa configurazione.
  function romberg(gruppi){
    var out = {}
    Object.keys(gruppi).forEach(function(k){
      var r0 = gruppi[k][0]
      if (r0.occhi !== 'aperti') return
      var kc = condizioneDi({ configurazione: r0.configurazione, evento: r0.evento, occhi: 'chiusi', momento: r0.momento })
      if (!gruppi[kc]) return
      var va = mediaDi(gruppi[k], function(r){ return numeroO(r.velocita) })
      var vc = mediaDi(gruppi[kc], function(r){ return numeroO(r.velocita) })
      if (va > 0) out[(r0.configurazione ? r0.configurazione + ' · ' : '') + r0.evento +
        (r0.momento === 'pre' ? ' · prima dei 3R' : r0.momento === 'post' ? ' · dopo i 3R' : '')] = vc / va
    })
    return out
  }

  // A e B: le righe di oscillazione_test delle due sessioni (con la traccia)
  function confrontoSessioni(righeA, righeB){
    var pa = perCondizione(righeA), pb = perCondizione(righeB)
    var comuni = pb.ordine.filter(function(k){ return pa.gruppi[k] })
    var condizioni = comuni.map(function(k){
      return confrontaCondizione(k, riassuntoCondizione(pa.gruppi[k]), riassuntoCondizione(pb.gruppi[k]))
    })
    var soloA = pa.ordine.filter(function(k){ return !pb.gruppi[k] })
    var soloB = pb.ordine.filter(function(k){ return !pa.gruppi[k] })
    var ra = romberg(pa.gruppi), rb = romberg(pb.gruppi)
    var rom = Object.keys(rb).filter(function(k){ return ra[k] != null })
      .map(function(k){ return { chiave: k, a: ra[k], b: rb[k] } })

    var html = ''
    if (condizioni.length){
      html += '<div class="sintesi">' + condizioni.map(function(c){
        return '<div class="sintesi-riga"><span>' + escH(nomeCond(c.condizione)) + '</span><b style="color:' +
          coloreVerdetto(c.verdetto) + '">' + c.verdetto + ' ' + segno(c.dv) + '</b></div>'
      }).join('') + '</div>'
    } else {
      html += '<div class="warn">⚠️ Le due sessioni non hanno <b>nessuna condizione in comune</b> ' +
        '(stessa tavola, stessa configurazione, stessi occhi): non c’è niente da confrontare senza ' +
        'mescolare situazioni diverse.</div>'
    }
    if (rom.length){
      html += '<div class="cond-card"><div class="cond-testa"><b>Quanto si appoggia alla vista</b>' +
        '<span class="descr">descrittivo</span></div><div class="cfr">' +
        rom.map(function(r){ return riga3(escH(r.chiave) + ' · chiusi ÷ aperti', r.a, r.b, '×', 2) }).join('') +
        '</div><div class="nota">Velocità a occhi chiusi divisa per quella a occhi aperti: più è alta, più ' +
        'toglierle la vista la fa muovere. La ripetibilità di questo rapporto non è ancora misurata.</div></div>'
    }
    condizioni.forEach(function(c){ html += htmlCondizione(c) })
    if (soloA.length || soloB.length){
      html += '<div class="nota">Non confrontate perché presenti in una sola sessione: ' +
        soloA.concat(soloB).map(function(k){ return escH(nomeCond(k)) }).join(' · ') + '.</div>'
    }
    var frasi = []
    condizioni.forEach(function(c){ frasi = frasi.concat(c.frasi) })
    rom.forEach(function(r){
      frasi.push('Il rapporto fra occhi chiusi e occhi aperti, ' + r.chiave + ', è passato da ' +
        numIt(r.a, 2) + ' a ' + numIt(r.b, 2) + '.')
    })
    frasi.push('Questi sono i numeri del confronto. L’interpretazione clinica la scrivi tu.')
    return { condizioni: condizioni, soloA: soloA, soloB: soloB, romberg: rom, html: html, frasi: frasi }
  }

  // Il gomitolo di una riga salvata, come immagine: serve ai referti
  function pngDaRiga(r, scala, lato){
    if (typeof document === 'undefined') return ''
    var cv = document.createElement('canvas'); cv.width = cv.height = lato || 500
    var s = serieDaRiga(r), sc = scala || 1.2, i
    if (!scala) for (i = 0; i < s.xs.length; i++) sc = Math.max(sc, Math.abs(s.xs[i]), Math.abs(s.ys[i]))
    var ca = numeroO(r.carico_avanti), cd = numeroO(r.carico_destra)
    disegna(cv, s.xs, s.ys, sc, ellisseDi(s.xs, s.ys), { parole: true, cuneo: true,
      carico: (ca != null && cd != null) ? { x: cd, y: ca } : null, colore: '#c0392b' })
    try { return cv.toDataURL('image/png') } catch(e){ return '' }
  }

  // Lo stile dei referti stampati: uno solo per tutte e due le pagine
  var CSS_REFERTO =
    'body{font-family:Montserrat,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:0;padding:14px;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.verdetto{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.testa-ref{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px}' +
    '.testa-ref h1{font-size:19px;margin:0}.testa-ref div{font-size:12px;color:#444}' +
    '.prova-ref{border:1px solid #ddd;border-radius:10px;padding:10px;margin:10px 0;page-break-inside:avoid;display:flex;gap:12px}' +
    '.prova-ref img{width:52mm;height:52mm;flex:none}.prova-ref table{border-collapse:collapse;font-size:11.5px;width:100%}' +
    '.prova-ref td{padding:2px 4px;border-bottom:1px solid #f0f0f0}.prova-ref td:last-child{text-align:right;font-weight:700}' +
    '.prova-ref h3{font-size:13px;margin:0 0 4px}' +
    '.cfr{border:1px solid #eee;border-radius:10px;padding:6px 10px;margin-top:6px}' +
    '.cfr-riga{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid #f3f3f3}' +
    '.cfr-riga:last-child{border-bottom:0}.cfr-val{color:#555}.cfr-d{font-weight:800;min-width:60px;text-align:right}' +
    '.cond-card{border:1.5px solid #ddd;border-radius:12px;padding:10px;margin:12px 0;page-break-inside:avoid}' +
    '.cond-testa{display:flex;justify-content:space-between;align-items:center;gap:8px}' +
    '.verdetto{color:#fff;border-radius:8px;padding:2px 8px;font-size:11px;font-weight:800;white-space:nowrap}' +
    '.cond-n,.nota{font-size:11px;color:#777;margin-top:4px}.domanda{font-weight:800;margin-top:10px;font-size:12.5px}' +
    '.descr{font-size:10px;font-weight:700;color:#8a6d00;background:#fff3c4;border-radius:6px;padding:1px 6px;margin-left:6px}' +
    '.sintesi{border:2px solid #111;border-radius:12px;padding:8px 12px;margin:10px 0}' +
    '.sintesi-riga{display:flex;justify-content:space-between;gap:8px;padding:3px 0}' +
    '.warn{background:#fff8e6;border:1.5px solid #e6a100;border-radius:10px;padding:8px 10px;color:#7a5200;margin-top:8px;font-size:12px}' +
    '.tele-ref{display:flex;gap:10px;text-align:center;font-size:11px;color:#555}.tele-ref img{width:70mm;height:70mm}' +
    '.piede-ref{font-size:10px;color:#777;border-top:1px solid #ddd;margin-top:14px;padding-top:6px}'

  var PIEDE_REFERTO = '<div class="piede-ref">Test del Sistema Policettivo®: misura l’inclinazione della ' +
    'Tavola Policettiva — dove va il carico e quanto oscilla. Non è una stabilometria su pedana: i numeri si ' +
    'confrontano fra prove della stessa persona, non con una norma. L’interpretazione clinica è del professionista.</div>'

  function escH(t){
    return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] })
  }

  // Chi: il paziente, oppure nome · età · peso della sessione libera
  function chiDi(info){
    info = info || {}
    var t = info.nome ? escH(info.nome) : 'Prova libera'
    var extra = []
    if (info.eta != null && info.eta !== '') extra.push(escH(info.eta) + ' anni')
    if (info.peso_kg != null && info.peso_kg !== '') extra.push(numIt(Number(info.peso_kg), 1) + ' kg')
    return '<b>' + t + '</b>' + (extra.length ? ' · ' + extra.join(' · ') : '')
  }

  // Il referto di TUTTA una sessione: una scheda per prova, poi le medie
  function refertoSessione(righe, info){
    righe = (righe || []).filter(function(r){ return r.velocita != null })
      .sort(function(a, b){ return new Date(a.quando) - new Date(b.quando) })
    var quando = righe.length ? new Date(righe[0].quando) : new Date()
    var h = '<div class="testa-ref"><h1>Oscillazione Policettiva — sessione del ' +
      quando.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + '</h1>' +
      '<div>' + chiDi(info) + '</div><div>' + righe.length + (righe.length === 1 ? ' prova' : ' prove') + '</div></div>'
    righe.forEach(function(r, i){
      var s = serieDaRiga(r), d = direzioni(s.xs, s.ys)
      var ca = numeroO(r.carico_avanti), cd = numeroO(r.carico_destra)
      var tr = function(n, v){ return '<tr><td>' + n + '</td><td>' + v + '</td></tr>' }
      h += '<div class="prova-ref">' + (r.traccia ? '<img src="' + pngDaRiga(r, null, 420) + '">' : '') +
        '<div style="flex:1"><h3>' + (i+1) + ') ' + new Date(r.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
        ' · ' + escH(r.evento) + ' · occhi ' + escH(r.occhi || '—') + ' · ' + escH(r.piedi || '') +
        (r.configurazione ? ' · ' + escH(r.configurazione) : '') + '</h3><table>' +
        tr('⭐ Velocità media', numIt(numeroO(r.velocita), 2) + ' °/s') +
        (ca != null ? tr('Carico', numIt(Math.abs(ca), 1) + '° ' + lato('beta', ca) + ' · ' +
                                   numIt(Math.abs(cd || 0), 1) + '° ' + lato('gamma', cd || 0)) : '') +
        tr('Oscillazione avanti-indietro', numIt(numeroO(r.osc_ap) || 0, 2) + '°') +
        tr('Oscillazione destra-sinistra', numIt(numeroO(r.osc_ds) || 0, 2) + '°') +
        tr('Ellisse 95%', numIt(numeroO(r.ellisse) || 0, 2) + ' °²') +
        (d ? tr('Si spinge avanti / indietro', numIt(d.escAvanti, 1) + '° / ' + numIt(d.escIndietro, 1) + '°') +
             tr('Si spinge destra / sinistra', numIt(d.escDestra, 1) + '° / ' + numIt(d.escSinistra, 1) + '°') : '') +
        '</table>' + (r.tarato ? '' : '<div class="nota">⚠️ senza taratura del verso: il verso del carico potrebbe essere invertito</div>') +
        '</div></div>'
    })
    // le medie per condizione, se in una condizione ci sono due prove o più
    var pc = perCondizione(righe)
    var multiple = pc.ordine.filter(function(k){ return pc.gruppi[k].length >= 2 })
    if (multiple.length){
      h += '<div class="cond-card"><div class="cond-testa"><b>Medie della sessione</b></div><div class="cfr">' +
        multiple.map(function(k){
          var S = riassuntoCondizione(pc.gruppi[k])
          return '<div class="cfr-riga"><span>' + escH(nomeCond(k)) + ' · ' + S.n + ' prove</span><span class="cfr-val">' +
            numIt(S.velocita, 2) + ' °/s · carico ' + numIt(S.carico_avanti || 0, 1) + '° / ' +
            numIt(S.carico_destra || 0, 1) + '°</span></div>'
        }).join('') + '</div></div>'
    }
    var rom = romberg(pc.gruppi)
    Object.keys(rom).forEach(function(k){
      h += '<div class="nota">Occhi chiusi ÷ occhi aperti (' + escH(k) + '): <b>' + numIt(rom[k], 2) + '×</b> (descrittivo)</div>'
    })
    return h + PIEDE_REFERTO
  }

  // Il documento completo, pronto per il server del PDF o per la stampa
  function documento(titolo, corpo){
    return '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>' + escH(titolo) +
      '</title><style>' + CSS_REFERTO + '</style></head><body>' + corpo + '</body></html>'
  }

  global.PolOscillazione = {
    // test-sessioni-v1
    confrontoSessioni: confrontoSessioni, refertoSessione: refertoSessione, documento: documento,
    serieDaRiga: serieDaRiga, ellisseDi: ellisseDi, direzioni: direzioni, condizioneDi: condizioneDi, nomeCond: nomeCond,
    riassuntoCondizione: riassuntoCondizione, pngDaRiga: pngDaRiga, chiDi: chiDi, bandaDi: bandaDi, CV: CV,
    CSS_REFERTO: CSS_REFERTO, PIEDE_REFERTO: PIEDE_REFERTO,
    confronto: confronto,
    BANDA_SINGOLA: BANDA_SINGOLA, BANDA_TRE: BANDA_TRE, BANDA_CARICO: BANDA_CARICO,
    numIt: numIt, parolaAsse: parolaAsse,
    omini: omini,
    ominoProfilo: ominoProfilo, ominoFronte: ominoFronte, ominoAlto: ominoAlto,
    disegna: disegna,
    versoCuneo: versoCuneo,
    r1: r1, r2: r2
  }
})(typeof window !== 'undefined' ? window : this)
