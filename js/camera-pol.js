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
  var TOL = 4; // gradi di tolleranza per asse (morbida: deve essere raggiungibile a mano libera)

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
      '.pcm-target{position:absolute;width:58px;height:58px;margin:-29px 0 0 -29px;border:3px solid rgba(255,255,255,.95);border-radius:50%;z-index:4;pointer-events:none;box-shadow:0 0 6px rgba(0,0,0,.6)}' +
      '.pcm-target:before,.pcm-target:after{content:"";position:absolute;background:rgba(255,255,255,.95)}' +
      '.pcm-target:before{left:50%;top:8px;bottom:8px;width:2px;margin-left:-1px}' +
      '.pcm-target:after{top:50%;left:8px;right:8px;height:2px;margin-top:-1px}' +
      '.pcm-target .pcm-tag{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:6px;font-size:10px;font-weight:700;color:#fff;background:rgba(0,0,0,.6);padding:2px 8px;border-radius:8px;white-space:nowrap}' +
      '#pcm-target-top{left:50%;top:16%}' +
      '#pcm-target-bottom{left:50%;top:82%;border-color:rgba(255,208,8,.95)}' +
      '#pcm-target-bottom:before,#pcm-target-bottom:after{background:rgba(255,208,8,.95)}' +
      '#pcm-target-bottom .pcm-tag{top:auto;bottom:100%;margin-bottom:6px;margin-top:0}' +
      '#pcm-dima-line{position:absolute;left:0;right:0;top:82%;height:2px;margin-top:-1px;background:rgba(255,208,8,.75);z-index:3;pointer-events:none}' +
      '#pcm-veil{position:absolute;inset:0;background:#00C853;opacity:0;transition:opacity .25s;z-index:2;pointer-events:none}' +
      '.pcm-roll-line{position:absolute;left:12%;right:12%;top:50%;height:3px;margin-top:-1.5px;background:#e53935;z-index:4;pointer-events:none;transition:transform .07s linear;box-shadow:0 0 8px rgba(229,57,53,.7)}' +
      '.pcm-pitch-rail{position:absolute;right:14px;top:30%;bottom:30%;width:6px;border-radius:3px;background:rgba(255,255,255,.25);z-index:4;pointer-events:none}' +
      '.pcm-pitch-rail:after{content:"";position:absolute;top:50%;left:-5px;right:-5px;height:2px;margin-top:-1px;background:rgba(255,255,255,.8)}' +
      '#pcm-pitch-dot{position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#e53935;z-index:5;transition:top .07s linear;box-shadow:0 0 8px rgba(0,0,0,.6)}' +
      '#pcm-stato{position:absolute;top:56%;left:50%;transform:translateX(-50%);z-index:5;font-size:20px;font-weight:800;color:#e53935;text-shadow:0 1px 4px #000;pointer-events:none}' +
      '#pcm-hint{position:absolute;top:62px;left:50%;transform:translateX(-50%);z-index:5;font-size:13px;font-weight:600;color:#fff;background:rgba(0,0,0,.6);padding:6px 14px;border-radius:16px;white-space:nowrap}' +
      '#pcm-debug{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:5;font-size:11px;color:rgba(255,255,255,.75);font-family:monospace}' +
      '#pcm-ios-btn{display:none;position:absolute;top:104px;left:50%;transform:translateX(-50%);z-index:7;background:#FFD008;color:#000;border:none;padding:10px 18px;border-radius:10px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer}' +
      '.pcm-bottombar{position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:34px;padding:18px 0 26px;z-index:6;background:linear-gradient(transparent,rgba(0,0,0,.65))}' +
      '#pcm-shutter{width:72px;height:72px;border-radius:50%;background:#fff;border:5px solid #e53935;cursor:pointer;transition:border-color .15s}' +
      '#pcm-shutter.ready{border-color:#00C853;box-shadow:0 0 16px rgba(0,200,83,.55)}' +
      '#pcm-gallery{background:rgba(0,0,0,.55);color:#fff;border:1.5px solid rgba(255,255,255,.5);padding:10px 16px;border-radius:10px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer}' +
      '</style>' +
      '<video id="pol-cam-video" autoplay playsinline muted></video>' +
      '<div id="pcm-veil"></div>' +
      '<div id="pcm-dima-line"></div>' +
      '<div class="pcm-topbar"><span class="pcm-label" id="pcm-label"></span><button class="pcm-close" onclick="polCamera.close()">✕</button></div>' +
      '<div class="pcm-cross-v" id="pcm-cross-v"></div>' +
      '<div class="pcm-cross-h" id="pcm-cross-h"></div>' +
      '<div class="pcm-target" id="pcm-target-top"><span class="pcm-tag">riferimento porta</span></div>' +
      '<div class="pcm-target" id="pcm-target-bottom"><span class="pcm-tag">croce a terra</span></div>' +
      '<div class="pcm-roll-line" id="pcm-roll-line"></div>' +
      '<div class="pcm-pitch-rail"><div id="pcm-pitch-dot"></div></div>' +
      '<div id="pcm-stato">—</div>' +
      '<div id="pcm-hint"></div>' +
      '<div id="pcm-debug"></div>' +
      '<button id="pcm-ios-btn">🎯 Abilita livella</button>' +
      '<div class="pcm-bottombar">' +
        '<button id="pcm-gallery" onclick="polCamera._gallery()">📁 Galleria</button>' +
        '<button id="pcm-shutter" onclick="polCamera._shot()" aria-label="Scatta"></button>' +
        '<span style="width:76px"></span>' +
      '</div>';
    document.body.appendChild(d);
  }

  function setLevelUI(roll, pitch) {
    var rollOk = Math.abs(roll) <= TOL;
    var pitchOk = Math.abs(pitch) <= TOL;
    var ok = rollOk && pitchOk;
    var line = document.getElementById('pcm-roll-line');
    var dot = document.getElementById('pcm-pitch-dot');
    var stato = document.getElementById('pcm-stato');
    var shutter = document.getElementById('pcm-shutter');
    var shift = Math.max(-90, Math.min(90, roll * 5));
    line.style.transform = 'translateY(' + shift + 'px)';
    line.style.background = rollOk ? '#00C853' : '#e53935';
    line.style.boxShadow = rollOk ? '0 0 10px rgba(0,200,83,.5)' : '0 0 8px rgba(229,57,53,.7)';
    var pshift = Math.max(-46, Math.min(46, pitch * 3));
    dot.style.top = 'calc(50% + ' + pshift + 'px)';
    dot.style.background = pitchOk ? '#00C853' : '#e53935';
    stato.style.color = ok ? '#00C853' : '#e53935';
    stato.textContent = ok ? '✓ PRONTO' : (!rollOk ? 'Raddrizza ↔' : (pitch > 0 ? 'Inclina indietro' : 'Inclina avanti'));
    shutter.classList.toggle('ready', ok);
    var veil = document.getElementById('pcm-veil');
    if (veil) veil.style.opacity = ok ? 0.13 : 0;
    document.getElementById('pcm-debug').textContent = 'γ ' + roll.toFixed(1) + '° · β ' + pitch.toFixed(1) + '°';
  }

  function attachOrient() {
    if (orientHandler) return;
    orientHandler = function (e) {
      var roll = e.gamma != null ? e.gamma : 0;          // rotazione (portrait)
      var beta = e.beta != null ? e.beta : 90;
      var pitch = beta - 90;                              // 0 = telefono verticale
      setLevelUI(roll, pitch);
    };
    window.addEventListener('deviceorientation', orientHandler, true);
  }

  function initLivella() {
    var needsPerm = (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function');
    var btn = document.getElementById('pcm-ios-btn');
    if (needsPerm) {
      btn.style.display = 'block';
      btn.textContent = '🎯 Abilita livella';
      btn.onclick = function () {
        DeviceOrientationEvent.requestPermission().then(function (perm) {
          if (perm === 'granted') { btn.style.display = 'none'; attachOrient(); }
          else btn.textContent = 'Permesso negato';
        }).catch(function (err) { btn.textContent = 'Errore livella'; console.warn(err); });
      };
    } else {
      btn.style.display = 'none';
      attachOrient();
    }
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
