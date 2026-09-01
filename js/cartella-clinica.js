/* ===================================================================
   js/cartella-clinica.js — cartella-in-anamnesi-v1 (31 agosto 2026)

   LA CARTELLA CLINICA VIVE IN UN POSTO SOLO.
   Prima la scheda «Relazione clinica» esisteva solo dentro paziente.html:
   per scriverne una dall'anamnesi bisognava uscire, e l'unico modo di
   averla anche li' sarebbe stato ricopiarla. In questo repo due punti che
   disegnano la stessa cosa divergono SEMPRE — e' gia' successo con gli
   slot foto della visita e col vocabolario delle osservazioni.
   Quindi: un elemento, una funzione che lo disegna, un file solo.

   COME SI USA
     window.polCartellaClinica.montaRelazione({
       sb:        client supabase,
       patientId: id del paziente,
       mount:     elemento (o id) dove disegnare,
       onApriAI:  funzione(id) — opzionale. Se c'e', le note di sintesi AI
                  si aprono con quella (paziente.html). Se manca, la card
                  AI dice dove si apre invece di aprire un JSON grezzo.
     })

   PERCHE' ESPONE NOMI SU window
   La Sintesi AI di paziente.html chiama clinicalNotesGetProfId(),
   clinicalNotesInit(), clinicalNotesState.loaded e legge _cnNoteDataMap.
   Il modulo espone ESATTAMENTE quei nomi, con lo stesso comportamento:
   cosi' spostando il codice qui dentro la Sintesi AI non e' stata toccata
   di una riga. Gli onclick inline restano identici a prima.

   ⚠️ LA MIGRATION 039 SERVE SOLO AL PROGETTO.
   La relazione clinica funziona identica anche senza. Se la colonna
   clinical_notes.tipo non c'e' (errore 42703) il modulo se ne accorge da
   solo, continua a leggere le note come prima e nel riquadro del progetto
   SCRIVE che manca la 039. Una migration non lanciata non deve produrre
   un guasto muto: il 29 agosto tre round di debug sul PDF avevano quella
   causa, e il sintomo non lo diceva.

   La sintesi AI continua a riconoscersi dal prefisso [SINTESI_AI_V1] nel
   contenuto: il visore lo usa per estrarre il JSON.
   =================================================================== */
