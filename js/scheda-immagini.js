/* scheda-paziente-v4 · scheda-paziente-v5 · scheda-paziente-v6 · scheda-paziente-v7 — LE IMMAGINI DEGLI ESERCIZI nella scheda del paziente.
 *
 * Un elenco solo, in un file solo: per dare le immagini a un altro esercizio
 * si mettono i file in img/esercizi/ e si aggiunge UNA riga qui. La pagina non
 * si tocca.
 *
 *   img    → la foto piccola (elenco e «Adesso tocca a»). JPG verticale, 240–480 px di larghezza.
 *   scheda → l'infografica dell'esercizio, quella che si vede MENTRE lo si fa, sopra
 *            al timer (si tocca per ingrandirla). JPG verticale, 900 px di larghezza.
 *
 * Come si riconosce l'esercizio (basta una delle tre):
 *   slug   → la colonna slug della libreria esercizi (es. '0-3r')
 *   id     → il codice dei Cuscini Elicoidali (es. '1E-NLP')
 *   nome   → il nome, senza maiuscole/minuscole: «schema 1» trova «Schema 1» ma NON «Schema 10»
 */
window.SCHEDA_IMMAGINI = [
  { slug: '0-3r', nome: '3 respiri',
    img: 'img/esercizi/tre-respiri.jpg', scheda: 'img/esercizi/tre-respiri-scheda.jpg',
    alt: 'Tecnica dei 3 Respiri: in piedi sui due Cuscini Elicoidali' },
  { nome: 'schema 1',
    img: 'img/esercizi/schema-1.jpg', scheda: 'img/esercizi/schema-1-scheda.jpg',
    alt: 'Schema 1: sequenza nelle 3 posizioni sui Cuscini Elicoidali' },
  { nome: 'schema 2',
    img: 'img/esercizi/schema-2.jpg', scheda: 'img/esercizi/schema-2-scheda.jpg',
    alt: 'Schema 2: sequenza sopra i cuscini, largo, stretto, croce' },
  { nome: 'schema 3',
    img: 'img/esercizi/schema-3.jpg', scheda: 'img/esercizi/schema-3-scheda.jpg',
    alt: 'Schema 3: passo avanti e indietro fra i due cuscini' },
  { nome: 'schema 4',
    img: 'img/esercizi/schema-4.jpg', scheda: 'img/esercizi/schema-4-scheda.jpg',
    alt: 'Schema 4: piedi convergenti e divergenti sui cuscini' },
  { nome: 'schema 5',
    img: 'img/esercizi/schema-5.jpg', scheda: 'img/esercizi/schema-5-scheda.jpg',
    alt: 'Schema 5: circolazione, da largo a stretto' },
  { nome: 'schema 6',
    img: 'img/esercizi/schema-6.jpg', scheda: 'img/esercizi/schema-6-scheda.jpg',
    alt: 'Schema 6: monopodalico, appoggio destro e sinistro sulla croce' },
  { nome: 'barchetta',
    img: 'img/esercizi/barchetta-2.jpg', scheda: 'img/esercizi/barchetta-2-scheda.jpg',   // -2: corretta il 17/10 (nome nuovo = niente copia vecchia in memoria)
    alt: 'Barchetta: inversione ed eversione con i piedi al centro sulla croce' }
];
