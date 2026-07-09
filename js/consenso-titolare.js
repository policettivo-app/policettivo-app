/* Helper condiviso: intestazione "Titolare del trattamento" per PDF/UI consenso.
   Stessa logica di profilo.html: unisce i campi studio non vuoti separati da " — ".
   Ritorna '' se tutti i campi sono vuoti (il chiamante mostra un avviso). */
(function (global) {
  function buildTitolareBlock(prof) {
    if (!prof) return ''
    var centro    = String(prof.centro       || '').trim()
    var indirizzo = String(prof.indirizzo    || '').trim()
    var citta     = String(prof.citta        || '').trim()
    var piva      = String(prof.partita_iva  || '').trim()
    var email     = String(prof.email_studio || '').trim()
    var parts = []
    if (centro) parts.push(centro)
    var addr = [indirizzo, citta].filter(Boolean).join(', ')
    if (addr) parts.push(addr)
    if (piva) parts.push('P.IVA ' + piva)
    if (email) parts.push(email)
    if (!parts.length) return ''
    return 'Titolare del trattamento: ' + parts.join(' — ')
  }
  global.buildTitolareBlock = buildTitolareBlock
})(window);
