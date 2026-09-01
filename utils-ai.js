/* ═══════════════════════════════════════════════════════════════════════
   utils-ai.js — ai-solo-premium-v1 (1 settembre 2026)

   Prima questo file raccontava una prova gratuita: «hai ancora N analisi
   AI gratuite». Quella prova non esiste piu': ogni chiamata all'AI e' una
   chiamata a pagamento verso Anthropic, e la paga lo studio. Adesso le
   funzioni AI sono riservate agli account Premium, e questo file dice
   soltanto quello.

   ⚠️ QUI NON C'E' NESSUNA SICUREZZA. Il divieto vero sta in
   api/_check-ai-access.js, che nega a chiunque non sia Premium. Queste
   funzioni servono solo a far vedere il messaggio giusto invece di un
   errore grezzo.

   I nomi delle funzioni NON cambiano: sono chiamati da dashboard.html,
   paziente.html, visita.html, visite.html, valutazione-posturale.html,
   diario.html e diario-sedute.html. Cambiarli vorrebbe dire toccare
   sette pagine per un motivo cosmetico.
   ═══════════════════════════════════════════════════════════════════ */

;(function () {
  var MARKER = 'ai-solo-premium-v1'

  function injectStyles() {
    if (document.getElementById('_ai-utils-style')) return
    var s = document.createElement('style')
    s.id = '_ai-utils-style'
    s.textContent = [
      '#ai-uses-banner{position:fixed;bottom:0;left:0;right:0;background:#1a1a1a;color:#fff;font-family:\'Montserrat\',sans-serif;font-size:12px;font-weight:600;text-align:center;padding:10px 16px;z-index:8000;display:none;border-top:2px solid #FFD008;letter-spacing:0.3px}',
      '#ai-uses-banner a{color:#FFD008;text-decoration:none;margin-left:8px;font-weight:700}',
      '#ai-limit-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;align-items:center;justify-content:center;padding:24px;font-family:\'Montserrat\',sans-serif}',
      '#ai-limit-modal.open{display:flex}',
      '#ai-limit-box{background:#111;border:1.5px solid #333;border-radius:20px;padding:36px 28px;max-width:360px;width:100%;text-align:center}',
      '#ai-limit-icon{font-size:40px;margin-bottom:16px}',
      '#ai-limit-title{font-size:18px;font-weight:700;color:#fff;margin-bottom:10px}',
      '#ai-limit-desc{font-size:13px;color:#aaa;line-height:1.7;margin-bottom:24px}',
      '#ai-limit-cta{width:100%;background:#FFD008;color:#000;border:none;border-radius:10px;padding:14px;font-family:\'Montserrat\',sans-serif;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:10px;display:block}',
      '#ai-limit-cta:hover{background:#e6bc00}',
      '#ai-limit-close{width:100%;background:transparent;border:1px solid #444;border-radius:10px;padding:12px;font-family:\'Montserrat\',sans-serif;font-size:13px;cursor:pointer;color:#888;display:block}'
    ].join('')
    document.head.appendChild(s)
  }

  function injectModal() {
    if (document.getElementById('ai-limit-modal')) return
    var div = document.createElement('div')
    div.id = 'ai-limit-modal'
    /* Niente template literal con ' + X + ' dentro: nella versione
       precedente il testo del modale stampava letteralmente
       «' + LIMIT + ' analisi AI gratuite». Qui si concatena e basta. */
    div.innerHTML =
      '<div id="ai-limit-box">' +
        '<div id="ai-limit-icon">🔒</div>' +
        '<div id="ai-limit-title">Funzione riservata a Premium</div>' +
        '<div id="ai-limit-desc">Le analisi con <strong style="color:#FFD008">intelligenza artificiale</strong> ' +
          '— lettura dei referti, sintesi, relazioni e analisi posturale — ' +
          'sono disponibili solo con l\'account Premium.<br><br>' +
          'Tutto il resto di Policettivo® resta a tua disposizione anche con il piano Free.</div>' +
        '<button id="ai-limit-cta" onclick="window.location.href=\'upgrade.html\'">Passa a Premium</button>' +
        '<button id="ai-limit-close" onclick="document.getElementById(\'ai-limit-modal\').classList.remove(\'open\')">Non ora</button>' +
      '</div>'
    document.body.appendChild(div)
  }

  function injectBanner() {
    if (document.getElementById('ai-uses-banner')) return
    var div = document.createElement('div')
    div.id = 'ai-uses-banner'
    document.body.appendChild(div)
  }

  function ensureDOM() {
    injectStyles()
    injectModal()
    injectBanner()
  }

  /* Il banner in cima alla pagina. Non promette piu' analisi gratuite:
     dice cosa il piano Free E' e cosa non include. */
  window.policettivoUpdateFreeBanner = function () {
    if (window.isPremium) return
    var el = document.querySelector('.premium-banner-text')
    var wrap = document.querySelector('.premium-banner')
    if (!el || !wrap) return
    el.textContent = '⭐ Stai usando Policettivo Free — le analisi con intelligenza artificiale sono riservate a Premium'
    wrap.classList.add('visible')
  }

  /* Chiamata dopo una risposta AI andata a buon fine. Per un Premium non
     deve comparire niente; per chiunque altro non ci sono piu' risposte
     andate a buon fine, quindi in pratica non passa piu' di qui. Resta
     definita perche' sette pagine la chiamano. */
  window.policettivoShowAIBanner = function () {
    if (window.isPremium) return
    window.policettivoUpdateFreeBanner()
    ensureDOM()
    var banner = document.getElementById('ai-uses-banner')
    if (!banner) return
    banner.style.background = '#1a1a1a'
    banner.innerHTML = 'Le analisi AI sono riservate agli account Premium<a href="upgrade.html">Passa a Premium →</a>'
    banner.style.display = 'block'
  }

  /* Il server ha risposto 403. */
  window.policettivoHandleAI403 = function () {
    ensureDOM()
    document.getElementById('ai-limit-modal').classList.add('open')
  }

  /* Da chiamare PRIMA di partire con una funzione AI, cosi' il free vede
     subito il messaggio invece di aspettare il giro sul server.

     ⚠️ Nel dubbio si lascia passare: se `window.isPremium` non e' ancora
     stato risolto (una pagina che non chiama policettivoCheckPremium) il
     valore e' `undefined`, e bloccare li' vorrebbe dire bloccare anche i
     Premium. Chi decide davvero e' api/_check-ai-access.js. */
  window.policettivoRichiedePremium = function () {
    if (window.isPremium !== false) return true
    window.policettivoHandleAI403()
    return false
  }

  window.policettivoAIMarker = MARKER
})()
