// AI UX utilities: banner + modal per limite analisi FREE

;(function () {
  const LIMIT = 15

  function injectStyles() {
    if (document.getElementById('_ai-utils-style')) return
    const s = document.createElement('style')
    s.id = '_ai-utils-style'
    s.textContent = `
      #ai-uses-banner{position:fixed;bottom:0;left:0;right:0;background:#1a1a1a;color:#fff;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:600;text-align:center;padding:10px 16px;z-index:8000;display:none;border-top:2px solid #FFD008;letter-spacing:0.3px}
      #ai-uses-banner a{color:#FFD008;text-decoration:none;margin-left:8px;font-weight:700}
      #ai-limit-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;align-items:center;justify-content:center;padding:24px;font-family:'Montserrat',sans-serif}
      #ai-limit-modal.open{display:flex}
      #ai-limit-box{background:#111;border:1.5px solid #333;border-radius:20px;padding:36px 28px;max-width:360px;width:100%;text-align:center}
      #ai-limit-icon{font-size:40px;margin-bottom:16px}
      #ai-limit-title{font-size:18px;font-weight:700;color:#fff;margin-bottom:10px}
      #ai-limit-desc{font-size:13px;color:#aaa;line-height:1.7;margin-bottom:24px}
      #ai-limit-cta{width:100%;background:#FFD008;color:#000;border:none;border-radius:10px;padding:14px;font-family:'Montserrat',sans-serif;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:10px;display:block}
      #ai-limit-cta:hover{background:#e6bc00}
      #ai-limit-close{width:100%;background:transparent;border:1px solid #444;border-radius:10px;padding:12px;font-family:'Montserrat',sans-serif;font-size:13px;cursor:pointer;color:#888;display:block}
    `
    document.head.appendChild(s)
  }

  function injectModal() {
    if (document.getElementById('ai-limit-modal')) return
    const div = document.createElement('div')
    div.id = 'ai-limit-modal'
    div.innerHTML = `
      <div id="ai-limit-box">
        <div id="ai-limit-icon">🤖</div>
        <div id="ai-limit-title">Analisi AI esaurite</div>
        <div id="ai-limit-desc">Hai usato tutte le <strong style="color:#FFD008">' + LIMIT + ' analisi AI gratuite</strong>.<br>Passa a Premium per analisi illimitate su postura, referti e sedute.</div>
        <button id="ai-limit-cta" onclick="window.location.href='upgrade.html'">Scopri Premium</button>
        <button id="ai-limit-close" onclick="document.getElementById('ai-limit-modal').classList.remove('open')">Non ora</button>
      </div>
    `
    document.body.appendChild(div)
  }

  function injectBanner() {
    if (document.getElementById('ai-uses-banner')) return
    const div = document.createElement('div')
    div.id = 'ai-uses-banner'
    document.body.appendChild(div)
  }

  function ensureDOM() {
    injectStyles()
    injectModal()
    injectBanner()
  }

  window.policettivoUpdateFreeBanner = function (aiUses) {
    if (window.isPremium) return
    const used = aiUses || 0
    const remaining = Math.max(0, LIMIT - used)
    const el = document.querySelector('.premium-banner-text')
    const wrap = document.querySelector('.premium-banner')
    if (!el || !wrap) return
    if (remaining === 0) {
      // AI esaurita: nasconde il top banner, il navbar badge gestisce l'indicazione
      wrap.classList.remove('visible')
      return
    }
    if (used === 0) {
      el.textContent = '⭐ Stai usando Policettivo Free — Hai ancora ' + LIMIT + ' analisi AI gratuite per provare il sistema Policettivo®'
    } else {
      el.textContent = '⭐ Hai usato ' + used + '/' + LIMIT + ' analisi AI gratuite — Continua a testare il sistema Policettivo®'
    }
    wrap.classList.add('visible')
  }

  window.policettivoShowAIBanner = function (aiUses) {
    if (window.isPremium) return
    window.policettivoUpdateFreeBanner(aiUses)
    ensureDOM()
    const remaining = Math.max(0, LIMIT - (aiUses || 0))
    const banner = document.getElementById('ai-uses-banner')
    if (!banner) return
    if (remaining === 0) {
      banner.style.background = '#1a1a1a'
      banner.innerHTML = 'Analisi AI gratuite esaurite — <a href="upgrade.html">Passa a Premium</a> per analisi illimitate'
    } else if (remaining <= 3) {
      banner.style.background = '#c62828'
      banner.innerHTML = '\u26A0\uFE0F Ultime <strong>' + remaining + '</strong> analisi AI gratuite — <a href="upgrade.html" style="color:#fff;text-decoration:underline">Passa a Premium</a> per non rimanere senza'
    } else {
      banner.style.background = '#1a1a1a'
      banner.innerHTML = 'Analisi AI gratuite rimaste: <strong style="color:#FFD008">' + remaining + ' / ' + LIMIT + '</strong><a href="upgrade.html">Scopri Premium →</a>'
    }
    banner.style.display = 'block'
  }

  window.policettivoHandleAI403 = function () {
    ensureDOM()
    document.getElementById('ai-limit-modal').classList.add('open')
  }
})()
