/* js/schermo-paziente.js — schermo-paziente-v1 (23 settembre 2026) · valutazioni-coerenti-v1 · gradi-foto-v1
 *
 * IL «PRIMA E DOPO» CHE SI MOSTRA AL PAZIENTE, IN UN FILE SOLO.
 *
 * Qui sta la parte che decide COSA si dice al paziente: le parole, i verdetti,
 * il criterio di normalità. La pagina `schermo-paziente.html` disegna e basta.
 *
 * Le regole, decise il 23 settembre (1A 2A 3A 4A 5A 6A):
 *  - la normalità è onesta: il filo a piombo, la simmetria, il paziente
 *    rispetto a sé stesso. Nessuna fascia BLANDO/MODERATO/SEVERO inventata;
 *  - «migliorato» solo oltre la variabilità misurata. Dentro, è «invariato»,
 *    anche quando si sperava il contrario;
 *  - si dice «DOPO i 3 Respiri», mai «GRAZIE ai 3 Respiri»: un prima/dopo nella
 *    stessa seduta non separa l'effetto dei cuscini da tutto il resto;
 *  - finché la Fase 0 posturale non c'è, le FOTO si guardano e basta: nessun
 *    verdetto numerico sulle foto.
 *
 * ⚠️ Questo file è matematica e parole: NIENTE rete, NIENTE Supabase.
 *    Un controllo automatico lo verifica.
 */
