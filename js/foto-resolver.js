/*
 * js/foto-resolver.js — Policettivo®
 * Helper condiviso per risolvere una foto (iniziale o di visita) in un src usabile.
 *
 * Gestisce QUALSIASI formato presente oggi o in arrivo, in quest'ordine:
 *   - null / '' / '{}'                       -> null
 *   - oggetto { storage_path }               -> signed URL fresca (bucket clinical-docs)
 *   - oggetto { url }                        -> url (retrocompatibilita', usato in visite.html)
 *   - stringa 'data:...' (base64)            -> ritorna com'e' (foto iniziali attuali)
 *   - stringa 'http...'                      -> ritorna com'e'
 *   - stringa tipo 'patientId/file.jpg'      -> signed URL fresca (storage_path "nudo")
 *
 * REGOLA: non salva MAI una signed URL. La genera al volo alla lettura.
 * Il client Supabase va passato come 2o argomento (le pagine lo chiamano _supabase o _sb).
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
    if (!sb || !sb.storage) { console.warn('[foto-resolver] client Supabase mancante per storage_path:', c.value); return null; }
    try {
      var r = await sb.storage.from(BUCKET).createSignedUrl(c.value, SIGNED_TTL);
      if (r && r.data && r.data.signedUrl) return r.data.signedUrl;
      console.warn('[foto-resolver] signed URL non generata per:', c.value, r && r.error);
      return null;
    } catch (e) {
      console.warn('[foto-resolver] errore signed URL:', c.value, e);
      return null;
    }
  };

  w.polResolveFotoMappa = async function (obj, sb) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    var slots = Object.keys(obj);
    for (var i = 0; i < slots.length; i++) {
      out[slots[i]] = await w.polResolveFoto(obj[slots[i]], sb);
    }
    return out;
  };
})(window);
