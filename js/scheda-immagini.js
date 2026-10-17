/* scheda-paziente-v4 · v5 · v6 · v7 · scheda-paziente-v8 — LE IMMAGINI E LA VOCE DEGLI ESERCIZI nella scheda del paziente.
 *
 * Un elenco solo, in un file solo: per dare immagini e voce a un altro esercizio
 * si mettono i file in img/esercizi/ e si aggiunge UNA voce qui. La pagina non
 * si tocca.
 *
 *   img    → la foto piccola (elenco e «Adesso tocca a»). JPG verticale, 240–480 px di larghezza.
 *   scheda → l'infografica dell'esercizio, quella che si vede MENTRE lo si fa, sopra
 *            al timer (si tocca per ingrandirla). JPG verticale, 900 px di larghezza.
 *            Quando un'immagine si CORREGGE si usa un nome file nuovo (-2, -3…): col nome
 *            uguale un telefono può continuare a mostrare la copia vecchia.
 *   voce   → il testo che il telefono legge con «🔊 Spiegami l'esercizio a voce».
 *            ⚖️ Trascritto parola per parola dalle infografiche di Giuliano (17/10), solo
 *            messo in frasi da ascoltare. DA RILEGGERE. Senza «voce» il telefono legge la
 *            descrizione della libreria, o almeno il nome e quanto dura.
 *
 * Come si riconosce l'esercizio (basta una delle tre):
 *   slug   → la colonna slug della libreria esercizi (es. '0-3r')
 *   id     → il codice dei Cuscini Elicoidali (es. '1E-NLP')
 *   nome   → il nome, senza maiuscole/minuscole: «schema 1» trova «Schema 1» ma NON «Schema 10»
 */
