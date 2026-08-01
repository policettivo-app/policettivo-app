/*
 * js/foto-resolver.js — Policettivo®
 * Helper condiviso: risolve una foto (base64 o storage_path) in src usabile,
 * e carica una foto iniziale nello storage (nome file unico per evitare sovrascritture).
 */
(function (w) {
  var BUCKET = 'clinical-docs';
  var SIGNED_TTL = 7200;

  function classify(v) {
    if (!v) return { kind: 'empty', value: null };
    if (typeof v === 'object') {
      if (v.storage_path) return { kind: 'storage', value: v.storage_path };
      if (v.url)          return { kind: 'direct',  value: v.url };
      return { kind: 'empty', value: null };
    }
    if (typeof v === 'string') {
      if (v === '{}' || v.trim() === '') return { kind: 'empty', value: null };
      if (v.indexOf('data:') === 0)      return { kind: 'direct',  value: v };
      if (v.indexOf('http') === 0)       return { kind: 'direct',  value: v };
      return { kind: 'storage', value: v };
    }
    return { kind: 'empty', value: null };
  }

  w.polFotoPronta   = function (v) { return classify(v).kind === 'direct'; };
  w.polFotoEStorage = function (v) { return classify(v).kind === 'storage'; };

  w.polResolveFoto = async function (v, sb) {
    var c = classify(v);
    if (c.kind === 'empty')  return null;
    if (c.kind === 'direct') return c.value;
    if (!sb || !sb.storage) { console.warn('[foto-resolver] client mancante per', c.value); return null; }
    try {
      var r = await sb.storage.from(BUCKET).createSignedUrl(c.value, SIGNED_TTL);
      if (r && r.data && r.data.signedUrl) return r.data.signedUrl;
      console.warn('[foto-resolver] signed URL non generata per', c.value, r && r.error);
      return null;
    } catch (e) { console.warn('[foto-resolver] errore signed URL', c.value, e); return null; }
  };

  w.polResolveFotoMappa = async function (obj, sb) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    var slots = Object.keys(obj);
    for (var i = 0; i < slots.length; i++) out[slots[i]] = await w.polResolveFoto(obj[slots[i]], sb);
    return out;
  };

  w.polUploadFotoIniziale = async function (dataUrl, patientId, slot, sb) {
    var m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || '');
    if (!m) throw new Error('polUploadFotoIniziale: dataUrl non valido');
    var mime = m[1];
    var bin = atob(m[2]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var blob = new Blob([bytes], { type: mime });
    var ext = mime.indexOf('png') >= 0 ? 'png' : mime.indexOf('webp') >= 0 ? 'webp' : 'jpg';
    var path = patientId + '/iniziali/' + slot + '_' + Date.now() + '.' + ext;
    var up = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: mime });
    if (up.error) throw up.error;
    return path;
  };
})(window);
