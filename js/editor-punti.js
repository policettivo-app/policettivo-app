/* js/editor-punti.js — editor-punti-v1 (24 settembre 2026)
 *
 * L'EDITOR DEI PUNTI SULLE FOTO, IN UN FILE SOLO.
 *
 * Prima stava dentro schermo-paziente.html. Adesso lo usa anche la pagina della
 * Fase 0 (prova-gradi.html): due copie dello stesso editor divergerebbero, e
 * la Fase 0 deve misurare ESATTAMENTE lo strumento che poi si usa coi pazienti.
 *
 * Il modello (MediaPipe, via js/postural-overlay.js) PROPONE; il professionista
 * sposta col dito e CONFERMA. I due punti gialli vanno sul filo a piombo.
 * Il salvataggio non lo fa l'editor: lo fa chi lo apre (callback `salva`).
 *
 * Uso:
 *   PolEditorPunti.apri({ url, plane, titolo, gia: {punti, verso, origine} | null,
 *                         salva: async function (dati) { return { ok, errore } } })
 *   dati = { vista, verso, punti, gradi, larghezza, altezza, origine, versione }
 */
;(function (global) {
  'use strict'
  var PM = function () { return global.PolMisure }
  var ed = null, montato = false

  var CSS = [
    '.ed{position:fixed;inset:0;z-index:400;background:#050505;display:none;font-family:Montserrat,Helvetica,Arial,sans-serif}',
    '.ed.on{display:flex}',
    '.ed-foto{flex:1;position:relative;min-width:0;touch-action:none}',
    '.ed-foto img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none}',
    '.ed-foto svg{position:absolute;inset:0;width:100%;height:100%}',
    '.ed-foto circle.pm{cursor:grab}',
    '.ed-lato{width:340px;flex:0 0 auto;background:#111;border-left:1px solid #222;padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;color:#fff}',
    '.ed-tit{font-size:16px;font-weight:900;color:#FFD008}',
    '.ed-txt{font-size:12.5px;color:#bbb;line-height:1.5}',
    '.ed-punti{display:flex;flex-direction:column;gap:4px}',
    '.ed-punto{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#ddd;padding:5px 8px;border-radius:8px;background:#181818}',
    '.ed-punto i{width:12px;height:12px;border-radius:50%;display:inline-block;flex:0 0 auto}',
    '.ed-gradi{background:#181818;border-radius:10px;padding:10px;font-size:13px;line-height:1.7;color:#eee}',
    '.ed-gradi b{color:#FFD008}',
    '.ed-riga{display:flex;gap:8px;flex-wrap:wrap}',
    '.ed-stato{font-size:12.5px;line-height:1.5;border-radius:8px;padding:8px 10px;background:#181818;color:#bbb}',
    '.ed-stato.ko{background:#2a1414;color:#ffb4b4}.ed-stato.ok{background:#12241d;color:#7fe3c0}',
    '.ed-btn{background:#1a1a1a;border:1px solid #333;color:#fff;padding:9px 14px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}',
    '.ed-btn.giallo{background:#FFD008;border-color:#FFD008;color:#000}',
    '.ed-btn[disabled]{opacity:.5;cursor:not-allowed}',
    '@media (max-width:760px){.ed{flex-direction:column}.ed-lato{width:auto;max-height:46vh;border-left:0;border-top:1px solid #222}}'
  ].join('\n')

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function $(id) { return document.getElementById(id) }
  var COL = function (k) { return /^filo/.test(k) ? '#FFD008' : (/_dx$/.test(k) ? '#FF7A59' : (/_sx$/.test(k) ? '#5AB0FF' : '#FFFFFF')) }

  function monta() {
    if (montato) return
    montato = true
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st)
    var d = document.createElement('div')
    d.className = 'ed'; d.id = 'ed'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Misura la foto')
    d.innerHTML =
      '<div class="ed-foto" id="ed-foto"><img id="ed-img" alt=""><svg id="ed-svg"></svg></div>' +
      '<div class="ed-lato">' +
        '<div class="ed-tit" id="ed-tit">Misura la foto</div>' +
        '<div class="ed-txt">Trascina i punti col dito. I due <b style="color:#FFD008">gialli</b> vanno <b>sul filo a piombo</b>: ' +
          'sono il riferimento verticale, così un telefono un po’ storto non diventa postura.</div>' +
        '<div class="ed-stato" id="ed-stato"></div>' +
        '<div class="ed-riga" id="ed-verso-riga"></div>' +
        '<div class="ed-punti" id="ed-punti"></div>' +
        '<div class="ed-gradi" id="ed-gradi"></div>' +
        '<div class="ed-riga">' +
          '<button class="ed-btn" id="ed-proponi">✨ Proponi i punti</button>' +
          '<button class="ed-btn" id="ed-annulla">Annulla</button>' +
          '<button class="ed-btn giallo" id="ed-salva">✓ Conferma e salva</button>' +
        '</div>' +
      '</div>'
    document.body.appendChild(d)
    $('ed-proponi').addEventListener('click', proponi)
    $('ed-annulla').addEventListener('click', chiudi)
    $('ed-salva').addEventListener('click', salva)
    $('ed-verso-riga').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-verso]'); if (!b || !ed) return
      ed.verso = Number(b.getAttribute('data-verso')); disegna()
    })
    var box = $('ed-foto')
    box.addEventListener('pointerdown', function (e) {
      var t = e.target
      if (!ed || !t || !t.getAttribute || !t.getAttribute('data-k')) return
      ed.attivo = t.getAttribute('data-k')
      try { box.setPointerCapture(e.pointerId) } catch (x) {}
      e.preventDefault()
    })
    box.addEventListener('pointermove', function (e) {
      if (!ed || !ed.attivo) return
      var r = rett(), b = box.getBoundingClientRect()
      var x = (e.clientX - b.left - r.x) / r.w, y = (e.clientY - b.top - r.y) / r.h
      ed.punti[ed.attivo] = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
      disegna()
    })
    var fine = function () { if (ed && ed.attivo) { ed.attivo = null; disegna() } }
    box.addEventListener('pointerup', fine); box.addEventListener('pointercancel', fine)
    window.addEventListener('resize', function () { if (ed) disegna() })
  }

  function stato(t, cls) { var e = $('ed-stato'); e.textContent = t; e.className = 'ed-stato ' + (cls || '') }

  function apri(o) {
    monta()
    var P = PM()
    var vista = P.vistaDi(o.plane), gia = o.gia || null
    ed = { plane: o.plane, vista: vista, salvaFn: o.salva, url: o.url,
      verso: gia && gia.verso ? gia.verso : P.versoPredefinito(o.plane),
      punti: gia ? JSON.parse(JSON.stringify(gia.punti)) : P.predefiniti(vista, o.plane),
      origine: gia && gia.origine ? gia.origine : 'mano', W: 0, H: 0, attivo: null }
    $('ed-tit').textContent = o.titolo || 'Misura la foto'
    stato(gia ? 'Punti già confermati: puoi correggerli.' : 'Cerco i punti sulla foto…', '')
    var img = $('ed-img')
    img.onload = function () {
      if (!ed) return
      ed.W = img.naturalWidth; ed.H = img.naturalHeight
      disegna()
      if (!gia) proponi()
    }
    img.onerror = function () {
      // senza CORS la foto si apre lo stesso, ma il modello non può leggerla: si va a mano
      if (ed && img.getAttribute('crossorigin') !== null) { img.removeAttribute('crossorigin'); ed.noMP = true; img.src = o.url; return }
      stato('La foto non si è aperta. Riprova.', 'ko')
    }
    // una foto scelta dal telefono (blob:) non ha bisogno del CORS
    if (/^(blob|data):/.test(o.url)) img.removeAttribute('crossorigin'); else img.crossOrigin = 'anonymous'
    img.src = o.url
    $('ed').classList.add('on')
  }

  function chiudi() { if (montato) $('ed').classList.remove('on'); ed = null }

  async function proponi() {
    if (!ed) return
    if (ed.noMP) { stato('Il modello non può leggere questa foto: sposta i punti a mano.', ''); return }
    stato('Cerco i punti sulla foto…', '')
    try {
      var fn = global.__mpFinto || (await import('./js/postural-overlay.js?v=editor-punti-v1')).puntiMediaPipe
      var r = await fn($('ed-img'))
      if (!ed) return
      if (!r || !r.ok) { stato((r && r.message ? r.message + ' ' : '') + 'Sposta i punti a mano.', ''); return }
      var nuovi = PM().daMediaPipe(ed.vista, r.punti, ed.plane)
      if (!nuovi) { stato('Il modello non ha trovato abbastanza punti: spostali a mano.', ''); return }
      Object.keys(nuovi).forEach(function (k) { ed.punti[k] = nuovi[k] })
      ed.origine = 'mediapipe'
      stato('Punti proposti dal modello: controllali e spostali dove serve, poi conferma.', 'ok')
      disegna()
    } catch (e) {
      stato('Il modello non si è caricato (' + (e && e.message ? e.message : e) + '): sposta i punti a mano.', '')
    }
  }

  function rett() {
    var box = $('ed-foto'), bw = box.clientWidth, bh = box.clientHeight
    if (!ed || !ed.W || !bw) return null
    var sc = Math.min(bw / ed.W, bh / ed.H)
    return { x: (bw - ed.W * sc) / 2, y: (bh - ed.H * sc) / 2, w: ed.W * sc, h: ed.H * sc, bw: bw, bh: bh }
  }

  function disegna() {
    var r = rett(); if (!r) return
    var P = PM(), svg = $('ed-svg')
    svg.setAttribute('viewBox', '0 0 ' + r.bw + ' ' + r.bh)
    var Q = function (q) { return { x: r.x + q.x * r.w, y: r.y + q.y * r.h } }
    var pt = ed.punti, h = []
    var L = function (a, b, col, w, d) { if (!pt[a] || !pt[b]) return; var A = Q(pt[a]), B = Q(pt[b])
      h.push('<line x1="' + A.x + '" y1="' + A.y + '" x2="' + B.x + '" y2="' + B.y + '" stroke="' + col + '" stroke-width="' + w + '"' + (d ? ' stroke-dasharray="' + d + '"' : '') + '/>') }
    L('filo_alto', 'filo_basso', '#FFD008', 2, '8 6')
    if (ed.vista === 'sagittale') ['orecchio', 'spalla', 'anca', 'ginocchio', 'caviglia'].reduce(function (a, b) { L(a, b, '#fff', 3); return b })
    else {
      L('spalla_dx', 'spalla_sx', '#fff', 3); L('anca_dx', 'anca_sx', '#fff', 3)
      ;['dx', 'sx'].forEach(function (l) { L('anca_' + l, 'ginocchio_' + l, '#fff', 2); L('ginocchio_' + l, 'caviglia_' + l, '#fff', 2) })
    }
    P.PUNTI[ed.vista].forEach(function (d) {
      var q = pt[d.k]; if (!q) return
      var A = Q(q)
      h.push('<circle class="pm" data-k="' + d.k + '" cx="' + A.x + '" cy="' + A.y + '" r="22" fill="transparent"/>' +
        '<circle cx="' + A.x + '" cy="' + A.y + '" r="' + (ed.attivo === d.k ? 11 : 8) + '" fill="' + COL(d.k) + '" stroke="#000" stroke-width="2.5" pointer-events="none"/>')
    })
    svg.innerHTML = h.join('')
    $('ed-punti').innerHTML = P.PUNTI[ed.vista].map(function (d) {
      return '<div class="ed-punto"><i style="background:' + COL(d.k) + '"></i>' + esc(d.nome) + '</div>' }).join('')
    $('ed-verso-riga').innerHTML = ed.vista !== 'sagittale' ? '' :
      '<span class="ed-txt" style="align-self:center">Guarda verso:</span>' +
      '<button class="ed-btn' + (ed.verso === -1 ? ' giallo' : '') + '" data-verso="-1">← sinistra</button>' +
      '<button class="ed-btn' + (ed.verso === 1 ? ' giallo' : '') + '" data-verso="1">destra →</button>'
    var ms = P.misure(ed.vista, pt, ed.W, ed.H, ed.verso)
    $('ed-gradi').innerHTML = ms.map(function (m) { return esc(m.nome) + ': <b>' + P.numIt(m.valore) + '°</b> ' + esc(m.parola) }).join('<br>')
  }

  async function salva() {
    if (!ed || !ed.W) return
    var P = PM()
    var dati = { vista: ed.vista, verso: ed.verso, punti: ed.punti, gradi: P.misure(ed.vista, ed.punti, ed.W, ed.H, ed.verso),
      larghezza: ed.W, altezza: ed.H, origine: ed.origine, versione: P.VERSIONE }
    var btn = $('ed-salva'); btn.disabled = true
    var r
    try { r = await ed.salvaFn(dati) } catch (e) { r = { ok: false, errore: e && e.message ? e.message : String(e) } }
    btn.disabled = false
    if (!r || !r.ok) { stato('Non salvato: ' + ((r && r.errore) || 'errore sconosciuto'), 'ko'); return }
    chiudi()
    if (typeof r.dopo === 'function') r.dopo()
  }

  global.PolEditorPunti = { apri: apri, chiudi: chiudi, stato: function () { return ed } }
})(typeof window !== 'undefined' ? window : globalThis)
