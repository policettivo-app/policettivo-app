/* pol-lock-v1 — BLOCCO SCHERMO PER INATTIVITÀ.
 *
 * Il rischio vero in uno studio non è l'hacker: è il computer o il tablet
 * lasciato acceso e sbloccato tra un paziente e l'altro, con la scheda di
 * qualcuno aperta. Questo file copre quel caso e solo quello.
 *
 * COME SI COMPORTA
 *   - Se il professionista non ha impostato un PIN, questo file non fa
 *     assolutamente nulla: niente timer, niente velo. È tutto facoltativo.
 *   - Se il PIN c'è: dopo N minuti senza toccare nulla (mouse, tastiera,
 *     dito, scroll) cala un velo opaco e chiede 4 cifre. Si sblocca da solo
 *     appena la quarta cifra è giusta — nessun pulsante da premere.
 *   - Mentre si lavora NON interrompe mai, perché chi lavora tocca lo schermo.
 *   - Il blocco segue chi naviga: se cambi pagina mentre è bloccato, la
 *     pagina nuova nasce bloccata (sessionStorage).
 *   - 5 PIN sbagliati = logout vero. Meglio rifare il login che lasciare
 *     provare all'infinito.
 *
 * COSA NON È — importante, da non raccontare diversamente all'utente
 *   È un velo sullo schermo, non una cassaforte. Una persona esperta con una
 *   sessione valida può aggirarlo dal browser. Serve contro chi passa davanti
 *   a un computer incustodito, che è il buco più probabile in uno studio. La
 *   protezione forte resta un account per persona, e uscire quando si finisce.
 *
 * DOVE GIRA
 *   Non va aggiunto pagina per pagina: lo caricano da soli utils-premium.js,
 *   js/pol-ui.js e js/pol-conti.js, che sono già inclusi quasi ovunque.
 *   Le poche pagine che non includono nessuno dei tre hanno il tag a mano.
 *   Le pagine rivolte al PAZIENTE non devono mai caricarlo.
 */
