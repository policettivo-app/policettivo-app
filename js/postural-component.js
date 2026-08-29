// Shared postural data — single source of truth
// Used by: valutazione-posturale.html, visita.html

/* vocabolario-unico-v1 (29 ago 2026)
   Le voci NON stanno piu' qui: la fonte unica e' `js/osservazioni.js`.
   Prima c'erano due elenchi paralleli per le stesse cose — "Spalla dx elevata"
   in questo file, "Spalla dx piu' alta" nell'altro — e la stessa crocetta
   entrava nel database con due nomi a seconda della pagina da cui la mettevi.
   Una crocetta che cambia nome non si conta su duecento pazienti.
   ⚠️ Chi usa questo file deve caricare PRIMA js/osservazioni.js.
   Se manca, si resta senza elenco invece di mostrarne uno diverso: meglio un
   pannello vuoto che due vocabolari che si contraddicono. */
const POSTURAL_OBSERVATIONS = (function () {
  const piani = ['sagittale', 'frontale', 'posteriore', 'podoscopio_sotto', 'podoscopio_dietro']
  const out = {}
  const fonte = (typeof window !== 'undefined' && window.polVociPiano) ? window.polVociPiano : null
  piani.forEach(p => { out[p] = fonte ? fonte(p) : [] })
  if (!fonte && typeof console !== 'undefined') {
    console.warn('[postural-component] js/osservazioni.js non caricato: elenco osservazioni vuoto')
  }
  return out
})()

// Canonical photo plane definitions
const POSTURAL_PHOTO_PLANES = [
  { plane: 'sagittale_sx',      label: 'Sagittale SX',
    pre:  { tipo: 'sagittale_sx_pre',       label: 'PRE',     ordine: 2 },
    post: { tipo: 'sagittale_sx_post',      label: 'POST 3R', ordine: 3 } },
  { plane: 'sagittale_dx',      label: 'Sagittale DX',
    pre:  { tipo: 'sagittale_dx_pre',       label: 'PRE',     ordine: 0 },
    post: { tipo: 'sagittale_dx_post',      label: 'POST 3R', ordine: 1 } },
  { plane: 'frontale',          label: 'Frontale',
    pre:  { tipo: 'frontale_pre',           label: 'PRE',     ordine: 4 },
    post: { tipo: 'frontale_post',          label: 'POST 3R', ordine: 5 } },
  { plane: 'posteriore',        label: 'Posteriore',
    pre:  { tipo: 'posteriore_pre',         label: 'PRE',     ordine: 6 },
    post: { tipo: 'posteriore_post',        label: 'POST 3R', ordine: 7 } },
  { plane: 'podoscopio_sotto',  label: 'Podoscopio (sotto)',
    pre:  { tipo: 'podoscopio_sotto_pre',   label: 'PRE',     ordine: 8 },
    post: { tipo: 'podoscopio_sotto_post',  label: 'POST 3R', ordine: 9 } },
  { plane: 'podoscopio_dietro', label: 'Podoscopio (dietro)',
    pre:  { tipo: 'podoscopio_dietro_pre',  label: 'PRE',     ordine: 10 },
    post: { tipo: 'podoscopio_dietro_post', label: 'POST 3R', ordine: 11 } },
]

// Flat slot list derived from planes (same shape as visita.html S3_SLOTS)
const POSTURAL_PHOTO_SLOTS_FLAT = POSTURAL_PHOTO_PLANES.flatMap(p => [
  { key: p.pre.tipo,  label: p.label + ' (PRE)',     tipo: p.pre.tipo,  ordine: p.pre.ordine  },
  { key: p.post.tipo, label: p.label + ' (POST 3R)', tipo: p.post.tipo, ordine: p.post.ordine },
])

// Section groupings (used by both files' builders)
const POSTURAL_PHOTO_SECTIONS = [
  { sectionKey: 'sagittale',         sectionLabel: 'Piano Sagittale',
    hasScapolare: true,  noteField: 'note_sagittale',         obsPiano: 'sagittale',
    planes: ['sagittale_sx', 'sagittale_dx'],
    pairs: [
      { pairKey: 'sagittale_sx', pairLabel: 'Sagittale SX', preKey: 'sagittale_sx_pre',  postKey: 'sagittale_sx_post'  },
      { pairKey: 'sagittale_dx', pairLabel: 'Sagittale DX', preKey: 'sagittale_dx_pre',  postKey: 'sagittale_dx_post'  },
    ]},
  { sectionKey: 'frontale',          sectionLabel: 'Piano Frontale',
    hasScapolare: false, noteField: 'note_frontale',          obsPiano: 'frontale',
    planes: ['frontale'],
    pairs: [{ pairKey: 'frontale',          pairLabel: 'Frontale',         preKey: 'frontale_pre',         postKey: 'frontale_post'         }]},
  { sectionKey: 'posteriore',        sectionLabel: 'Piano Posteriore',
    hasScapolare: false, noteField: 'note_posteriore',        obsPiano: 'posteriore',
    planes: ['posteriore'],
    pairs: [{ pairKey: 'posteriore',        pairLabel: 'Posteriore',       preKey: 'posteriore_pre',       postKey: 'posteriore_post'       }]},
  { sectionKey: 'podoscopio_sotto',  sectionLabel: 'Podoscopio — Vista Plantare',
    hasScapolare: false, noteField: 'note_podoscopio_sotto',  obsPiano: 'podoscopio_sotto',
    planes: ['podoscopio_sotto'],
    pairs: [{ pairKey: 'podoscopio_sotto',  pairLabel: 'Vista plantare',   preKey: 'podoscopio_sotto_pre', postKey: 'podoscopio_sotto_post'  }]},
  { sectionKey: 'podoscopio_dietro', sectionLabel: 'Podoscopio — Vista Posteriore',
    hasScapolare: false, noteField: 'note_podoscopio_dietro', obsPiano: 'podoscopio_dietro',
    planes: ['podoscopio_dietro'],
    pairs: [{ pairKey: 'podoscopio_dietro', pairLabel: 'Vista posteriore', preKey: 'podoscopio_dietro_pre',postKey: 'podoscopio_dietro_post' }]},
]
