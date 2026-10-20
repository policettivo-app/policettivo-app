/* ═══════════════════════════════════════════════════════════════════════
   js/ai-correggi.js — ai-correggi-v1 (20 ottobre 2026)

   Pulsante «✨ Correggi e sintetizza con AI» sotto un testo per il paziente
   (descrizione del video personalizzato, nota dell'esercizio nella scheda).
   Corregge un testo scritto di fretta o dettato e lo rende chiaro e breve.

   Usa /api/ai-analisi (già esistente, già riservato ai Premium in
   api/_check-ai-access.js): NESSUN file nuovo in api/ (limite 12/12).
   Il controllo nella pagina serve solo a mostrare il messaggio giusto:
   la difesa vera resta sul server.

   Dopo la correzione compare «↩ Annulla» che rimette il testo originale.
   Uso:  polCorreggiTesto('id-textarea', bottone, clientSupabase)
   ═══════════════════════════════════════════════════════════════════ */
;(function () {
  var originali = {}

  function prompt(testo) {
    return 'Sei un fisioterapista che scrive le istruzioni di un esercizio per il suo paziente.\n' +
      'Correggi e riscrivi il testo qui sotto: è stato scritto di fretta o dettato al microfono.\n' +
      'Regole:\n' +
      '- italiano corretto, frasi brevi e chiare, dai del tu al paziente\n' +
      '- più sintetico possibile, senza perdere nessuna indicazione\n' +
      '- NON aggiungere indicazioni, numeri, ripetizioni, tempi o avvertenze che nel testo non ci sono\n' +
      '- se ci sono più passaggi, mettili uno per riga con un trattino\n' +
      '- niente titoli, niente grassetto, niente commenti: rispondi SOLO con il testo corretto\n\n' +
      'TESTO:\n' + testo
  }

  function bottoneAnnulla(ta, btn) {
    var vecchio = btn.parentNode.querySelector('.ai-annulla[data-per="' + ta.id + '"]')
    if (vecchio) vecchio.remove()
    var a = document.createElement('button')
    a.type = 'button'
    a.className = 'ai-annulla'
    a.setAttribute('data-per', ta.id)
    a.textContent = '↩ Annulla'
    a.style.cssText = 'margin-left:8px;background:transparent;border:1px solid #999;color:#666;padding:8px 12px;border-radius:8px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer'
    a.onclick = function () {
      if (originali[ta.id] != null) ta.value = originali[ta.id]
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      a.remove()
    }
    btn.insertAdjacentElement('afterend', a)
  }

  window.polCorreggiTesto = async function (idTextarea, btn, sb) {
    var ta = document.getElementById(idTextarea)
    if (!ta) return
    var testo = (ta.value || '').trim()
    if (testo.length < 3) { alert('Scrivi o detta prima il testo, poi lo correggo.'); ta.focus(); return }
    if (window.isPremium === false) {
      if (window.policettivoHandleAI403) window.policettivoHandleAI403()
      else alert('Funzione riservata agli account Premium.')
      return
    }
    var etichetta = btn.textContent
    btn.disabled = true
    btn.textContent = '⏳ Sto correggendo...'
    try {
      var s = await sb.auth.getSession()
      var tok = (s && s.data && s.data.session && s.data.session.access_token) || ''
      var r = await fetch('/api/ai-analisi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ prompt: prompt(testo), max_tokens: 600 })
      })
      if (r.status === 403) {
        if (window.policettivoHandleAI403) window.policettivoHandleAI403()
        else alert('Funzione riservata agli account Premium.')
        return
      }
      var data = await r.json().catch(function () { return {} })
      if (!r.ok || data.error) { alert('Correzione non riuscita: ' + (data.error || ('errore ' + r.status))); return }
      var nuovo = String(data.testo || '').trim()
      if (!nuovo) { alert('Correzione non riuscita: risposta vuota. Il tuo testo è rimasto com\'era.'); return }
      originali[ta.id] = ta.value
      ta.value = nuovo
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      bottoneAnnulla(ta, btn)
    } catch (e) {
      alert('Correzione non riuscita: ' + (e && e.message || e) + '. Il tuo testo è rimasto com\'era.')
    } finally {
      btn.disabled = false
      btn.textContent = etichetta
    }
  }

})()
