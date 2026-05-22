// Shared postural data — single source of truth
// Used by: valutazione-posturale.html, visita.html

const POSTURAL_OBSERVATIONS = {
  sagittale:        ['Allineamento sagittale neutro','Testa anteriorizzata','Testa retratta','Ipercifosi dorsale','Dorso piatto','Iperlordosi lombare','Ipolordosi lombare','Bacino in antiversione','Bacino in retroversione','Spalle anteposte','Spalle posteriorizzate','Ginocchia flesse','Ginocchia recurvate','Carico anteriore','Carico posteriore','Appoggio pronatorio','Appoggio supinatorio','Respirazione toracica','Respirazione diaframmatica','Assetto rigido','Assetto ipotonico'],
  frontale:         ['Allineamento frontale neutro','Testa inclinata dx','Testa inclinata sx','Spalla dx elevata','Spalla sx elevata','Scapole asimmetriche','Tronco inclinato dx','Tronco inclinato sx','Scoliosi funzionale','Bacino elevato dx','Bacino elevato sx','Bacino ruotato','Ginocchio valgo','Ginocchio varo','Piede pronato dx','Piede pronato sx','Piede supinato dx','Piede supinato sx','Carico prevalente dx','Carico prevalente sx'],
  posteriore:       ['Allineamento posteriore neutro','Testa inclinata dx','Testa inclinata sx','Spalla dx elevata','Spalla sx elevata','Scapola alata dx','Scapola alata sx','Scapole asimmetriche','Tronco deviato dx','Tronco deviato sx','Scoliosi evidente','Bacino elevato dx','Bacino elevato sx','Glutei asimmetrici','Ginocchio valgo dx','Ginocchio valgo sx','Ginocchio varo dx','Ginocchio varo sx','Tendine achilleo valgo dx','Tendine achilleo valgo sx','Tendine achilleo varo dx','Tendine achilleo varo sx','Appoggio calcaneare asimmetrico'],
  podoscopio_sotto: ['Allineamento podalico neutro','Arco mediale ridotto','Arco mediale aumentato','Piede piatto dx','Piede piatto sx','Piede cavo dx','Piede cavo sx','Ipercarico avampiede','Ipercarico retropiede','Carico mediale prevalente','Carico laterale prevalente','Alluce valgo dx','Alluce valgo sx','Dita a griffe','Appoggio asimmetrico','Impronta pronata dx','Impronta pronata sx','Impronta supinata dx','Impronta supinata sx','Scarso appoggio dita'],
  podoscopio_dietro:['Allineamento neutro arti inferiori','Calcagno valgo dx','Calcagno valgo sx','Calcagno varo dx','Calcagno varo sx','Tendine achilleo deviato dx','Tendine achilleo deviato sx','Retropiede pronato dx','Retropiede pronato sx','Retropiede supinato dx','Retropiede supinato sx','Asimmetria retropodalica','Carico prevalente dx','Carico prevalente sx','Rotazione tibiale interna','Rotazione tibiale esterna','Ginocchia valghe','Ginocchia vare','Appoggio instabile','Appoggio simmetrico'],
}

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