;(function (global) {
  'use strict'

  // ── LE PAROLE CHE LEGGE IL PAZIENTE ──────────────────────────────────
  // Una chiave → una frase. ⚠️ Vanno rilette da Giuliano prima di usarle
  // davanti ai pazienti (METODO-lavoro.md: «vale anche per le parole che
  // legge un paziente»).
  var TESTI = {
    copertina_titolo:   'Il tuo prima e dopo',
    copertina_sotto:    'Tecnica dei 3 Respiri · circa 42 secondi',
    copertina_nota:     'Stessa seduta, stesse condizioni: cambia solo il prima e il dopo.',
    prima:              'Prima',
    dopo:               'Dopo i 3 Respiri',
    // valutazioni-coerenti-v1 · la valutazione iniziale (scheda paziente)
    copertina_sotto_scheda: 'Valutazione iniziale · prima e dopo i cuscini',
    dopo_scheda:        'Dopo i cuscini',

    foto_profilo:       'Come stai in piedi, di profilo',
    foto_fronte:        'Come stai in piedi, di fronte',
    foto_spalle:        'Come stai in piedi, di spalle',
    foto_piedi_sotto:   'Come appoggi i piedi',
    foto_piedi_dietro:  'I tuoi piedi, da dietro',
    criterio_profilo:   'Il riferimento è il filo a piombo: orecchio, spalla, anca, ginocchio e caviglia vicini alla stessa linea verticale.',
    criterio_simmetria: 'Il riferimento è la simmetria: le due metà del corpo alla stessa altezza.',
    criterio_piedi:     'Il riferimento è la simmetria: i due piedi appoggiati allo stesso modo.',
    foto_affiancate:    'Affiancate',
    foto_sovrapposte:   'Sovrapposte',

    spalla_titolo:      'La tua spalla rispetto alla linea',
    spalla_criterio:    'Il riferimento è la spalla in asse con il filo a piombo: né in avanti, né indietro.',
    spalla_fonte:       'Osservazione del fisioterapista',

    eq_titolo:          'Il tuo equilibrio',
    eq_criterio:        'Qui il riferimento sei tu: si confronta il dopo con il tuo prima. Più il disegno è piccolo e lento, più stai fermo in equilibrio.',
    eq_misura:          'Velocità di oscillazione',
    eq_banda:           'Conta solo una differenza oltre {b}%: sotto, è la variabilità normale della misura.',

    sintesi_titolo:     'Cosa è cambiato',
    sintesi_foto:       'Le foto le guardiamo insieme: per dare un numero alla postura serve prima tarare la misura.',
    percorso_titolo:    'Il tuo percorso',
    percorso_sotto:     'Seduta dopo seduta: il prima e il dopo di ogni volta.',

    // gradi-foto-v1 · i gradi sulle foto (3A 4A)
    gradi_bottone:      '° Gradi',
    rif_bottone:        '📐 Riferimento',
    gradi_nota:         'Differenza da confermare: l’errore di questa misura non è ancora stato misurato. I gradi si leggono, non si giudicano.',
    /* editor-punti-v1 */ gradi_nota_misurata:'Conta solo una differenza oltre l’errore della misura, misurato ripetendo le foto: sotto, è «invariato».',
    sintesi_gradi:      'Le foto hanno {n} confronti in gradi: la differenza si legge, ma non si giudica finché non misuriamo l’errore della misura.',
    gradi_tempo_titolo: 'I gradi nel tempo',
    gradi_tempo_sotto:  'Prima → dopo, seduta per seduta. 0° è il riferimento.',

    esito_meglio:       'Più vicino al riferimento',
    esito_uguale:       'Invariato',
    esito_lavoro:       'Da lavorare',
    esito_altro:        'Cambiato',
    esito_nd:           'Non registrato',
    eq_meglio:          'Più stabile',
    eq_uguale:          'Invariato',
    eq_lavoro:          'Meno stabile'
  }

  // ── LA SPALLA (piano scapolare, osservazione a chip) ────────────────
  // I valori sono quelli dei chip di valutazione-posturale.html e visita.html.
  // pos: dove sta rispetto al filo (0 = in asse, +1 avanti, −1 indietro).
  var SCAPOLA = {
    in_asse:    { pos: 0,  parola: 'In asse' },
    anteriore:  { pos: 1,  parola: 'In avanti' },
    posteriore: { pos: -1, parola: 'Indietro' }
  }

  function esitoScapola(pre, post) {
    var a = SCAPOLA[pre], b = SCAPOLA[post]
    var out = { pre: pre || null, post: post || null, a: a || null, b: b || null }
    if (!a || !b)              out.esito = 'nd'
    else if (pre === post)     out.esito = 'uguale'
    else if (b.pos === 0)      out.esito = 'meglio'   // arriva in asse
    else if (a.pos === 0)      out.esito = 'lavoro'   // era in asse, non lo è più
    else                       out.esito = 'altro'    // da avanti a indietro o viceversa
    return out
  }

  // ── IL GIORNO ────────────────────────────────────────────────────────
  // Il giorno di calendario ITALIANO: una prova delle 00:30 è di quel giorno,
  // non di quello prima come direbbe l'UTC.
  function giornoDi(iso) {
    if (!iso) return null
    var s = String(iso)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s            // data_visita è già un giorno
    var d = new Date(s)
    if (isNaN(d.getTime())) return null
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
    } catch (e) {
      return d.toISOString().slice(0, 10)
    }
  }

  function dataLunga(g) {
    if (!g) return 'data non registrata'
    var d = new Date(g + 'T12:00:00')
    return isNaN(d.getTime()) ? 'data non registrata'
      : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }
  function dataCorta(g) {
    if (!g) return 'Senza data'
    var d = new Date(g + 'T12:00:00')
    return isNaN(d.getTime()) ? 'Senza data' : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  // ── I GIORNI DA MOSTRARE ────────────────────────────────────────────
  // Un giorno entra se ha almeno UN prima/dopo vero: una coppia di foto dello
  // stesso piano, la spalla prima e dopo, oppure prove di equilibrio segnate.
  // Le visite dello stesso giorno (posturale e fisioterapica) si sommano; se
  // tutte e due hanno lo stesso piano, vince la posturale.
  //   visite: [{id, tipo, data_visita, created_at, note_scapolare_pre, note_scapolare_post}]
  //   foto:   [{visit_id, tipo, storage_path, url}]
  //   prove:  righe di oscillazione_test
  //   piani:  POSTURAL_PHOTO_PLANES
  //   scheda: { foto: { plane: { pre, post } }, data } | null  (foto iniziali)
  function costruisciGiorni(o) {
    var piani = o.piani || [], per = {}, ordine = []
    function giorno(k) {
      if (!per[k]) { per[k] = { giorno: k === 'scheda' ? giornoDi(o.scheda && o.scheda.data) : k, chiave: k,
        visite: [], foto: {}, scap: null, prove: [], scheda: k === 'scheda' }; ordine.push(k) }
      return per[k]
    }
    var visite = (o.visite || []).slice().sort(function (a, b) {
      // la posturale per prima: è lei che vince sui piani doppi
      return (a.tipo === 'posturale' ? 0 : 1) - (b.tipo === 'posturale' ? 0 : 1)
    })
    var fotoPer = {}
    ;(o.foto || []).forEach(function (f) { (fotoPer[f.visit_id] = fotoPer[f.visit_id] || []).push(f) })

    visite.forEach(function (v) {
      var k = giornoDi(v.data_visita || v.created_at); if (!k) return
      var g = giorno(k)
      g.visite.push({ id: v.id, tipo: v.tipo })
      var lista = fotoPer[v.id] || []
      piani.forEach(function (pl) {
        if (g.foto[pl.plane]) return
        var pre = lista.filter(function (f) { return f.tipo === pl.pre.tipo && (f.url || f.storage_path) })[0]
        var post = lista.filter(function (f) { return f.tipo === pl.post.tipo && (f.url || f.storage_path) })[0]
        if (pre && post) g.foto[pl.plane] = {
          pre:  { path: pre.storage_path || null, url: pre.url || null },
          post: { path: post.storage_path || null, url: post.url || null } }
      })
      if (!g.scap && (v.note_scapolare_pre || v.note_scapolare_post)) g.scap = esitoScapola(v.note_scapolare_pre, v.note_scapolare_post)
    })

    if (o.scheda && o.scheda.foto) {
      var coppie = {}
      Object.keys(o.scheda.foto).forEach(function (pl) {
        var c = o.scheda.foto[pl]
        if (c && c.pre && c.post && (c.pre.url || c.pre.path) && (c.post.url || c.post.path)) coppie[pl] = c
      })
      if (Object.keys(coppie).length) giorno('scheda').foto = coppie
    }

    ;(o.prove || []).forEach(function (r) {
      if (r.momento !== 'pre' && r.momento !== 'post') return
      var k = giornoDi(r.quando); if (!k) return
      giorno(k).prove.push(r)
    })
    // le prove NON segnate: servono al professionista per segnarle, non
    // entrano nel confronto (non si indovina cosa è prima e cosa è dopo)
    ;(o.prove || []).forEach(function (r) {
      if (r.momento === 'pre' || r.momento === 'post') return
      var k = giornoDi(r.quando); if (!k) return
      var g = giorno(k)
      ;(g.nonSegnate = g.nonSegnate || []).push(r)
    })

    var out = ordine.map(function (k) { return per[k] }).filter(function (g) {
      var eq = equilibrio(g.prove)
      g.eq = eq
      return Object.keys(g.foto).length || (g.scap && g.scap.esito !== 'nd') || (eq && eq.condizioni.length) ||
             (g.nonSegnate && g.nonSegnate.length)
    })
    // in ordine di tempo; le foto iniziali della scheda senza data vanno per prime
    out.sort(function (a, b) {
      if (!a.giorno && !b.giorno) return 0
      if (!a.giorno) return -1
      if (!b.giorno) return 1
      if (a.giorno === b.giorno) return (a.scheda ? -1 : 0) + (b.scheda ? 1 : 0)   // stesso giorno: prima la valutazione iniziale
      return a.giorno < b.giorno ? -1 : a.giorno > b.giorno ? 1 : 0
    })
    return out
  }

  // ── L'EQUILIBRIO: prima contro dopo, con le soglie della Fase 0 ─────
  // Usa PolOscillazione (js/oscillazione.js): stesse medie, stesse soglie,
  // stesse parole dello storico. Due motori per la stessa misura divergono.
  function equilibrio(prove) {
    var P = global.PolOscillazione
    if (!P || !prove || !prove.length) return null
    // il momento esce dalla chiave della condizione: qui il prima e il dopo
    // DEVONO finire nella stessa condizione per essere confrontati
    var senza = function (r) { var c = {}; for (var k in r) c[k] = r[k]; c.momento = null; return c }
    var pre  = prove.filter(function (r) { return r.momento === 'pre' }).map(senza)
    var post = prove.filter(function (r) { return r.momento === 'post' }).map(senza)
    if (!pre.length || !post.length) return { condizioni: [], soloPre: pre.length, soloPost: post.length }
    var c = P.confrontoSessioni(pre, post)
    var perK = function (lista, k) { return lista.filter(function (r) { return P.condizioneDi(r) === k }) }
    return {
      condizioni: c.condizioni.map(function (x) {
        return {
          chiave: x.condizione, nome: P.nomeCond(x.condizione),
          esito: x.verdetto === 'PIÙ STABILE' ? 'meglio' : (x.verdetto === 'MENO STABILE' ? 'lavoro' : 'uguale'),
          verdetto: x.verdetto, velA: x.a.velocita, velB: x.b.velocita, dv: x.dv, banda: x.bandaVel,
          nA: x.a.n, nB: x.b.n, tarati: x.a.tarati && x.b.tarati,
          righeA: perK(pre, x.condizione), righeB: perK(post, x.condizione)
        }
      }),
      soloPre: c.soloA.length, soloPost: c.soloB.length
    }
  }

  // La prova da disegnare per una parte: la mediana per velocità, come lo
  // storico. Non la migliore: quella scelta a mano racconterebbe una storia.
  function provaMediana(righe) {
    var s = (righe || []).filter(function (r) { return r && r.traccia && r.velocita != null })
      .slice().sort(function (a, b) { return Number(a.velocita) - Number(b.velocita) })
    return s.length ? s[Math.floor((s.length - 1) / 2)] : null
  }

  // ── LA SINTESI ──────────────────────────────────────────────────────
  // Si contano SOLO le cose che hanno un verdetto onesto. Le foto no (6A).
  function sintesi(g) {
    var voci = []
    if (g.scap && g.scap.esito !== 'nd') {
      voci.push({ cosa: 'Spalla rispetto alla linea', esito: g.scap.esito,
        dettaglio: g.scap.a.parola + ' → ' + g.scap.b.parola, fonte: TESTI.spalla_fonte })
    }
    if (g.eq) g.eq.condizioni.forEach(function (c) {
      voci.push({ cosa: 'Equilibrio · ' + c.nome, esito: c.esito,
        dettaglio: numIt(c.velA, 1) + ' → ' + numIt(c.velB, 1) + ' °/s (' + segno(c.dv) + ')',
        fonte: 'Oscillazione Policettiva' })
    })
    var conta = { meglio: 0, uguale: 0, lavoro: 0, altro: 0 }
    voci.forEach(function (v) { conta[v.esito] = (conta[v.esito] || 0) + 1 })
    return { voci: voci, conta: conta, totale: voci.length, foto: Object.keys(g.foto || {}).length }
  }

  // ── IL PERCORSO ─────────────────────────────────────────────────────
  // La condizione di equilibrio più ricorrente fra i giorni, e per ogni giorno
  // la velocità media prima e dopo. Niente medie fra condizioni diverse.
  function percorso(giorni) {
    var conta = {}
    giorni.forEach(function (g) { if (g.eq) g.eq.condizioni.forEach(function (c) { conta[c.chiave] = (conta[c.chiave] || 0) + 1 }) })
    var chiave = Object.keys(conta).sort(function (a, b) { return conta[b] - conta[a] })[0] || null
    var punti = giorni.map(function (g) {
      var c = chiave && g.eq ? g.eq.condizioni.filter(function (x) { return x.chiave === chiave })[0] : null
      return { giorno: g.giorno, scheda: g.scheda, scap: g.scap || null,
        velA: c ? c.velA : null, velB: c ? c.velB : null, esitoEq: c ? c.esito : null }
    })
    var P = global.PolOscillazione
    return { chiave: chiave, nome: chiave && P ? P.nomeCond(chiave) : null, punti: punti,
      conEq: punti.filter(function (p) { return p.velA != null }).length,
      conScap: punti.filter(function (p) { return p.scap && p.scap.esito !== 'nd' }).length }
  }

  // ── ALLINEAMENTO DELLE FOTO (stessa matematica di comparazione.html) ─
  // Due riferimenti per foto → scala, rotazione e spostamento che portano i
  // riferimenti di B sopra quelli di A. box = riquadro in cui è disegnata la
  // foto (object-fit: contain), p = punti normalizzati 0..1.
  function matriceAllineamento(boxA, boxB, pa, pb) {
    if (!boxA || !boxB || !pa || !pb || !pa.a || !pa.b || !pb.a || !pb.b) return null
    var inBox = function (r, p) { return { x: r.x + p.x * r.w, y: r.y + p.y * r.h } }
    var a1 = inBox(boxA, pa.a), a2 = inBox(boxA, pa.b), b1 = inBox(boxB, pb.a), b2 = inBox(boxB, pb.b)
    var dr = { x: a2.x - a1.x, y: a2.y - a1.y }, dp = { x: b2.x - b1.x, y: b2.y - b1.y }
    var lr = Math.hypot(dr.x, dr.y), lp = Math.hypot(dp.x, dp.y)
    if (lp < 1 || lr < 1) return null
    var s = lr / lp, th = Math.atan2(dr.y, dr.x) - Math.atan2(dp.y, dp.x)
    var co = Math.cos(th), si = Math.sin(th)
    return [s * co, s * si, -s * si, s * co, a1.x - s * (co * b1.x - si * b1.y), a1.y - s * (si * b1.x + co * b1.y)]
  }

  function numIt(x, dec) {
    if (x == null || isNaN(x)) return '—'
    return Number(x).toFixed(dec).replace('.', ',')
  }
  function segno(d) { return (d >= 0 ? '+' : '−') + Math.round(Math.abs(d)) + '%' }

  global.PolSchermo = {
    TESTI: TESTI, SCAPOLA: SCAPOLA,
    esitoScapola: esitoScapola, giornoDi: giornoDi, dataLunga: dataLunga, dataCorta: dataCorta,
    costruisciGiorni: costruisciGiorni, equilibrio: equilibrio, provaMediana: provaMediana,
    sintesi: sintesi, percorso: percorso, matriceAllineamento: matriceAllineamento,
    numIt: numIt, segno: segno
  }
})(typeof window !== 'undefined' ? window : globalThis)
