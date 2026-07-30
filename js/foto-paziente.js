/* ============================================================
   POLICETTIVO — funzioni foto scheda paziente
   Lightbox, elimina, libreria, schermo intero.
   Richiamate dalla barra azioni standard (foto-actions.js).
   ============================================================ */
(function (w) {
  'use strict';

  var SLOT_META = {
    'prima-sx': ['Sinistro', '\uD83D\uDCF7'],
    'prima-dx': ['Destro', '\uD83D\uDCF7'],
    'dopo-sx': ['Sinistro', '\uD83D\uDCF7'],
    'dopo-dx': ['Destro', '\uD83D\uDCF7'],
    'frontale': ['Vista frontale', '\uD83D\uDCF7'],
    'posteriore': ['Vista posteriore', '\uD83D\uDCF7'],
    'podo-sotto': ['Piede da sotto', '\uD83E\uDDB6'],
    'podo-dietro': ['Piede da dietro', '\uD83E\uDDB6']
  };

  function _urls() {
    try { return JSON.parse((typeof patient !== 'undefined' && patient ? patient.foto_url : '{}') || '{}'); }
    catch (e) { return {}; }
  }
  function _pid() { return (typeof patientId !== 'undefined' && patientId) ? patientId : ''; }

  function ensureLightbox() {
    if (document.getElementById('pol-lightbox')) return;
    var d = document.createElement('div');
    d.className = 'pol-lightbox';
    d.id = 'pol-lightbox';
    d.onclick = w.polChiudiLightbox;
    d.innerHTML = '<button class="pol-lightbox-x" onclick="event.stopPropagation();polChiudiLightbox()" aria-label="Chiudi">&times;</button>' +
                  '<img id="pol-lightbox-img" src="" alt="Foto a schermo intero">';
    document.body.appendChild(d);
  }

  w.polFotoIntero = async function (slot) {
    var u = _urls(); var raw = u[slot]; if (!raw) return;
    ensureLightbox();
    var src = (typeof polResolveFoto === 'function')
      ? await polResolveFoto(raw, (typeof _supabase !== 'undefined' ? _supabase : null))
      : raw;
    if (!src) return;
    document.getElementById('pol-lightbox-img').src = src;
    document.getElementById('pol-lightbox').classList.add('open');
  };

  w.polChiudiLightbox = function () {
    var lb = document.getElementById('pol-lightbox');
    if (lb) lb.classList.remove('open');
  };

  w.polFotoLibreria = function (slot) {
    if (w._polSetSlot) w._polSetSlot(slot);
    if (w.fotoSourceLibreria) w.fotoSourceLibreria();
  };

  w.polFotoElimina = function (slot) {
    if (!confirm('Eliminare questa foto?')) return;
    var u = _urls(); delete u[slot];
    if (typeof patient !== 'undefined' && patient) {
      patient.foto_url = JSON.stringify(u);
      if (typeof _supabase !== 'undefined' && _supabase) {
        _supabase.from('patients').update({ foto_url: patient.foto_url }).eq('id', _pid());
      }
    }
    var el = document.getElementById('slot-' + slot);
    if (el) {
      el.classList.remove('has-photo');
      el.onclick = function () { triggerInput(slot); };
      var m = SLOT_META[slot] || [slot, '\uD83D\uDCF7'];
      el.innerHTML = '<div class="foto-label">' + m[0] + '</div>' +
        '<div class="foto-icon">' + m[1] + '</div>' +
        '<div class="foto-hint">Tocca per foto</div>' +
        '<input type="file" id="input-' + slot + '" accept="image/*" style="display:none" onchange="handleFoto(\'' + slot + '\',this)">';
    }
  };
})(window);
