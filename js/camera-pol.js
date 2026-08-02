/* ============================================================
   POLICETTIVO — Fotocamera unificata (polCamera)
   Usata da: paziente.html, visita.html, valutazione-posturale.html
   - Bolla a 2 assi (rotazione γ + inclinazione avanti/indietro β)
   - 2 mirini fissi: basso → croce della dima a terra, alto → riferimento
     verticale sulla porta. Bolla verde + mirini centrati = scatti ripetibili.
   API:
     polCamera.open({ label, hint, showCross, showTargets, onShot(rawDataUrl), onGallery() }) → Promise<bool>
     polCamera.close()
   ============================================================ */
(function (w) {
  'use strict';

  var stream = null, orientHandler = null, opts = null;
  var TOL = 5; // gradi di tolleranza per asse (morbida: deve essere raggiungibile a mano libera)
  var sRoll = 0, sPitch = 0; // valori smorzati (mirino lento e stabile)

  function buildDom() {
    if (document.getElementById('pol-cam-modal')) return;
    var d = document.createElement('div');
    d.id = 'pol-cam-modal';
    d.innerHTML =
      '<style>' +
      '#pol-cam-modal{display:none;position:fixed;inset:0;z-index:3000;background:#000;font-family:Montserrat,sans-serif}' +
      '#pol-cam-modal.open{display:block}' +
      '#pol-cam-video{width:100%;height:100%;object-fit:cover;display:block}' +
      '.pcm-topbar{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;z-index:6;background:linear-gradient(rgba(0,0,0,.55),transparent)}' +
      '.pcm-label{color:#FFD008;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;text-shadow:0 1px 3px #000}' +
      '.pcm-close{background:rgba(0,0,0,.55);color:#fff;border:none;width:38px;height:38px;border-radius:50%;font-size:18px;cursor:pointer}' +
      '.pcm-cross-v{position:absolute;left:50%;top:0;bottom:0;width:2px;margin-left:-1px;background:rgba(255,208,8,.85);z-index:3;pointer-events:none}' +
      '.pcm-cross-h{position:absolute;top:50%;left:0;right:0;height:2px;margin-top:-1px;background:rgba(255,208,8,.55);z-index:3;pointer-events:none}' +
      '.pcm-target{position:absolute;width:66px;height:66px;margin:-33px 0 0 -33px;z-index:4;pointer-events:none;filter:drop-shadow(0 0 3px rgba(0,0,0,.7))}' +
      '.pcm-target:before,.pcm-target:after{content:"";position:absolute;background:rgba(255,255,255,.95)}' +
      '.pcm-target:before{left:50%;top:0;bottom:0;width:3px;margin-left:-1.5px}' +
      '.pcm-target:after{top:50%;left:0;right:0;height:3px;margin-top:-1.5px}' +
      '.pcm-target .pcm-tag{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:6px;font-size:10px;font-weight:700;color:#fff;background:rgba(0,0,0,.6);padding:2px 8px;border-radius:8px;white-space:nowrap}' +
      '#pcm-target-top{left:50%;top:16%}' +
      '#pcm-target-bottom{left:50%;top:82%}' +
      '#pcm-target-bottom:before,#pcm-target-bottom:after{background:rgba(255,208,8,.95)}' +
      '#pcm-target-bottom .pcm-tag{top:auto;bottom:100%;margin-bottom:6px;margin-top:0}' +
      '#pcm-dima-line{position:absolute;left:0;right:0;top:82%;height:2px;margin-top:-1px;background:rgba(255,208,8,.75);z-index:3;pointer-events:none}' +
      '#pcm-veil{position:absolute;inset:0;background:#00C853;opacity:0;transition:opacity .25s;z-index:2;pointer-events:none}' +
      '#pcm-reticle{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;color:#e53935;border:3px solid currentColor;border-radius:50%;z-index:5;pointer-events:none;transition:transform .22s ease-out,color .15s;filter:drop-shadow(0 0 4px rgba(0,0,0,.6))}' +
      '.pcm-ret-h{position:absolute;top:50%;left:-18px;right:-18px;height:2.5px;margin-top:-1.25px;background:currentColor}' +
      '.pcm-ret-v{position:absolute;left:50%;top:-18px;bottom:-18px;width:2.5px;margin-left:-1.25px;background:currentColor}' +
      '#pcm-stato{position:absolute;top:60%;left:50%;transform:translateX(-50%);z-index:5;font-size:20px;font-weight:800;color:#00C853;text-shadow:0 1px 4px #000;pointer-events:none}' +
      '.pcm-arrow{position:absolute;z-index:5;font-size:36px;color:#FFD008;text-shadow:0 1px 5px #000;pointer-events:none;display:none;animation:pcmBlink .9s infinite}' +
      '@keyframes pcmBlink{0%,100%{opacity:.3}50%{opacity:1}}' +
      '#pcm-arr-left{left:8px;top:50%;transform:translateY(-50%)}' +
      '#pcm-arr-right{right:8px;top:50%;transform:translateY(-50%)}' +
      '#pcm-arr-up{top:120px;left:50%;transform:translateX(-50%)}' +
      '#pcm-arr-down{bottom:132px;left:50%;transform:translateX(-50%)}' +
      '#pcm-hint{position:absolute;top:62px;left:50%;transform:translateX(-50%);z-index:5;font-size:13px;font-weight:600;color:#fff;background:rgba(0,0,0,.6);padding:6px 14px;border-radius:16px;white-space:nowrap}' +
      '#pcm-debug{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:5;font-size:11px;color:rgba(255,255,255,.75);font-family:monospace}' +
      '#pcm-ios-btn{display:none;position:absolute;top:104px;left:50%;transform:translateX(-50%);z-index:7;background:#FFD008;color:#000;border:none;padding:10px 18px;border-radius:10px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer}' +
      '.pcm-bottombar{position:absolute;bottom:0;left:0;right:0;height:120px;z-index:6;background:linear-gradient(transparent,rgba(0,0,0,.65))}' +
      '#pcm-shutter{position:absolute;left:50%;bottom:26px;transform:translateX(-50%)}' +
      '#pcm-gallery{position:absolute;left:16px;bottom:42px}' +
      '#pcm-shutter{width:72px;height:72px;border-radius:50%;background:#FFD008;border:5px solid #000;cursor:pointer;transition:border-color .15s,box-shadow .15s}' +
      '#pcm-shutter.ready{border-color:#00C853;box-shadow:0 0 16px rgba(0,200,83,.6)}' +
      '#pcm-gallery{background:rgba(0,0,0,.55);color:#fff;border:1.5px solid rgba(255,255,255,.5);padding:10px 16px;border-radius:10px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer}' +
      '</style>' +
      '<video id="pol-cam-video" autoplay playsinline muted></video>' +
      '<div id="pcm-veil"></div>' +
      '<div id="pcm-dima-line"></div>' +
      '<div class="pcm-topbar"><span class="pcm-label" id="pcm-label"></span><button class="pcm-close" onclick="polCamera.close()">✕</button></div>' +
      '<div class="pcm-cross-v" id="pcm-cross-v"></div>' +
      '<div class="pcm-cross-h" id="pcm-cross-h"></div>' +
      '<div class="pcm-target" id="pcm-target-top"><span class="pcm-tag">riferimento superiore</span></div>' +
      '<div class="pcm-target" id="pcm-target-bottom"><span class="pcm-tag">riferimento inferiore</span></div>' +
      '<div id="pcm-reticle"><div class="pcm-ret-h"></div><div class="pcm-ret-v"></div></div>' +
      '<div id="pcm-stato"></div>' +
      '<div class="pcm-arrow" id="pcm-arr-left">◀</div>' +
      '<div class="pcm-arrow" id="pcm-arr-right">▶</div>' +
      '<div class="pcm-arrow" id="pcm-arr-up">▲</div>' +
      '<div class="pcm-arrow" id="pcm-arr-down">▼</div>' +
      '<div id="pcm-hint"></div>' +
      '<div id="pcm-debug"></div>' +
      '<button id="pcm-ios-btn">🎯 Abilita livella</button>' +
      '<div class="pcm-bottombar">' +
        '<button id="pcm-gallery" onclick="polCamera._gallery()">📁 Galleria</button>' +
        '<button id="pcm-shutter" onclick="polCamera._shot()" aria-label="Scatta"></button>' +
      '</div>';
    document.body.appendChild(d);
  }

  function setLevelUI(roll, pitch) {
    var rollOk = Math.abs(roll) <= TOL;
    var pitchOk = Math.abs(pitch) <= TOL;
    var ok = rollOk && pitchOk;
    var ret = document.getElementById('pcm-reticle');
    var stato = document.getElementById('pcm-stato');
    var shutter = document.getElementById('pcm-shutter');
    // Mirino "da aereo": scappa dal centro se il telefono non è dritto.
    // destra/sinistra = rotazione (γ) · su/giù = inclinazione avanti-indietro (β)
    // Dentro la tolleranza → si AGGANCIA al centro (calamita).
    var x = ok ? 0 : Math.max(-120, Math.min(120, roll * 3.5));
    var y = ok ? 0 : Math.max(-120, Math.min(120, pitch * 3.5));
    ret.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    ret.style.color = ok ? '#00C853' : '#e53935';
    stato.textContent = ok ? '✓ PRONTO' : '';
    shutter.classList.toggle('ready', ok);
    // Frecce guida sui bordi: si accende quella verso cui portare il mirino
    document.getElementById('pcm-arr-left').style.display = (!ok && roll > TOL) ? 'block' : 'none';
    document.getElementById('pcm-arr-right').style.display = (!ok && roll < -TOL) ? 'block' : 'none';
    document.getElementById('pcm-arr-up').style.display = (!ok && pitch > TOL) ? 'block' : 'none';
    document.getElementById('pcm-arr-down').style.display = (!ok && pitch < -TOL) ? 'block' : 'none';
    var veil = document.getElementById('pcm-veil');
    if (veil) veil.style.opacity = ok ? 0.13 : 0;
    document.getElementById('pcm-debug').textContent = 'γ ' + roll.toFixed(1) + '° · β ' + pitch.toFixed(1) + '°';
  }

  function attachOrient() {
    if (orientHandler) return;
    sRoll = 0; sPitch = 0;
    orientHandler = function (e) {
      var roll = e.gamma != null ? e.gamma : 0;          // rotazione (portrait)
      var beta = e.beta != null ? e.beta : 90;
      var pitch = beta - 90;                              // 0 = telefono verticale
      // smorzamento forte: il mirino si muove piano, niente tremolii casuali
      sRoll += (roll - sRoll) * 0.12;
      sPitch += (pitch - sPitch) * 0.12;
      setLevelUI(Math.round(sRoll * 10) / 10, Math.round(sPitch * 10) / 10);
    };
    window.addEventListener('deviceorientation', orientHandler, true);
  }

  function initLivella() {
    var needsPerm = (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function');
    var btn = document.getElementById('pcm-ios-btn');
    if (!needsPerm) { btn.style.display = 'none'; attachOrient(); return; }
    var mostraBottone = function () {
      btn.style.display = 'block';
      btn.textContent = '🎯 Abilita livella';
      btn.onclick = function () {
        DeviceOrientationEvent.requestPermission().then(function (perm) {
          if (perm === 'granted') { btn.style.display = 'none'; attachOrient(); }
          else btn.textContent = 'Permesso negato';
        }).catch(function (err) { btn.textContent = 'Errore livella'; console.warn(err); });
      };
    };
    // Prova ad attivarla DA SOLA (se il permesso è già stato dato in questa sessione
    // il popup non compare). Solo se iOS pretende il tocco, mostra il bottone.
    try {
      DeviceOrientationEvent.requestPermission().then(function (perm) {
        if (perm === 'granted') { btn.style.display = 'none'; attachOrient(); }
        else mostraBottone();
      }).catch(mostraBottone);
    } catch (e) { mostraBottone(); }
  }

  w.polCamera = {
    open: async function (o) {
      opts = o || {};
      buildDom();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false
        });
      } catch (e) { return false; }
      document.getElementById('pol-cam-video').srcObject = stream;
      document.getElementById('pcm-label').textContent = opts.label || '';
      document.getElementById('pcm-hint').textContent = opts.hint || 'Centra il paziente · distanza 2,5 m';
      var showCross = opts.showCross !== false;
      var showTargets = opts.showTargets !== false;
      document.getElementById('pcm-cross-v').style.display = showCross ? '' : 'none';
      document.getElementById('pcm-cross-h').style.display = showCross ? '' : 'none';
      document.getElementById('pcm-target-top').style.display = showTargets ? '' : 'none';
      document.getElementById('pcm-target-bottom').style.display = showTargets ? '' : 'none';
      document.getElementById('pcm-dima-line').style.display = showTargets ? '' : 'none';
      document.getElementById('pcm-veil').style.opacity = 0;
      document.getElementById('pcm-gallery').style.display = (typeof opts.onGallery === 'function') ? '' : 'none';
      document.getElementById('pol-cam-modal').classList.add('open');
      initLivella();
      return true;
    },

    close: function () {
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      if (orientHandler) { window.removeEventListener('deviceorientation', orientHandler, true); orientHandler = null; }
      var m = document.getElementById('pol-cam-modal');
      if (m) m.classList.remove('open');
      var sh = document.getElementById('pcm-shutter');
      if (sh) sh.classList.remove('ready');
    },

    _shot: function () {
      var video = document.getElementById('pol-cam-video');
      if (!video || !video.videoWidth) return;
      var c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      var cb = opts && opts.onShot;
      var raw = c.toDataURL('image/jpeg', 0.95);
      this.close();
      if (typeof cb === 'function') cb(raw);
    },

    _gallery: function () {
      var cb = opts && opts.onGallery;
      this.close();
      if (typeof cb === 'function') cb();
    }
  };
})(window);
