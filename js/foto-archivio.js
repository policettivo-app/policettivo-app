/*
 * js/foto-archivio.js — Policettivo®  [foto-archivio-v1]
 * UN solo posto per salvare le foto del paziente senza perderle.
 *
 *  • nomeFile()   → n0042_2026-10-15_17-42_prima-sx_1760542920000.jpg
 *                   numero progressivo del paziente, data e ora, casella.
 *                   Il nome FINISCE SEMPRE con _<millisecondi>.jpg: è da lì che
 *                   le pagine di oggi ricavano la data (_dataDaPercorso).
 *  • carica()     → registra lo scatto (migration 058), carica il file, scrive
 *                   il percorso nel registro. Se la 058 non è stata lanciata
 *                   salva come prima (senza numero) e lo dice al professionista.
 *  • impostaCasellaScheda() → cambia UNA casella di patients.foto_url, in un
 *                   colpo solo dal database (due scatti non si cancellano più).
 *  • segnaSostituita() → la foto esce dalla casella ma resta in archivio.
 *  • fileInUso()  → prima di cancellare un file: lo usa qualcun altro?
 *                   Nel dubbio risponde SÌ (non si cancella).
 *  • dataOra()    → «15/10/2026 · 17:42», oppure «data non registrata».
 *  • inCoda()     → i salvataggi della stessa pagina uno dopo l'altro.
 */
