/* pol-sessione-v1 — UNA SEDUTA, UNA RIGA.        [daily-context-v1]
 *
 * A COSA SERVE
 *   La migration 036 aveva messo le colonne della seduta (modalita,
 *   quando e' cominciata, quando e' finita, quali esercizi, la chiave
 *   anti doppio-click) e nessuno le scriveva. Questo file e' il punto -
 *   UNO SOLO - che le prepara. Tre pagine le mandano, una sola funzione
 *   le costruisce: due punti che compilano gli stessi campi divergono
 *   sempre.
 *
 * LA CHIAVE DELLA SEDUTA
 *   Ogni visita a una pagina di esercizi si inventa una chiave e se la
 *   tiene in sessionStorage. Il database ha un indice univoco su
 *   (paziente, chiave): due tocchi sul pulsante, un refresh a meta'
 *   strada o un "torna indietro" restano UNA seduta sola invece di
 *   diventare tre righe che gonfiano l'aderenza.
 *   La chiave e' per PAGINA: la rapida e la guidata dello stesso giorno
 *   restano due sedute distinte, perche' lo sono.
 *   Dopo sei ore la chiave scade: quella non e' piu' la stessa seduta.
 *
 * LA REGOLA DI QUESTO FILE
 *   Come pol-eventi.js: non deve MAI far fallire una seduta. Se
 *   sessionStorage e' spento (navigazione privata, browser vecchio) si
 *   lavora in memoria e non se ne accorge nessuno. Ogni funzione e'
 *   protetta: nel peggiore dei casi restituisce un oggetto vuoto e il
 *   salvataggio va avanti esattamente come prima.
 *
 * COME SI USA
 *   polSessione.avvia()                       // all'apertura della pagina
 *   polSessione.campi('guided', { esercizi_completati: [...] })
 *   polSessione.chiudi()                      // dopo aver salvato
 */
(function () {
  'use strict';
  if (window.polSessione) return;

  var SCADENZA = 6 * 60 * 60 * 1000;   // sei ore
  var memoria = null;                  // rete di sicurezza se sessionStorage non c'e'

  function param(nome) {
    try { return new URLSearchParams(window.location.search).get(nome) || ''; }
    catch (e) { return ''; }
  }

  function pagina() {
    try {
      var p = (window.location.pathname || '').split('/').pop() || 'pagina';
      return p.replace(/[^a-zA-Z0-9_.-]/g, '');
    } catch (e) { return 'pagina'; }
  }

  // Il token NON entra nella chiave per intero: sessionStorage e' leggibile
  // da qualsiasi script della pagina, e il token e' l'unica chiave del
  // paziente. Bastano i primi otto caratteri per non confondere due
  // pazienti sullo stesso telefono.
  function chiave() {
    return 'pol_sessione_' + pagina() + '_' + param('token').slice(0, 8);
  }

  function nuovoId() {
    try {
      if (window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID().replace(/-/g, '');
      }
    } catch (e) {}
    return 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  function leggi() {
    if (memoria) return memoria;
    try {
      var grezzo = window.sessionStorage.getItem(chiave());
      if (!grezzo) return null;
      var o = JSON.parse(grezzo);
      if (!o || !o.id || !o.iniziata) return null;
      if (Date.now() - Date.parse(o.iniziata) > SCADENZA) return null;
      return o;
    } catch (e) { return null; }
  }

  function scrivi(o) {
    memoria = o;
    try { window.sessionStorage.setItem(chiave(), JSON.stringify(o)); } catch (e) {}
  }

  window.polSessione = {

    /* Apre la seduta, o riprende quella gia' aperta in questa pagina.
       Si chiama all'apertura: cosi' 'iniziata_alle' e' davvero quando il
       paziente ha cominciato, non quando ha premuto Salva. */
    avvia: function () {
      try {
        var s = leggi();
        if (!s) { s = { id: nuovoId(), iniziata: new Date().toISOString() }; scrivi(s); }
        return s;
      } catch (e) { return null; }
    },

    /* I campi da aggiungere a p_data di save_diary_entry.
       'extra' passa attraverso senza essere toccato, cosi' una pagina
       puo' aggiungere esercizi_completati, risposta_post, stelle... */
    campi: function (modalita, extra) {
      var out = {};
      try {
        var s = leggi() || window.polSessione.avvia();
        if (modalita) out.modalita = modalita;
        if (s) {
          out.client_session_id = s.id;
          out.iniziata_alle     = s.iniziata;
          out.finita_alle       = new Date().toISOString();
        }
      } catch (e) {}
      try {
        if (extra && typeof extra === 'object') {
          for (var k in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
          }
        }
      } catch (e) {}
      return out;
    },

    /* Seduta chiusa: la prossima volta se ne apre una nuova. */
    chiudi: function () {
      memoria = null;
      try { window.sessionStorage.removeItem(chiave()); } catch (e) {}
    }
  };
})();
