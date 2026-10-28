/* scheda-ovunque-v1 — le funzioni pure della scheda di allenamento, in UN punto solo.
   Le usano l'editor (protocollo-esercizi.html) e il passaggio automatico (passa-scheda.html):
   «Copia dal protocollo» e «Passa tutti» devono produrre ESATTAMENTE la stessa scheda.
   Niente database, niente pagina: solo dati dentro → dati fuori. */
;(function () {
  function clampInt(v, min, max) {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n) || n < min || n > max) return null
    return n
  }
  function cfgOk(c) { const k = String(c || '').toUpperCase(); return (k === 'NPL' || k === 'GPL') ? k : null }
  function versoDb(r, schedaId, i) {
    const es = r.tipo === 'esercizio'
    return {
      scheda_id: schedaId, ordine: i + 1, tipo: r.tipo,
      exercise_id: es ? (r.exercise_id || null) : null,
      video_id: es ? (r.video_id || null) : null,
      elicoidale_id: es ? (r.elicoidale_id || null) : null,
      nome: es ? String(r.nome).trim() : null,
      misura: es ? r.misura : null,
      secondi: es && r.misura === 'tempo' ? clampInt(r.secondi, 1, 3600) : null,
      ripetizioni: es && r.misura === 'ripetizioni' ? clampInt(r.ripetizioni, 1, 500) : null,
      serie: clampInt(r.serie, 1, 20) || 1,
      quando: r.quando || 'sempre',
      ritmo_sec: null, recupero_sec: null,
      guidato_sensore: false,
      testo: String(r.testo || '').trim() || null,
      configurazione: es ? cfgOk(r.configurazione) : null
    }
  }
  function daProtocollo(prot, ppe, exById, eli, vids, listaEli) {
    const gen = cfgOk(prot && prot.configurazione_generale)
    const sec = function (v, ripiego) { return clampInt(v, 1, 3600) || ripiego }
    const es = (ppe || []).slice().sort(function (a, b) { return (a.ordine || 0) - (b.ordine || 0) }).map(function (e) {
      const ex = exById[e.exercise_id] || null
      const c = cfgOk(e.configurazione)
      return { tipo: 'esercizio', nome: (ex && ex.nome) || 'Esercizio', exercise_id: e.exercise_id || null, video_id: null, elicoidale_id: null,
               misura: 'tempo', secondi: sec(e.durata || (ex && ex.durata_default), 90), ripetizioni: null, serie: 1, quando: 'sempre', testo: '',
               configurazione: c && c !== gen ? c : null }
    })
    const ce = (eli || []).slice().sort(function (a, b) { return (a.ordine || 0) - (b.ordine || 0) }).map(function (e) {
      const def = (listaEli || []).find(function (x) { return x.id === e.elicoidale_id })
      return { tipo: 'esercizio', nome: (def && def.title) || e.elicoidale_id, exercise_id: null, video_id: null, elicoidale_id: e.elicoidale_id,
               misura: 'tempo', secondi: sec(e.durata, 60), ripetizioni: null, serie: 1, quando: 'sempre', testo: '', configurazione: null }
    })
    const cv = (vids || []).slice().sort(function (a, b) { return String(a.created_at || '') < String(b.created_at || '') ? -1 : 1 }).map(function (v) {
      return { tipo: 'esercizio', nome: v.titolo || 'Contenuto personalizzato', exercise_id: null, video_id: v.id, elicoidale_id: null,
               misura: 'tempo', secondi: sec(v.durata, 60), ripetizioni: null, serie: 1, quando: 'sempre', testo: v.descrizione || '', configurazione: null }
    })
    return { righe: [].concat(es, ce, cv), configurazione: gen }
  }
  window.SchedaPure = { clampInt: clampInt, cfgOk: cfgOk, versoDb: versoDb, daProtocollo: daProtocollo }
})();
