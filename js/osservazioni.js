/* ============================================================
   POLICETTIVO — Osservazioni posturali per piano
   Tassonomia clinica fornita dal professionista.
   Usata dal pannello "Osserva" dentro Annota.
   ============================================================ */
(function (w) {
  'use strict';

  var OSS_PIANI = {
    // FRONTALE ANTERIORE — piani di riferimento delle Linee guida
    frontale_ant: [
      { g: 'Capo (piano bipupillare)', items: ['Capo inclinato a dx', 'Capo inclinato a sx', 'Capo ruotato a dx', 'Capo ruotato a sx'] },
      { g: 'Spalle (piano biacromiale)', items: ['Spalla dx più alta', 'Spalla sx più alta', 'Anteposizione spalla dx', 'Anteposizione spalla sx'] },
      { g: 'Bacino (piano biiliaco)', items: ['Emibacino dx più alto', 'Emibacino sx più alto', 'Rotazione del bacino'] },
      { g: 'Ginocchia (piano birotuleo)', items: ['Ginocchia valghe', 'Ginocchia vare'] },
      { g: 'Arti inferiori', items: ['Arto inf. dx più corto', 'Arto inf. sx più corto'] },
      { g: 'Piedi (piano bimalleolare)', items: ['Appoggio pronato', 'Appoggio supinato'] }
    ],
    // FRONTALE POSTERIORE
    frontale_post: [
      { g: 'Capo e collo', items: ['Capo inclinato a dx', 'Capo inclinato a sx'] },
      { g: 'Scapole', items: ['Scapola dx più alta', 'Scapola sx più alta', 'Scapola alata dx', 'Scapola alata sx'] },
      { g: 'Rachide', items: ['Atteggiamento scoliotico dx', 'Atteggiamento scoliotico sx', 'Gibbo costale dx', 'Gibbo costale sx'] },
      { g: 'Bacino (piano biiliaco)', items: ['Emibacino dx più alto', 'Emibacino sx più alto'] },
      { g: 'Retropiede', items: ['Retropiede valgo', 'Retropiede varo'] }
    ],
    // SAGITTALE — filo a piombo e curve del rachide
    sagittale_sx: [
      { g: 'Capo', items: ['Anteposizione del capo', 'Capo allineato'] },
      { g: 'Rachide cervicale', items: ['Iperlordosi cervicale', 'Rettilineizzazione cervicale'] },
      { g: 'Rachide dorsale', items: ['Ipercifosi dorsale', 'Dorso piatto'] },
      { g: 'Rachide lombare', items: ['Iperlordosi lombare', 'Rettilineizzazione lombare'] },
      { g: 'Bacino', items: ['Antiversione del bacino', 'Retroversione del bacino'] },
      { g: 'Ginocchio', items: ['Ginocchio recurvato', 'Ginocchio flesso'] },
      { g: 'Filo a piombo', items: ['Allineato', 'Baricentro anteriore', 'Baricentro posteriore'] }
    ],
    // PODOSCOPIA — appoggio piatto/valgo/cavo (Linee guida)
    podoscopia: [
      { g: 'Arco plantare', items: ['Piede normale', 'Piede piatto', 'Piede cavo'] },
      { g: 'Appoggio', items: ['Appoggio valgo', 'Appoggio varo', 'Pronazione', 'Supinazione'] },
      { g: 'Carico', items: ['Asimmetria di carico dx', 'Asimmetria di carico sx'] }
    ],
    // CAPO (ravvicinato)
    capo: [
      { g: 'Capo', items: ['Inclinato a dx', 'Inclinato a sx', 'Ruotato a dx', 'Ruotato a sx', 'Anteposto'] }
    ],
    // STOMATOGNATICO (essenziale)
    stomato: [
      { g: 'Stomatognatico', items: ['Latero-deviazione mandibolare dx', 'Latero-deviazione mandibolare sx', 'Deviazione in apertura'] }
    ],
    // CONVERGENZA OCULARE (essenziale)
    occhi: [
      { g: 'Convergenza oculare', items: ['Normale', 'Insufficienza di convergenza'] }
    ],
    // GENERALE (fallback)
    generale: [
      { g: 'Osservazioni', items: ['Spalla dx alta', 'Spalla sx alta', 'Emibacino dx alto', 'Emibacino sx alto', 'Anteposizione del capo', 'Ipercifosi dorsale', 'Iperlordosi lombare', 'Atteggiamento scoliotico'] }
    ]
  };

  // Sagittale destro = stesse variabili del sinistro.
  // ⚠️ Dal 29 ago le voci sagittali si compilano UNA VOLTA SOLA, sul lato
  // sinistro (riferimento): il destro le mostra in sola lettura. L'elenco resta
  // condiviso perche' e' la stessa colonna vertebrale vista dall'altro lato.
  OSS_PIANI.sagittale_dx = OSS_PIANI.sagittale_sx;

  /* ============================================================
     COPPIA SAGITTALE — sagittale-condiviso-v1
     Le curve del rachide, il capo, il bacino, il ginocchio e il filo a piombo
     sono la STESSA colonna: registrarli due volte non aggiunge informazione,
     aggiunge la possibilita' che le due schede si contraddicano.
     Il lato di riferimento e' SINISTRO (decisione A del 29 ago).
     La coppia e' sempre fra scatti dello STESSO momento: sx_pre con dx_pre,
     sx_post con dx_post. Pre e post sono due stati clinici diversi e non
     condividono niente.
     ============================================================ */
  var SAG_COPPIA = {
    // foto di visita (visit_photos.tipo)
    'sagittale_sx_pre':  { lato: 'sx', gemella: 'sagittale_dx_pre',  momento: 'PRE' },
    'sagittale_dx_pre':  { lato: 'dx', gemella: 'sagittale_sx_pre',  momento: 'PRE' },
    'sagittale_sx_post': { lato: 'sx', gemella: 'sagittale_dx_post', momento: 'POST 3R' },
    'sagittale_dx_post': { lato: 'dx', gemella: 'sagittale_sx_post', momento: 'POST 3R' },
    'sagittale_sx':      { lato: 'sx', gemella: 'sagittale_dx',      momento: '' },
    'sagittale_dx':      { lato: 'dx', gemella: 'sagittale_sx',      momento: '' },
    // slot della scheda paziente (patients.foto_annotazioni)
    'prima-sx': { lato: 'sx', gemella: 'prima-dx', momento: 'PRIMA' },
    'prima-dx': { lato: 'dx', gemella: 'prima-sx', momento: 'PRIMA' },
    'dopo-sx':  { lato: 'sx', gemella: 'dopo-dx',  momento: 'DOPO 3R' },
    'dopo-dx':  { lato: 'dx', gemella: 'dopo-sx',  momento: 'DOPO 3R' }
  };

  // Ritorna null se la foto non e' sagittale. Altrimenti:
  //   { lato, gemella, momento, riferimento, isRiferimento }
  // 'riferimento' e' il tipo/slot su cui vivono i dati condivisi (sempre il sx).
  function polSagCoppia(tipo) {
    var t = String(tipo || '').trim().toLowerCase();
    if (!t) return null;
    var c = SAG_COPPIA[t];
    // gli slot della scheda paziente girano sia con trattino sia con underscore
    if (!c) c = SAG_COPPIA[t.replace(/_/g, '-')];
    if (!c) return null;
    var chiave = SAG_COPPIA[t] ? t : t.replace(/_/g, '-');
    return {
      lato: c.lato,
      gemella: c.gemella,
      momento: c.momento,
      riferimento: (c.lato === 'sx' ? chiave : c.gemella),
      isRiferimento: (c.lato === 'sx')
    };
  }

  /* ------------------------------------------------------------
     ROTAZIONE — non e' una proprieta' della foto destra: e' una
     proprieta' della COPPIA. Non esiste in nessuna delle due foto,
     esiste nel fatto che i due profili non si somigliano.
     Percio': un solo record, sul lato di riferimento, visibile da
     entrambe. Concorde e dissociata sono due quadri clinici
     diversi, non due modi di dire la stessa cosa.
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

  /* Renderer condiviso del pannello Osserva.
     Vive qui e non nelle pagine perche' i punti d'ingresso sono due
     (disegno.html e valutazione-posturale.html) e la lezione #56 di questo
     repo e' esattamente «stesso bisogno, una sola delle due strade coperta».
     Gli stili sono in linea di proposito: cosi' il blocco funziona identico
     nei due fogli di stile, che hanno nomi di classe diversi.

     o = {
       tipo,                      // tipo/slot della foto aperta
       chipClass,                 // classe delle chip nella pagina chiamante
       grpClass, rowClass,        // classi di gruppo/riga
       chipClick,                 // es. "polToggleObsChip(this)"
       sagSel:  [],               // voci sagittali spuntate (dal riferimento)
       rotSel:  [],               // voci di rotazione spuntate (dal riferimento)
       legacy:  [],               // voci gia' salvate su QUESTA foto destra
       legacyClick,               // handler del pulsante "unisci a sinistra"
       gemellaPresente: bool      // esiste la foto dell'altro lato?
     }
  */
  function polObsHtml(o) {
    o = o || {};
    var chipC = o.chipClass || 'pol-chip';
    var grpC  = o.grpClass  || 'pol-obs-grp';
    var rowC  = o.rowClass  || 'pol-obs-row';
    var click = o.chipClick || 'polToggleObsChip(this)';
    var sagSel = o.sagSel || [], rotSel = o.rotSel || [], legacy = o.legacy || [];
    var cop = polSagCoppia(o.tipo);
    var bloccato = !!(cop && !cop.isRiferimento);
    var groups = w.ossGruppiPerTipo ? w.ossGruppiPerTipo(o.tipo) : null;
    var html = '';

    function chip(v, sel, bloc, extra) {
      var cls = chipC + (sel ? ' active' : '');
      var st  = bloc ? ' style="opacity:.55;cursor:default"' : '';
      var on  = bloc ? '' : ' onclick="' + click + '"';
      return '<span class="' + cls + '" data-v="' + _esc(v) + '"' + (extra || '') +
             (bloc ? ' aria-disabled="true"' : '') + st + on + '>' + _esc(v) + '</span>';
    }

    if (bloccato) {
      html += '<div style="background:#fff8e0;border-left:4px solid #FFD008;border-radius:6px;' +
              'padding:9px 11px;margin-bottom:10px;font-size:12px;line-height:1.5;color:#4a3c00">' +
              '<b>Voci condivise con il lato sinistro' + (cop.momento ? ' (' + _esc(cop.momento) + ')' : '') + '.</b> ' +
              'Sono la stessa colonna vista dall\'altro lato: si compilano una volta sola. ' +
              'Qui si leggono, si modificano dal lato sinistro.</div>';
    }

    if (groups) {
      for (var g = 0; g < groups.length; g++) {
        html += '<div class="' + grpC + '">' + _esc(groups[g].g) + '</div><div class="' + rowC + '">';
        var its = groups[g].items || [];
        for (var i = 0; i < its.length; i++) {
          html += chip(its[i], sagSel.indexOf(its[i]) >= 0, bloccato);
        }
        html += '</div>';
      }
    }

    // Voci rimaste sulla foto destra da prima della condivisione: non si
    // cancellano da sole. Si mostrano, e il professionista decide.
    if (bloccato && legacy.length) {
      html += '<div style="background:#fdf1f0;border-left:4px solid #e53935;border-radius:6px;' +
              'padding:9px 11px;margin:12px 0;font-size:12px;line-height:1.55;color:#5a1f1c">' +
              '<b>' + (legacy.length === 1
                ? 'Su questa foto c\'e\' 1 voce registrata prima della condivisione.'
                : 'Su questa foto ci sono ' + legacy.length + ' voci registrate prima della condivisione.') +
              '</b><br>' +
              _esc(legacy.join(', ')) +
              (o.legacyClick ? '<br><button type="button" onclick="' + o.legacyClick + '" ' +
                'style="margin-top:8px;background:#e53935;color:#fff;border:none;border-radius:8px;' +
                'padding:8px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer">' +
                'Sposta a sinistra</button>' : '') +
              '</div>';
    }

    if (cop) {
      html += '<div class="' + grpC + '">' + _esc(ROT_TITOLO) + '</div>';
      if (o.gemellaPresente) {
        html += '<div class="' + rowC + '">';
        for (var r = 0; r < ROT_ITEMS.length; r++) {
          html += chip(ROT_ITEMS[r], rotSel.indexOf(ROT_ITEMS[r]) >= 0, false, ' data-rot="1"');
        }
        html += '</div>';
        html += '<div style="font-size:11px;line-height:1.5;color:#7a6400;background:#fffdf2;' +
                'border:1px solid #f0e2a0;border-radius:6px;padding:8px 10px;margin:6px 0 2px">⚠️ ' +
                _esc(ROT_AVVISO) + '</div>';
      } else {
        html += '<div style="font-size:12px;line-height:1.5;color:#666;background:#f6f6f4;' +
                'border-radius:6px;padding:9px 11px;margin-bottom:4px">' +
                'Manca la foto sagittale ' + (cop.lato === 'sx' ? 'destra' : 'sinistra') +
                (cop.momento ? ' (' + _esc(cop.momento) + ')' : '') + '. ' +
                'La rotazione e\' un confronto fra i due profili: senza l\'altro scatto non si registra.</div>';
      }
      html += '<div style="font-size:11px;color:#888;margin-bottom:6px">' +
              'Un solo record, salvato sul lato sinistro: si vede e si modifica da tutte e due le foto.</div>';
    }
    return html;
  }

  w.polSagCoppia   = polSagCoppia;
  w.POL_ROT_ITEMS  = ROT_ITEMS;
  w.POL_ROT_TITOLO = ROT_TITOLO;
  w.polObsHtml     = polObsHtml;

  function ossPianoForTipo(t) {
    t = (t || '').toLowerCase();
    // osserva-ovunque-v1 — gli slot della SCHEDA PAZIENTE hanno nomi diversi da
    // quelli delle visite ('prima-sx' invece di 'sagittale_sx'), ma sono le
    // stesse viste. Senza queste righe la scheda paziente cadeva su 'generale'
    // e mostrava un elenco di voci che non c'entravano col piano inquadrato.
    // Stessa traduzione che fa gia' classifyView() in js/postural-overlay.js:
    // la conoscenza era in due posti e ne era stato aggiornato uno solo.
    if (t.indexOf('prima-sx') === 0 || t.indexOf('prima_sx') === 0) return 'sagittale_sx';
    if (t.indexOf('dopo-sx')  === 0 || t.indexOf('dopo_sx')  === 0) return 'sagittale_sx';
    if (t.indexOf('prima-dx') === 0 || t.indexOf('prima_dx') === 0) return 'sagittale_dx';
    if (t.indexOf('dopo-dx')  === 0 || t.indexOf('dopo_dx')  === 0) return 'sagittale_dx';
    if (t.indexOf('podo') === 0) return 'podoscopia';
    if (t.indexOf('sagittale_sx') === 0) return 'sagittale_sx';
    if (t.indexOf('sagittale_dx') === 0) return 'sagittale_dx';
    if (t.indexOf('frontale') === 0) return 'frontale_ant';
    if (t.indexOf('posteriore') === 0) return 'frontale_post';
    if (t.indexOf('podoscopio') === 0) return 'podoscopia';
    if (t.indexOf('capo') === 0) return 'capo';
    if (t.indexOf('stomato') === 0) return 'stomato';
    if (t.indexOf('convergenza') === 0) return 'occhi';
    return 'generale';
  }

  w.OSS_PIANI = OSS_PIANI;
  w.ossPianoForTipo = ossPianoForTipo;
  w.ossGruppiPerTipo = function (tipo) { return OSS_PIANI[ossPianoForTipo(tipo)] || OSS_PIANI.generale; };

  // Etichetta leggibile del piano per il testo AI
  var PIANO_LABEL = {
    frontale_ant: 'Frontale anteriore', frontale_post: 'Frontale posteriore',
    sagittale_sx: 'Sagittale sinistro', sagittale_dx: 'Sagittale destro',
    podoscopia: 'Podoscopia', capo: 'Capo', stomato: 'Stomatognatico',
    occhi: 'Occhi', generale: 'Generale'
  };

  // Raccoglie TUTTE le osservazioni+note delle foto del paziente e le formatta per il prompt AI.
  // Ritorna stringa vuota se non c'è nulla.
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
      // indice per ritrovare la foto gemella: la rotazione e le voci sagittali
      // vivono sul lato di riferimento, non su questa foto.
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
        var cop = polSagCoppia(ph.tipo);

        // sagittale-condiviso-v1 — sul lato destro le voci sagittali sono quelle
        // del sinistro: stamparle di nuovo le farebbe contare due volte. Restano
        // solo le eventuali voci vecchie che il sinistro non ha.
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
        var c2 = polSagCoppia(p2.tipo);
        if (!c2 || !c2.isRiferimento) continue;
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
