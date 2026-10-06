/* nav-v1 (28 set 2026) — IL PULSANTE DI NAVIGAZIONE, UGUALE SU TUTTE LE PAGINE
   «dal cellulare a volte è difficile vedere come tornare indietro o alla home».
   Una pillola nera in basso a sinistra, sempre nello stesso posto:
       ‹ Indietro   ·   ⌂ Home
   • Indietro = la pagina di prima dell'app; se non c'è (pagina aperta da un
     link o da una notifica) va alla scheda del paziente (?pid=) o alla home.
   • Home = dashboard.html.
   Si vede SOLO al professionista entrato nell'app. Non si vede:
     – al paziente (pagine aperte col suo link ?token=, senza &pro=1);
     – sulla TV e dentro le finestre incorporate (iframe, ?tv=1);
     – in stampa e nei PDF;
     – mentre si scrive (la tastiera del telefono la coprirebbe);
     – durante un test (schermata di partenza, schermo bloccato).
   Si alza da sola sopra le barre fisse in fondo alla pagina.
   Solo navigazione: non legge e non scrive dati.

   nav-v2 (4 ott 2026) — PIÙ DISCRETO. «A volte nasconde scritte o testi… può
   sembrare invasivo». Stesso posto, stessi colori, stesse regole, ma:
   • sul telefono solo le due icone (‹ e ⌂): è larga meno della metà;
   • mentre scorri in giù per leggere si rimpicciolisce e diventa trasparente;
     torna piena appena scorri in su, in cima alla pagina, o la tocchi. */
