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

  // Sagittale destro = stesse variabili del sinistro
  OSS_PIANI.sagittale_dx = OSS_PIANI.sagittale_sx;

  function ossPianoForTipo(t) {
    t = (t || '').toLowerCase();
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
      var righe = [];
      for (var i = 0; i < photos.length; i++) {
        var ph = photos[i];
        var ann = ph.annotazioni;
        if (typeof ann === 'string') { try { ann = JSON.parse(ann); } catch (e) { ann = null; } }
        if (!ann) continue;
        var oss = Array.isArray(ann.osservazioni) ? ann.osservazioni : [];
        var note = ann.note || '';
        if (!oss.length && !note) continue;
        var piano = PIANO_LABEL[ossPianoForTipo(ph.tipo)] || (ph.tipo || '').replace(/_/g, ' ');
        var parts = [];
        if (oss.length) parts.push(oss.join(', '));
        if (note) parts.push('Note: ' + note);
        righe.push('- ' + piano + ' (' + (ph.tipo || '').replace(/_/g, ' ') + '): ' + parts.join('. '));
      }
      if (!righe.length) return '';
      return 'OSSERVAZIONI POSTURALI RILEVATE DAL FISIOTERAPISTA (annotate sulle foto):\n' + righe.join('\n');
    } catch (e) { return ''; }
  };
})(window);
