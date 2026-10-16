/* scheda-paziente-v4 — LE IMMAGINI DEGLI ESERCIZI nella scheda del paziente.
 *
 * Un elenco solo, in un file solo: per dare un'immagine a un altro esercizio
 * si mette la foto in img/esercizi/ e si aggiunge UNA riga qui. La pagina non
 * si tocca. Formato consigliato: JPG verticale, 480 px di larghezza (~30 KB).
 *
 * Come si riconosce l'esercizio (basta una delle tre):
 *   slug   → la colonna slug della libreria esercizi (es. '0-3r')
 *   id     → il codice dei Cuscini Elicoidali (es. '1E-NLP')
 *   nome   → un pezzo del nome, senza maiuscole/minuscole (es. '3 respiri')
 */
window.SCHEDA_IMMAGINI = [
  { slug: '0-3r', nome: '3 respiri', img: 'img/esercizi/tre-respiri.jpg', alt: 'In piedi sui due Cuscini Elicoidali, di schiena' }
];
