/* accetta-termini-v1 — ACCETTAZIONE DI TERMINI, DPA E PRIVACY.
 *
 * Al primo accesso (e ogni volta che cambia VERSIONE) il professionista vede
 * una finestra unica: una spunta e un pulsante. Finche' non accetta, l'app
 * resta coperta. L'accettazione si salva in public.accettazioni_termini
 * (migration 064) con versione, data e ora.
 *
 * Si carica da solo: lo richiama js/pol-lock.js, che e' gia' su tutte le
 * pagine del professionista. Senza login (pagine del paziente, login,
 * registrazione) non fa nulla.
 *
 * Se la migration 064 non e' ancora stata lanciata NON blocca nessuno:
 * scrive in console quale SQL manca e lascia lavorare.
 *
 * Quando l'avvocato cambia i testi: si alza VERSIONE e a tutti viene chiesto
 * di nuovo, una volta sola.
 */
(function () {
  'use strict';
  if (window.__polAccordoAvviato) return;
  window.__polAccordoAvviato = true;

  var VERSIONE = 'termini-1.0_dpa-1.1_privacy-1.1'; // dpa-v1-1
  var SB_URL = 'https://kazlnoikvwdqwvxtigej.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthemxub2lrdndkcXd2eHRpZ2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTM1MDEsImV4cCI6MjA5MzEyOTUwMX0.gCclWImW4SnIBcsNfFAW0KNtimEw6iiEiLnXbgC96mE';
  var ESCLUSE = /(^|\/)(login|registrazione|reset-password|termini|dpa|privacy)\.html$/i;

  if (ESCLUSE.test(location.pathname)) return;

  function client() {
    if (window._sb && window._sb.auth && window._sb.from) return window._sb;
    if (window._supabase && window._supabase.auth && window._supabase.from) return window._supabase;
    return null;
  }

  // La pagina crea il suo client un attimo dopo: si aspetta fino a 3 secondi,
  // poi se ne fa uno proprio, senza rinnovo automatico dei token.
  function attendiClient(n) {
    var c = client();
    if (c) return Promise.resolve(c);
    if (n <= 0) {
      if (!window.supabase || !window.supabase.createClient) return Promise.resolve(null);
      try {
        return Promise.resolve(window.supabase.createClient(SB_URL, SB_KEY, {
          auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }
        }));
      } catch (e) { return Promise.resolve(null); }
    }
    return new Promise(function (r) { setTimeout(r, 150); }).then(function () { return attendiClient(n - 1); });
  }

  function chiaveCache(uid) { return 'polAccordo:' + uid + ':' + VERSIONE; }

  async function avvia() {
    var sb = await attendiClient(20);
    if (!sb) return;
    var sess = null;
    try { sess = (await sb.auth.getSession()).data.session; } catch (e) { return; }
    if (!sess || !sess.user) return;
    var uid = sess.user.id;
    try { if (localStorage.getItem(chiaveCache(uid)) === '1') return; } catch (e) {}

    var res = await sb.from('accettazioni_termini').select('id').eq('versione', VERSIONE).limit(1);
    if (res.error) {
      console.warn('[accetta-termini-v1] Manca la SQL db/migrations/064_accettazione_termini.sql — finestra non mostrata.', res.error);
      return;
    }
    if (res.data && res.data.length) {
      try { localStorage.setItem(chiaveCache(uid), '1'); } catch (e) {}
      return;
    }
    mostra(sb, uid);
  }

  function mostra(sb, uid) {
    if (document.getElementById('pol-accordo')) return;
    var st = document.createElement('style');
    st.textContent =
      '#pol-accordo{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;' +
      "background:rgba(10,13,18,.92);padding:18px;font-family:'Montserrat',system-ui,sans-serif}" +
      '#pol-accordo .bx{width:100%;max-width:440px;background:#fff;border-radius:16px;padding:24px 22px;color:#222;box-shadow:0 10px 40px rgba(0,0,0,.4)}' +
      '#pol-accordo h2{font-size:19px;margin:0 0 8px;font-weight:800}' +
      '#pol-accordo p{font-size:13.5px;line-height:1.55;margin:0 0 14px;color:#444}' +
      '#pol-accordo label{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;line-height:1.5;cursor:pointer;' +
      'background:#f6f6f4;border-radius:10px;padding:12px}' +
      '#pol-accordo input{width:22px;height:22px;flex-shrink:0;margin:1px 0 0;cursor:pointer}' +
      '#pol-accordo a{color:#000;font-weight:700}' +
      '#pol-accordo .ok{width:100%;margin-top:16px;padding:14px;border:0;border-radius:11px;background:#FFD008;color:#000;' +
      'font-family:inherit;font-size:15px;font-weight:800;cursor:pointer}' +
      '#pol-accordo .ok:disabled{opacity:.4;cursor:not-allowed}' +
      '#pol-accordo .err{color:#c62828;font-size:12.5px;font-weight:700;min-height:16px;margin-top:10px}' +
      '#pol-accordo .out{display:block;margin:6px auto 0;background:none;border:0;color:#888;font-family:inherit;font-size:12px;text-decoration:underline;cursor:pointer}';
    document.head.appendChild(st);

    var d = document.createElement('div');
    d.id = 'pol-accordo';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.innerHTML =
      '<div class="bx">' +
        '<h2>Prima di continuare</h2>' +
        '<p>Per usare l\'app serve la tua accettazione: tu sei titolare dei dati dei tuoi pazienti, Physiomood S.r.l. li custodisce per tuo conto. Basta farlo una volta.</p>' +
        '<label><input type="checkbox" id="pol-accordo-chk">' +
          '<span>Ho letto e accetto i <a href="termini.html" target="_blank" rel="noopener">Termini di servizio</a>, ' +
          'l\'<a href="dpa.html" target="_blank" rel="noopener">Accordo sul trattamento dei dati</a> e la ' +
          '<a href="privacy.html" target="_blank" rel="noopener">Privacy</a>. Dichiaro di raccogliere dai miei pazienti ' +
          'informativa e consenso privacy prima di inserirne i dati.</span></label>' +
        '<button class="ok" id="pol-accordo-ok" disabled>Accetto e continuo</button>' +
        '<div class="err" id="pol-accordo-err"></div>' +
        '<button class="out" id="pol-accordo-out">Esci</button>' +
      '</div>';
    document.body.appendChild(d);
    document.documentElement.style.overflow = 'hidden';

    var chk = d.querySelector('#pol-accordo-chk');
    var ok = d.querySelector('#pol-accordo-ok');
    var err = d.querySelector('#pol-accordo-err');
    chk.addEventListener('change', function () { ok.disabled = !chk.checked; err.textContent = ''; });

    ok.addEventListener('click', async function () {
      ok.disabled = true;
      ok.textContent = 'Salvo…';
      var r = await sb.from('accettazioni_termini').insert({
        versione: VERSIONE,
        user_agent: (navigator.userAgent || '').slice(0, 300)
      });
      // 23505 = gia' accettato (doppio clic o altra scheda): va bene lo stesso.
      if (r.error && r.error.code !== '23505') {
        err.textContent = 'Non sono riuscito a salvare. Controlla la connessione e riprova.';
        ok.textContent = 'Accetto e continuo';
        ok.disabled = !chk.checked;
        return;
      }
      try { localStorage.setItem(chiaveCache(uid), '1'); } catch (e) {}
      d.remove();
      document.documentElement.style.overflow = '';
    });

    d.querySelector('#pol-accordo-out').addEventListener('click', async function () {
      try { await sb.auth.signOut(); } catch (e) {}
      location.href = 'login.html';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
  else avvia();
})();