window.SCHEDA_IMMAGINI = [
  { slug: '0-3r', nome: '3 respiri',
    img: 'img/esercizi/tre-respiri.jpg', scheda: 'img/esercizi/tre-respiri-scheda.jpg',
    alt: "Tecnica dei 3 Respiri: in piedi sui due Cuscini Elicoidali",
    voce: "Tecnica dei 3 Respiri. Centra, senti, attiva. È la base di ogni esercizio NPSP: prepara il corpo, attiva la percezione e stabilizza la postura. Uno: inspira dal naso. Inspira lentamente dal naso, lascia espandere l'addome e le costole lateralmente. Due: trattieni, 3 secondi. Trattieni il respiro, mantieni l'addome attivo e i glutei leggermente contratti. Tre: espira con attivazione. Espira lentamente con addominali e glutei attivi, mantenendo lo sguardo all'orizzonte. Errori da evitare: piedi non centrati sui cuscini; ginocchia piegate o in tensione; sguardo rivolto in basso." },
  { nome: 'schema 1',
    img: 'img/esercizi/schema-1.jpg', scheda: 'img/esercizi/schema-1-scheda.jpg',
    alt: "Schema 1: sequenza nelle 3 posizioni sui Cuscini Elicoidali",
    voce: "Schema 1. Sequenza nelle 3 posizioni. Una sequenza semplice ed efficace per attivare il corpo, stimolare la propriocezione e migliorare la stabilità. Uno: sali sui cuscini con i piedi larghi. Due: scendi all'indietro dai cuscini. Tre: sali sui cuscini con i piedi stretti. Quattro: scendi all'indietro dai cuscini. Cinque: sali sui cuscini posizionando i piedi sulla croce. Sguardo all'orizzonte. Percepisci la posizione del cuscino attraverso la sensibilità del piede. Mantieni ogni posizione per il tempo indicato, di norma almeno 1 minuto. Sequenza completa: largo, indietro, stretto, indietro, croce." },
  { nome: 'schema 2',
    img: 'img/esercizi/schema-2.jpg', scheda: 'img/esercizi/schema-2-scheda.jpg',
    alt: "Schema 2: sequenza sopra i cuscini, largo, stretto, croce",
    voce: "Schema 2. Sequenza sopra i cuscini. Una progressione continua di attivazione e percezione, senza scendere dai cuscini. Uno: parti largo. Inizia in posizione larga. Due: porta i piedi stretti. Alza bene le ginocchia e porta i piedi nella posizione stretta. Tre: vai sulla croce. Alza di nuovo i piedi e porta l'appoggio sulla croce. La sequenza si esegue senza mai scendere dai cuscini: largo, stretto, croce. Sguardo all'orizzonte. Percepisci la posizione del cuscino attraverso la sensibilità del piede. Alza bene le ginocchia durante ogni passaggio. Mantieni l'esercizio per il tempo indicato." },
  { nome: 'schema 3',
    img: 'img/esercizi/schema-3.jpg', scheda: 'img/esercizi/schema-3-scheda.jpg',
    alt: "Schema 3: passo avanti e indietro fra i due cuscini",
    voce: "Schema 3. Passo avanti e indietro. Percepisci, stabilizza, controlla. Uno: posizione di partenza. Parti con entrambi i piedi sul cuscino posteriore. Guarda l'orizzonte. Due: passo avanti, gamba destra. Porta una gamba avanti appoggiando il piede sul cuscino anteriore, percependo la posizione con la sensibilità del piede. Tre: passo avanti, gamba sinistra. Porta anche l'altra gamba sul cuscino anteriore, fino ad avere entrambi i piedi sullo stesso cuscino. Quattro: passo indietro, gamba destra. Riporta una gamba indietro appoggiando il piede sul cuscino posteriore, mantenendo il controllo e la corretta lunghezza del passo. Cinque: passo indietro, gamba sinistra. Riporta anche l'altra gamba sul cuscino posteriore, fino a tornare alla posizione di partenza. Sei: ripeti la sequenza. Punti chiave: sguardo sempre all'orizzonte; percepisci la posizione del cuscino con la sensibilità del piede; mantieni il controllo del movimento e la corretta lunghezza del passo; tronco stabile, addome attivo. Errori da evitare: guardare i cuscini; movimenti troppo rapidi; perdere l'equilibrio o oscillare il busto; appoggio impreciso del piede; passo troppo corto o troppo lungo." },
  { nome: 'schema 4',
    img: 'img/esercizi/schema-4.jpg', scheda: 'img/esercizi/schema-4-scheda.jpg',
    alt: "Schema 4: piedi convergenti e divergenti sui cuscini",
    voce: "Schema 4. Piedi convergenti e divergenti. Alterna la posizione dei piedi da convergenti a divergenti. Solleva bene le ginocchia durante il passaggio. Rispetta i limiti meccanici delle articolazioni. Se avverti dolore, rallenta il movimento e mantieni la posizione un po' più a lungo. Mantieni lo sguardo in avanti. Errori da evitare: non guardare verso il basso; non forzare oltre il limite articolare; non eseguire il movimento in modo frettoloso." },
  { nome: 'schema 5',
    img: 'img/esercizi/schema-5.jpg', scheda: 'img/esercizi/schema-5-scheda.jpg',
    alt: "Schema 5: circolazione, da largo a stretto",
    voce: "Schema 5. Circolazione. Alterna da largo a stretto in modo continuo. Parti a velocità naturale e aumenta progressivamente. Mantieni lo sguardo in avanti e non fermarti. Favorisce la circolazione di gambe e piedi. Errori da evitare: non guardare verso il basso; non bloccarti durante la sequenza; non accelerare oltre le tue possibilità." },
  { nome: 'schema 6',
    img: 'img/esercizi/schema-6.jpg', scheda: 'img/esercizi/schema-6-scheda.jpg',
    alt: "Schema 6: monopodalico, appoggio destro e sinistro sulla croce",
    voce: "Schema 6. Monopodalico. Piede in appoggio sulla croce. Solleva il ginocchio in avanti a 90 gradi. Guarda un punto fisso davanti a te. Mantieni l'equilibrio per il tempo prescritto. Alterna il lato secondo la somministrazione NPL o GPL. Errori da evitare: non chiudere gli occhi; non portare la gamba indietro; non spostare il piede fuori dal centro." },
  { nome: 'barchetta',
    img: 'img/esercizi/barchetta-2.jpg', scheda: 'img/esercizi/barchetta-2-scheda.jpg',
    alt: "Barchetta: inversione ed eversione con i piedi al centro sulla croce",
    voce: "Barchetta. Inversione ed eversione. Piedi al centro sulla croce. Alterna inversione ed eversione lentamente. Mantieni la posizione per qualche secondo. Mobilizza caviglia e mortaio tibio-tarsico. Guarda in avanti. Errori da evitare: non muovere il corpo in modo brusco; non guardare verso il basso; non uscire dalla posizione centrale." }
];
