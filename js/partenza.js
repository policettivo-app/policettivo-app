/* partenza-v1 (28 set 2026) — IL MARCHIO E LA PARTENZA DEI TEST
   Due cose, usate da più pagine:
   1) PolMarchio: il marchio POLICETTIVO® e la «P», vettoriali (ricavati dai
      file originali del marchio, stesse forme), in qualsiasi colore.
        PolMarchio.parola('#fff')  PolMarchio.p('#FFD008')   → '<svg …>'
   2) PolPartenza: la schermata grande dei secondi prima che un test parta.
        PolPartenza.apri({ titolo, sotto, testo, avviso, secondi })
        PolPartenza.numero(n)     → il numero e l'anello che si svuota
        PolPartenza.via()         → «VIA» per un attimo, poi si chiude
        PolPartenza.chiudi()
   Non misura niente e non salva niente: è solo grafica. Se questo file non
   si carica, i test funzionano lo stesso (le pagine controllano che esista). */
;(function(g){
  'use strict'
  var D_PAROLA = 'M 1123.2 61.2 C 1116.7 64.3,1115.0 75.5,1120.2 80.6 C 1126.9 87.3,1139.2 83.7,1141.6 74.4 C 1143.9 65.1,1132.3 56.8,1123.2 61.2 M 1123.3 63.7 C 1115.4 70.1,1119.5 81.9,1129.6 81.9 C 1135.8 82.0,1141.2 74.4,1139.1 68.7 C 1136.8 62.7,1128.0 59.9,1123.3 63.7 M 58 73 L 58 80 96.5 80 L 135.1 80 138.0 82.9 C 143.1 88.0,141.3 97.6,134.8 99.8 C 132.7 100.6,119.2 101,94.8 101 L 58 101 58 125 L 58 149 65 149 L 72 149 72 132.0 L 72 115.1 104.7 114.8 C 141.5 114.4,143.1 114.1,149.6 106.6 C 157.5 97.7,156.9 80.5,148.5 72.4 C 142.1 66.2,140.3 66,96.5 66 L 58 66 58 73 M 199.0 67.4 C 179.3 71.9,170.3 83.0,169.2 104.2 C 167.4 137.7,182.5 150.3,222.7 148.7 C 253.3 147.5,264.8 137.8,266.6 112 C 268.1 89.8,259.5 74.8,242.1 68.9 C 233.4 66.0,209.0 65.2,199.0 67.4 M 282 99.4 C 282 134.8,282.1 136.4,286.8 141.3 C 293.6 148.5,293.0 148.4,337.7 148.8 L 378 149.1 378 142.0 L 378 135.0 340.0 134.7 L 302.1 134.5 299.0 131.5 L 296 128.6 296 97.3 L 296 66 289 66 L 282 66 282 99.4 M 395 107.5 L 395 149 402 149 L 409 149 409 107.5 L 409 66 402 66 L 395 66 395 107.5 M 454.0 67.5 C 434.4 71.8,425.3 82.9,424.2 104.2 C 423.1 124.7,428.8 137.4,441.8 143.9 C 450.0 148.0,458.9 149,491.0 149 L 521 149 521 142.0 L 521 135.1 489.2 134.8 C 454.6 134.4,451.9 134.0,445.1 127.7 C 437.8 120.9,435.8 103.7,441.0 93.4 C 446.7 82.3,454.6 80,485.6 80 L 507 80 507 83.5 L 507 87 514 87 L 521 87 521 76.5 L 521 66 490.7 66.0 C 468.8 66.1,458.7 66.5,454.0 67.5 M 537 73 L 537 80 585.5 80 L 634 80 634 73 L 634 66 585.5 66 L 537 66 537 73 M 649 73 L 649 80 669.5 80 L 690 80 690 114.5 L 690 149 697 149 L 704 149 704 114.5 L 704 80 725 80 L 746 80 746 73 L 746 66 697.5 66 L 649 66 649 73 M 762 73 L 762 80 782.5 80 L 803 80 803 114.5 L 803 149 810 149 L 817 149 817 114.5 L 817 80 838 80 L 859 80 859 73 L 859 66 810.5 66 L 762 66 762 73 M 874 107.5 L 874 149 881 149 L 888 149 888 107.5 L 888 66 881 66 L 874 66 874 107.5 M 905.0 76.5 C 930.6 131.2,941.4 149,949 149 C 956.0 149,959.5 143.8,979.5 103.8 C 989.7 83.6,998 66.8,998 66.5 C 998 66.2,994.3 66,989.9 66 L 981.9 66 965.7 98.5 C 956.8 116.3,949.2 131,949 131 C 948.7 131,941.1 116.3,932.2 98.5 L 916.0 66 908.0 66 L 900.1 66 905.0 76.5 M 1033.0 67.4 C 1013.3 71.9,1004.3 83.0,1003.2 104.2 C 1001.4 137.7,1016.5 150.3,1056.7 148.7 C 1087.3 147.5,1098.8 137.8,1100.6 112 C 1102.1 89.8,1093.5 74.8,1076.1 68.9 C 1067.4 66.0,1043.0 65.2,1033.0 67.4 M 1124 72.5 C 1124 76.1,1124.4 79,1125 79 C 1125.5 79,1126 77.6,1126 76 C 1126 72.1,1127.1 72.2,1130.4 76.0 C 1133.6 79.8,1136.0 79.5,1132.9 75.7 C 1131.1 73.3,1131.0 72.9,1132.4 72.3 C 1134.4 71.6,1134.4 67.3,1132.4 66.6 C 1131.5 66.2,1129.2 66,1127.4 66 L 1124 66 1124 72.5 M 1126 70 C 1126 72.0,1127.5 72.5,1130.4 71.3 C 1133.2 70.3,1132.2 68,1129 68 C 1126.6 68,1126 68.4,1126 70 M 202.1 81.4 C 189.1 84.6,183.4 92.7,183.5 107.9 C 183.5 126.6,191.5 133.8,213.3 134.8 C 238.0 135.8,249.2 129.9,252.0 114.5 C 254.7 99.7,249.4 88.0,237.6 82.8 C 231.2 80.0,210.8 79.2,202.1 81.4 M 1036.1 81.4 C 1023.1 84.6,1017.4 92.7,1017.5 107.9 C 1017.5 126.6,1025.5 133.8,1047.3 134.8 C 1072.0 135.8,1083.2 129.9,1086.0 114.5 C 1088.7 99.7,1083.4 88.0,1071.6 82.8 C 1065.2 80.0,1044.8 79.2,1036.1 81.4 M 537 108.0 L 537 115.0 585.2 114.7 L 633.5 114.5 633.7 107.7 L 634.0 101 585.5 101 L 537 101 537 108.0 M 537 142 L 537 149 585.5 149 L 634 149 634 142 L 634 135 585.5 135 L 537 135 537 142'
  var D_P = 'M 10 51.9 L 10 75.9 141.2 76.2 L 272.5 76.5 277.5 78.8 C 290.2 84.6,296.0 96.6,294.7 114.7 C 293.7 129.4,287.7 139.0,276.5 144.2 L 271.5 146.5 140.7 146.7 L 10 147.0 10 230.0 L 10 313 33.5 313 L 57 313 57 254 L 57 195 158.7 194.9 C 214.7 194.9,265.0 194.5,270.6 194.0 C 306.3 190.7,331.4 171.7,340.1 141.4 C 343.4 129.9,343.4 92.7,340.1 80.7 C 333.0 54.4,314.2 37.3,285 30.3 C 278.0 28.7,268.0 28.5,143.7 28.2 L 10 27.9 10 51.9'
  function svg(vb, d, colore, cls){
    return '<svg class="' + (cls || '') + '" xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" role="img" aria-label="Policettivo®">' +
      '<path d="' + d + '" fill="' + (colore || '#000') + '" fill-rule="evenodd"/></svg>'
  }
  g.PolMarchio = {
    parola: function(colore, cls){ return svg('56 58 1090 93', D_PAROLA, colore, cls) },
    p: function(colore, cls){ return svg('8 26 337 289', D_P, colore, cls) }
  }

  var CSS = '' +
    '.pp-ov{position:fixed;inset:0;z-index:99990;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'gap:min(2.6vh,22px);padding:max(18px,env(safe-area-inset-top)) 18px max(18px,env(safe-area-inset-bottom));text-align:center;color:#fff;' +
    'background:radial-gradient(120vmax 90vmax at 50% 45%,#1b1b1b 0%,#080808 60%,#000 100%);' +
    'font-family:Montserrat,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;opacity:0;transition:opacity .35s ease;overflow:hidden}' +
    '.pp-ov.on{opacity:1}' +
    '.pp-parola{width:min(64vw,44vh,560px);height:auto;display:block}' +
    '.pp-tit{font-size:min(4.6vw,3.2vh,30px);font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:#FFD008;margin-top:-4px}' +
    '.pp-anello{position:relative;width:min(66vw,40vh,440px);height:min(66vw,40vh,440px)}' +
    '.pp-anello svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}' +
    '.pp-anello .pp-fondo{fill:none;stroke:#242424;stroke-width:5}' +
    '.pp-anello .pp-arco{fill:none;stroke:#FFD008;stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset 1s linear}' +
    '.pp-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900;' +
    'font-size:min(30vw,18vh,200px);line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.03em}' +
    '.pp-num.ultimi{color:#FFD008;animation:pp-batte 1s ease-out infinite}' +
    '.pp-num.via{color:#FFD008;font-size:min(22vw,13vh,150px);letter-spacing:.06em}' +
    '@keyframes pp-batte{0%{transform:scale(1.18)}60%{transform:scale(1)}100%{transform:scale(1)}}' +
    '.pp-sta{font-size:min(6.4vw,4vh,40px);font-weight:900;line-height:1.1}' +
    '.pp-sotto{font-size:min(4vw,2.4vh,22px);color:#bdbdbd;font-weight:600;letter-spacing:.06em}' +
    '.pp-testo{font-size:min(4.2vw,2.6vh,24px);color:#fff;max-width:760px;line-height:1.35}' +
    '.pp-avviso{font-size:min(3.8vw,2.3vh,21px);font-weight:800;color:#111;background:#FFD008;border-radius:12px;padding:8px 14px;max-width:760px}' +
    '.pp-piede{position:absolute;left:0;right:0;bottom:max(14px,env(safe-area-inset-bottom));font-size:min(3vw,1.7vh,14px);color:#6f6f6f;letter-spacing:.14em;text-transform:uppercase}' +
    '@media (prefers-reduced-motion:reduce){.pp-num.ultimi{animation:none}.pp-anello .pp-arco{transition:none}}' +
    '@media print{.pp-ov{display:none!important}}'

  var ov = null, tot = 1, chiudiT = null
  var C = 2 * Math.PI * 46
  function el(){
    if (ov) return ov
    if (!document.getElementById('pp-stile')){
      var st = document.createElement('style'); st.id = 'pp-stile'; st.textContent = CSS; document.head.appendChild(st)
    }
    ov = document.createElement('div'); ov.className = 'pp-ov'; ov.id = 'pol-partenza'
    ov.setAttribute('role', 'timer'); ov.setAttribute('aria-live', 'assertive')
    ov.innerHTML =
      g.PolMarchio.parola('#fff', 'pp-parola') +
      '<div class="pp-tit" id="pp-tit"></div>' +
      '<div class="pp-anello"><svg viewBox="0 0 100 100"><circle class="pp-fondo" cx="50" cy="50" r="46"/>' +
      '<circle class="pp-arco" id="pp-arco" cx="50" cy="50" r="46" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="0"/></svg>' +
      '<div class="pp-num" id="pp-num"></div></div>' +
      '<div class="pp-sta">Il test sta per partire</div>' +
      '<div class="pp-sotto" id="pp-sotto"></div>' +
      '<div class="pp-testo" id="pp-testo"></div>' +
      '<div class="pp-avviso" id="pp-avviso" style="display:none"></div>' +
      '<div class="pp-piede">Test del Sistema Policettivo®</div>'
    return ov
  }
  function q(id){ return document.getElementById(id) }
  function apri(o){
    o = o || {}
    clearTimeout(chiudiT)
    var e = el()
    if (!e.parentNode) document.body.appendChild(e)
    tot = Math.max(1, Number(o.secondi) || 1)
    q('pp-tit').textContent = o.titolo || 'Oscillazione Policettiva'
    q('pp-sotto').textContent = o.sotto || ''
    q('pp-testo').textContent = o.testo || ''
    q('pp-testo').style.display = o.testo ? '' : 'none'
    q('pp-avviso').textContent = o.avviso || ''
    q('pp-avviso').style.display = o.avviso ? '' : 'none'
    var a = q('pp-arco'); a.style.transition = 'none'; a.setAttribute('stroke-dashoffset', '0')
    void a.getBoundingClientRect(); a.style.transition = ''
    numero(tot)
    requestAnimationFrame(function(){ e.classList.add('on') })
  }
  function numero(n){
    if (!ov) return
    n = Math.max(0, Math.round(Number(n) || 0))
    var nu = q('pp-num')
    nu.className = 'pp-num' + (n <= 3 ? ' ultimi' : '')
    nu.textContent = n
    // l'anello si svuota: pieno al primo numero, vuoto allo zero
    q('pp-arco').setAttribute('stroke-dashoffset', (C * (1 - (n - 1) / tot)).toFixed(2))
  }
  function via(){
    if (!ov) return
    var nu = q('pp-num'); nu.className = 'pp-num via'; nu.textContent = 'VIA'
    q('pp-arco').setAttribute('stroke-dashoffset', C.toFixed(2))
    clearTimeout(chiudiT); chiudiT = setTimeout(chiudi, 700)
  }
  function chiudi(){
    clearTimeout(chiudiT)
    if (!ov) return
    ov.classList.remove('on')
    var e = ov
    chiudiT = setTimeout(function(){ if (e.parentNode && !e.classList.contains('on')) e.parentNode.removeChild(e) }, 400)
  }
  function aperta(){ return !!(ov && ov.parentNode && ov.classList.contains('on')) }
  g.PolPartenza = { apri: apri, numero: numero, via: via, chiudi: chiudi, aperta: aperta }
})(window)
