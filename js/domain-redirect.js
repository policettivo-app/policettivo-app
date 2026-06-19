// Redirect al dominio ufficiale: se non siamo su app.policettivo.it,
// reindirizza mantenendo path + query (token/id) + hash.
// Localhost escluso (per i test in locale).
(function () {
  try {
    var ufficiale = 'app.policettivo.it';
    var host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return;
    if (host !== ufficiale) {
      var nuovoUrl = 'https://' + ufficiale + location.pathname + location.search + location.hash;
      location.replace(nuovoUrl);
    }
  } catch (e) { /* in caso di errore non bloccare la pagina */ }
})();
