/* ============================================================
   POLICETTIVO — barra azioni foto (helper condiviso)
   policettivoFotoBar(opts) restituisce l'HTML standard della barra.
   Cestino ISOLATO in alto a sinistra (anti-clic accidentale).
   Schermo intero in alto a destra. In basso: Annota + Libreria + Sostituisci.
   Icone SVG inline: nessuna dipendenza esterna.
   ============================================================ */
(function (w) {
  'use strict';

  var SVG = {
    full:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    annota: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    osserva:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    libr:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="14" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    sost:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    elim:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6"/><path d="M10 11v6M14 11v6"/></svg>',
    dl:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>'
  };

  function btn(cls, action, svg, label, attrs) {
    if (!action) return '';
    var a = (attrs || '');
    var txt = label ? ('<span>' + label + '</span>') : '';
    return '<button type="button" class="' + cls + '" ' + a +
           ' onclick="event.stopPropagation();' + action + '">' + svg + txt + '</button>';
  }

  /* Slot PIENO */
  function policettivoFotoBar(o) {
    o = o || {};
    var trash = o.onElimina
      ? btn('pol-fa-trash', o.onElimina, SVG.elim, '', 'aria-label="Elimina foto" title="Elimina"')
      : '';
    var full = o.onIntero
      ? btn('pol-fa-full', o.onIntero, SVG.full, '', 'aria-label="Schermo intero" title="Schermo intero"')
      : '';
    var bar =
      '<div class="pol-foto-actions">' +
        btn('pol-fa-annota', o.onAnnota, SVG.annota, 'Nota rapida', 'aria-label="Nota rapida"') +
        btn('pol-fa-annota', o.onOsserva, SVG.osserva, 'Osserva', 'aria-label="Osserva"') +
        btn('pol-fa-icon', o.onLibreria, SVG.libr, '', 'aria-label="Scegli da libreria" title="Libreria"') +
        btn('pol-fa-icon', o.onSostituisci, SVG.sost, '', 'aria-label="Sostituisci foto" title="Sostituisci"') +
        btn('pol-fa-icon', o.onScarica, SVG.dl, '', 'aria-label="Scarica foto" title="Scarica"') +
      '</div>';
    return trash + full + bar;
  }

  /* Slot VUOTO: badge libreria in alto a destra */
  function policettivoFotoBarVuoto(o) {
    o = o || {};
    return o.onLibreria
      ? btn('pol-fa-libr-empty', o.onLibreria, SVG.libr, '', 'aria-label="Scegli da libreria" title="Libreria"')
      : '';
  }

  function polScaricaFile(url, filename) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).then(function (blob) {
      var a = document.createElement('a');
      var u = URL.createObjectURL(blob);
      a.href = u;
      a.download = filename || 'file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
    });
  }

  w.polScaricaFile = polScaricaFile;
  w.policettivoFotoBar = policettivoFotoBar;
  w.policettivoFotoBarVuoto = policettivoFotoBarVuoto;
})(window);
