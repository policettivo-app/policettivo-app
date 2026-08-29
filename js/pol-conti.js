/* pol-conti-v1 — I CONTI DEI PAZIENTI, IN UN POSTO SOLO.
 *
 * Perche' esiste questo file: lo stesso numero («quanto mi deve questo
 * paziente») compare in Contabile, in Statistiche e in Sospesi. Tre
 * implementazioni della stessa regola divergono sempre, e il giorno che
 * divergono l'utente non sa piu' a chi credere. Qui la regola sta scritta
 * una volta.
 *
 * LA REGOLA (modello di cassa, decisione Giuliano 27 ago):
 *   - sedute e addebiti dei noleggi finiscono in UNA CODA SOLA, ordinata
 *     per data;
 *   - i soldi incassati coprono il debito PIU' VECCHIO, senza etichetta:
 *     un incasso «per il cuscino» puo' quindi appoggiarsi su una seduta
 *     arretrata. Il totale e' sempre corretto, cambia solo la riga su cui
 *     si appoggia;
 *   - i RIMBORSI sono importi NEGATIVI in patient_payments: sono uscite di
 *     cassa vere e si sottraggono da soli dall'incassato;
 *   - le righe di addebito ANNULLATE non contano (il cestino sui canoni
 *     marca, non cancella: una DELETE si rigenererebbe da sola);
 *   - le voci a prezzo 0 non generano debito.
 */
(function(){
  'use strict';

  function iso(s){ return String(s == null ? '' : s).substring(0, 10); }
  function oggiISO(){
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function giorniTra(a, b){
    if (!a || !b) return null;
    return Math.round((new Date(iso(b)+'T00:00:00') - new Date(iso(a)+'T00:00:00')) / 86400000);
  }

  /* Supabase restituisce al massimo 1000 righe per chiamata: senza range()
   * uno studio con qualche anno di storico vedrebbe numeri TRONCATI e senza
   * nessun errore — il modo peggiore di sbagliare. */
  async function caricaTutto(sb, tabella, colonne){
    var out = [], from = 0, size = 1000, giri = 0;
    while (giri < 60){
      var r = await sb.from(tabella).select(colonne).range(from, from + size - 1);
      if (r && r.error){ console.error('[pol-conti] ' + tabella + ':', r.error); break; }
      var d = (r && r.data) ? r.data : [];
      out = out.concat(d);
      if (d.length < size) break;
      from += size; giri++;
    }
    return out;
  }

  /* dati = { sedute, addebiti, pagamenti }
   * ritorna un array, un elemento per paziente che ha almeno un movimento:
   *   { pid, venduto, incassato, residuo, scopertoDal, giorni,
   *     nSedute, ultimaSeduta, primaSeduta } */
  function statoPazienti(dati){
    var sedute    = (dati && dati.sedute)    || [];
    var addebiti  = (dati && dati.addebiti)  || [];
    var pagamenti = (dati && dati.pagamenti) || [];
    var perPaz = {};

    function slot(pid){
      if (!perPaz[pid]) perPaz[pid] = { pid:pid, debiti:[], incassato:0, nSedute:0, ultimaSeduta:null, primaSeduta:null };
      return perPaz[pid];
    }

    for (var i=0;i<sedute.length;i++){
      var s = sedute[i];
      if (!s.patient_id) continue;
      var sl = slot(s.patient_id);
      sl.nSedute++;
      var ds = iso(s.data_seduta);
      if (ds){
        if (!sl.ultimaSeduta || ds > sl.ultimaSeduta) sl.ultimaSeduta = ds;
        if (!sl.primaSeduta  || ds < sl.primaSeduta)  sl.primaSeduta  = ds;
      }
      var c = Number(s.costo) || 0;
      if (c > 0) sl.debiti.push({ data: ds || '', importo: c, tipo: 'seduta' });
    }

    for (var a=0;a<addebiti.length;a++){
      var ad = addebiti[a];
      if (ad.annullato) continue;
      if (!ad.patient_id) continue;
      var im = Number(ad.importo) || 0;
      if (im <= 0) continue;
      slot(ad.patient_id).debiti.push({ data: iso(ad.periodo) || '', importo: im, tipo: 'noleggio' });
    }

    for (var p=0;p<pagamenti.length;p++){
      var pg = pagamenti[p];
      if (!pg.patient_id) continue;
      slot(pg.patient_id).incassato += (Number(pg.importo) || 0);
    }

    var hoy = oggiISO();
    var out = [];
    for (var id in perPaz){
      if (!Object.prototype.hasOwnProperty.call(perPaz, id)) continue;
      var o = perPaz[id];
      o.debiti.sort(function(x,y){ return x.data < y.data ? -1 : (x.data > y.data ? 1 : 0); });

      var venduto = 0;
      for (var d=0;d<o.debiti.length;d++) venduto += o.debiti[d].importo;
      var residuo = Math.round((venduto - o.incassato) * 100) / 100;

      var scopertoDal = null;
      if (residuo > 0.005){
        var resta = o.incassato;
        for (var q=0;q<o.debiti.length;q++){
          if (resta >= o.debiti[q].importo - 0.005){ resta -= o.debiti[q].importo; continue; }
          scopertoDal = o.debiti[q].data || null;
          break;
        }
      }

      out.push({
        pid: o.pid,
        venduto: venduto,
        incassato: o.incassato,
        residuo: residuo,
        scopertoDal: scopertoDal,
        giorni: scopertoDal ? giorniTra(scopertoDal, hoy) : null,
        nSedute: o.nSedute,
        ultimaSeduta: o.ultimaSeduta,
        primaSeduta: o.primaSeduta
      });
    }
    return out;
  }

  window.polConti = {
    versione: 'pol-conti-v1',
    iso: iso,
    oggiISO: oggiISO,
    giorniTra: giorniTra,
    caricaTutto: caricaTutto,
    statoPazienti: statoPazienti
  };
})();

/* pol-lock-inject-v1 — vedi utils-premium.js: stesso aggancio, per sospesi.html
   e statistiche.html. Il ';' iniziale protegge dall'incollamento con la riga
   precedente in un file senza punti e virgola (vedi utils-premium.js). */
;(function () {
  if (window.__polLockInject) return;
  window.__polLockInject = true;
  var s = document.createElement('script');
  s.src = 'js/pol-lock.js';
  s.async = true;
  (document.head || document.documentElement).appendChild(s);
})();
