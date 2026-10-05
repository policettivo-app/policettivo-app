/* momento-nota-v2 (5 ott 2026) — PRIMA / DOPO CON LA DESCRIZIONE, UGUALE IN TUTTI I TEST
   «Non solo i 3 Respiri: quando clicco PRIMA devo poter scrivere com'è il paziente,
   quando clicco DOPO che cosa ho fatto (schema 2, un esercizio…)».
   La pagina mette il riquadro (#momento coi tre tasti, #momento-nota, #mn-dett,
   #mn-lbl, #mn-recenti); qui sta il comportamento, in un posto solo:
     • la descrizione compare solo con PRIMA o DOPO, una per parte;
     • i tasti pronti: «3 Respiri» + le ultime descrizioni lette dai TUOI test già
       salvati nel database. ⛔ Mai dal dispositivo: sul telefono non resta scritto
       niente che riguardi un paziente.
   Se questo file non si carica, il test funziona lo stesso: restano i tre tasti. */
;(function(){
  'use strict'
  if (window.PolMomento) return
  var $ = function(id){ return document.getElementById(id) }
  var testo = { pre: '', post: '' }, usate = { pre: [], post: [] }, chiesto = false, opz = {}
  var CSS = '.mn-box{border:2px solid #111;border-radius:16px;padding:12px 14px;margin:0 0 14px;background:#fffdf2}' +
    '.mn-tit{font-weight:800;font-size:15px;margin-bottom:8px}' +
    '.mn-chips .chip{flex:1;text-align:center;font-size:15px;padding:13px 10px;font-weight:700}' +
    '.mn-chips .chip.mn-pre.on{background:#2864dc;border-color:#2864dc;color:#fff}' +
    '.mn-chips .chip.mn-post.on{background:#FFD008;border-color:#FFD008;color:#111}' +
    '.mn-box input[type=text]{width:100%;box-sizing:border-box;padding:12px;border:1.5px solid #ddd;border-radius:10px;font-size:15px;font-family:inherit;background:#fff}' +
    '.mn-box label{display:block;font-size:13px;color:#666;margin:10px 0 6px;font-weight:600}' +
    '#mn-recenti{margin-top:8px}#mn-recenti .chip{font-size:13px;padding:7px 12px}'
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] }) }
  function momento(){
    try { var c = document.querySelector('#momento .chip.on'); var m = c ? (c.getAttribute('data-m') || '') : ''; return (m === 'pre' || m === 'post') ? m : '' } catch(e){ return '' }
  }
  function nota(){ var m = momento(); return m ? String(testo[m] || '').trim().slice(0, 200) : '' }
  function etichetta(m, n){ return (m === 'pre' || m === 'post') ? ' · ' + (m === 'pre' ? 'PRIMA' : 'DOPO') + (n ? ' · ' + n : '') : '' }
  function metti(m, t, inTesta){
    t = String(t || '').trim(); if ((m !== 'pre' && m !== 'post') || !t) return
    var i = usate[m].indexOf(t)
    if (i >= 0){ if (!inTesta) return; usate[m].splice(i, 1) }
    if (inTesta) usate[m].unshift(t); else usate[m].push(t)
    usate[m] = usate[m].slice(0, 6)
  }
  async function dalDatabase(){
    if (chiesto) return
    var sb = null
    try { sb = opz.sb ? opz.sb() : null } catch(e){}
    if (!sb || !opz.tabella) return
    chiesto = true
    try {
      var r = await sb.from(opz.tabella).select('momento,momento_nota').order('quando', { ascending: false }).limit(80)
      if (r && !r.error && r.data && r.data.forEach){ r.data.forEach(function(x){ metti(x.momento, x.momento_nota, false) }); disegna() }
    } catch(e){}
  }
  function cambiato(){ try { if (opz.alCambio) opz.alCambio() } catch(e){} }
  function disegna(){
    var d = $('mn-dett'), m = momento(); if (!d) return
    if (!m){ d.style.display = 'none'; return }
    d.style.display = ''
    $('mn-lbl').textContent = m === 'pre' ? 'PRIMA · com’è adesso (facoltativo)' : 'DOPO · che cosa hai fatto'
    $('momento-nota').placeholder = m === 'pre' ? 'es. neutro, mai provato nessun cuscino' : 'es. schema 2, 3 Respiri, esercizio…'
    $('momento-nota').value = testo[m] || ''
    dalDatabase()
    var rec = usate[m].slice()
    if (m === 'post' && rec.indexOf('3 Respiri') < 0) rec.push('3 Respiri')
    $('mn-recenti').innerHTML = rec.slice(0, 6).map(function(t){ return '<button type="button" class="chip">' + esc(t) + '</button>' }).join('')
    Array.prototype.forEach.call($('mn-recenti').querySelectorAll('.chip'), function(b){
      b.addEventListener('click', function(){ var mm = momento(); if (!mm) return; testo[mm] = b.textContent; $('momento-nota').value = b.textContent; cambiato() })
    })
  }
  function avvia(o){
    try {
      opz = o || {}
      if (!$('momento') || !$('momento-nota')) return false
      if (!$('mn-stile')){ var st = document.createElement('style'); st.id = 'mn-stile'; st.textContent = CSS; document.head.appendChild(st) }
      Array.prototype.forEach.call(document.querySelectorAll('#momento .chip'), function(c){
        c.addEventListener('click', function(){ setTimeout(function(){ try { disegna(); cambiato() } catch(e){} }, 0) })
      })
      $('momento-nota').addEventListener('input', function(){ var m = momento(); if (m) testo[m] = this.value; cambiato() })
      disegna()
      return true
    } catch(e){ return false }
  }
  window.PolMomento = {
    avvia: avvia, momento: momento, nota: nota, etichetta: etichetta,
    ricorda: function(m, t){ try { metti(m, t, true); disegna() } catch(e){} }
  }
})()
