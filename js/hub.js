/* ============================================================
   POLICETTIVO — hub azioni rapide (bottom bar "+")
   Apertura/chiusura del pannello azioni. Generico/riusabile.
   ============================================================ */
(function (w) {
  'use strict';
  w.polApriHub = function () { var h = document.getElementById('pol-hub'); if (h) h.classList.add('open'); };
  w.polChiudiHub = function () { var h = document.getElementById('pol-hub'); if (h) h.classList.remove('open'); };
})(window);
