/* video-guida-v1 — I VIDEO CHE SPIEGANO IL METODO.
 *
 * A COSA SERVE
 *   Oggi il paziente sa COSA fare (il programma) ma non PERCHE', e non
 *   come funzionano i cuscini. E' la domanda che gli si risponde a voce
 *   in studio e che a casa non ha risposta. Questi video sono quella
 *   risposta.
 *
 * ⚠️ NON SONO ESERCIZI ASSEGNATI. Spiegano il metodo. Il programma del
 *    paziente resta quello che il professionista gli ha messo nella home:
 *    per questo il pannello finisce con l'avviso qui sotto, che non si
 *    toglie. Un video che mostra un movimento non e' una prescrizione, e
 *    la differenza va scritta, non lasciata capire.
 *
 * UN ELENCO SOLO, IN UN FILE SOLO
 *   Stessa regola di js/osservazioni.js e js/terapie.js. Aggiungere un
 *   video vuol dire aggiungere una riga QUI: la pagina non si tocca.
 *
 * COME SI AGGIUNGE UN VIDEO
 *   L'id e' la parte finale del link di YouTube:
 *   https://youtu.be/4Rr9da0nrZQ  ->  id: '4Rr9da0nrZQ'
 */
window.VIDEO_GUIDA = {

  titolo:      'Video guida',
  sottotitolo: 'Come si usano i cuscini elicoidali, e come funziona il metodo',

  gruppi: [
    {
      nome: 'Comincia da qui',
      video: [
        {
          id: '4Rr9da0nrZQ',
          titolo: 'Uso generale dei Cuscini Elicoidali',
          nota: 'nella tecnica dei 3 respiri — schema 0-3R'
        }
      ]
    },
    {
      nome: 'Capire il metodo',
      video: [
        { id: '8q0NVGkqAng', titolo: 'Cos’è il Sistema Policettivo®' },
        { id: 'y5QjsQDtjMw', titolo: 'Introduzione' },
        { id: 't1FelAlItF0', titolo: 'Percepire le differenze tra i quadranti' }
      ]
    },
    {
      nome: 'Da ascoltare',
      video: [
        { id: 'XgejBDfoEsE', titolo: 'Podcast — il sunto', nota: 'solo audio, si può ascoltare camminando' }
      ]
    }
  ],

  /* ═══════════════════════════════════════════════════════════════════
     FUORI DA QUI, E PERCHE'
     ═══════════════════════════════════════════════════════════════════

     ⚖️ GLI «SCHEMA» NON VANNO IN QUESTA CARD.
     Sono esercizi, non spiegazioni. In una sezione aperta a tutti i
     pazienti, chiunque potrebbe eseguirli senza che nessuno glieli abbia
     dati - ed e' la riga che separa un'app di aderenza da una che sceglie
     l'intervento. Vanno assegnati al singolo paziente come video
     personalizzati sul suo protocollo, che l'app sa gia' fare. E' anche
     la regola di Giuliano: «devo far eseguire un esercizio preciso?
     mando direttamente lo Schema corrispondente» - lo manda LUI.

       4UF  SCHEMA 1 .................... mB7A5iJ68hI
       5UF  SCHEMA 2 .................... gUeRn0nIheA
       6UFx SCHEMA CIRCOLAZIONE ......... nRtbWXgxYos
       8UF  Schema Ginocchia coscia ..... A429Dfpz78g
       10UF Riorganizzazione postura .... wtH60FI6EWk

     👔 PER I PROFESSIONISTI, NON PER I PAZIENTI.
     Spiega come si inquadra una persona: e' formazione, non materiale
     per chi il programma lo riceve.

       INQUADRAMENTO POSTURALE .......... AjCXsu9uPyQ

     ⏸️ TOLTE DA GIULIANO IL 2 SETTEMBRE. Per rimetterle basta spostarle
     nell'elenco qui sopra: nessuna pagina si tocca.

       ELICOIDALI LEZIONE 1 ............. vmPyz39cvdo
       ELICOIDALI LEZIONE 2 ............. slkUWgSnOSg
       ELICOIDALI LEZIONE 3 ............. 88wFC5wSLp8

     🎧 GLI ALTRI PODCAST. Undici righe fanno di una card un archivio che
     nessuno apre: per ora c'e' solo il sunto. Se il sunto viene
     ascoltato, si valuta di aprire il resto.

       1 zdpUHoaxTcc   2 kGdX2EHJkpU   3 R-HYjZMulMQ   4 jQAB3qRsI_k
       5 ZPRMEJtx0ec   6 Tp8XBwVXNIk   7 UjjsPGjs_Ws   8 LNwYV6xFfFE
       9 X-F_ZJSN8h0  10 -b-0Dcn4LhY
     ═══════════════════════════════════════════════════════════════════ */

  /* ⚖️ Questa riga non si toglie e non si addolcisce. Un video che mostra
     un movimento, visto da chi ha un programma diverso, e' l'unico modo
     in cui questa sezione puo' fare danno. */
  avviso: 'Questi video spiegano il metodo. Il tuo programma è quello che trovi qui sopra: ' +
          'se in un video vedi un esercizio che nel tuo programma non c’è, chiedi al tuo ' +
          'fisioterapista prima di farlo.'
};
