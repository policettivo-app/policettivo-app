/* pol-eventi-v1 — GLI OCCHI SULL'AREA PAZIENTE.
 *
 * A COSA SERVE
 *   Oggi non esiste un solo numero su come viene usata l'area paziente:
 *   quanti aprono, quanti iniziano, quanti finiscono, dove abbandonano,
 *   quale modalita' usano. Senza quei numeri, fra due mesi alla domanda
 *   "il redesign ha migliorato le cose?" si puo' rispondere solo con
 *   un'opinione. Questo file raccoglie il "prima".
 *
 * DA SAPERE, PERCHE' SONO DATI SANITARI
 *   - Nessun servizio di terze parti. Gli eventi vanno solo sul NOSTRO
 *     Supabase, nella tabella patient_events (migration 036).
 *   - Il token del paziente NON viene mai scritto da nessuna parte: la
 *     RPC lo riceve solo per capire di chi si tratta e poi lo butta.
 *   - Il token viaggia nel CORPO della richiesta, mai nell'indirizzo:
 *     cosi' non finisce in nessun log di traffico.
 *   - In modalita' anteprima (?preview=1, il professionista che guarda)
 *     non viene registrato niente: sporcherebbe i numeri veri.
 *
 * LA REGOLA DI QUESTO FILE
 *   Non deve MAI far fallire una seduta. Non lancia eccezioni, non
 *   aspetta risposte, non blocca niente: se la rete non c'e' o il
 *   server risponde male, l'evento si perde in silenzio e il paziente
 *   non se ne accorge. Un dato di misura non vale mai piu' della cura.
 *
 * COME SI USA
 *   polEvento('session_completed', { modalita: 'rapid' })
 *   Il nome dell'evento deve stare nell'elenco dell'Allegato C.
 */
(function () {
  'use strict';
  if (window.polEvento) return;

  var URL_RPC = 'https://kazlnoikvwdqwvxtigej.supabase.co/rest/v1/rpc/log_patient_event';
  var CHIAVE  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imthemxub2lrdndkcXd2eHRpZ2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTM1MDEsImV4cCI6MjA5MzEyOTUwMX0.gCclWImW4SnIBcsNfFAW0KNtimEw6iiEiLnXbgC96mE';

  function leggiParam(nome) {
    try { return new URLSearchParams(window.location.search).get(nome) || ''; }
    catch (e) { return ''; }
  }

  window.polEvento = function (nome, meta) {
    try {
      if (leggiParam('preview') === '1') return;      // anteprima del professionista
      var t = leggiParam('token');
      if (!t) return;                                  // nessun token: niente da registrare
      if (!nome) return;

      var corpo = JSON.stringify({
        p_token:  t,
        p_evento: String(nome),
        p_meta:   (meta && typeof meta === 'object') ? meta : null
      });

      if (!window.fetch) return;                       // browser antico: si rinuncia, non si rompe

      // keepalive: l'evento parte anche se l'utente sta gia' cambiando pagina,
      // che e' esattamente il momento in cui ci interessa di piu' saperlo.
      fetch(URL_RPC, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CHIAVE,
          'Authorization': 'Bearer ' + CHIAVE
        },
        body: corpo,
        keepalive: true
      })['catch'](function () { /* in silenzio, sempre */ });
    } catch (e) {
      /* in silenzio, sempre */
    }
  };
})();
