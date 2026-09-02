/* messaggio-professionista-v1 — LA CARD CHE FA SENTIRE SEGUITO IL PAZIENTE.
 *
 * A COSA SERVE
 *   Il paziente apre l'app e vede che qualcuno ha guardato. Non e' una
 *   chat: il professionista scrive, il paziente legge. Il perche' sta in
 *   PIANO-comunicazione-paziente.md, e non e' una mancanza da colmare
 *   dopo: il paziente non ha un login, quindi CHIUNQUE ABBIA IL LINK E'
 *   IL PAZIENTE. Finche' l'app gli MOSTRA cose sue va bene; nel momento
 *   in cui accettasse che LUI scriva, un messaggio non autenticato
 *   finirebbe nella cartella clinica come se l'avesse scritto lui.
 *
 * ⚠️ UN ELEMENTO, UNA FUNZIONE CHE LO DISEGNA.
 *   Questo file esiste perche' la card serve OGGI a protocollo.html e
 *   DOMANI alla home a card. Due punti che disegnano la stessa cosa
 *   divergono sempre: qui c'e' il markup, qui c'e' lo stile, qui c'e' la
 *   riga che segna il messaggio come letto. Chi la usa passa i dati e un
 *   contenitore, e non scrive una sola parola rivolta al paziente.
 *
 * LE PAROLE CHE LEGGE IL PAZIENTE STANNO TUTTE QUI SOTTO, IN `PAROLE`.
 *   Sono tre. Si correggono qui, in un punto solo.
 *
 * DA DOVE ARRIVANO I DATI
 *   get_daily_context(p_token) -> chiave 'messaggio', gia' filtrata sul
 *   piu' recente non archiviato. Questo file non interroga il database
 *   da solo: riceve l'oggetto e basta.
 *
 * COME SI USA
 *   montaMessaggioPaziente({
 *     messaggio: ctx.messaggio,        // l'oggetto, o null
 *     contenitore: document.getElementById('mp-card'),
 *     supabase: _supabase,             // serve solo per segnare 'letto'
 *     token: token,
 *     preview: isPreview               // in anteprima non si salva niente
 *   })
 *
 * LA REGOLA DI QUESTO FILE
 *   Non deve MAI rompere la home. Se qualcosa non torna, la card non
 *   compare e il programma resta dov'e'. Il paziente apre l'app per fare
 *   gli esercizi: un saluto che va storto non gli deve togliere quello.
 */
(function () {
  'use strict';
  if (window.montaMessaggioPaziente) return;

  /* Le uniche parole rivolte al paziente. */
  var PAROLE = {
    da:      'Messaggio da ',
    senza:   'Messaggio dal tuo fisioterapista',
    oggi:    'oggi',
    ieri:    'ieri'
  };

  var MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
              'luglio','agosto','settembre','ottobre','novembre','dicembre'];

  var STILE = '' +
    '.mp-card{background:#111;border:1px solid #222;border-left:3px solid #333;' +
      'border-radius:16px;padding:18px 20px;margin-bottom:20px}' +
    '.mp-card.mp-nuovo{border-left-color:#FFD008}' +
    '.mp-testa{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}' +
    '.mp-da{font-size:13px;font-weight:700;color:#FFD008;letter-spacing:.2px}' +
    '.mp-quando{font-size:11px;color:#666;flex-shrink:0}' +
    '.mp-testo{font-size:15px;color:#eee;line-height:1.55;white-space:pre-wrap;word-break:break-word}' +
    '.mp-audio{width:100%;margin-top:12px}';

  function stileUnaVolta() {
    if (document.getElementById('mp-stile')) return;
    var s = document.createElement('style');
    s.id = 'mp-stile';
    s.textContent = STILE;
    document.head.appendChild(s);
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Mai scrivere una data che non si conosce: se non si legge, non si
     scrive niente al posto suo. */
  function quando(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var oggi = new Date();
    var g = function (x) { return x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate(); };
    if (g(d) === g(oggi)) return PAROLE.oggi;
    var ieri = new Date(oggi.getTime() - 864e5);
    if (g(d) === g(ieri)) return PAROLE.ieri;
    return d.getDate() + ' ' + MESI[d.getMonth()];
  }

  /* L'audio non e' ancora inviabile dal professionista (serve una URL
     firmata: vedi api/genera-pdf, tipo 'video'). La card sa gia'
     riprodurlo: quando arrivera', questa meta' e' fatta. */
  function corpo(m) {
    var h = '';
    if (m.testo && String(m.testo).trim()) {
      h += '<div class="mp-testo">' + esc(String(m.testo).trim()) + '</div>';
    }
    if (m.audio_url && String(m.audio_url).trim()) {
      h += '<audio class="mp-audio" controls preload="none" src="' + esc(m.audio_url) + '"></audio>';
    }
    return h;
  }

  window.montaMessaggioPaziente = function (o) {
    try {
      o = o || {};
      var box = o.contenitore;
      var m   = o.messaggio;
      if (!box) return false;
      box.innerHTML = '';
      if (!m || !m.id) return false;

      var testoC = corpo(m);
      if (!testoC) return false;          // un messaggio vuoto non e' un messaggio

      stileUnaVolta();
      var nuovo = !m.letto_il;
      var da    = (m.autore && String(m.autore).trim())
                    ? PAROLE.da + esc(String(m.autore).trim())
                    : PAROLE.senza;
      var q     = quando(m.creato_il);

      box.innerHTML =
        '<div class="mp-card' + (nuovo ? ' mp-nuovo' : '') + '" id="mp-card">' +
          '<div class="mp-testa">' +
            '<span class="mp-da">' + da + '</span>' +
            (q ? '<span class="mp-quando">' + esc(q) + '</span>' : '') +
          '</div>' +
          testoC +
        '</div>';

      /* Segnare 'letto' e' l'unica scrittura di questa card, e serve al
         professionista per sapere se e' arrivato. In anteprima no: la
         barra gialla in cima promette che non si salva niente.
         Non si aspetta la risposta e non si mostra nessun errore: se
         fallisce, il paziente non se ne deve accorgere. Qui non si cambia
         pagina subito dopo, quindi il browser non annulla la chiamata. */
      if (nuovo && !o.preview && o.supabase && o.token) {
        try {
          o.supabase.rpc('segna_messaggio_letto', { p_token: o.token, p_message_id: m.id })
            .then(function () {}, function () {});
        } catch (e) {}
      }
      if (!o.preview) { try { if (window.polEvento) window.polEvento('messaggio_prof_visto'); } catch (e) {} }
      return true;
    } catch (e) {
      return false;                       // la home non si rompe per un saluto
    }
  };
})();
