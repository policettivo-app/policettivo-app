/* js/pdf-prima-dopo.js — pdf-gradi-v1 (23 settembre 2026) · editor-punti-v1 · gradi-auto-v1
 *
 * «PRIMA E DOPO I 3 RESPIRI» DENTRO I PDF: UN POSTO SOLO.
 *
 * Decisioni del 23 settembre (1A 2A 3A):
 *   1A  gradi ed equilibrio vanno nel PDF della valutazione (posturale e,
 *       3A, fisioterapica): il documento che il professionista valida e firma;
 *   2A  sulle foto misurate si disegnano punti, linee e gradi (lo stesso
 *       disegno dello schermo del paziente: PolMisure.svgMisura);
 *   la sezione dice sempre che i gradi NON sono ancora giudicabili (errore di
 *   misura non misurato) e che «dopo» non vuol dire «grazie a».
 *
 * Usa: PolMisure (js/misure-foto.js), PolSchermo + PolOscillazione (equilibrio).
 * Se uno manca, la sezione non c'è e il PDF resta quello di prima: un pezzo
 * nuovo non deve poter rompere un documento che c'era già.
 */
;(function (global) {
  'use strict'

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function num(x, d) { return (x == null || isNaN(x)) ? '—' : Number(x).toFixed(d == null ? 1 : d).replace('.', ',') }

  var NOMI_PIANO = {
    sagittale_dx: 'Profilo destro', sagittale_sx: 'Profilo sinistro',
    frontale: 'Di fronte', posteriore: 'Di spalle'
  }

  /* Le misure delle foto di questa visita e le prove di equilibrio di quel
     giorno. Ogni lettura che fallisce (tabella che manca, rete) lascia il suo
     pezzo vuoto: il PDF si fa lo stesso. */
  async function carica(sb, o) {
    var out = { misure: {}, prove: [], eq: null, avvisi: [] }
    var S = global.PolSchermo
    try {
      var paths = (o.paths || []).filter(Boolean)
      if (paths.length) {
        var r = await sb.from('foto_misure').select('*').in('storage_path', paths)
        if (r.error) out.avvisi.push('misure')
        else (r.data || []).forEach(function (x) { if (x.storage_path) out.misure[x.storage_path] = x })
      }
    } catch (e) { out.avvisi.push('misure') }
    try {
      if (o.patientId && S) {
        var g = S.giornoDi(o.giorno)
        var r2 = await sb.from('oscillazione_test')
          .select('id,quando,evento,occhi,piedi,configurazione,momento,velocita,osc_ap,osc_ds,raggio,ellisse,deriva,carico_avanti,carico_destra,tarato')
          .eq('patient_id', o.patientId)
        if (r2.error) out.avvisi.push('equilibrio')
        else {
          out.prove = (r2.data || []).filter(function (p) {
            return (p.momento === 'pre' || p.momento === 'post') && S.giornoDi(p.quando) === g
          })
          out.eq = S.equilibrio(out.prove)
        }
      }
    } catch (e) { out.avvisi.push('equilibrio') }
    return out
  }

  /* Una foto del PDF, con il disegno delle misure sopra se c'è.
     Il contenitore ha la forma della foto (l'immagine non viene tagliata né
     deformata dai max-width/max-height), quindi l'SVG con le coordinate della
     foto le cade sopra esatto. */
  function foto(url, misura, stileImg) {
    var PM = global.PolMisure
    var img = '<img src="' + esc(url) + '" crossorigin="anonymous" style="' + stileImg + '">'
    if (!PM || !misura || !misura.larghezza || !misura.altezza) return img
    var svg = PM.svgMisura(misura, { gradi: true })
    if (!svg) return img
    // Il disegno viaggia come IMMAGINE (un SVG dentro un data-URL), non come
    // <svg> nella pagina: html2canvas, che la visita fisioterapica usa per fare
    // il PDF, un <svg> sovrapposto non lo disegna (provato: 0 pixel). Un'<img>
    // sì, e anche il server dei PDF della posturale.
    var W = misura.larghezza, H = misura.altezza
    var doc = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + svg + '</svg>'
    return '<div style="position:relative;display:inline-block;line-height:0">' + img +
      '<img class="pd-disegno" data-w="' + W + '" data-h="' + H + '" alt="" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(doc) + '" ' +
      'style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;border:0;margin:0;max-width:none;max-height:none"></div>'
  }

  /* La sezione. piani: POSTURAL_PHOTO_PLANES; photos: righe di visit_photos
     con storage_path; pd: quello che ha restituito carica(); sec(titolo): la
     testata di sezione del PDF che la ospita (stesso stile). */
  function sezione(o) {
    var PM = global.PolMisure, pd = o.pd
    if (!pd) return ''
    var misura = function (tipo) {
      var p = (o.photos || []).filter(function (f) { return f.tipo === tipo })[0]
      return p && p.storage_path ? pd.misure[p.storage_path] : null
    }
    var righe = [], auto = false
    if (PM) (o.piani || []).forEach(function (pl) {
      if (!PM.vistaDi(pl.plane)) return
      var a = misura(pl.pre.tipo), b = misura(pl.post.tipo)
      if (!a || !b) return
      if (a.origine === 'automatico' || b.origine === 'automatico') auto = true   // gradi-auto-v1
      PM.confronto(a.gradi || [], b.gradi || [], a.vista).forEach(function (c) {
        righe.push({ vista: NOMI_PIANO[pl.plane] || pl.label, c: c })
      })
    })
    var eq = pd.eq && pd.eq.condizioni && pd.eq.condizioni.length ? pd.eq.condizioni : []
    var giud = righe.some(function (r) { return r.c.errore != null })   // editor-punti-v1
    if (!righe.length && !eq.length) return ''

    var th = 'style="text-align:left;font-size:7.5px;color:#666;font-weight:700;padding:3px 5px;border-bottom:1px solid #ddd"'
    var td = 'style="font-size:8.5px;color:#1a1a1a;padding:3px 5px;border-bottom:1px solid #f0f0f0"'
    var h = o.sec('Prima e dopo i 3 Respiri — misure')

    if (righe.length) {
      h += '<div style="font-size:8px;font-weight:700;color:#555;margin:6px 0 2px">Gradi sulle foto (0° = riferimento: filo a piombo / linea in piano)</div>' +
        '<table style="width:100%;border-collapse:collapse;margin-bottom:4px"><tr>' +
        '<th ' + th + '>Vista</th><th ' + th + '>Misura</th><th ' + th + '>Prima</th><th ' + th + '>Dopo</th><th ' + th + '>Differenza</th>' +
        (giud ? '<th ' + th + '>Esito (soglia)</th>' : '') + '</tr>' +
        righe.map(function (r) {
          return '<tr><td ' + td + '>' + esc(r.vista) + '</td><td ' + td + '>' + esc(r.c.nome) + '</td>' +
            '<td ' + td + '>' + num(r.c.a.valore) + '° <span style="color:#888">' + esc(r.c.a.parola) + '</span></td>' +
            '<td ' + td + '><b>' + num(r.c.b.valore) + '°</b> <span style="color:#888">' + esc(r.c.b.parola) + '</span></td>' +
            '<td ' + td + '>' + (r.c.delta > 0 ? '+' : r.c.delta < 0 ? '−' : '±') + num(Math.abs(r.c.delta)) + '°</td>' +
            (giud ? '<td ' + td + '>' + (r.c.errore == null ? '<span style="color:#888">da confermare</span>'
              : '<b>' + ({ meglio: 'Più vicino al riferimento', uguale: 'Invariato', lavoro: 'Più lontano dal riferimento' }[r.c.esito] || '') + '</b> <span style="color:#888">(±' + num(r.c.errore) + '°)</span>') + '</td>' : '') + '</tr>'
        }).join('') + '</table>' +
        '<p style="margin:2px 0 6px;font-size:7.5px;color:#666;font-style:italic;line-height:1.5">' +
        (auto ? 'Punti trovati in automatico dal modello (riferimento: la verticale della foto), eventualmente corretti dal professionista. ' : 'Punti confermati dal professionista sulla foto. ') +
        (giud ? 'Una differenza entro la soglia (errore della misura, ' +
          'ricavato ripetendo le foto: 2,77 × deviazione standard entro il soggetto) è riportata come «invariato».'
        : 'L’errore di misura di questo metodo non è ancora stato ' +
          'misurato: le differenze si riportano, ma non vanno interpretate come miglioramento o peggioramento.') + '</p>'
    }

    if (eq.length) {
      var parola = { meglio: 'Più stabile', uguale: 'Invariato', lavoro: 'Meno stabile' }
      h += '<div style="font-size:8px;font-weight:700;color:#555;margin:8px 0 2px">Equilibrio — Oscillazione Policettiva, velocità media di oscillazione</div>' +
        '<table style="width:100%;border-collapse:collapse;margin-bottom:4px"><tr>' +
        '<th ' + th + '>Condizione</th><th ' + th + '>Prima</th><th ' + th + '>Dopo</th><th ' + th + '>Differenza</th><th ' + th + '>Esito (soglia)</th></tr>' +
        eq.map(function (c) {
          return '<tr><td ' + td + '>' + esc(c.nome) + ' <span style="color:#888">(' + c.nA + '+' + c.nB + ' prove)</span></td>' +
            '<td ' + td + '>' + num(c.velA) + ' °/s</td><td ' + td + '><b>' + num(c.velB) + ' °/s</b></td>' +
            '<td ' + td + '>' + (c.dv >= 0 ? '+' : '−') + Math.round(Math.abs(c.dv)) + '%</td>' +
            '<td ' + td + '><b>' + esc(parola[c.esito] || c.verdetto) + '</b> <span style="color:#888">(±' + c.banda + '%)</span></td></tr>'
        }).join('') + '</table>' +
        '<p style="margin:2px 0 6px;font-size:7.5px;color:#666;font-style:italic;line-height:1.5">' +
        'Una differenza entro la soglia rientra nella variabilità della misura ed è riportata come «invariato». ' +
        'Le soglie derivano dalla ripetibilità misurata finora su un campione ridotto: sono provvisorie.</p>'
    }

    h += '<p style="margin:4px 0 0;font-size:7.5px;color:#444;line-height:1.5;background:#f7f7f7;border-left:3px solid #FFD008;padding:5px 8px">' +
      '<b>Nota di metodo.</b> Prima e dopo sono rilevati nella stessa seduta, prima e dopo la tecnica dei 3 Respiri. ' +
      'Il confronto descrive cosa è cambiato dopo la tecnica; da solo non ne dimostra la causa.</p>'
    return h
  }

  global.PolPdfPrimaDopo = { carica: carica, foto: foto, sezione: sezione, NOMI_PIANO: NOMI_PIANO }
})(typeof window !== 'undefined' ? window : globalThis)
