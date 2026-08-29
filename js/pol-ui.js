/* Policettivo® — Popup brandizzati (polAlert / polConfirm)
   Sostituiscono alert()/confirm() del browser con una grafica coerente
   (giallo #FFD008, nero, Montserrat). Autonomo: inietta CSS e DOM da solo.

   Uso:
     await polAlert('Messaggio', { title:'Titolo', icon:'⚠️' });
     var ok = await polConfirm('Domanda', { title:'...', icon:'⚠️',
                 okLabel:'Sì', cancelLabel:'No', danger:true });
*/
(function () {
  if (window.polAlert && window.polConfirm) return;

  var CSS = ''
    + '.pol-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;'
    + 'z-index:99999;opacity:0;visibility:hidden;transition:opacity .15s ease;padding:20px;'
    + "font-family:'Montserrat',-apple-system,sans-serif;}"
    + '.pol-ov.open{opacity:1;visibility:visible;}'
    + '.pol-modal{background:#fff;border-radius:16px;max-width:400px;width:100%;padding:26px 24px 22px;'
    + 'box-shadow:0 18px 50px rgba(0,0,0,.28);transform:translateY(10px) scale(.98);transition:transform .18s ease;text-align:center;}'
    + '.pol-ov.open .pol-modal{transform:translateY(0) scale(1);}'
    + '.pol-ic{font-size:34px;line-height:1;margin-bottom:12px;}'
    + '.pol-title{font-size:18px;font-weight:800;color:#1a1a1a;margin-bottom:8px;}'
    + '.pol-msg{font-size:14px;line-height:1.55;color:#555;margin-bottom:20px;}'
    + '.pol-actions{display:flex;gap:10px;justify-content:center;}'
    + '.pol-btn{flex:1;border:none;border-radius:10px;padding:13px 16px;font-family:inherit;font-size:14px;'
    + 'font-weight:700;cursor:pointer;transition:filter .12s ease;}'
    + '.pol-btn:hover{filter:brightness(.95);}'
    + '.pol-btn-pri{background:#FFD008;color:#000;}'
    + '.pol-btn-pri.danger{background:#c62828;color:#fff;}'
    + '.pol-btn-sec{background:#fff;color:#555;border:1.5px solid #ddd;}'
    + '.pol-btn-sec:hover{border-color:#bbb;filter:none;}'
    + '@media(max-width:420px){.pol-actions{flex-direction:column-reverse;}}';

  function esc(s){ return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

  function ensureDom(){
    if (document.getElementById('pol-ui-overlay')) return;
    var st = document.createElement('style'); st.id = 'pol-ui-style'; st.textContent = CSS;
    document.head.appendChild(st);
    var ov = document.createElement('div'); ov.id = 'pol-ui-overlay'; ov.className = 'pol-ov';
    ov.innerHTML =
      '<div class="pol-modal" role="dialog" aria-modal="true">' +
        '<div class="pol-ic" id="pol-ic"></div>' +
        '<div class="pol-title" id="pol-title"></div>' +
        '<div class="pol-msg" id="pol-msg"></div>' +
        '<div class="pol-actions" id="pol-actions"></div>' +
      '</div>';
    document.body.appendChild(ov);
  }

  function open(opts){
    ensureDom();
    return new Promise(function (resolve){
      var ov = document.getElementById('pol-ui-overlay');
      var ic = document.getElementById('pol-ic');
      var ti = document.getElementById('pol-title');
      ic.textContent = opts.icon || '';
      ic.style.display = opts.icon ? '' : 'none';
      ti.textContent = opts.title || '';
      ti.style.display = opts.title ? '' : 'none';
      document.getElementById('pol-msg').innerHTML = esc(opts.message || '');
      var act = document.getElementById('pol-actions'); act.innerHTML = '';

      function close(val){ ov.classList.remove('open'); setTimeout(function(){ resolve(val); }, 130); }

      if (opts.type === 'confirm'){
        var bC = document.createElement('button');
        bC.className = 'pol-btn pol-btn-sec'; bC.textContent = opts.cancelLabel || 'Annulla';
        bC.onclick = function(){ close(false); };
        var bO = document.createElement('button');
        bO.className = 'pol-btn pol-btn-pri' + (opts.danger ? ' danger' : '');
        bO.textContent = opts.okLabel || 'OK';
        bO.onclick = function(){ close(true); };
        act.appendChild(bC); act.appendChild(bO);
      } else {
        var bK = document.createElement('button');
        bK.className = 'pol-btn pol-btn-pri'; bK.textContent = opts.okLabel || 'OK';
        bK.onclick = function(){ close(true); };
        act.appendChild(bK);
      }
      ov.classList.add('open');
    });
  }

  window.polAlert = function (message, opts){
    opts = opts || {};
    return open({ type:'alert', message:message, title:opts.title, icon:opts.icon, okLabel:opts.okLabel });
  };
  window.polConfirm = function (message, opts){
    opts = opts || {};
    return open({ type:'confirm', message:message, title:opts.title, icon:opts.icon,
      okLabel:opts.okLabel, cancelLabel:opts.cancelLabel, danger:opts.danger });
  };
})();

/* pol-lock-inject-v1 — vedi utils-premium.js: stesso aggancio, per le pagine
   che includono pol-ui.js invece di utils-premium.js. Il ';' iniziale protegge
   dall'incollamento con la riga precedente. */
;(function () {
  if (window.__polLockInject) return;
  window.__polLockInject = true;
  var s = document.createElement('script');
  s.src = 'js/pol-lock.js';
  s.async = true;
  (document.head || document.documentElement).appendChild(s);
})();
