/* ===================================================================
   js/terapie.js — progetto-terapeutico-v1 (1 settembre 2026)

   L'ELENCO DELLE TERAPIE STA QUI E DA NESSUN'ALTRA PARTE.
   Stessa regola di js/osservazioni.js: se una pagina si costruisce un
   secondo elenco «suo», la stessa terapia entra nel database con due
   nomi e non si conta piu' su duecento pazienti.

   I NOMI SONO QUELLI CHE USA GIULIANO IN STUDIO, non quelli dei
   cataloghi: e' il documento che firma lui, e deve riconoscerci il suo
   apparecchio. La chiave `k` invece non cambia mai — e' quella che
   finisce nel database.

   ⚠️ QUI NON CI SONO LE CONTROINDICAZIONI, ED E' VOLUTO.
   Arriveranno in js/controindicazioni.js (blocco red-flag-documenti-v1)
   DOPO che Giuliano avra' riletto l'elenco. Mettere adesso una tabella
   non ancora rivista dentro un documento che porta la sua firma sarebbe
   il modo piu' rapido per far comparire un avviso clinico sbagliato.
   Il campo `famiglia` serve proprio ad agganciarle quando ci saranno.
   =================================================================== */
(function () {
  'use strict'
  if (window.polTerapie) return

  var STRUMENTALI = [
    { k:'tecar',        nome:'Tecar Terapia (Resistiva/Capacitiva)',              famiglia:'diatermia' },
    { k:'laser904',     nome:'Laser Terapia 904 nm',                              famiglia:'laser' },
    { k:'laser_alta',   nome:'Laser alta tecnologia — Chronic Five Crio Plus',    famiglia:'laser_crio' },
    { k:'ultrasuoni',   nome:'Ultrasuoni Terapia',                                famiglia:'ultrasuoni' },
    { k:'us_micro',     nome:'Ultrasuoni con Microcorrenti Antalgiche',           famiglia:'ultrasuoni_corrente' },
    { k:'emtt',         nome:'EMTT — magnetoterapia induttiva pulsata',           famiglia:'campo_magnetico' },
    { k:'tens',         nome:'TENS Antalgica',                                    famiglia:'elettro' },
    { k:'ems',          nome:'EMS ad impulsi variabili',                          famiglia:'elettro' }
  ]

  /* Quello che si fa con le mani e col movimento. Non e' un di piu': un
     progetto fatto di sole macchine non e' un progetto riabilitativo, e
     nel documento la differenza si deve vedere. */
  var MANUALI = [
    { k:'terapia_manuale',   nome:'Terapia manuale',                famiglia:'manuale' },
    { k:'esercizio',         nome:'Esercizio terapeutico',          famiglia:'esercizio' },
    { k:'rieducazione',      nome:'Rieducazione posturale',         famiglia:'esercizio' },
    { k:'elicoidali',        nome:'Protocollo elicoidali (cuscini)',famiglia:'esercizio' },
    { k:'educazione',        nome:'Educazione e gestione autonoma', famiglia:'educazione' }
  ]

  var TUTTE = MANUALI.concat(STRUMENTALI)

  window.polTerapie = {
    marker: 'progetto-terapeutico-v1',
    gruppi: [
      { titolo: 'Terapia manuale ed esercizio', voci: MANUALI },
      { titolo: 'Terapie strumentali',          voci: STRUMENTALI }
    ],
    tutte: TUTTE,
    nome: function (k) {
      for (var i = 0; i < TUTTE.length; i++) if (TUTTE[i].k === k) return TUTTE[i].nome
      return k   // una chiave sconosciuta si mostra com'e': non si perde un dato
    }
  }
})()
