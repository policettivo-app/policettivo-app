/* ============================================================
   POLICETTIVO — Osservazioni posturali per piano
   Tassonomia clinica fornita dal professionista.
   Usata dal pannello "Osserva" (disegno.html, valutazione-posturale.html)
   e dall'elenco "Aggiungi osservazione" di visita.html.

   ⚠️ QUESTO FILE E' L'UNICA FONTE DELLE VOCI. Se una voce va aggiunta o
   riscritta, si fa qui: `js/postural-component.js` non tiene piu' un elenco
   suo. Due vocabolari per la stessa cosa ("Spalla dx piu' alta" di qua,
   "Spalla dx elevata" di la') vogliono dire che la stessa crocetta entra nel
   database con due nomi, e una crocetta che cambia nome non si conta su
   duecento pazienti.

   REGOLA DI FONDO — vocabolario-unico-v1 (29 ago 2026):
   ogni reperto sta in UN elenco solo, quello della vista da cui si vede
   davvero. Se due foto vedono la stessa cosa, o la voce e' condivisa
   (una copia sola) oppure porta scritto il repere, cosi' che una
   differenza fra le due sia un dato clinico e non una contraddizione.
   ============================================================ */
(function (w) {
  'use strict';

  var OSS_PIANI = {

    // ── FRONTALE ANTERIORE — piani di riferimento delle Linee guida ──────
    frontale_ant: [
      { g: 'Capo (piano bipupillare)',
        items: ['Capo allineato (bipupillare)', 'Capo inclinato a dx', 'Capo inclinato a sx', 'Capo ruotato a dx', 'Capo ruotato a sx'],
        nota: 'L\'inclinazione del capo si registra QUI, sulla linea bipupillare: sul posteriore si legge soltanto.' },
      { g: 'Spalle (piano biacromiale)',
        items: ['Spalle allineate', 'Spalla dx più alta', 'Spalla sx più alta', 'Anteposizione spalla dx', 'Anteposizione spalla sx'] },
      { g: 'Bacino (piano biiliaco — SIAS)',
        items: ['Bacino in bolla (SIAS)', 'Emibacino dx più alto (SIAS)', 'Emibacino sx più alto (SIAS)', 'Rotazione del bacino'],
        nota: 'Davanti si guardano le SIAS, dietro le SIPS. Se le due schede non coincidono NON è un errore: è una torsione del bacino. Si registrano tutte e due.' },
      { g: 'Ginocchia (piano birotuleo)',
        items: ['Ginocchia allineate', 'Ginocchia valghe', 'Ginocchia vare'] },
      { g: 'Arti inferiori',
        items: ['Arti inferiori simmetrici', 'Arto inf. dx più corto', 'Arto inf. sx più corto'] },
      { g: 'Piedi (screening — si conferma al podoscopio)',
        items: ['Appoggio pronato dx', 'Appoggio pronato sx', 'Appoggio supinato dx', 'Appoggio supinato sx'],
        nota: 'Da una foto a figura intera il piede è un sospetto. Il dato buono è quello del podoscopio.' }
    ],

    // ── FRONTALE POSTERIORE ──────────────────────────────────────────────
    frontale_post: [
      { g: 'Capo e collo',
        items: ['Capo allineato (bipupillare)', 'Capo inclinato a dx', 'Capo inclinato a sx'],
        nota: 'Condivise con la foto frontale: qui si leggono, si modificano da davanti.' },
      { g: 'Scapole',
        items: ['Scapole simmetriche', 'Scapola dx più alta', 'Scapola sx più alta', 'Scapola alata dx', 'Scapola alata sx'] },
      { g: 'Rachide e tronco',
        items: ['Rachide in asse', 'Atteggiamento scoliotico dx', 'Atteggiamento scoliotico sx', 'Gibbo costale dx', 'Gibbo costale sx', 'Tronco deviato a dx', 'Tronco deviato a sx'] },
      { g: 'Bacino (piano biiliaco — SIPS)',
        items: ['Bacino in bolla (SIPS)', 'Emibacino dx più alto (SIPS)', 'Emibacino sx più alto (SIPS)', 'Glutei asimmetrici'],
        nota: 'Qui si guardano le SIPS. Una differenza col frontale (SIAS) è una torsione, non una contraddizione.' },
      { g: 'Retropiede (screening — si conferma al podoscopio)',
        items: ['Retropiede valgo dx', 'Retropiede valgo sx', 'Retropiede varo dx', 'Retropiede varo sx'] }
    ],

    // ── PODOSCOPIO, VISTA PLANTARE (sotto) ───────────────────────────────
    // Da sotto si vedono arco, impronta e carico. Valgo/varo NON si giudicano
    // da qui: sono del retropiede e stanno nella vista da dietro.
    podoscopia_sotto: [
      { g: 'Arco plantare',
        items: ['Arco normale dx', 'Arco normale sx', 'Piede piatto dx', 'Piede piatto sx', 'Piede cavo dx', 'Piede cavo sx'] },
      { g: 'Impronta',
        items: ['Impronta pronata dx', 'Impronta pronata sx', 'Impronta supinata dx', 'Impronta supinata sx'] },
      { g: 'Carico',
        items: ['Carico simmetrico', 'Ipercarico avampiede', 'Ipercarico retropiede', 'Asimmetria di carico dx', 'Asimmetria di carico sx'] },
      { g: 'Avampiede',
        items: ['Avampiede nella norma', 'Alluce valgo dx', 'Alluce valgo sx', 'Dita a griffe'] }
    ],

    // ── PODOSCOPIO, VISTA POSTERIORE (dietro) ────────────────────────────
    // Da dietro si vede il retropiede. Piatto/cavo NON si giudicano da qui.
    podoscopia_dietro: [
      { g: 'Calcagno (asse posteriore)',
        items: ['Calcagno in asse dx', 'Calcagno in asse sx', 'Calcagno valgo dx', 'Calcagno valgo sx', 'Calcagno varo dx', 'Calcagno varo sx'],
        nota: 'Il calcagno È il retropiede: non c\'è una seconda voce "retropiede pronato". Una sola parola per un solo reperto.' },
      { g: 'Tendine d\'Achille',
        items: ['Achilleo rettilineo dx', 'Achilleo rettilineo sx', 'Achilleo deviato dx', 'Achilleo deviato sx'] },
      { g: 'Rotazione tibiale',
        items: ['Rotazione tibiale interna dx', 'Rotazione tibiale interna sx', 'Rotazione tibiale esterna dx', 'Rotazione tibiale esterna sx'] }
    ],

    // ── SAGITTALE — filo a piombo e curve del rachide ────────────────────
    sagittale_sx: [
      { g: 'Capo', items: ['Capo allineato sul filo a piombo', 'Anteposizione del capo', 'Retrazione del capo'] },
      { g: 'Rachide cervicale', items: ['Cervicale nella norma', 'Iperlordosi cervicale', 'Rettilineizzazione cervicale'] },
      { g: 'Rachide dorsale', items: ['Dorsale nella norma', 'Ipercifosi dorsale', 'Dorso piatto'] },
      { g: 'Rachide lombare', items: ['Lombare nella norma', 'Iperlordosi lombare', 'Rettilineizzazione lombare'] },
      { g: 'Bacino', items: ['Bacino neutro', 'Antiversione del bacino', 'Retroversione del bacino'] },
      { g: 'Ginocchio', items: ['Ginocchio in asse', 'Ginocchio recurvato', 'Ginocchio flesso'] },
      { g: 'Filo a piombo', items: ['Allineato', 'Baricentro anteriore', 'Baricentro posteriore'] },
      { g: 'Spalle e assetto', items: ['Spalle anteposte', 'Spalle posteriorizzate', 'Respirazione toracica', 'Respirazione diaframmatica', 'Assetto rigido', 'Assetto ipotonico'] }
    ],

    // ── CAPO, RAVVICINATO FRONTALE ───────────────────────────────────────
    // Inclinazione e rotazione del capo stanno sul FRONTALE: qui solo il
    // dettaglio che una foto a figura intera non da'.
    capo_frontale: [
      { g: 'Dettaglio ravvicinato',
        items: ['Occhio dx più basso', 'Occhio sx più basso', 'Orecchio dx più basso', 'Orecchio sx più basso', 'Asimmetria del viso', 'Nessuna asimmetria evidente'],
        nota: 'Inclinazione e rotazione del capo si registrano sulla foto frontale: qui non si ripetono.' }
    ],

    // ── CAPO, RAVVICINATO DI PROFILO ─────────────────────────────────────
    capo_profilo: [
      { g: 'Rapporto capo-tronco',
        items: ['Nessuna anteposizione', 'Anteposizione lieve', 'Anteposizione marcata'],
        nota: 'Qui si GRADUA l\'anteposizione già segnata sul sagittale, non si registra un reperto nuovo.' }
    ],

    // ── STOMATOGNATICO — FRONTALE ────────────────────────────────────────
    stomato_frontale: [
      { g: 'Mandibola (frontale)',
        items: ['Apertura simmetrica', 'Latero-deviazione mandibolare dx', 'Latero-deviazione mandibolare sx', 'Deviazione in apertura a dx', 'Deviazione in apertura a sx'],
        nota: 'Osservazione, non diagnosi: l\'occlusione la classifica l\'odontoiatra. Qui si annota cosa si è visto e, se serve, si invia.' }
    ],

    // ── STOMATOGNATICO — PROFILO ─────────────────────────────────────────
    stomato_profilo: [
      { g: 'Mandibola (profilo)',
        items: ['Profilo mandibolare nella norma', 'Mandibola retrusa', 'Mandibola protrusa'],
        nota: 'Osservazione, non diagnosi: la classe scheletrica è radiologica e non si legge da una foto.' }
    ],

    // ── CONVERGENZA OCULARE ──────────────────────────────────────────────
    occhi: [
      { g: 'Convergenza oculare',
        items: ['Convergenza simmetrica all\'osservazione', 'Convergenza ridotta all\'osservazione — inviare a ortottista'],
        nota: 'La convergenza si misura col punto prossimo (NPC), con una manovra dinamica: una foto non la dimostra. Questa è la registrazione di ciò che si è osservato, non un referto ortottico.' }
    ],

    // ── GENERALE (ripiego) ───────────────────────────────────────────────
    generale: [
      { g: 'Osservazioni', items: ['Spalla dx più alta', 'Spalla sx più alta', 'Anteposizione del capo', 'Ipercifosi dorsale', 'Iperlordosi lombare', 'Atteggiamento scoliotico dx', 'Atteggiamento scoliotico sx'] }
    ]
  };

  // Il sagittale destro mostra le stesse variabili del sinistro, ma dal 29 ago
  // si compilano una volta sola sul sinistro (vedi COPPIE, modo 'tutto').
  OSS_PIANI.sagittale_dx = OSS_PIANI.sagittale_sx;
  // Chiavi vecchie tenute vive per non rompere chiamate esterne.
  OSS_PIANI.podoscopia = OSS_PIANI.podoscopia_sotto;
  OSS_PIANI.capo       = OSS_PIANI.capo_frontale;
  OSS_PIANI.stomato    = OSS_PIANI.stomato_frontale;

  /* ------------------------------------------------------------------
     ALIAS — voci riscritte il 29 ago. Servono a NON perdere le crocette
     gia' messe: la voce vecchia si legge e diventa quella nuova.
     Le voci vecchie che non hanno un corrispondente (perche' non dicevano
     quale piede) NON si indovinano: finiscono nel riquadro "fuori elenco",
     restano salvate e si riscrivono a mano.
     ------------------------------------------------------------------ */
  var ALIAS = {
    frontale_ant: {
      'Emibacino dx più alto': 'Emibacino dx più alto (SIAS)',
      'Emibacino sx più alto': 'Emibacino sx più alto (SIAS)'
    },
    frontale_post: {
      'Emibacino dx più alto': 'Emibacino dx più alto (SIPS)',
      'Emibacino sx più alto': 'Emibacino sx più alto (SIPS)'
    },
    sagittale_sx: {
      'Capo allineato': 'Capo allineato sul filo a piombo'
    }
  };
  ALIAS.sagittale_dx = ALIAS.sagittale_sx;

  function ossPianoForTipo(t) {
    t = (t || '').toLowerCase();
    // Slot della SCHEDA PAZIENTE: nomi diversi dalle visite, stesse viste.
    if (t.indexOf('prima-sx') === 0 || t.indexOf('prima_sx') === 0) return 'sagittale_sx';
    if (t.indexOf('dopo-sx')  === 0 || t.indexOf('dopo_sx')  === 0) return 'sagittale_sx';
    if (t.indexOf('prima-dx') === 0 || t.indexOf('prima_dx') === 0) return 'sagittale_dx';
    if (t.indexOf('dopo-dx')  === 0 || t.indexOf('dopo_dx')  === 0) return 'sagittale_dx';
    // Podoscopio: due viste, due elenchi diversi (podoscopio-split-v1).
    if (t.indexOf('podo') === 0) {
      if (t.indexOf('dietro') >= 0) return 'podoscopia_dietro';
      return 'podoscopia_sotto';
    }
    if (t.indexOf('sagittale_sx') === 0) return 'sagittale_sx';
    if (t.indexOf('sagittale_dx') === 0) return 'sagittale_dx';
    // ⚠️ 'frontale_post' come TIPO vuol dire "frontale dopo i 3R", non
    // "posteriore": il piano resta quello anteriore.
    if (t.indexOf('frontale') === 0) return 'frontale_ant';
    if (t.indexOf('posteriore') === 0) return 'frontale_post';
    if (t.indexOf('capo') === 0) return (t.indexOf('profilo') >= 0) ? 'capo_profilo' : 'capo_frontale';
    if (t.indexOf('stomato') === 0) return (t.indexOf('profilo') >= 0) ? 'stomato_profilo' : 'stomato_frontale';
    if (t.indexOf('convergenza') === 0) return 'occhi';
    return 'generale';
  }

  w.OSS_PIANI = OSS_PIANI;
  w.ossPianoForTipo = ossPianoForTipo;
  w.ossGruppiPerTipo = function (tipo) { return OSS_PIANI[ossPianoForTipo(tipo)] || OSS_PIANI.generale; };

  // Elenco piatto di un piano, per chi non usa le chip (visita.html).
  var PIANO_ALIAS = {
    frontale: 'frontale_ant', posteriore: 'frontale_post',
    sagittale: 'sagittale_sx',
    podoscopio_sotto: 'podoscopia_sotto', podoscopio_dietro: 'podoscopia_dietro'
  };
  w.polVociPiano = function (piano) {
    var k = PIANO_ALIAS[piano] || piano;
    var gruppi = OSS_PIANI[k];
    if (!gruppi) return [];
    var out = [];
    for (var i = 0; i < gruppi.length; i++) {
      for (var j = 0; j < gruppi[i].items.length; j++) {
        if (out.indexOf(gruppi[i].items[j]) < 0) out.push(gruppi[i].items[j]);
      }
    }
    return out;
  };

  /* ============================================================
     COPPIE DI FOTO — quando due scatti vedono la stessa cosa
     modo 'tutto'  → tutto l'elenco vive sul riferimento (sagittale)
     modo 'alcune' → solo le voci elencate (frontale/posteriore)
     La coppia è sempre fra scatti dello STESSO momento: pre con pre,
     post con post. Pre e post sono due stati clinici diversi.
     ============================================================ */
  var CAPO_CONDIVISO = ['Capo allineato (bipupillare)', 'Capo inclinato a dx', 'Capo inclinato a sx'];

  var COPPIE = {
    // ── sagittale: riferimento SINISTRO, tutto l'elenco + rotazione ──
    'sagittale_sx_pre':  { rif: true,  gemella: 'sagittale_dx_pre',  momento: 'PRE',     modo: 'tutto', rotazione: true, nomeRif: 'sinistro' },
    'sagittale_dx_pre':  { rif: false, gemella: 'sagittale_sx_pre',  momento: 'PRE',     modo: 'tutto', rotazione: true, nomeRif: 'sinistro' },
    'sagittale_sx_post': { rif: true,  gemella: 'sagittale_dx_post', momento: 'POST 3R', modo: 'tutto', rotazione: true, nomeRif: 'sinistro' },
    'sagittale_dx_post': { rif: false, gemella: 'sagittale_sx_post', momento: 'POST 3R', modo: 'tutto', rotazione: true, nomeRif: 'sinistro' },
    'sagittale_sx':      { rif: true,  gemella: 'sagittale_dx',      momento: '',        modo: 'tutto', rotazione: true, nomeRif: 'sinistro' },
    'sagittale_dx':      { rif: false, gemella: 'sagittale_sx',      momento: '',        modo: 'tutto', rotazione: true, nomeRif: 'sinistro' },
    'prima-sx': { rif: true,  gemella: 'prima-dx', momento: 'PRIMA',   modo: 'tutto', rotazione: true, nomeRif: 'sinistro' },
    'prima-dx': { rif: false, gemella: 'prima-sx', momento: 'PRIMA',   modo: 'tutto', rotazione: true, nomeRif: 'sinistro' },
    'dopo-sx':  { rif: true,  gemella: 'dopo-dx',  momento: 'DOPO 3R', modo: 'tutto', rotazione: true, nomeRif: 'sinistro' },
    'dopo-dx':  { rif: false, gemella: 'dopo-sx',  momento: 'DOPO 3R', modo: 'tutto', rotazione: true, nomeRif: 'sinistro' },

    // ── frontale/posteriore: riferimento FRONTALE, solo il capo ──
    // Il bacino NON si condivide: davanti sono le SIAS, dietro le SIPS.
    'frontale_pre':   { rif: true,  gemella: 'posteriore_pre',  momento: 'PRE',     modo: 'alcune', condivise: CAPO_CONDIVISO, nomeRif: 'frontale' },
    'posteriore_pre': { rif: false, gemella: 'frontale_pre',    momento: 'PRE',     modo: 'alcune', condivise: CAPO_CONDIVISO, nomeRif: 'frontale' },
    'frontale_post':   { rif: true,  gemella: 'posteriore_post', momento: 'POST 3R', modo: 'alcune', condivise: CAPO_CONDIVISO, nomeRif: 'frontale' },
    'posteriore_post': { rif: false, gemella: 'frontale_post',   momento: 'POST 3R', modo: 'alcune', condivise: CAPO_CONDIVISO, nomeRif: 'frontale' },
    'frontale':   { rif: true,  gemella: 'posteriore', momento: '', modo: 'alcune', condivise: CAPO_CONDIVISO, nomeRif: 'frontale' },
    'posteriore': { rif: false, gemella: 'frontale',   momento: '', modo: 'alcune', condivise: CAPO_CONDIVISO, nomeRif: 'frontale' }
  };

  function polCoppia(tipo) {
    var t = String(tipo || '').trim().toLowerCase();
    if (!t) return null;
    var chiave = COPPIE[t] ? t : (COPPIE[t.replace(/_/g, '-')] ? t.replace(/_/g, '-') : null);
    if (!chiave) return null;
    var c = COPPIE[chiave];
    return {
      isRiferimento: !!c.rif,
      gemella: c.gemella,
      momento: c.momento,
      modo: c.modo,
      condivise: c.condivise || null,     // null = tutto l'elenco
      rotazione: !!c.rotazione,
      nomeRif: c.nomeRif,
      riferimento: c.rif ? chiave : c.gemella
    };
  }
  w.polCoppia = polCoppia;
  // Nome vecchio, tenuto per compatibilita'.
  w.polSagCoppia = polCoppia;

  /* ------------------------------------------------------------
     ROTAZIONE (solo sagittale) — non e' una proprieta' della foto
     destra: e' una proprieta' della COPPIA. Un solo record, sul lato
     di riferimento, visibile da entrambe.
     ------------------------------------------------------------ */
  var ROT_TITOLO = 'Rotazione (confronto fra i due lati)';
  var ROT_ITEMS = [
    'Profili sovrapponibili — nessuna rotazione apparente',
    'Rotazione del cingolo scapolare a dx',
    'Rotazione del cingolo scapolare a sx',
    'Rotazione del bacino a dx',
    'Rotazione del bacino a sx',
    'Rotazione concorde (cingoli nello stesso senso)',
    'Rotazione dissociata (cingoli in senso opposto)'
  ];
  var ROT_AVVISO =
    'Dal sagittale la rotazione e\' un SOSPETTO, non una misura: dieci centimetri ' +
    'di distanza diversi o tre gradi di rotazione del paziente fra i due scatti la ' +
    'creano dal nulla. Si conferma sul piano frontale/posteriore. Scrivere ' +
    '«asimmetria fra i profili — da confermare sul frontale», mai «rotazione di X gradi».';

  function _esc(x) {
    return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }
  function _uniq(a) {
    var o = []; for (var i = 0; i < a.length; i++) if (o.indexOf(a[i]) < 0) o.push(a[i]); return o;
  }

  /* ============================================================
     STATO DEL PANNELLO — una sola funzione per tutte le pagine.
     Divide le voci salvate in quattro mucchi, e nessuno si perde:
       editabili   → spuntate su questa foto, modificabili qui
       condivise   → arrivano dal riferimento, sola lettura
       legacy      → spuntate qui ma ora di competenza del riferimento
       fuoriElenco → voci vecchie che non stanno piu' in nessun elenco
     ============================================================ */
  function polStatoPannello(o) {
    o = o || {};
    var tipo = o.tipo || '';
    var piano = ossPianoForTipo(tipo);
    var cop = polCoppia(tipo);
    var gruppi = OSS_PIANI[piano] || OSS_PIANI.generale;

    var validi = [], gi, ii;
    for (gi = 0; gi < gruppi.length; gi++)
      for (ii = 0; ii < gruppi[gi].items.length; ii++) validi.push(gruppi[gi].items[ii]);

    var alias = ALIAS[piano] || {};
    function norm(arr) {
      var out = [];
      for (var i = 0; i < (arr || []).length; i++) out.push(alias[arr[i]] || arr[i]);
      return _uniq(out);
    }

    var mie = norm(o.annPropria && o.annPropria.osservazioni);
    var delRif = norm(o.annRiferimento && o.annRiferimento.osservazioni);
    var rot = (o.annRiferimento && Array.isArray(o.annRiferimento.rotazione))
      ? o.annRiferimento.rotazione.slice() : [];

    var bloccate = null;          // null = niente di bloccato
    if (cop && !cop.isRiferimento) bloccate = (cop.modo === 'tutto') ? validi.slice() : (cop.condivise || []);

    function eBloccata(v) { return !!bloccate && bloccate.indexOf(v) >= 0; }

    var editabili = [], legacy = [], fuoriElenco = [];
    for (var i = 0; i < mie.length; i++) {
      var v = mie[i];
      if (validi.indexOf(v) < 0) { fuoriElenco.push(v); continue; }
      if (eBloccata(v)) { legacy.push(v); continue; }   // di competenza del riferimento
      editabili.push(v);
    }
    // Le voci del riferimento che qui sono bloccate: si mostrano spuntate.
    var condivise = [];
    for (var j = 0; j < delRif.length; j++) if (eBloccata(delRif[j])) condivise.push(delRif[j]);
    // Se il riferimento le ha gia', non sono piu' "voci vecchie da spostare".
    legacy = legacy.filter(function (v) { return condivise.indexOf(v) < 0; });

    return {
      tipo: tipo, piano: piano, cop: cop,
      editabili: editabili, condivise: condivise, legacy: legacy,
      fuoriElenco: fuoriElenco, rot: rot,
      gemellaPresente: !!o.gemellaPresente
    };
  }

  // Cosa va scritto nel campo `osservazioni` di QUESTA foto.
  // Le voci fuori elenco e quelle vecchie non si buttano mai via.
  function polVociDaSalvare(stato, editabiliCorrenti) {
    var e = editabiliCorrenti || (stato && stato.editabili) || [];
    return _uniq(e.concat((stato && stato.legacy) || []).concat((stato && stato.fuoriElenco) || []));
  }

  w.polStatoPannello = polStatoPannello;
  w.polVociDaSalvare = polVociDaSalvare;
  w.POL_ROT_ITEMS  = ROT_ITEMS;
  w.POL_ROT_TITOLO = ROT_TITOLO;

  /* ------------------------------------------------------------
     RENDERING del pannello Osserva. Sta qui e non nelle pagine
     perche' i punti d'ingresso sono tre e la lezione #56 di questo
     repo e' «stesso bisogno, una sola delle due strade coperta».
     Stili in linea di proposito: i fogli di stile delle pagine usano
     nomi di classe diversi.
     ------------------------------------------------------------ */
  function polObsHtml(o) {
    o = o || {};
    var chipC = o.chipClass || 'pol-chip';
    var grpC  = o.grpClass  || 'pol-obs-grp';
    var rowC  = o.rowClass  || 'pol-obs-row';
    var click = o.chipClick || 'polToggleObsChip(this)';
    var st = o.stato || polStatoPannello({ tipo: o.tipo });
    var cop = st.cop;
    var gruppi = OSS_PIANI[st.piano] || OSS_PIANI.generale;
    var soloAlcune = !!(cop && !cop.isRiferimento && cop.modo === 'alcune');
    var tutto = !!(cop && !cop.isRiferimento && cop.modo === 'tutto');
    var condSet = tutto ? null : ((cop && cop.condivise) || []);
    var html = '';

    function bloccata(v) { return tutto || (soloAlcune && condSet.indexOf(v) >= 0); }
    function attiva(v) { return st.editabili.indexOf(v) >= 0 || st.condivise.indexOf(v) >= 0; }

    function chip(v, sel, bloc, extra) {
      return '<span class="' + chipC + (sel ? ' active' : '') + '" data-v="' + _esc(v) + '"' +
             (extra || '') + (bloc ? ' aria-disabled="true"' : '') +
             (bloc ? ' style="opacity:.55;cursor:default"' : '') +
             (bloc ? '' : ' onclick="' + click + '"') + '>' + _esc(v) + '</span>';
    }
    function avviso(testo, colore, sfondo) {
      return '<div style="background:' + sfondo + ';border-left:4px solid ' + colore + ';border-radius:6px;' +
             'padding:9px 11px;margin-bottom:10px;font-size:12px;line-height:1.5;color:#333">' + testo + '</div>';
    }

    if (tutto) {
      html += avviso('<b>Voci condivise con il lato ' + _esc(cop.nomeRif) +
        (cop.momento ? ' (' + _esc(cop.momento) + ')' : '') + '.</b> Sono la stessa colonna vista ' +
        'dall\'altro lato: si compilano una volta sola. Qui si leggono, si modificano dal lato sinistro.',
        '#FFD008', '#fff8e0');
    } else if (soloAlcune) {
      html += avviso('<b>Il capo si registra sulla foto ' + _esc(cop.nomeRif) +
        (cop.momento ? ' (' + _esc(cop.momento) + ')' : '') + '</b>, sulla linea bipupillare: ' +
        'qui si legge soltanto. Tutto il resto di questa scheda si compila normalmente.',
        '#FFD008', '#fff8e0');
    }

    for (var g = 0; g < gruppi.length; g++) {
      html += '<div class="' + grpC + '">' + _esc(gruppi[g].g) + '</div>';
      html += '<div class="' + rowC + '">';
      var its = gruppi[g].items || [];
      for (var i = 0; i < its.length; i++) html += chip(its[i], attiva(its[i]), bloccata(its[i]));
      html += '</div>';
      if (gruppi[g].nota) {
        html += '<div style="font-size:11px;line-height:1.45;color:#777;margin:-2px 0 8px">' +
                _esc(gruppi[g].nota) + '</div>';
      }
    }

    // Voci proprie ora di competenza del riferimento: si mostrano e si spostano
    // a mano. Non si cancellano da sole.
    if (st.legacy.length) {
      html += '<div style="background:#fdf1f0;border-left:4px solid #e53935;border-radius:6px;' +
              'padding:9px 11px;margin:12px 0;font-size:12px;line-height:1.55;color:#5a1f1c">' +
              '<b>' + (st.legacy.length === 1
                ? 'Su questa foto c\'è 1 voce registrata prima della condivisione.'
                : 'Su questa foto ci sono ' + st.legacy.length + ' voci registrate prima della condivisione.') +
              '</b><br>' + _esc(st.legacy.join(', ')) +
              (o.legacyClick ? '<br><button type="button" onclick="' + o.legacyClick + '" ' +
                'style="margin-top:8px;background:#e53935;color:#fff;border:none;border-radius:8px;' +
                'padding:8px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer">Sposta sul ' +
                _esc(cop ? cop.nomeRif : 'riferimento') + '</button>' : '') + '</div>';
    }

    // Voci di una versione precedente dell'elenco: restano salvate, si
    // riscrivono a mano perche' non si puo' indovinare quale piede fossero.
    if (st.fuoriElenco.length) {
      html += '<div style="background:#f6f6f4;border-left:4px solid #bbb;border-radius:6px;' +
              'padding:9px 11px;margin:12px 0;font-size:12px;line-height:1.55;color:#444">' +
              '<b>Voci registrate con l\'elenco precedente</b> (restano salvate, non compaiono più fra le crocette):<br>' +
              _esc(st.fuoriElenco.join(', ')) +
              '<br><span style="color:#777">Se servono ancora, rimettile con le voci nuove: quelle vecchie non dicevano quale lato.</span></div>';
    }

    // Blocco rotazione: solo per il sagittale.
    if (cop && cop.rotazione) {
      html += '<div class="' + grpC + '">' + _esc(ROT_TITOLO) + '</div>';
      if (st.gemellaPresente) {
        html += '<div class="' + rowC + '">';
        for (var r = 0; r < ROT_ITEMS.length; r++) {
          html += chip(ROT_ITEMS[r], st.rot.indexOf(ROT_ITEMS[r]) >= 0, false, ' data-rot="1"');
        }
        html += '</div>';
        html += '<div style="font-size:11px;line-height:1.5;color:#7a6400;background:#fffdf2;' +
                'border:1px solid #f0e2a0;border-radius:6px;padding:8px 10px;margin:6px 0 2px">⚠️ ' +
                _esc(ROT_AVVISO) + '</div>';
      } else {
        html += '<div style="font-size:12px;line-height:1.5;color:#666;background:#f6f6f4;' +
                'border-radius:6px;padding:9px 11px;margin-bottom:4px">Manca la foto sagittale ' +
                (cop.isRiferimento ? 'destra' : 'sinistra') +
                (cop.momento ? ' (' + _esc(cop.momento) + ')' : '') +
                '. La rotazione è un confronto fra i due profili: senza l\'altro scatto non si registra.</div>';
      }
      html += '<div style="font-size:11px;color:#888;margin-bottom:6px">' +
              'Un solo record, salvato sul lato sinistro: si vede e si modifica da tutte e due le foto.</div>';
    }
    return html;
  }
  w.polObsHtml = polObsHtml;

  // Etichetta leggibile del piano per il testo AI
  var PIANO_LABEL = {
    frontale_ant: 'Frontale anteriore', frontale_post: 'Frontale posteriore',
    sagittale_sx: 'Sagittale sinistro', sagittale_dx: 'Sagittale destro',
    podoscopia_sotto: 'Podoscopio (vista plantare)', podoscopia_dietro: 'Podoscopio (vista posteriore)',
    capo_frontale: 'Capo (frontale)', capo_profilo: 'Capo (profilo)',
    stomato_frontale: 'Stomatognatico (frontale)', stomato_profilo: 'Stomatognatico (profilo)',
    occhi: 'Convergenza oculare', generale: 'Generale'
  };

  // Raccoglie TUTTE le osservazioni+note delle foto del paziente e le formatta
  // per il prompt AI. Ritorna stringa vuota se non c'è nulla.
  w.polRaccogliOsservazioniVisite = async function (supabase, patientId) {
    try {
      if (!supabase || !patientId) return '';
      var vr = await supabase.from('visits').select('id, tipo, data_visita').eq('patient_id', patientId);
      var visits = vr && vr.data;
      if (!visits || !visits.length) return '';
      var ids = visits.map(function (v) { return v.id; });
      var pr = await supabase.from('visit_photos').select('visit_id, tipo, annotazioni').in('visit_id', ids);
      var photos = pr && pr.data;
      if (!photos || !photos.length) return '';

      function annDi(ph) {
        var a = ph && ph.annotazioni;
        if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = null; } }
        return a || null;
      }
      var perChiave = {};
      for (var k = 0; k < photos.length; k++) {
        perChiave[photos[k].visit_id + '|' + (photos[k].tipo || '')] = photos[k];
      }

      var righe = [];
      for (var i = 0; i < photos.length; i++) {
        var ph = photos[i];
        var ann = annDi(ph);
        if (!ann) continue;
        var oss = Array.isArray(ann.osservazioni) ? ann.osservazioni : [];
        var note = ann.note || '';
        var cop = polCoppia(ph.tipo);

        // Le voci di competenza del riferimento non si stampano due volte.
        if (cop && !cop.isRiferimento && oss.length) {
          var rif = perChiave[ph.visit_id + '|' + cop.riferimento];
          var annRif = annDi(rif);
          var ossRif = (annRif && Array.isArray(annRif.osservazioni)) ? annRif.osservazioni : [];
          if (ossRif.length) {
            oss = oss.filter(function (v) { return ossRif.indexOf(v) < 0; });
          }
        }
        if (!oss.length && !note) continue;
        var piano = PIANO_LABEL[ossPianoForTipo(ph.tipo)] || (ph.tipo || '').replace(/_/g, ' ');
        var parts = [];
        if (oss.length) parts.push(oss.join(', '));
        if (note) parts.push('Note: ' + note);
        righe.push('- ' + piano + ' (' + (ph.tipo || '').replace(/_/g, ' ') + '): ' + parts.join('. '));
      }

      // Rotazione: un solo record per coppia, sul lato di riferimento.
      for (var j = 0; j < photos.length; j++) {
        var p2 = photos[j];
        var c2 = polCoppia(p2.tipo);
        if (!c2 || !c2.rotazione || !c2.isRiferimento) continue;
        var a2 = annDi(p2);
        var rot = (a2 && Array.isArray(a2.rotazione)) ? a2.rotazione : [];
        if (!rot.length) continue;
        righe.push('- Confronto fra i profili sagittali' + (c2.momento ? ' (' + c2.momento + ')' : '') +
                   ': ' + rot.join(', ') +
                   '. [sospetto rilevato sul sagittale, da confermare sul piano frontale/posteriore]');
      }

      if (!righe.length) return '';
      return 'OSSERVAZIONI POSTURALI RILEVATE DAL FISIOTERAPISTA (annotate sulle foto):\n' + righe.join('\n');
    } catch (e) { return ''; }
  };
})(window);