(function () {
  'use strict'

  if (window.polCartellaClinica) return   // caricato due volte: non si raddoppia

  var MARKER = 'cartella-in-anamnesi-v1'

  // ── stato, con gli stessi nomi di prima ─────────────────────────────
  var stato = { profId: null, editingId: null, timer: null, loaded: false }
  var cfg   = { sb: null, patientId: null, mount: null, onApriAI: null }

  window.clinicalNotesState = stato
  window._cnNoteDataMap     = window._cnNoteDataMap || {}

  // ── CSS, iniettato una volta sola ───────────────────────────────────
  var CSS = ''
    + '.cn-note-list{display:flex;flex-direction:column;gap:10px}'
    + '.cn-note-card{position:relative;background:#f9f9f9;border:1.5px solid #eee;border-radius:10px;padding:14px 42px 14px 16px;cursor:pointer;transition:border-color .15s}'
    + '.cn-note-card:hover{border-color:#FFD008}'
    + '.cn-note-card-title{font-weight:700;font-size:13px;color:#000;margin-bottom:4px}'
    + '.cn-note-card-preview{font-size:12px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px}'
    + '.cn-note-card-meta{font-size:11px;color:#bbb}'
    + '.cn-note-card-del{position:absolute;top:8px;right:8px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;color:#a15a5a;font-size:14px;line-height:1;cursor:pointer;border-radius:6px;padding:0}'
    + '.cn-note-card-del:hover{background:#fee2e2;color:#7f1d1d}'
    + '.cn-note-badge-ai{display:inline-block;background:#000;color:#FFD008;font-size:10px;font-weight:700;border-radius:4px;padding:1px 7px;margin-left:8px;letter-spacing:.5px}'
    + '.cn-empty{text-align:center;padding:32px 16px;color:#bbb;font-size:13px}'
    + '.cn-status{font-size:11px;color:#999;height:16px;display:inline-block}'
    + '.cn-status.saved{color:#4CAF50}'
    + '.cn-status.saving{color:#aaa}'
    + '.cn-status.errore{color:#c62828;font-weight:700;height:auto}'
    + '.cn-input{width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #ddd;border-radius:8px;font-family:Montserrat,sans-serif;font-size:14px;color:#000;outline:none}'
    + '.cn-input:focus{border-color:#FFD008}'
    + '.cn-textarea{width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #ddd;border-radius:8px;font-family:Montserrat,sans-serif;font-size:14px;color:#000;outline:none;resize:vertical;min-height:180px;line-height:1.7}'
    + '.cn-textarea:focus{border-color:#FFD008}'
    /* bottoni propri: la classe .btn-primary esiste in paziente.html ma non
       in anamnesi.html. Un modulo condiviso non si appoggia allo stile della
       pagina che lo ospita, se no in una delle due e' senza vestito. */
    + '.cnx-btn{background:#FFD008;color:#000;border:none;padding:12px 24px;border-radius:8px;font-family:Montserrat,sans-serif;font-size:13px;font-weight:700;cursor:pointer}'
    + '.cnx-btn:hover{background:#e6bc00}'
    + '.cnx-btn.small{font-size:12px;padding:8px 16px}'
    + '.cnx-link{background:transparent;border:none;color:#999;font-size:13px;cursor:pointer;font-family:Montserrat,sans-serif;padding:0}'
    + '.cnx-tpl{width:100%;box-sizing:border-box;padding:7px 10px;border:1.5px solid #ddd;border-radius:8px;font-family:Montserrat,sans-serif;font-size:12px;color:#666;background:#fafafa;cursor:pointer;margin-bottom:6px}'
    /* progetto-terapeutico-v1 — il progetto sta IN CIMA alla scheda: e' il
       documento che guida tutti gli altri, non una nota fra le note. */
    + '.pg-box{border:2px solid #FFD008;border-radius:12px;padding:14px 16px;margin-bottom:18px;background:#fffdf0}'
    + '.pg-box.vuoto{border-style:dashed;border-color:#ddd;background:#fafafa;text-align:center;padding:20px 16px}'
    + '.pg-box.chiuso{border-color:#ccc;background:#fafafa}'
    + '.pg-tit{font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#7a6300;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}'
    + '.pg-stato{font-size:9px;font-weight:800;padding:2px 8px;border-radius:20px;background:#0d5c3f;color:#fff;letter-spacing:.4px}'
    + '.pg-stato.chiuso{background:#888}'
    + '.pg-riga{font-size:12.5px;color:#222;line-height:1.6;margin-bottom:3px}'
    + '.pg-riga b{color:#000}'
    + '.pg-et{font-size:11px;font-weight:700;color:#8a7300;text-transform:uppercase;letter-spacing:.4px}'
    + '.pg-chip-mini{display:inline-block;background:#fff;border:1px solid #e0cf6a;border-radius:20px;padding:2px 9px;font-size:11px;font-weight:600;margin:2px 4px 2px 0}'
    + '.pg-scaduto{background:#ffebee;border:1.5px solid #c62828;color:#8c1d1d;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700;line-height:1.5;margin:8px 0 4px}'
    + '.pg-azioni{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}'
    + '.pg-form{display:flex;flex-direction:column;gap:14px}'
    + '.pg-campo{display:flex;flex-direction:column;gap:5px}'
    + '.pg-campo>label{font-size:12px;font-weight:700;color:#444}'
    + '.pg-aiuto{font-size:11px;color:#999;line-height:1.45}'
    + '.pg-precomp{font-size:11px;color:#0d5c3f;font-weight:700}'
    + '.pg-due{display:grid;grid-template-columns:1fr 1fr;gap:10px}'
    + '@media(max-width:560px){.pg-due{grid-template-columns:1fr}}'
    + '.pg-chip{display:inline-block;background:#fff;border:1.5px solid #ddd;border-radius:20px;padding:7px 13px;font-size:12px;font-weight:600;cursor:pointer;margin:0 6px 6px 0;user-select:none}'
    + '.pg-chip.on{background:#FFD008;border-color:#FFD008;font-weight:700}'
    + '.pg-grp{font-size:11px;font-weight:800;color:#999;text-transform:uppercase;letter-spacing:.4px;margin:8px 0 6px}'
    + '.pg-avviso{background:#fff8e1;border:1.5px solid #FFD008;border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.55;color:#4a3b00}'
    + '.pg-manca{background:#ffebee;border:1.5px solid #c62828;border-radius:10px;padding:12px 14px;font-size:12.5px;line-height:1.6;color:#8c1d1d}'

  function iniettaCss() {
    if (document.getElementById('cn-css-' + MARKER)) return
    var s = document.createElement('style')
    s.id = 'cn-css-' + MARKER
    s.textContent = CSS
    document.head.appendChild(s)
  }

  // ── il markup: scritto QUI, non in due pagine ───────────────────────
  var HTML = ''
    + '<div id="cn-progetto"></div>'          // progetto-terapeutico-v1
    + '<div id="cn-progetto-editor" style="display:none"></div>'
    + '<div id="cn-list-view">'
    +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:10px;flex-wrap:wrap">'
    +     '<span style="font-size:13px;font-weight:600;color:#555">Cronologia note — più recenti prima</span>'
    +     '<button type="button" id="cn-btn-nuova" class="cnx-btn small" onclick="clinicalNotesNewForm()">+ Nuova nota</button>'
    +   '</div>'
    +   '<div id="cn-note-list" class="cn-note-list"><div class="cn-empty">Nessuna nota clinica ancora.</div></div>'
    + '</div>'
    + '<div id="cn-editor" style="display:none;flex-direction:column;gap:12px">'
    +   '<div style="display:flex;justify-content:space-between;align-items:center">'
    +     '<span style="font-size:13px;font-weight:700;color:#000" id="cn-editor-label">Nuova nota</span>'
    +     '<button type="button" class="cnx-link" onclick="clinicalNotesCancel()">✕ Annulla</button>'
    +   '</div>'
    +   '<input type="text" id="cn-title" class="cn-input" placeholder="Titolo nota (opzionale)" oninput="clinicalNotesScheduleAutosave()">'
    +   '<select id="cn-tpl-select" class="cnx-tpl" onchange="clinicalNotesTemplate(this)"><option value="">⚡ Template rapido...</option></select>'
    +   '<textarea id="cn-content" class="cn-textarea" placeholder="Scrivi la nota clinica..." oninput="clinicalNotesScheduleAutosave()"></textarea>'
    +   '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">'
    +     '<span id="cn-status" class="cn-status"></span>'
    +     '<button type="button" id="cn-btn-salva" class="cnx-btn" onclick="clinicalNotesSave()">Salva nota</button>'
    +   '</div>'
    + '</div>'

  // ── TEMPLATE RAPIDI (identici a prima) ──────────────────────────────
  var CN_TEMPLATES = [
    { label: 'Cervicalgia',          testo: 'Mobilizzazioni cervicali C1-C7. Stretching scaleni e trapezio superiore. Terapia manuale faccette articolari. Esercizi di stabilizzazione cervicale.' },
    { label: 'Lombalgia',            testo: 'Mobilizzazioni lombari L4-S1. Rinforzo core: isometrici addominali e glutei. Stretching piriforme e flessori anca. Educazione posturale.' },
    { label: 'Spalla',               testo: 'Mobilizzazione gleno-omerale. Rinforzo cuffia dei rotatori (sopraspinato, infraspinato). Stretching catena posteriore. Progressione CCC e CCA.' },
    { label: 'Ginocchio',            testo: 'Rinforzo quadricipite e ischio-crurali. Propriocezione su pedana instabile. Mobilizzazione rotulea. Esercizi in catena cinematica chiusa.' },
    { label: 'Terapia manuale',      testo: 'Mobilizzazione articolare grado III-IV (Maitland). Tecniche miofasciali. Soft tissue mobilization.' },
    { label: 'Mobilità',             testo: 'Stretching attivo e passivo mirato. Mobilizzazioni accessorie. Incremento progressivo range of motion.' },
    { label: 'Rinforzo',             testo: 'Esercizi di rinforzo muscolare progressivo. Lavoro eccentrico e concentrico. Progressione carico adeguata alla fase.' },
    { label: 'Stabilizzazione',      testo: 'Attivazione muscoli profondi (multifido, trasverso). Progressione da supino a ortostatismo. Esercizi su superfici instabili.' },
    { label: 'Progressione',         testo: 'Aggiunta esercizi funzionali, incremento carichi, riduzione supervisione. Valutazione obiettivi raggiunti.' },
    { label: 'Educazione paziente',  testo: 'Spiegazione meccanismo di guarigione. Gestione autonoma del dolore. Indicazioni posturali quotidiane. Esercizi domiciliari consegnati.' }
  ]

  // ── utilita' ────────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id) }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
  // Nasconde il marker upsert (es. " [#<uuid>]") dal titolo mostrato in
  // cronologia. Il valore nel DB e in data-title resta intatto: se lo si
  // toglie davvero si rompe l'upsert della nota dalla visita.
  function stripMarker(t) { return String(t || '').replace(/\s*\[#[^\]]+\]\s*$/, '').trim() }

  // ── professionista ──────────────────────────────────────────────────
  async function getProfId() {
    if (stato.profId) return stato.profId
    if (!cfg.sb) return null
    var s = await cfg.sb.auth.getSession()
    var session = s && s.data ? s.data.session : null
    if (!session) return null
    var r = await cfg.sb.from('professionals').select('id').eq('user_id', session.user.id).maybeSingle()
    stato.profId = (r && r.data) ? r.data.id : null
    return stato.profId
  }

  // ── caricamento e disegno ───────────────────────────────────────────
  async function init() {
    var list = el('cn-note-list')
    if (!list) return
    stato.loaded = true
    list.innerHTML = '<div class="cn-empty" style="color:#bbb">Caricamento...</div>'

    var profId = await getProfId()
    if (!profId) {
      // ⚠️ L'errore si legge a schermo. Un toast che sparisce non basta:
      // se il profilo non c'e', le note non si salvano e va detto.
      list.innerHTML = '<div class="cn-empty" style="color:#c62828;font-weight:700">Profilo professionista non trovato: le note non si possono leggere né salvare. Ricarica la pagina, e se resta così segnalalo.</div>'
      stato.loaded = false
      return
    }

    var res = await caricaNote(profId)

    if (res.error) {
      list.innerHTML = '<div class="cn-empty" style="color:#c62828;font-weight:700">Errore nel caricamento delle note: ' + esc(res.error.message || res.error.code || 'sconosciuto') + '</div>'
      stato.loaded = false
      return
    }

    /* progetto-terapeutico-v1 — il progetto non compare nella cronologia
       delle note: ha il suo riquadro in cima. In cronologia si vedrebbe
       come un blocco di JSON, che non e' un documento clinico leggibile. */
    var tutte = res.data || []
    progetti  = senzaMigration ? [] : tutte.filter(function (n) { return n.tipo === 'progetto' })
    render(tutte.filter(function (n) { return n.tipo !== 'progetto' }))
    renderProgetto()

    var sel = el('cn-tpl-select')
    if (sel && sel.options.length === 1) {
      CN_TEMPLATES.forEach(function (t) {
        var o = document.createElement('option'); o.value = t.label; o.textContent = t.label; sel.appendChild(o)
      })
    }
  }

  function render(notes) {
    var list = el('cn-note-list')
    if (!list) return
    if (!notes.length) { list.innerHTML = '<div class="cn-empty">Nessuna nota clinica ancora.</div>'; return }

    list.innerHTML = notes.map(function (n) {
      var isAI = String(n.content || '').indexOf('[SINTESI_AI_V1]') === 0
      var displayTitle = stripMarker(n.title || 'Senza titolo') || 'Senza titolo'
      var rawPreview = isAI
        ? (function () { try { return JSON.parse(n.content.replace('[SINTESI_AI_V1]\n', '')).problema_principale || '' } catch (e) { return '' } })()
        : (n.content || '')
      var preview = rawPreview.replace(/\n/g, ' ').substring(0, 90)
      var d = new Date(n.updated_at)
      var date = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) +
                 ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

      if (isAI) window._cnNoteDataMap[n.id] = n.content

      var dataAttr = 'data-id="' + n.id + '" data-title="' + esc(n.title || '') + '" data-content="' + esc(n.content || '') + '"'
      var badgeAI  = isAI ? '<span class="cn-note-badge-ai">AI</span>' : ''
      // Una sintesi AI si apre nel suo visore, che vive in paziente.html.
      // Dove quel visore non c'e' (anamnesi) NON si apre il JSON grezzo:
      // si dice dove si apre. Meglio una riga onesta che un documento
      // clinico mostrato come un blocco di codice.
      var clickHandler = isAI
        ? (cfg.onApriAI ? 'onclick="_cnApriAI(\'' + n.id + '\')"' : 'onclick="_cnAvvisoAI()"')
        : 'onclick="clinicalNotesEditFormFromEl(this)"'
      var delBtn = '<button type="button" class="cn-note-card-del" title="Elimina nota" aria-label="Elimina nota" onclick="clinicalNotesDelete(event, \'' + n.id + '\')">🗑</button>'

      return '<div class="cn-note-card" ' + dataAttr + ' ' + clickHandler + '>' +
        delBtn +
        '<div class="cn-note-card-title">' + esc(displayTitle) + badgeAI + '</div>' +
        '<div class="cn-note-card-preview">' + esc(preview) + '</div>' +
        '<div class="cn-note-card-meta">Modificato: ' + date + '</div>' +
        '</div>'
    }).join('')
  }

  // ── editor ──────────────────────────────────────────────────────────
  function editFormFromEl(node) {
    apriEditor({
      id:      node.getAttribute('data-id'),
      title:   node.getAttribute('data-title'),
      content: node.getAttribute('data-content')
    })
  }

  function apriEditor(nota) {
    stato.editingId = nota ? nota.id : null
    el('cn-title').value   = (nota && nota.title)   ? nota.title   : ''
    el('cn-content').value = (nota && nota.content) ? nota.content : ''
    var st = el('cn-status'); st.textContent = ''; st.className = 'cn-status'
    el('cn-editor-label').textContent = nota ? 'Modifica nota' : 'Nuova nota'
    el('cn-list-view').style.display = 'none'
    el('cn-editor').style.display = 'flex'
    el('cn-content').focus()
  }

  function nuovaNota() { apriEditor(null) }

  function annulla() {
    if (stato.timer) { clearTimeout(stato.timer); stato.timer = null }
    stato.editingId = null
    el('cn-editor').style.display = 'none'
    el('cn-list-view').style.display = 'block'
  }

  function programmaAutosave() {
    var st = el('cn-status')
    if (!st) return
    st.textContent = 'Modificato...'
    st.className = 'cn-status saving'
    if (stato.timer) clearTimeout(stato.timer)
    // Autosave silenzioso: salva senza chiudere l'editor ne' ricaricare la
    // lista, cosi' si continua a scrivere senza perdere il cursore.
    stato.timer = setTimeout(function () { salva({ closeAfter: false }) }, 3000)
  }

  async function salva(opts) {
    var closeAfter = !(opts && opts.closeAfter === false)
    if (stato.timer) { clearTimeout(stato.timer); stato.timer = null }

    var title   = el('cn-title').value.trim()
    var content = el('cn-content').value.trim()
    if (!content && !title) return

    var st = el('cn-status')
    st.textContent = 'Salvataggio...'
    st.className = 'cn-status saving'

    var profId = await getProfId()
    if (!profId) {
      st.textContent = 'Errore: profilo professionista non trovato. La nota NON è stata salvata.'
      st.className = 'cn-status errore'
      return
    }

    var error = null
    if (stato.editingId) {
      var r1 = await cfg.sb.from('clinical_notes')
        .update({ title: title || null, content: content, updated_at: new Date().toISOString() })
        .eq('id', stato.editingId)
      error = r1.error
    } else {
      var r2 = await cfg.sb.from('clinical_notes')
        .insert({ patient_id: cfg.patientId, professional_id: profId, title: title || null, content: content })
        .select('id')
        .maybeSingle()
      error = r2.error
      if (!error && r2.data) stato.editingId = r2.data.id
    }

    if (error) {
      // Il testo dell'errore si legge, e il testo scritto resta nella
      // casella: non si perde quello che il professionista ha appena scritto.
      st.textContent = 'Errore nel salvataggio: ' + (error.message || error.code || 'sconosciuto') + '. Il testo è ancora qui: riprova.'
      st.className = 'cn-status errore'
      return
    }

    if (closeAfter) {
      stato.loaded = false
      annulla()
      await init()
    } else {
      st.textContent = 'Salvato'
      st.className = 'cn-status saved'
    }
  }

  async function elimina(ev, id) {
    if (ev) { ev.stopPropagation(); ev.preventDefault() }
    if (!id) return
    if (!confirm('Eliminare questa nota? Operazione non annullabile.')) return
    var r = await cfg.sb.from('clinical_notes').delete().eq('id', id)
    if (r.error) { alert('Errore eliminazione nota: ' + (r.error.message || r.error.code || 'sconosciuto')); return }
    if (stato.editingId === id) annulla()
    stato.loaded = false
    await init()
  }

  function template(sel) {
    var val = sel.value
    if (!val) return
    var tpl = null
    for (var i = 0; i < CN_TEMPLATES.length; i++) if (CN_TEMPLATES[i].label === val) tpl = CN_TEMPLATES[i]
    if (tpl) {
      var ta = el('cn-content')
      ta.value = ta.value ? ta.value + '\n\n' + tpl.testo : tpl.testo
      programmaAutosave()
    }
    sel.value = ''
  }

  /* ═══════════════════════════════════════════════════════════════════
     progetto-terapeutico-v1 — IL PROGETTO TERAPEUTICO

     E' il documento che mancava: gli obiettivi del paziente stanno
     nell'anamnesi (§28) e quello che si trova sta nelle visite, ma
     «cosa faccio, e cosa NON posso fare» non era scritto da nessuna
     parte — si finiva dentro il testo libero della relazione.

     PERCHE' A CAMPI FISSI E NON TESTO LIBERO.
     Perche' il controllo delle controindicazioni ha bisogno di sapere
     QUALI terapie sono in programma. Da un paragrafo non si ricava;
     da un elenco di chip si'. E' questo che sblocca il blocco
     red-flag-documenti-v1: senza, l'AI non puo' avvertire di niente.

     DOVE VIVE. Una riga di clinical_notes con tipo='progetto' e il
     contenuto in JSON. Niente tabella nuova: archivio, permessi e
     storico esistono gia'. Il progetto attivo e' la piu' recente.
     ═══════════════════════════════════════════════════════════════════ */

  var progetti = []          // le revisioni, dalla piu' recente
  var senzaMigration = false // la 039 non e' stata lanciata
  var bozza = null           // il progetto aperto nell'editor

  // PostgREST, quando la colonna non c'e', risponde 42703. Il codice non
  // deve morire: la relazione clinica continua a funzionare e il progetto
  // dice cosa manca. Il 29 agosto tre round di debug sul PDF avevano una
  // sola causa — una migration mai lanciata — e il sintomo non lo diceva.
  function mancaLaColonna(e) {
    if (!e) return false
    if (e.code === '42703' || e.code === 'PGRST204') return true
    var m = String(e.message || '').toLowerCase()
    return (m.indexOf('tipo') >= 0 && (m.indexOf('does not exist') >= 0 || m.indexOf('schema cache') >= 0))
  }

  async function caricaNote(profId) {
    var campi = senzaMigration
      ? 'id, title, content, updated_at'
      : 'id, title, content, updated_at, tipo'
    var res = await cfg.sb.from('clinical_notes').select(campi)
      .eq('patient_id', cfg.patientId)
      .eq('professional_id', profId)
      .order('updated_at', { ascending: false })
    if (res.error && mancaLaColonna(res.error) && !senzaMigration) {
      senzaMigration = true
      return caricaNote(profId)
    }
    return res
  }

  function progVuoto() {
    return { v:1, stato:'attivo', origine:'autonomo', prescrittore:'', data_prescrizione:'',
             problema:'', ob_breve:'', ob_medio:'', ob_lungo:'', interventi:[],
             frequenza:'', durata:'', precauzioni:'', rivaluta_quando:'', rivaluta_data:'', esito:'' }
  }

  function progLeggi(nota) {
    if (!nota) return null
    try {
      var o = JSON.parse(nota.content || '{}')
      if (o && typeof o === 'object') { o.__id = nota.id; o.__agg = nota.updated_at; return o }
    } catch (e) {}
    return null
  }

  function dataIT(v) { if (!v) return ''; var d = new Date(v); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT') }
  function giorniDa(v) {
    var d = new Date(v); if (isNaN(d.getTime())) return null
    return Math.floor((Date.now() - d.getTime()) / 86400000)
  }

  // ── il riquadro ─────────────────────────────────────────────────────
  function renderProgetto() {
    var box = el('cn-progetto')
    if (!box) return

    if (senzaMigration) {
      box.className = ''
      box.innerHTML = '<div class="pg-manca"><b>Il progetto terapeutico non è disponibile: manca la migration 039.</b><br>' +
        'La colonna <code>clinical_notes.tipo</code> non esiste ancora nel database. Le note cliniche qui sotto funzionano normalmente. ' +
        'Per attivare il progetto va eseguita la SQL <code>039_clinical_notes_tipo.sql</code> in Supabase, poi basta ricaricare la pagina.</div>'
      return
    }

    var p = progLeggi(progetti[0])

    if (!p) {
      box.className = ''
      box.innerHTML = '<div class="pg-box vuoto">' +
        '<div style="font-size:13px;color:#666;margin-bottom:4px;font-weight:700">Nessun progetto terapeutico</div>' +
        '<div class="pg-aiuto" style="margin-bottom:12px">Cosa si fa, con che frequenza, e quando si rivaluta. Gli obiettivi li prende dall\'anamnesi.</div>' +
        '<button type="button" id="pg-btn-crea" class="cnx-btn small" onclick="progNuovo()">+ Crea il progetto</button>' +
        '</div>'
      return
    }

    var chiuso = p.stato === 'chiuso'
    var righe = []

    righe.push('<div class="pg-tit">📌 Progetto terapeutico' +
      '<span class="pg-stato' + (chiuso ? ' chiuso' : '') + '">' + (chiuso ? 'CHIUSO' : 'ATTIVO') + '</span>' +
      (progetti.length > 1 ? '<span style="font-size:10px;color:#aaa;font-weight:600">revisione ' + progetti.length + '</span>' : '') +
      '<span style="font-size:10px;color:#aaa;font-weight:600;margin-left:auto">agg. ' + dataIT(p.__agg) + '</span></div>')

    /* ⚖️ L'origine e' la prima riga, non un dettaglio in fondo: dice se il
       progetto nasce da una prescrizione o dall'iniziativa autonoma del
       fisioterapista, e cambia di chi e' la responsabilita' di quello che
       segue. */
    righe.push('<div class="pg-riga"><span class="pg-et">Origine</span> — ' +
      (p.origine === 'prescrizione'
        ? 'su <b>prescrizione</b>' + (p.prescrittore ? ' di ' + esc(p.prescrittore) : '') + (p.data_prescrizione ? ' del ' + dataIT(p.data_prescrizione) : '')
        : '<b>iniziativa autonoma</b> del fisioterapista') + '</div>')

    if (p.problema) righe.push('<div class="pg-riga"><span class="pg-et">Problema</span> — ' + esc(p.problema) + '</div>')

    var ob = []
    if (p.ob_breve) ob.push('breve: ' + esc(p.ob_breve))
    if (p.ob_medio) ob.push('medio: ' + esc(p.ob_medio))
    if (p.ob_lungo) ob.push('lungo: ' + esc(p.ob_lungo))
    if (ob.length) righe.push('<div class="pg-riga"><span class="pg-et">Obiettivi</span> — ' + ob.join(' · ') + '</div>')

    if (p.interventi && p.interventi.length) {
      righe.push('<div class="pg-riga"><span class="pg-et">Interventi</span><br>' +
        p.interventi.map(function (k) { return '<span class="pg-chip-mini">' + esc(nomeTerapia(k)) + '</span>' }).join('') + '</div>')
    }

    var fd = []
    if (p.frequenza) fd.push(esc(p.frequenza))
    if (p.durata)    fd.push(esc(p.durata))
    if (fd.length) righe.push('<div class="pg-riga"><span class="pg-et">Frequenza e durata</span> — ' + fd.join(' · ') + '</div>')

    if (p.precauzioni) righe.push('<div class="pg-riga"><span class="pg-et">Precauzioni</span> — ' + esc(p.precauzioni) + '</div>')

    var rv = []
    if (p.rivaluta_data)   rv.push(dataIT(p.rivaluta_data))
    if (p.rivaluta_quando) rv.push(esc(p.rivaluta_quando))
    if (rv.length) righe.push('<div class="pg-riga"><span class="pg-et">Rivalutazione</span> — ' + rv.join(' · ') + '</div>')

    // ⚠️ Una data di rivalutazione passata e' il motivo per cui questo campo
    // esiste: se scade in silenzio, tanto vale non scriverla.
    if (!chiuso && p.rivaluta_data) {
      var g = giorniDa(p.rivaluta_data)
      if (g !== null && g > 0) {
        righe.push('<div class="pg-scaduto">⚠️ La rivalutazione era prevista per il ' + dataIT(p.rivaluta_data) +
          ': sono passati ' + g + ' giorni. Rivaluta, oppure sposta la data con una nuova revisione.</div>')
      }
    }

    if (chiuso && p.esito) righe.push('<div class="pg-riga" style="margin-top:6px"><span class="pg-et">Esito</span> — ' + esc(p.esito) + '</div>')

    righe.push('<div class="pg-azioni">' +
      '<button type="button" id="pg-btn-modifica" class="cnx-btn small" onclick="progModifica()">✏️ Modifica</button>' +
      '<button type="button" id="pg-btn-revisione" class="cnx-btn small" style="background:#222;color:#fff" onclick="progRevisione()">+ Nuova revisione</button>' +
      '</div>')

    box.innerHTML = '<div class="pg-box' + (chiuso ? ' chiuso' : '') + '">' + righe.join('') + '</div>'
  }

  function nomeTerapia(k) {
    return (window.polTerapie && window.polTerapie.nome) ? window.polTerapie.nome(k) : k
  }

  // ── precompilazione dall'anamnesi ───────────────────────────────────
  /* Precompila SOLO un progetto nuovo, e solo i campi vuoti. Riscrivere
     quello che il professionista ha gia' corretto e' il modo piu' rapido
     per fargli perdere fiducia in un campo precompilato. */
  async function precompila(p) {
    try {
      var r = await cfg.sb.from('patients').select('anamnesi, red_flags').eq('id', cfg.patientId).maybeSingle()
      if (r.error || !r.data) return p
      var A = {}
      try { A = typeof r.data.anamnesi === 'string' ? JSON.parse(r.data.anamnesi || '{}') : (r.data.anamnesi || {}) } catch (e) { A = {} }

      if (!p.ob_breve && A.obiettivi_breve) p.ob_breve = String(A.obiettivi_breve)
      if (!p.ob_medio && A.obiettivi_medio) p.ob_medio = String(A.obiettivi_medio)
      if (!p.ob_lungo && A.obiettivi_lungo) p.ob_lungo = String(A.obiettivi_lungo)
      if (!p.ob_breve && A.obiettivi) p.ob_breve = [].concat(A.obiettivi).join(', ')
      if (!p.problema && A.motivo_txt) p.problema = String(A.motivo_txt)

      // Le red flag entrano nelle precauzioni, non come diagnosi: sono le
      // cose che il professionista ha spuntato lui nello screening §27.
      var rf = r.data.red_flags
      var voci = Array.isArray(rf) ? rf : (rf && Array.isArray(rf.voci) ? rf.voci : [])
      if (!p.precauzioni && voci.length) p.precauzioni = 'Da screening di sicurezza: ' + voci.join('; ')
      p.__precompilato = true
    } catch (e) {}
    return p
  }

  // ── editor ──────────────────────────────────────────────────────────
  async function progNuovo(daRevisione) {
    var base = progVuoto()
    if (daRevisione) {
      var prec = progLeggi(progetti[0])
      if (prec) {
        base = JSON.parse(JSON.stringify(prec))
        delete base.__id; delete base.__agg
        base.stato = 'attivo'
      }
    } else {
      base = await precompila(base)
    }
    bozza = base
    bozza.__nuovo = true
    disegnaEditor()
  }

  function progModifica() {
    var p = progLeggi(progetti[0])
    if (!p) return
    bozza = p
    bozza.__nuovo = false
    disegnaEditor()
  }

  function progRevisione() { progNuovo(true) }

  function progAnnulla() {
    bozza = null
    el('cn-progetto-editor').style.display = 'none'
    el('cn-progetto').style.display = 'block'
    el('cn-list-view').style.display = 'block'
  }

  function campo(lbl, id, val, ph, aiuto) {
    return '<div class="pg-campo"><label for="' + id + '">' + lbl + '</label>' +
      '<input type="text" id="' + id + '" class="cn-input" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '">' +
      (aiuto ? '<span class="pg-aiuto">' + aiuto + '</span>' : '') + '</div>'
  }

  function disegnaEditor() {
    var p = bozza
    var box = el('cn-progetto-editor')
    el('cn-progetto').style.display = 'none'
    el('cn-list-view').style.display = 'none'
    box.style.display = 'block'

    var gruppi = (window.polTerapie && window.polTerapie.gruppi) ? window.polTerapie.gruppi : null
    var chips = gruppi
      ? gruppi.map(function (g) {
          return '<div class="pg-grp">' + esc(g.titolo) + '</div>' +
            g.voci.map(function (t) {
              var on = p.interventi.indexOf(t.k) >= 0
              return '<span class="pg-chip' + (on ? ' on' : '') + '" data-k="' + t.k + '" onclick="progChip(this)">' + esc(t.nome) + '</span>'
            }).join('')
        }).join('')
      /* Nessun elenco «di riserva» scritto qui: due vocabolari per la stessa
         cosa fanno entrare la stessa terapia nel database con due nomi. */
      : '<div class="pg-manca">Non si è caricato <code>js/terapie.js</code>: l\'elenco delle terapie non è disponibile. Ricarica la pagina.</div>'

    box.innerHTML =
      '<div class="pg-form">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<span style="font-size:14px;font-weight:800">📌 ' + (p.__nuovo ? 'Nuovo progetto terapeutico' : 'Modifica progetto') + '</span>' +
          '<button type="button" class="cnx-link" onclick="progAnnulla()">✕ Annulla</button>' +
        '</div>' +

        (p.__precompilato ? '<div class="pg-avviso">Ho precompilato obiettivi, problema e precauzioni con quello che c\'è nell\'<b>anamnesi</b>. Correggi pure: quello che scrivi qui non torna indietro sull\'anamnesi.</div>' : '') +

        '<div class="pg-campo"><label>Origine del progetto</label>' +
          '<div>' +
            '<span class="pg-chip' + (p.origine === 'autonomo' ? ' on' : '') + '" onclick="progOrigine(\'autonomo\')">Iniziativa autonoma</span>' +
            '<span class="pg-chip' + (p.origine === 'prescrizione' ? ' on' : '') + '" onclick="progOrigine(\'prescrizione\')">Su prescrizione</span>' +
          '</div>' +
          '<span class="pg-aiuto">Se non c\'è un\'indicazione specialistica, il progetto è tuo: sul documento deve risultare.</span>' +
        '</div>' +

        '<div id="pg-presc" class="pg-due" style="' + (p.origine === 'prescrizione' ? '' : 'display:none') + '">' +
          campo('Chi ha prescritto', 'pg-prescrittore', p.prescrittore, 'Es. Dott. Rossi, ortopedico') +
          campo('Data della prescrizione', 'pg-data-presc', p.data_prescrizione, 'gg/mm/aaaa') +
        '</div>' +

        campo('Problema / diagnosi funzionale', 'pg-problema', p.problema, 'Es. lombalgia meccanica con limitazione in flessione') +

        '<div class="pg-campo"><label>Obiettivi</label>' +
          (p.__precompilato ? '<span class="pg-precomp">↩ presi dall\'anamnesi §28</span>' : '') +
          '<input type="text" id="pg-ob-breve" class="cn-input" value="' + esc(p.ob_breve) + '" placeholder="A breve termine">' +
          '<input type="text" id="pg-ob-medio" class="cn-input" value="' + esc(p.ob_medio) + '" placeholder="A medio termine">' +
          '<input type="text" id="pg-ob-lungo" class="cn-input" value="' + esc(p.ob_lungo) + '" placeholder="A lungo termine">' +
        '</div>' +

        '<div class="pg-campo"><label>Interventi previsti</label>' +
          '<span class="pg-aiuto">Tocca quelli che hai in programma. Servono anche a far controllare le controindicazioni: quello che non è segnato qui, nessuno lo può controllare.</span>' +
          '<div id="pg-chips">' + chips + '</div>' +
        '</div>' +

        '<div class="pg-due">' +
          campo('Frequenza', 'pg-frequenza', p.frequenza, 'Es. 2 a settimana') +
          campo('Durata prevista', 'pg-durata', p.durata, 'Es. 6 settimane') +
        '</div>' +

        '<div class="pg-campo"><label>Precauzioni e controindicazioni</label>' +
          (p.__precompilato ? '<span class="pg-precomp">↩ prese dallo screening di sicurezza §27</span>' : '') +
          '<textarea id="pg-precauzioni" class="cn-textarea" style="min-height:80px" placeholder="Cosa evitare, e perché">' + esc(p.precauzioni) + '</textarea>' +
        '</div>' +

        '<div class="pg-due">' +
          campo('Quando rivaluto (criterio)', 'pg-riv-quando', p.rivaluta_quando, 'Es. alla 6ª seduta, o se VAS < 3') +
          '<div class="pg-campo"><label for="pg-riv-data">Data della rivalutazione</label>' +
            '<input type="date" id="pg-riv-data" class="cn-input" value="' + esc(p.rivaluta_data || '') + '">' +
            '<span class="pg-aiuto">Se la data passa, il riquadro te lo dice.</span>' +
          '</div>' +
        '</div>' +

        '<div class="pg-campo"><label>Stato</label>' +
          '<div>' +
            '<span class="pg-chip' + (p.stato === 'attivo' ? ' on' : '') + '" onclick="progStato(\'attivo\')">Attivo</span>' +
            '<span class="pg-chip' + (p.stato === 'chiuso' ? ' on' : '') + '" onclick="progStato(\'chiuso\')">Chiuso</span>' +
          '</div>' +
        '</div>' +

        '<div id="pg-esito-box" class="pg-campo" style="' + (p.stato === 'chiuso' ? '' : 'display:none') + '">' +
          '<label for="pg-esito">Esito / dimissione</label>' +
          '<textarea id="pg-esito" class="cn-textarea" style="min-height:70px" placeholder="Com\'è andata, e cosa resta da fare">' + esc(p.esito) + '</textarea>' +
        '</div>' +

        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<span id="pg-status" class="cn-status"></span>' +
          '<button type="button" id="pg-btn-salva" class="cnx-btn" onclick="progSalva()">Salva il progetto</button>' +
        '</div>' +
      '</div>'
  }

  function progChip(node) {
    var k = node.getAttribute('data-k')
    var i = bozza.interventi.indexOf(k)
    if (i >= 0) { bozza.interventi.splice(i, 1); node.classList.remove('on') }
    else { bozza.interventi.push(k); node.classList.add('on') }
  }

  function progOrigine(v) {
    leggiCampi()
    bozza.origine = v
    disegnaEditor()
  }

  function progStato(v) {
    leggiCampi()
    bozza.stato = v
    disegnaEditor()
  }

  function val(id) { var e = el(id); return e ? String(e.value || '').trim() : '' }

  function leggiCampi() {
    if (!bozza) return
    bozza.prescrittore      = val('pg-prescrittore')
    bozza.data_prescrizione = val('pg-data-presc')
    bozza.problema          = val('pg-problema')
    bozza.ob_breve          = val('pg-ob-breve')
    bozza.ob_medio          = val('pg-ob-medio')
    bozza.ob_lungo          = val('pg-ob-lungo')
    bozza.frequenza         = val('pg-frequenza')
    bozza.durata            = val('pg-durata')
    bozza.precauzioni       = val('pg-precauzioni')
    bozza.rivaluta_quando   = val('pg-riv-quando')
    bozza.rivaluta_data     = val('pg-riv-data')
    bozza.esito             = val('pg-esito')
  }

  async function progSalva() {
    leggiCampi()
    var st = el('pg-status')
    st.textContent = 'Salvataggio...'
    st.className = 'cn-status saving'

    var profId = await getProfId()
    if (!profId) {
      st.textContent = 'Errore: profilo professionista non trovato. Il progetto NON è stato salvato.'
      st.className = 'cn-status errore'
      return
    }

    var pulito = JSON.parse(JSON.stringify(bozza))
    delete pulito.__id; delete pulito.__agg; delete pulito.__nuovo; delete pulito.__precompilato
    var contenuto = JSON.stringify(pulito)
    var titolo = 'Progetto terapeutico — ' + new Date().toLocaleDateString('it-IT')

    var error = null
    if (bozza.__nuovo) {
      var r1 = await cfg.sb.from('clinical_notes')
        .insert({ patient_id: cfg.patientId, professional_id: profId, tipo: 'progetto', title: titolo, content: contenuto })
        .select('id').maybeSingle()
      error = r1.error
    } else {
      var r2 = await cfg.sb.from('clinical_notes')
        .update({ content: contenuto, updated_at: new Date().toISOString() })
        .eq('id', bozza.__id)
      error = r2.error
    }

    if (error) {
      // Il testo scritto resta nel modulo: non si perde un progetto appena
      // compilato perche' il salvataggio e' andato storto.
      st.innerHTML = mancaLaColonna(error)
        ? '<b>Manca la migration 039</b>: la colonna <code>clinical_notes.tipo</code> non esiste. Il progetto non è stato salvato — quello che hai scritto è ancora qui.'
        : 'Errore nel salvataggio: ' + esc(error.message || error.code || 'sconosciuto') + '. Quello che hai scritto è ancora qui: riprova.'
      st.className = 'cn-status errore'
      return
    }

    bozza = null
    el('cn-progetto-editor').style.display = 'none'
    el('cn-progetto').style.display = 'block'
    el('cn-list-view').style.display = 'block'
    stato.loaded = false
    await init()
  }

  // ── montaggio ───────────────────────────────────────────────────────
  function montaRelazione(opzioni) {
    opzioni = opzioni || {}
    var nodo = (typeof opzioni.mount === 'string') ? el(opzioni.mount) : opzioni.mount
    if (!nodo) { console.error('[cartella-clinica] mount non trovato'); return null }
    if (!opzioni.sb)        { console.error('[cartella-clinica] manca il client supabase'); return null }
    if (!opzioni.patientId) { console.error('[cartella-clinica] manca patientId'); return null }

    cfg.sb        = opzioni.sb
    cfg.patientId = opzioni.patientId
    cfg.mount     = nodo
    cfg.onApriAI  = opzioni.onApriAI || null
    stato.loaded  = false
    stato.editingId = null

    iniettaCss()
    nodo.innerHTML = HTML
    return { init: init, apriNuova: nuovaNota }
  }

  // ── nomi esposti: gli stessi che usavano paziente.html e gli onclick ──
  window.clinicalNotesInit             = init
  window.clinicalNotesGetProfId        = getProfId
  window.clinicalNotesRender           = render
  window.clinicalNotesNewForm          = nuovaNota
  window.clinicalNotesEditForm         = apriEditor
  window.clinicalNotesEditFormFromEl   = editFormFromEl
  window.clinicalNotesCancel           = annulla
  window.clinicalNotesScheduleAutosave = programmaAutosave
  window.clinicalNotesSave             = salva
  window.clinicalNotesDelete           = elimina
  window.clinicalNotesTemplate         = template
  window.CN_TEMPLATES                  = CN_TEMPLATES

  // progetto-terapeutico-v1 — gli handler degli onclick del riquadro
  window.progNuovo    = progNuovo
  window.progModifica = progModifica
  window.progRevisione= progRevisione
  window.progAnnulla  = progAnnulla
  window.progSalva    = progSalva
  window.progChip     = progChip
  window.progOrigine  = progOrigine
  window.progStato    = progStato

  window._cnApriAI = function (id) { if (cfg.onApriAI) cfg.onApriAI(id) }
  window._cnAvvisoAI = function () {
    alert('Questa è una sintesi AI: si apre dalla scheda paziente, nella cartella clinica → Sintesi AI.')
  }

  window.polCartellaClinica = {
    marker: MARKER,
    montaRelazione: montaRelazione,
    ricarica: function () { stato.loaded = false; return init() },
    progettoAttivo: function () { return progLeggi(progetti[0]) },
    senzaMigration: function () { return senzaMigration },
    templates: CN_TEMPLATES
  }
})()
