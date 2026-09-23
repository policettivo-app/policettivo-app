/* js/valutazioni.js — valutazioni-coerenti-v1 (23 settembre 2026)
 *
 * QUALI VALUTAZIONI ENTRANO NEI CONFRONTI: UN POSTO SOLO.
 *
 * Prima di oggi «Confronto nel tempo» (comparazione.html) prendeva la scheda
 * paziente + le SOLE posturali, e «Prima e dopo» (schermo-paziente.html) la
 * scheda + posturali + fisioterapiche. Due elenchi per la stessa cosa: davanti
 * al paziente i due schermi raccontavano valutazioni diverse.
 *
 * La logica (decisioni 1A 2A del 23 settembre):
 *   T0  = la SCHEDA PAZIENTE: la valutazione iniziale, prima e dopo i cuscini
 *         (è da lì che si sceglie NPL o GPL);
 *   T1… = le visite con foto, POSTURALI e FISIOTERAPICHE, ognuna col suo
 *         PRE / POST 3R. Anche lo stesso giorno della scheda: sono due voci.
 *   «Prima e dopo» = PRE contro POST della STESSA valutazione (effetto subito);
 *   «Confronto nel tempo» = una valutazione contro un'altra (cosa resta).
 *
 * ⚠️ Solo costanti e funzioni pure: niente rete.
 */
;(function (global) {
  'use strict'

  // I tipi di visita che hanno foto PRE / POST 3R, nell'ordine in cui vincono
  // se due visite dello stesso giorno hanno lo stesso piano.
  var TIPI_VISITA = ['posturale', 'fisioterapica']

  // Le foto della scheda paziente, portate sui piani delle visite.
  // Solo il sagittale ha il prima e il dopo (Prima cuscini / Dopo cuscini).
  var SLOT_SCHEDA = {
    'prima-sx':    { plane: 'sagittale_sx',      fase: 'pre'  },
    'prima-dx':    { plane: 'sagittale_dx',      fase: 'pre'  },
    'dopo-sx':     { plane: 'sagittale_sx',      fase: 'post' },
    'dopo-dx':     { plane: 'sagittale_dx',      fase: 'post' },
    'frontale':    { plane: 'frontale',          fase: 'pre'  },
    'posteriore':  { plane: 'posteriore',        fase: 'pre'  },
    'podo-sotto':  { plane: 'podoscopio_sotto',  fase: 'pre'  },
    'podo-dietro': { plane: 'podoscopio_dietro', fase: 'pre'  }
  }

  // Come si chiama una valutazione, a schermo
  function nomeTipo(kind, tipo) {
    if (kind === 'scheda') return 'Valutazione iniziale'
    if (tipo === 'fisioterapica') return 'Visita fisioterapica'
    return 'Valutazione posturale'
  }

  /* Percorso su Storage di una foto della scheda. Le vecchie salvate in base64
     o come URL diretto non hanno un percorso: si vedono, non si allineano. */
  function percorsoScheda(v) {
    if (!v) return null
    if (typeof v === 'object') return v.storage_path || null
    if (typeof v !== 'string') return null
    if (v.indexOf('data:') === 0 || v.indexOf('http') === 0) return null
    return v
  }
  /* La scheda non ha una data di scatto: l'unica è nel nome del file, ed è il
     momento del CARICAMENTO. Senza numero nel nome, la data NON c'è. */
  function dataDaPercorso(p) {
    var m = /_(\d{10,16})\.[a-z]+$/i.exec(p || '')
    if (!m) return null
    var d = new Date(Number(m[1]))
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  global.PolValutazioni = {
    TIPI_VISITA: TIPI_VISITA, SLOT_SCHEDA: SLOT_SCHEDA,
    nomeTipo: nomeTipo, percorsoScheda: percorsoScheda, dataDaPercorso: dataDaPercorso
  }
})(typeof window !== 'undefined' ? window : globalThis)