(function () {
  'use strict';
  if (window.__polLockAvviato) return;
  window.__polLockAvviato = true;

  var SB_URL = 'https://kazlnoikvwdqwvxtigej.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthemxub2lrdndkcXd2eHRpZ2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTM1MDEsImV4cCI6MjA5MzEyOTUwMX0.gCclWImW4SnIBcsNfFAW0KNtimEw6iiEiLnXbgC96mE';
  var CHIAVE = 'polLockAttivo';
  var MAX_TENTATIVI = 5;

  var sb = null;
  var minuti = 15;
  var timer = null;
  var nascostoDa = 0;
  var tentativi = 0;
  var bloccato = false;

  // Riusa il client che la pagina ha già creato (`_sb` o `_supabase` sono
  // variabili globali in tutte le pagine dell'app). Crearne un secondo che
  // rinfresca i token sullo stesso archivio significa due orologi che
  // scrivono la stessa sessione: Supabase stesso avvisa dei doppioni. Solo
  // se non ne trova uno ne fa uno suo, e senza auto-refresh.
  function creaClient() {
    if (window._sb && window._sb.auth && window._sb.rpc) return window._sb;
    if (window._supabase && window._supabase.auth && window._supabase.rpc) return window._supabase;
    if (!window.supabase || !window.supabase.createClient) return null;
    try {
      return window.supabase.createClient(SB_URL, SB_KEY, {
        auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }
      });
    } catch (e) { return null; }
  }

  // ── il velo ────────────────────────────────────────────────────────
  function costruisciOverlay() {
    if (document.getElementById('pol-lock')) return;
    var st = document.createElement('style');
    st.textContent =
      '#pol-lock{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;' +
      'background:#0d1117;background:linear-gradient(160deg,#11161d,#0a0d12);padding:20px;' +
      "font-family:'Montserrat',system-ui,sans-serif}" +
      '#pol-lock.on{display:flex}' +
      '#pol-lock .bx{width:100%;max-width:340px;text-align:center;color:#e6edf3}' +
      '#pol-lock .em{font-size:40px;margin-bottom:10px}' +
      '#pol-lock h2{font-size:19px;margin:0 0 6px;font-weight:800;color:#fff}' +
      '#pol-lock p{font-size:13px;color:#8b949e;margin:0 0 20px;line-height:1.5}' +
      '#pol-lock input{width:100%;padding:16px;border-radius:12px;border:2px solid #30363d;background:#0d1117;' +
      'color:#fff;font-family:inherit;font-size:30px;text-align:center;letter-spacing:16px;text-indent:16px;outline:none}' +
      '#pol-lock input:focus{border-color:#FFD008}' +
      '#pol-lock .err{color:#f85149;font-size:12.5px;font-weight:700;min-height:18px;margin-top:12px}' +
      '#pol-lock .out{margin-top:22px;background:transparent;border:1.5px solid #30363d;color:#8b949e;' +
      'padding:9px 18px;border-radius:9px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer}' +
      '#pol-lock .out:hover{border-color:#f85149;color:#f85149}';
    document.head.appendChild(st);

    var d = document.createElement('div');
    d.id = 'pol-lock';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.innerHTML =
      '<div class="bx">' +
        '<div class="em">🔒</div>' +
        '<h2>Schermo bloccato</h2>' +
        '<p>Sei stato via un po\'. Scrivi il tuo PIN per riprendere.</p>' +
        '<input id="pol-lock-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="PIN a quattro cifre">' +
        '<div class="err" id="pol-lock-err"></div>' +
        '<button class="out" id="pol-lock-out">Esci dall\'account</button>' +
      '</div>';
    document.body.appendChild(d);

    var inp = d.querySelector('#pol-lock-pin');
    inp.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '');
      document.getElementById('pol-lock-err').textContent = '';
      if (this.value.length === 4) verifica(this.value);
    });
    d.querySelector('#pol-lock-out').addEventListener('click', esci);
  }

  async function esci() {
    try { sessionStorage.removeItem(CHIAVE); } catch (e) {}
    try { if (sb) await sb.auth.signOut(); } catch (e) {}
    window.location.href = 'login.html';
  }

  function blocca() {
    if (bloccato) return;
    bloccato = true;
    try { sessionStorage.setItem(CHIAVE, '1'); } catch (e) {}
    costruisciOverlay();
    var el = document.getElementById('pol-lock');
    el.classList.add('on');
    document.documentElement.style.overflow = 'hidden';
    var inp = document.getElementById('pol-lock-pin');
    inp.value = '';
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
    fermaTimer();
  }

  function sblocca() {
    bloccato = false;
    tentativi = 0;
    try { sessionStorage.removeItem(CHIAVE); } catch (e) {}
    var el = document.getElementById('pol-lock');
    if (el) el.classList.remove('on');
    document.documentElement.style.overflow = '';
    riarma();
  }

  async function verifica(pin) {
    var err = document.getElementById('pol-lock-err');
    var inp = document.getElementById('pol-lock-pin');
    err.textContent = 'Controllo…';
    var ok = false;
    try {
      var r = await sb.rpc('sess_pin_check', { pw: pin });
      ok = !!(r && !r.error && r.data === true);
    } catch (e) { ok = false; }
    if (ok) { err.textContent = ''; sblocca(); return; }
    tentativi++;
    inp.value = '';
    if (tentativi >= MAX_TENTATIVI) {
      err.textContent = 'Troppi tentativi. Ti faccio uscire.';
      setTimeout(esci, 900);
      return;
    }
    err.textContent = 'PIN sbagliato — ' + (MAX_TENTATIVI - tentativi) + ' tentativi rimasti';
    try { inp.focus(); } catch (e) {}
  }

  // ── il conto alla rovescia ─────────────────────────────────────────
  function fermaTimer() { if (timer) { clearTimeout(timer); timer = null; } }

  function riarma() {
    if (bloccato) return;
    fermaTimer();
    timer = setTimeout(blocca, minuti * 60 * 1000);
  }

  function attivita() { if (!bloccato) riarma(); }

  function ascolta() {
    var ev = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel', 'click'];
    for (var i = 0; i < ev.length; i++) {
      window.addEventListener(ev[i], attivita, { passive: true, capture: true });
    }
    // Scheda in secondo piano: il timer del browser può essere rallentato,
    // quindi al ritorno si controlla il tempo davvero passato.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { nascostoDa = Date.now(); return; }
      if (nascostoDa && (Date.now() - nascostoDa) >= minuti * 60 * 1000) blocca();
      else attivita();
      nascostoDa = 0;
    });
  }

  async function avvia() {
    sb = creaClient();
    if (!sb) return;                       // pagina senza supabase-js: niente da fare

    var sess = null;
    try { sess = await sb.auth.getSession(); } catch (e) { return; }
    if (!sess || !sess.data || !sess.data.session) return;   // non loggato

    var stato = null;
    try {
      var r = await sb.rpc('sess_lock_stato');
      if (r && !r.error) stato = r.data;
    } catch (e) { /* migrazione 035 non ancora eseguita */ }
    if (!stato || stato.attivo !== true) return;   // nessun PIN: il file si spegne qui

    minuti = Number(stato.minuti) || 15;
    costruisciOverlay();
    ascolta();

    var eraBloccato = false;
    try { eraBloccato = sessionStorage.getItem(CHIAVE) === '1'; } catch (e) {}
    if (eraBloccato) blocca(); else riarma();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia);
  } else {
    avvia();
  }
})();