;(function(){
  'use strict'
  if (window.__polNav) return
  window.__polNav = true
  try {
    if (window.self !== window.top) return
    var Q = new URLSearchParams(location.search)
    if (Q.get('tv') === '1') return
    if (Q.get('token') && Q.get('pro') !== '1') return
    var dentro = false
    for (var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i) || ''
      if (/^sb-.*-auth-token$/.test(k)){ dentro = true; break }
    }
    if (!dentro) return
  } catch(e){ return }

  var CSS = '' +
    '.pn-pil{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:calc(max(12px,env(safe-area-inset-bottom)) + var(--pn-su,0px));' +
    'z-index:950;display:flex;align-items:stretch;background:#111;border-radius:999px;box-shadow:0 6px 22px rgba(0,0,0,.28),0 0 0 1.5px #FFD008;' +
    'font-family:Montserrat,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow:hidden;transition:opacity .25s,transform .25s;transform-origin:left bottom}' +
    '.pn-pil.riposo{opacity:.4;transform:scale(.78);box-shadow:0 2px 8px rgba(0,0,0,.18),0 0 0 1.5px #FFD008}' +
    '.pn-pil.riposo:hover{opacity:1;transform:none}' +
    '.pn-pil.via{opacity:0;transform:translateY(12px);pointer-events:none}' +
    '.pn-pil a{display:flex;align-items:center;gap:7px;color:#fff;text-decoration:none;font-size:15px;font-weight:800;' +
    'padding:0 16px;min-height:48px;-webkit-tap-highlight-color:transparent;white-space:nowrap}' +
    '.pn-pil a:active{background:#2a2a2a}' +
    '.pn-pil a i{font-style:normal;color:#FFD008;font-size:22px;line-height:1;font-weight:900}' +
    '.pn-pil .pn-sep{width:1px;background:#333;margin:10px 0}' +
    '.pn-spazio{height:76px}' +
    '@media (max-width:700px){.pn-pil a{padding:0 15px;min-height:44px;gap:0}' +
    '.pn-pil .pn-t{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
    '.pn-spazio{height:64px}}' +
    '@media print{.pn-pil,.pn-spazio{display:none!important}}'

  function metti(){
    if (document.getElementById('pn-pil')) return
    var st = document.createElement('style'); st.id = 'pn-stile'; st.textContent = CSS; document.head.appendChild(st)
    var Q = new URLSearchParams(location.search)
    var pid = Q.get('pid') || ''
    var riserva = /^[0-9a-f-]{36}$/i.test(pid) ? 'paziente.html?id=' + pid : 'dashboard.html'
    var d = document.createElement('nav'); d.className = 'pn-pil'; d.id = 'pn-pil'
    d.setAttribute('aria-label', 'Navigazione')
    d.innerHTML = '<a href="' + riserva + '" id="pn-indietro" aria-label="Torna indietro"><i>‹</i><span class="pn-t">Indietro</span></a>' +
      '<span class="pn-sep"></span>' +
      '<a href="dashboard.html" id="pn-home" aria-label="Vai alla home"><i>⌂</i><span class="pn-t">Home</span></a>'
    document.body.appendChild(d)
    var sp = document.createElement('div'); sp.className = 'pn-spazio'; sp.setAttribute('aria-hidden', 'true')
    document.body.appendChild(sp)
    document.getElementById('pn-indietro').addEventListener('click', function(ev){
      var stesso = false
      try { stesso = !!document.referrer && new URL(document.referrer).origin === location.origin } catch(e){}
      if (stesso && history.length > 1){ ev.preventDefault(); history.back() }
    })

    // ── resta visibile ma fuori dai piedi ──
    var fissi = [], giro = 0
    function cercaFissi(){
      fissi = []
      var tutti = document.body.getElementsByTagName('*')
      for (var i = 0; i < tutti.length; i++){
        var e = tutti[i]
        if (e === d || d.contains(e)) continue
        var p = getComputedStyle(e).position
        if (p === 'fixed' || p === 'sticky') fissi.push(e)
      }
    }
    function sistema(){
      /* telefono-1 (6 ott 2026) — le barre fisse si cercano anche nei primi giri.
         Prima si cercavano al giro 0 e poi ogni 20 (14 secondi): la barra in basso
         di console-nav.js viene disegnata un attimo DOPO il giro 0, e per 14 secondi
         la pillola restava nascosta dietro. Misurato su visite, monitoraggio,
         comparazione: coperta a 1,5 · 5 · 10 · 13 s, visibile a 15,5 s. */
      if (giro < 8 || (giro % 20) === 0) cercaFissi()
      giro++
      var h = window.innerHeight, su = 0
      /* telefono-2 (6 ott 2026) — BARRE UNA SOPRA L'ALTRA. In assegna-protocollo il
         pulsante giallo «Assegna protocollo» sta fisso SOPRA la barra in basso: la
         pillola si alzava sopra la barra e finiva sul pulsante. Ora si ripassa finché
         l'altezza cresce: conta anche la barra che poggia su una già contata. */
      var cresce = true, passate = 0
      while (cresce && passate++ < 4){
        cresce = false
        for (var i = 0; i < fissi.length; i++){
          var e = fissi[i]
          if (!e.isConnected) continue
          var r = e.getBoundingClientRect()
          // una barra in fondo: tocca il bordo basso (o ci galleggia sopra, come il
          // grande PARTI dei test — atr-v1: prima la pillola ci finiva sopra),
          // sta nella metà bassa, larga
          if (r.width > window.innerWidth * 0.4 && r.height > 0 && r.height < h * 0.45 &&
              r.bottom >= h - 48 - su && r.top > h * 0.5 && getComputedStyle(e).visibility !== 'hidden' &&
              getComputedStyle(e).display !== 'none' && Number(getComputedStyle(e).opacity) > 0.05){
            var n = Math.round(h - r.top)
            if (n > su){ su = n; cresce = true }
          }
        }
      }
      d.style.setProperty('--pn-su', su + 'px')
      var a = document.activeElement
      var scrive = a && (a.tagName === 'TEXTAREA' || a.isContentEditable ||
        (a.tagName === 'INPUT' && !/^(button|submit|checkbox|radio|range|file|color|reset|image)$/i.test(a.type || '')))
      var occupato = !!document.querySelector('.pp-ov.on, .guard.on, .pol-ov.open, [data-nav-nascondi]')
      d.classList.toggle('via', !!(scrive || occupato))
    }
    // nav-v2 · a riposo mentre si scorre in giù; piena scorrendo in su, in cima, o al tocco
    var ultimoY = window.pageYOffset || 0
    window.addEventListener('scroll', function(){
      try {
        var y = window.pageYOffset || 0
        if (y < 40 || y < ultimoY - 6) d.classList.remove('riposo')
        else if (y > ultimoY + 6) d.classList.add('riposo')
        ultimoY = y
      } catch(e){}
    }, { passive: true })
    d.addEventListener('touchstart', function(){ d.classList.remove('riposo') }, { passive: true })
    sistema()
    // telefono-1 · un giro subito dopo che le altre barre si sono disegnate, senza aspettare 0,7 s
    setTimeout(function(){ try { sistema() } catch(e){} }, 60)
    window.addEventListener('load', function(){ try { sistema() } catch(e){} })
    setInterval(sistema, 700)
    window.addEventListener('resize', sistema)
    document.addEventListener('focusin', sistema)
    document.addEventListener('focusout', function(){ setTimeout(sistema, 50) })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', metti)
  else metti()
})()
