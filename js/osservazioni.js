/* ============================================================
   POLICETTIVO — Osservazioni posturali per piano
   Tassonomia clinica fornita dal professionista.
   Usata dal pannello "Osserva" dentro Annota.
   ============================================================ */
(function (w) {
  'use strict';

  var OSS_PIANI = {
    frontale_ant: [
      { g: 'Testa e collo', items: ['Inclinazione laterale del capo', 'Rotazione del capo', 'Asimmetria mandibolare', 'Asimmetria auricolare', 'Asimmetria orbitaria'] },
      { g: 'Cingolo scapolare', items: ['Altezza spalle', 'Rotazione delle spalle', 'Anteposizione spalla dx', 'Anteposizione spalla sx', 'Simmetria clavicole', 'Simmetria triangoli della taglia'] },
      { g: 'Torace', items: ['Rotazione toracica', 'Asimmetria coste', 'Gibbo anteriore', 'Simmetria emitoraci'] },
      { g: 'Bacino', items: ['Altezza creste iliache', 'Obliquità pelvica', 'Rotazione pelvica', 'Asimmetria ASIS', 'Shift laterale del bacino'] },
      { g: 'Arti inferiori', items: ['Valgo ginocchio dx', 'Valgo ginocchio sx', 'Varo ginocchio dx', 'Varo ginocchio sx', 'Rotazione femorale dx', 'Rotazione femorale sx', 'Asimmetria rotulea'] },
      { g: 'Piedi', items: ['Punta piede dx aperta/chiusa', 'Punta piede sx aperta/chiusa', 'Asimmetria appoggio', 'Pronazione osservativa', 'Supinazione osservativa', "Base d'appoggio"] },
      { g: 'Globale', items: ['Shift globale del corpo dx', 'Shift globale del corpo sx', 'Centro di massa osservativo', 'Simmetria appoggio podalico'] }
    ],
    frontale_post: [
      { g: 'Testa e collo', items: ['Inclinazione laterale capo', 'Rotazione capo', 'Verticalità occipitale'] },
      { g: 'Scapole', items: ['Altezza scapolare', 'Scapola alata dx', 'Scapola alata sx', 'Abduzione scapolare', 'Adduzione scapolare', 'Rotazione scapolare', 'Simmetria angoli inferiori'] },
      { g: 'Colonna', items: ['Deviazione laterale rachide', 'Curva scoliotica dorsale', 'Curva scoliotica lombare', 'Gibbo costale'] },
      { g: 'Bacino', items: ['Altezza SIPS', 'Obliquità pelvica', 'Rotazione pelvica', 'Shift pelvico dx', 'Shift pelvico sx'] },
      { g: 'Arti inferiori', items: ['Asse femorale', 'Asse tibiale', 'Valgo retropiede', 'Varo retropiede'] },
      { g: 'Piedi', items: ['Pronazione retropiede', 'Supinazione retropiede', 'Asimmetria carico', 'Divergenza calcaneare'] },
      { g: 'Verticale di Barré posteriore', items: ['Allineata', 'Sindrome ascendente', 'Sindrome discendente', 'Shift dx', 'Shift sx'] }
    ],
    sagittale_sx: [
      { g: 'Capo', items: ['Forward Head Posture', 'Retroposto', 'Allineamento meato-spalla'] },
      { g: 'Colonna cervicale', items: ['Iperlordosi cervicale', 'Rettilineizzazione cervicale', 'Inversione cervicale'] },
      { g: 'Cingolo scapolare', items: ['Anteposizione spalla', 'Retroposizione spalla'] },
      { g: 'Torace', items: ['Ipercifosi dorsale', 'Rettilineizzazione dorsale', 'Dorso piatto'] },
      { g: 'Bacino', items: ['Antiversione', 'Retroversione', 'Neutro'] },
      { g: 'Lombare', items: ['Iperlordosi lombare', 'Rettilineizzazione lombare', 'Inversione lombare'] },
      { g: 'Ginocchio', items: ['Recurvatum', 'Flessione persistente'] },
      { g: 'Caviglia', items: ['Tendenza dorsiflessione', 'Tendenza plantiflessione'] },
      { g: 'Verticale di Barré laterale', items: ['Normale', 'Anteriore', 'Posteriore'] },
      { g: 'Angoli (misurabili)', items: ['Forward Head Angle', 'Angolo acromion-trocantere', 'Angolo bacino', 'Angolo ginocchio', 'Angolo tibia'] }
    ],
    podoscopia: [
      { g: 'Arco plantare', items: ['Normale', 'Piede piatto', 'Piede cavo', 'Arco ridotto', 'Arco aumentato'] },
      { g: 'Appoggio', items: ['Neutro', 'Pronazione', 'Supinazione', 'Iperpronazione', 'Asimmetria carico'] },
      { g: 'Avampiede', items: ['Alluce valgo dx', 'Alluce valgo sx', 'Sovraccarico avampiede', 'Dita a martello'] }
    ],
    capo: [
      { g: 'Capo', items: ['Inclinazione laterale', 'Rotazione', 'Anteposizione', 'Asimmetria mandibolare'] }
    ],
    stomato: [
      { g: 'Stomatognatico', items: ['Asimmetria mandibolare', 'Deviazione apertura', 'Morso aperto', 'Latero-deviazione'] }
    ],
    occhi: [
      { g: 'Convergenza oculare', items: ['Normale', 'Insufficienza convergenza', 'Asimmetria oculare'] }
    ],
    generale: [
      { g: 'Elementi rilevati', items: ['Iperlordosi lombare', 'Cifosi dorsale', 'Antepulsione capo', 'Spalla dx alta', 'Spalla sx alta', 'Asimmetria bacino', 'Protrazione spalle', 'Atteggiamento scoliotico'] }
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
