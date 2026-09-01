/* ═══════════════════════════════════════════════════════════════════════
   js/configurazioni.js — config-vocabolario-v1 (1 settembre 2026)

   NPL E GPL SI SCRIVONO QUI, E DA NESSUN'ALTRA PARTE.
   Stessa regola di js/osservazioni.js e js/terapie.js.

   ⚠️ PERCHE' ESISTE QUESTO FILE. L'etichetta era scritta a mano in
   CINQUE pagine. Quattro dicevano la cosa giusta e una, proprio la
   valutazione posturale, diceva «Neutra Posteriore Lombare» e «Grande
   Piede Laterale»: due termini che non esistono, sotto gli occhi del
   paziente, dentro la pagina da cui esce il PDF. Nessuno se n'era
   accorto perche' le altre quattro erano giuste.

   NPL = Nero Posteriore Laterale   (cuscino NERO)
   GPL = Giallo Posteriore Laterale (cuscino GIALLO)

   La lettera iniziale e' il COLORE del cuscino: e' per questo che la
   card NPL e' nera con la scritta gialla e la GPL il contrario. I
   colori qui sotto sono gli stessi del marchio e servono a non
   ricopiarli a mano in ogni pagina.
   =================================================================== */
(function () {
  'use strict'
  if (window.polConfig) return

  var VOCI = {
    NPL: {
      k: 'NPL',
      desc: 'Nero Posteriore Laterale',
      colore: 'Nero',
      sfondo: '#000000',
      testo: '#FFD008'
    },
    GPL: {
      k: 'GPL',
      desc: 'Giallo Posteriore Laterale',
      colore: 'Giallo',
      sfondo: '#FFD008',
      testo: '#000000'
    }
  }

  /* La descrizione per esteso. Una chiave sconosciuta (per esempio
     'NEUTRO', o un valore vecchio rimasto nel database) non si perde e
     non diventa una descrizione inventata: si mostra com'e'. */
  function desc (k) {
    var v = VOCI[String(k || '').toUpperCase()]
    return v ? v.desc : String(k || '')
  }

  function voce (k) {
    return VOCI[String(k || '').toUpperCase()] || null
  }

  /* Riempie ogni elemento con data-cfg-desc="NPL" (o "GPL").
     Nelle pagine il testo giusto e' scritto anche nell'HTML, cosi' se
     questo file non venisse caricato si legge comunque la cosa giusta
     invece di un buco: qui lo si sovrascrive con la versione buona, che
     resta l'unica autorevole. */
  function montaEtichette (radice) {
    var r = radice || document
    var el = r.querySelectorAll('[data-cfg-desc]')
    for (var i = 0; i < el.length; i++) {
      var k = el[i].getAttribute('data-cfg-desc')
      if (VOCI[String(k || '').toUpperCase()]) el[i].textContent = desc(k)
    }
    return el.length
  }

  window.polConfig = {
    marker: 'config-vocabolario-v1',
    voci: VOCI,
    tutte: [VOCI.NPL, VOCI.GPL],
    desc: desc,
    voce: voce,
    montaEtichette: montaEtichette
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { montaEtichette() })
  } else {
    montaEtichette()
  }
})()