(function (w) {
  'use strict';
  var BUCKET = 'clinical-docs';
  var MIGRAZIONE = 'db/migrations/058_foto_storico.sql';

  function due(n) { return (n < 10 ? '0' : '') + n; }
  function quattro(n) { n = String(n); while (n.length < 4) n = '0' + n; return n; }
  function pulisci(s) { return String(s || 'foto').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'foto'; }

  // ora locale del dispositivo (quella che si legge in studio)
  function nomeFile(numero, casella, ms, ext) {
    var d = new Date(ms);
    var data = d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
    var ora = due(d.getHours()) + '-' + due(d.getMinutes());
    var e = (ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
    var pre = numero ? 'n' + quattro(numero) + '_' + data + '_' + ora + '_' : '';
    return pre + pulisci(casella) + '_' + ms + '.' + e;
  }

  function dataDaPercorso(p) {
    var m = /_(\d{10,16})\.[a-z]+$/i.exec(p || '');
    if (!m) return null;
    var d = new Date(Number(m[1]));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function numeroDaPercorso(p) {
    var m = /(?:^|\/)n(\d{4,})_/.exec(p || '');
    return m ? Number(m[1]) : null;
  }

  // «15/10/2026 · 17:42». soloGiorno=true quando l'ora non è della foto.
  function dataOra(iso, soloGiorno) {
    if (!iso) return 'data non registrata';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 'data non registrata';
    var g = due(d.getDate()) + '/' + due(d.getMonth() + 1) + '/' + d.getFullYear();
    return soloGiorno ? g : g + ' · ' + due(d.getHours()) + ':' + due(d.getMinutes());
  }

  function manca(err) {
    if (!err) return false;
    var c = String(err.code || ''), m = String(err.message || '');
    return c === '42883' || c === '42P01' || c === 'PGRST202' || c === 'PGRST205' ||
      /foto_registra|foto_scheda_imposta|foto_segna_sostituita|foto_storico/.test(m) && /not find|does not exist|schema cache/i.test(m);
  }
  function segnalaManca(err) {
    if (!manca(err)) return false;
    if (!api.mancaMigrazione) console.warn('[foto-archivio] manca ' + MIGRAZIONE + ' — le foto si salvano come prima, senza numero', err);
    api.mancaMigrazione = true;
    try { w.dispatchEvent(new CustomEvent('pol-foto-manca-migrazione', { detail: MIGRAZIONE })); } catch (e) {}
    return true;
  }

  function blobDaDataUrl(dataUrl) {
    var m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || '');
    if (!m) throw new Error('foto non valida');
    var bin = atob(m[2]); var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var mime = m[1];
    return { blob: new Blob([bytes], { type: mime }), mime: mime,
      ext: mime.indexOf('png') >= 0 ? 'png' : mime.indexOf('webp') >= 0 ? 'webp' : 'jpg' };
  }

  async function registra(sb, o, ms) {
    if (api.mancaMigrazione) return null;
    try {
      var r = await sb.rpc('foto_registra', {
        p_patient: o.patientId, p_origine: o.origine, p_casella: o.casella || null,
        p_visit: o.visitId || null, p_scattata: new Date(ms).toISOString()
      });
      if (r.error) { segnalaManca(r.error) || console.warn('[foto-archivio] registro non scritto', r.error); return null; }
      return r.data && r.data.numero ? r.data : null;
    } catch (e) { console.warn('[foto-archivio] registro non scritto', e); return null; }
  }

  /* o = { patientId, cartella, casella, origine, visitId, blob, mime, ext } oppure { ..., dataUrl }
     → { storage_path, scattata_il, numero, storicoId }. Se il FILE non si carica: errore. */
  async function carica(sb, o) {
    if (!sb || !sb.storage) throw new Error('collegamento non pronto');
    if (o.dataUrl && !o.blob) { var b = blobDaDataUrl(o.dataUrl); o.blob = b.blob; o.mime = b.mime; o.ext = b.ext; }
    if (!o.blob) throw new Error('foto vuota');
    var ms = Date.now();
    var reg = await registra(sb, o, ms);
    var path = String(o.cartella).replace(/\/+$/, '') + '/' + nomeFile(reg ? reg.numero : null, o.casella, ms, o.ext || 'jpg');
    var up = await sb.storage.from(BUCKET).upload(path, o.blob, { contentType: o.mime || 'image/jpeg', upsert: false });
    if (up && up.error) throw new Error(up.error.message || 'caricamento non riuscito');
    if (reg && reg.id) {
      try {
        var u = await sb.from('foto_storico').update({ storage_path: path }).eq('id', reg.id);
        if (u && u.error) console.warn('[foto-archivio] percorso non scritto nel registro', u.error);
      } catch (e) { console.warn('[foto-archivio] percorso non scritto nel registro', e); }
    }
    return { storage_path: path, scattata_il: new Date(ms).toISOString(), numero: reg ? reg.numero : null, storicoId: reg ? reg.id : null };
  }

  function percorsoDi(v) {
    if (!v) return null;
    if (typeof v === 'object') return v.storage_path || null;
    if (typeof v === 'string' && v.indexOf('data:') !== 0 && v.indexOf('http') !== 0 && v.trim() && v !== '{}') return v;
    return null;
  }

  /* Cambia UNA casella. valore null = svuota. → { foto_url (testo), prima (valore precedente) } */
  async function impostaCasellaScheda(sb, patientId, casella, valore) {
    if (!api.mancaMigrazione) {
      var r = await sb.rpc('foto_scheda_imposta', { p_patient: patientId, p_slot: casella, p_valore: valore == null ? null : valore });
      if (!r.error && r.data) return { foto_url: r.data.foto_url, prima: r.data.prima || null };
      if (!segnalaManca(r.error)) throw new Error((r.error && r.error.message) || 'casella non salvata');
    }
    // Senza la 058: si rilegge dal database SUBITO prima di scrivere (mai dalla copia in pagina).
    var q = await sb.from('patients').select('foto_url').eq('id', patientId).maybeSingle();
    if (q.error) throw new Error(q.error.message);
    var obj = {};
    try { obj = JSON.parse((q.data && q.data.foto_url) || '{}') || {}; } catch (e) { throw new Error('foto del paziente non leggibili: non le tocco'); }
    var prima = Object.prototype.hasOwnProperty.call(obj, casella) ? obj[casella] : null;
    if (valore == null) delete obj[casella]; else obj[casella] = valore;
    var testo = JSON.stringify(obj);
    var u = await sb.from('patients').update({ foto_url: testo }).eq('id', patientId);
    if (u.error) throw new Error(u.error.message);
    return { foto_url: testo, prima: prima };
  }

  async function segnaSostituita(sb, patientId, path, origine, casella) {
    if (!path || api.mancaMigrazione) return false;
    try {
      var r = await sb.rpc('foto_segna_sostituita', {
        p_patient: patientId, p_path: path, p_origine: origine || 'scheda',
        p_casella: casella || null, p_scattata: dataDaPercorso(path)
      });
      if (r.error) { segnalaManca(r.error) || console.warn('[foto-archivio] sostituita non segnata', r.error); return false; }
      return true;
    } catch (e) { return false; }
  }

  async function segnaEliminata(sb, patientId, path) {
    if (!path || api.mancaMigrazione) return;
    try { await sb.from('foto_storico').update({ eliminata_il: new Date().toISOString() }).eq('patient_id', patientId).eq('storage_path', path); } catch (e) {}
  }

  /* Il file è usato da un'altra parte? opz = { patientId, escludiVisitPhotoId, escludiCasella }
     true = NON cancellarlo. Nel dubbio: true. */
  async function fileInUso(sb, path, opz) {
    opz = opz || {};
    if (!path) return true;
    try {
      var v = await sb.from('visit_photos').select('id').eq('storage_path', path);
      if (v.error) return true;
      if ((v.data || []).some(function (r) { return String(r.id) !== String(opz.escludiVisitPhotoId); })) return true;
      if (opz.patientId) {
        var p = await sb.from('patients').select('foto_url').eq('id', opz.patientId).maybeSingle();
        if (p.error) return true;
        var obj = {};
        try { obj = JSON.parse((p.data && p.data.foto_url) || '{}') || {}; } catch (e) { return true; }
        for (var k in obj) {
          if (k === opz.escludiCasella) continue;
          if (percorsoDi(obj[k]) === path) return true;
        }
      } else if (path.indexOf('/iniziali/') >= 0) {
        return true;                       // della scheda, e non so di chi: non si tocca
      }
      return false;
    } catch (e) { return true; }
  }

  async function storicoPaziente(sb, patientId) {
    if (api.mancaMigrazione) return [];
    try {
      var r = await sb.from('foto_storico').select('*').eq('patient_id', patientId).order('numero', { ascending: true });
      if (r.error) { segnalaManca(r.error); return []; }
      return r.data || [];
    } catch (e) { return []; }
  }

  var _coda = Promise.resolve();
  function inCoda(fn) {
    var p = _coda.then(fn, fn);
    _coda = p.catch(function () {});
    return p;
  }

  var api = {
    versione: 'foto-archivio-v1',
    MIGRAZIONE: MIGRAZIONE,
    mancaMigrazione: false,
    nomeFile: nomeFile,
    dataDaPercorso: dataDaPercorso,
    numeroDaPercorso: numeroDaPercorso,
    dataOra: dataOra,
    percorsoDi: percorsoDi,
    carica: carica,
    impostaCasellaScheda: impostaCasellaScheda,
    segnaSostituita: segnaSostituita,
    segnaEliminata: segnaEliminata,
    fileInUso: fileInUso,
    storicoPaziente: storicoPaziente,
    inCoda: inCoda
  };
  w.PolFotoArchivio = api;
})(window);
