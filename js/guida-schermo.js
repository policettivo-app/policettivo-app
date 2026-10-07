/* js/guida-schermo.js — guidato-v4 (7 ottobre 2026)
 *
 * ESERCIZI GUIDATI: IL PALCO, DISEGNATO IN UN POSTO SOLO.
 * Lo usano il telefono (prova-guidato.html) e la TV (tv.html): due metà che
 * diventano rosse dalla parte della mano più bassa, la pallina del corpo, la
 * pallina delle braccia, la freccia, il conto. E l'esito in grande per la TV.
 *
 *   var palco = PolGuidaSchermo.monta(elemento)      → costruisce il disegno
 *   palco.disegna({ fase, n, ripetizioni, discese, p, corpo, roll, pitch,
 *                   lato, braccia, sogliaMani, sogliaBraccia })
 *   PolGuidaSchermo.esito(elemento, riassunto)       → l'esito, per la TV
 *
 * Tutte le misure sono in «em»: chi lo ospita mette font-size = un centesimo
 * dell'altezza del riquadro, e il disegno è identico a qualunque grandezza,
 * anche ruotato. Non misura niente e non salva niente: è solo grafica.
 */
;(function (g) {
  'use strict'
  var VERSIONE = 'guidato-v4'
  var CSS = '' +
    '.gs{position:absolute;inset:0;overflow:hidden;background:#050505;color:#fff;font-family:Montserrat,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
    '.gs-meta{position:absolute;top:0;bottom:0;width:50%;background:rgba(10,125,51,.30);transition:background .18s linear}' +
    '.gs-meta.sx{left:0}.gs-meta.dx{right:0}' +
    '.gs-lato{position:absolute;top:4em;font-size:3.6em;font-weight:900;letter-spacing:.12em;opacity:.55}' +
    '.gs-meta.sx .gs-lato{left:1.2em}.gs-meta.dx .gs-lato{right:1.2em}' +
    '.gs-bassa{position:absolute;bottom:4.6em;font-size:5em;font-weight:900;line-height:1.05;opacity:0;transition:opacity .15s}' +
    '.gs-meta.sx .gs-bassa{left:.8em;text-align:left}.gs-meta.dx .gs-bassa{right:.8em;text-align:right}' +
    '.gs-meta.rossa .gs-bassa{opacity:1}' +
    '.gs-pista{position:absolute;top:13em;width:11em;height:60em;border-radius:5.5em;background:rgba(0,0,0,.55);border:.35em solid rgba(255,255,255,.28)}' +
    '.gs-pista.corpo{left:calc(50% - 46em)}.gs-pista.braccia{left:calc(50% + 35em)}' +
    '.gs-nome{position:absolute;left:50%;top:-1.7em;transform:translateX(-50%);font-size:2.8em;font-weight:900;letter-spacing:.14em;white-space:nowrap;opacity:.85}' +
    '.gs-zona{position:absolute;left:0;right:0;background:rgba(10,125,51,.55)}' +
    '.gs-guida{position:absolute;left:50%;width:9.6em;height:9.6em;margin-left:-4.8em;border-radius:50%;border:.5em dashed rgba(255,208,8,.85)}' +
    '.gs-palla{position:absolute;left:50%;width:8.4em;height:8.4em;margin-left:-4.2em;border-radius:50%;background:#FFD008;border:.5em solid #111;box-shadow:0 0 3em rgba(255,208,8,.55);transition:top .14s linear}' +
    '.gs-centro{position:absolute;left:50%;top:0;bottom:0;width:60em;margin-left:-30em;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:4em}' +
    '.gs-freccia{width:26em;height:26em;transition:transform .35s ease}' +
    '.gs-freccia.su{transform:rotate(180deg)}.gs-freccia.ferma{opacity:.25}' +
    '.gs-fase{font-size:8.5em;font-weight:900;letter-spacing:.08em;line-height:1;margin-top:-.1em}' +
    '.gs-conta{font-size:19em;font-weight:900;line-height:1;font-variant-numeric:tabular-nums;margin-top:.05em}' +
    '.gs-conta small{font-size:.42em;font-weight:800;opacity:.6}' +
    '.gs-mezze{font-size:3em;font-weight:700;opacity:.75;letter-spacing:.06em;min-height:1.4em}' +
    '.gs-stima{position:absolute;left:2.4em;top:2.4em;font-size:2.4em;font-weight:700;opacity:.6;letter-spacing:.06em}' +
    /* l'esito per la TV */
    '.gse{position:absolute;inset:0;background:#050505;color:#fff;font-family:Montserrat,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:6em 8em;display:flex;flex-direction:column;gap:3.4em}' +
    '.gse-tit{font-size:5em;font-weight:900;letter-spacing:.06em;color:#FFD008}' +
    '.gse-tit small{font-size:.5em;color:#aaa;font-weight:700;letter-spacing:.04em;margin-left:1em}' +
    '.gse-riga{display:flex;gap:3em}' +
    '.gse-box{flex:1;border:.3em solid #2a2a2a;border-radius:3em;padding:2.4em 2em;text-align:center;background:#101010}' +
    '.gse-box b{display:block;font-size:13em;font-weight:900;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.gse-box b small{font-size:.4em;opacity:.6}' +
    '.gse-box span{display:block;font-size:2.7em;font-weight:700;color:#bbb;margin-top:.5em;text-transform:uppercase;letter-spacing:.05em}' +
    '.gse-box.no b{color:#ff6b5e}.gse-box.si b{color:#5fd68a}' +
    '.gse-due{display:flex;gap:3em;flex:1;min-height:0}' +
    '.gse-col{flex:1;border-radius:3em;padding:2.4em 3em;background:#101010;border:.3em solid #2a2a2a;overflow:hidden}' +
    '.gse-col h3{margin:0 0 .5em;font-size:3.6em;font-weight:900}.gse-col.si h3{color:#5fd68a}.gse-col.no h3{color:#FFD008}' +
    '.gse-col p{margin:0 0 .5em;font-size:2.9em;line-height:1.35;font-weight:600}' +
    '.gse-frasi{font-size:3.5em;line-height:1.45;font-weight:600}' +
    '.gse-frasi p{margin:0 0 .35em}.gse-frasi p:last-child{color:#999;font-style:italic;font-size:.82em}'

  function stile() {
    if (document.getElementById('gs-stile')) return
    var s = document.createElement('style'); s.id = 'gs-stile'; s.textContent = CSS; document.head.appendChild(s)
  }
  var NOMI = { inizio: 'FERMO', giu: 'GIÙ', fondo: 'FERMO', su: 'SU', piedi: 'IN PIEDI' }
  var CORSA = 60 - 8.4 - 1.4      // quanto può correre una pallina dentro la pista (em)

  function monta(el) {
    stile()
    el.innerHTML = '<div class="gs">' +
      '<div class="gs-meta sx" data-gs="sx"><div class="gs-lato">SINISTRA</div><div class="gs-bassa">ALZA<br>LA MANO</div></div>' +
      '<div class="gs-meta dx" data-gs="dx"><div class="gs-lato">DESTRA</div><div class="gs-bassa">ALZA<br>LA MANO</div></div>' +
      '<div class="gs-stima">stime · in prova</div>' +
      '<div class="gs-pista corpo" data-gs="pista-corpo"><div class="gs-nome">CORPO</div><div class="gs-guida" data-gs="guida"></div><div class="gs-palla" data-gs="corpo"></div></div>' +
      '<div class="gs-pista braccia"><div class="gs-nome">BRACCIA</div><div class="gs-zona" data-gs="zona"></div><div class="gs-palla" data-gs="braccia"></div></div>' +
      '<div class="gs-centro">' +
        '<svg class="gs-freccia ferma" data-gs="freccia" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 92 L12 46 H36 V8 H64 V46 H88 Z" fill="#FFD008" stroke="#111" stroke-width="3" stroke-linejoin="round"/></svg>' +
        '<div class="gs-fase" data-gs="fase">FERMO</div>' +
        '<div class="gs-conta" data-gs="conta">0</div>' +
        '<div class="gs-mezze" data-gs="mezze"></div>' +
      '</div></div>'
    var q = function (k) { return el.querySelector('[data-gs="' + k + '"]') }
    var E = { sx: q('sx'), dx: q('dx'), corpo: q('corpo'), guida: q('guida'), braccia: q('braccia'), zona: q('zona'), freccia: q('freccia'), fase: q('fase'), conta: q('conta'), mezze: q('mezze') }
    // la zona verde delle braccia: quanto è largo «all'altezza giusta» (metà corsa)
    E.zona.style.top = (0.35 + 4.2 + CORSA / 4).toFixed(2) + 'em'; E.zona.style.height = (CORSA / 2).toFixed(2) + 'em'
    function colore(m, rosso, forza, scritta) {
      m.style.background = rosso ? 'rgba(225,17,17,' + (0.45 + 0.4 * forza).toFixed(2) + ')' : 'rgba(10,125,51,' + (0.30 + 0.25 * forza).toFixed(2) + ')'
      m.classList.toggle('rossa', !!(rosso && scritta))
    }
    function disegna(v) {
      if (!v) return
      var sm = v.sogliaMani || 5, sb = v.sogliaBraccia || 20
      var forza = Math.max(0, Math.min(1, (Math.abs(v.roll || 0) - sm) / (sm * 2)))
      if (v.braccia) { colore(E.sx, true, 1, false); colore(E.dx, true, 1, false) }
      else { colore(E.sx, v.lato === 'sinistra', forza, true); colore(E.dx, v.lato === 'destra', forza, true) }
      // il corpo: in alto = in piedi, in basso = giù. Il cerchio tratteggiato è dove chiede il ritmo.
      E.corpo.style.top = (0.35 + CORSA * Math.max(0, Math.min(1, v.corpo || 0))).toFixed(2) + 'em'
      E.guida.style.top = (-0.25 + CORSA * Math.max(0, Math.min(1, v.p || 0))).toFixed(2) + 'em'
      // le braccia: al centro = come alla partenza
      var b = Math.max(-1, Math.min(1, (v.pitch || 0) / (sb * 2)))
      E.braccia.style.top = (0.35 + CORSA / 2 + CORSA / 2 * b).toFixed(2) + 'em'
      E.braccia.style.background = v.braccia ? '#e11' : '#FFD008'
      E.freccia.classList.toggle('su', v.fase === 'su'); E.freccia.classList.toggle('ferma', v.fase !== 'giu' && v.fase !== 'su')
      E.fase.textContent = NOMI[v.fase] || ''
      E.conta.innerHTML = (v.ripetizioni || 0) + '<small>/' + (v.n || 5) + '</small>'
      E.mezze.textContent = (v.discese || 0) > (v.ripetizioni || 0) ? 'discesa contata' : ''
    }
    return { disegna: disegna, el: el }
  }

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function num(x) { return x == null || isNaN(x) ? '—' : Math.abs(x).toFixed(1).replace('.', ',') }

  /* L'esito in grande. f = { fatti, aTempo, n, tempi:{giu,chiestiGiu}, fuori:{…}, frasi:[…], fermato } */
  function esito(el, f) {
    stile()
    f = f || {}
    var fu = f.fuori || {}, t = f.tempi || {}
    var mano = (fu.sinistraS || 0) >= 0.5 || (fu.destraS || 0) >= 0.5
    var qualeMano = (fu.sinistraS || 0) >= (fu.destraS || 0) ? 'sinistra' : 'destra'
    var gradi = qualeMano === 'sinistra' ? fu.sinistraMax : fu.destraMax
    el.innerHTML = '<div class="gse">' +
      '<div class="gse-tit">' + (f.fermato ? 'FERMATO' : 'COM’È ANDATA') + '<small>squat guidato · stime in prova</small></div>' +
      '<div class="gse-riga">' +
        '<div class="gse-box"><b>' + (f.fatti || 0) + '<small>/' + (f.n || 5) + '</small></b><span>squat contati</span></div>' +
        '<div class="gse-box ' + ((f.aTempo || 0) >= (f.n || 5) ? 'si' : '') + '"><b>' + (f.aTempo || 0) + '</b><span>a tempo con la voce</span></div>' +
        '<div class="gse-box"><b>' + (t.giu == null ? '—' : num(t.giu) + '<small> s</small>') + '</b><span>per scendere · chiesti ' + (t.chiestiGiu || 3) + '</span></div>' +
        '<div class="gse-box ' + (mano ? 'no' : 'si') + '"><b>' + (mano ? num(gradi) + '°' : 'pari') + '</b><span>' + (mano ? 'mano ' + qualeMano + ' più bassa' : 'le due mani') + '</span></div>' +
      '</div>' +
      (f.spiega ? '<div class="gse-due"><div class="gse-col si"><h3>✅ Come chiesto</h3>' + ((f.spiega.bene || []).map(function (x) { return '<p>' + esc(x) + '</p>' }).join('') || '<p>—</p>') + '</div>' +
          '<div class="gse-col no"><h3>👀 Da guardare</h3>' + ((f.spiega.guarda || []).map(function (x) { return '<p>' + esc(x) + '</p>' }).join('') || '<p>Niente da segnalare.</p>') + '</div></div>'
        : '<div class="gse-frasi">' + (f.frasi || []).map(function (x) { return '<p>' + esc(x) + '</p>' }).join('') + '</div>') + '</div>'
    // se le cose da dire sono tante, il carattere della colonna si stringe finché ci stanno tutte
    Array.prototype.forEach.call(el.querySelectorAll('.gse-col'), function (c) {
      for (var k = 1; k > 0.5 && c.scrollHeight > c.clientHeight + 1; k -= 0.05) c.style.fontSize = k.toFixed(2) + 'em'
    })
  }

  g.PolGuidaSchermo = { VERSIONE: VERSIONE, monta: monta, esito: esito, NOMI: NOMI }
})(typeof window !== 'undefined' ? window : globalThis)
