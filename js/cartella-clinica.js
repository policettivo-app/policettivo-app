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

   ⚠️ NIENTE MIGRATION. La sintesi AI si riconosce ancora dal prefisso
   [SINTESI_AI_V1] dentro il contenuto, come prima. La colonna
   clinical_notes.tipo arrivera' col progetto terapeutico: un blocco, una
   SQL, cosi' se la SQL non viene lanciata non si porta dietro anche
   questo.
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

  function iniettaCss() {
    if (document.getElementById('cn-css-' + MARKER)) return
    var s = document.createElement('style')
    s.id = 'cn-css-' + MARKER
    s.textContent = CSS
    document.head.appendChild(s)
  }

  // ── il markup: scritto QUI, non in due pagine ───────────────────────
  var HTML = ''
    + '<div id="cn-list-view">'
    +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:10px;flex-wrap:wrap">'
    +     '<span style="font-size:13px;font-weight:600;color:#555">Cronologia note — più recenti prima</span>'
    +     '<button type="button" class="cnx-btn small" onclick="clinicalNotesNewForm()">+ Nuova nota</button>'
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
    +     '<button type="button" class="cnx-btn" onclick="clinicalNotesSave()">Salva nota</button>'
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

    var res = await cfg.sb
      .from('clinical_notes')
      .select('id, title, content, updated_at')
      .eq('patient_id', cfg.patientId)
      .eq('professional_id', profId)
      .order('updated_at', { ascending: false })

    if (res.error) {
      list.innerHTML = '<div class="cn-empty" style="color:#c62828;font-weight:700">Errore nel caricamento delle note: ' + esc(res.error.message || res.error.code || 'sconosciuto') + '</div>'
      stato.loaded = false
      return
    }

    render(res.data || [])

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

  window._cnApriAI = function (id) { if (cfg.onApriAI) cfg.onApriAI(id) }
  window._cnAvvisoAI = function () {
    alert('Questa è una sintesi AI: si apre dalla scheda paziente, nella cartella clinica → Sintesi AI.')
  }

  window.polCartellaClinica = {
    marker: MARKER,
    montaRelazione: montaRelazione,
    ricarica: function () { stato.loaded = false; return init() },
    templates: CN_TEMPLATES
  }
})()
