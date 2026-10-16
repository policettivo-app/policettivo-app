/* scheda-paziente-v4 · scheda-paziente-v5 — LE IMMAGINI DEGLI ESERCIZI nella scheda del paziente.
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
    alt: 'Schema 1: sequenza nelle 3 posizioni sui Cuscini Elicoidali' }
];
