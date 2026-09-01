/* ═══════════════════════════════════════════════════════════════════════
   js/controindicazioni-bozza.js — controindicazioni-v1 (1 settembre 2026)

   ⚠️ QUESTA E' UNA BOZZA DA RIVEDERE, NON UN ELENCO CLINICO IN USO.
   Non e' js/controindicazioni.js e non deve diventarlo da sola: e' il
   materiale che alimenta controindicazioni-revisione.html, la pagina su
   cui Giuliano corregge, toglie e aggiunge. Il file definitivo nascera'
   DOPO, dalle sue correzioni.

   Nessuna pagina dell'app carica questo file. Se un giorno qualcuno lo
   importa in un documento firmato, sta pubblicando un elenco che nessun
   professionista ha riletto: e' esattamente la cosa che il METODO vieta.

   OGNI VOCE PORTA LA SUA FONTE. Una voce senza fonte non entra qui: se
   una fonte non e' stata trovata, sta scritto (fonti: ['NESSUNA']) e la
   voce parte come «da verificare».
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict'
  if (window.polControindicazioniBozza) return

  /* ── LE FONTI ────────────────────────────────────────────────────────
     liv: 'alta'  = manuale d'uso del produttore (documento regolatorio),
                    linea guida, revisione sistematica
          'media' = fonte clinica di riferimento (Physiopedia, StatPearls)
          'bassa' = sito commerciale o divulgativo: si legge, non si cita */
  var FONTI = {
    BTL4000:   { lab:'BTL 4000', n:'BTL — BTL-4000 Smart/Premium, manuale d\'uso, sez. 3.1 «controindicazioni generali della fisioterapia»', a:'2008', liv:'alta',
                 u:'https://info.orthocanada.com/hubfs/Technical%20Support%20Guide%20-%20User%20Manuals/Ultrasound%20IFC/BTL-4000%20User%20Manual.pdf' },
    BTLTR:     { lab:'BTL tecar', n:'BTL — BTL-6000 TR-Therapy (tecar), manuale d\'uso, sez. 1.5 e 2.2', a:'2019', liv:'alta',
                 u:'https://info.orthocanada.com/hubfs/Technical%20Support%20Guide%20-%20User%20Manuals/Other%20Modalities/BTL-6000%20TR%20User%20Manual.pdf' },
    BTLHIL:    { lab:'BTL laser HP', n:'BTL — BTL-6000 High Intensity Laser 10/20/30 W, manuale d\'uso, sez. 1.6.1', a:'2021', liv:'alta',
                 u:'https://info.orthocanada.com/hubfs/Technical%20Support%20Guide%20-%20User%20Manuals/Other%20Modalities/BTL-HIL%20High%20Intensity%20Laser%20User%20Manual.pdf' },
    CHATT:     { lab:'Chattanooga', n:'Chattanooga / Encore Medical — Intelect Advanced Therapy System, manuale d\'uso', a:'2005', liv:'alta',
                 u:'https://www.physiosupplies.eu/media/PDF/User_Manual_Intelect_Advanced_EN.pdf' },
    ZIMMER:    { lab:'Zimmer Cryo', n:'Zimmer MedizinSystems — Cryo 6, istruzioni per l\'uso, doc. 10 101 710 v3', a:'2015', liv:'alta',
                 u:'https://aesthetic.zimmerusa.com/wp-content/uploads/2017/03/USA_10101710_Instructions_for_Use_Cryo6_0215_V3_mail.pdf' },
    POGP:      { lab:'POGP', n:'POGP (Pelvic, Obstetric & Gynaecological Physiotherapy) — «Safety and best practice in neuromuscular electrical stimulation», Journal of POGP 124:53-58', a:'2019', liv:'alta',
                 u:'https://thepogp.co.uk/_userfiles/pages/files/journals/124/gps89122ms.pdf' },
    BADGER:    { lab:'Badger rev.', n:'Badger J, Taylor P, Swain I — «The safety of electrical stimulation in patients with pacemakers and ICDs: a systematic review», J Rehabil Assist Technol Eng', a:'2017', liv:'alta',
                 u:'https://journals.sagepub.com/doi/10.1177/2055668317745498' },
    ARAIN:     { lab:'Arain Europace', n:'Arain SS et al. — «Risk of electromagnetic interference from TENS on the sensing function of ICDs», EP Europace 25(7)', a:'2023', liv:'alta',
                 u:'https://academic.oup.com/europace/article/25/7/euad206/7230167' },
    PHYSIOEL:  { lab:'Physiopedia', n:'Physiopedia — «Electrotherapy Contraindications»', a:'', liv:'media',
                 u:'https://www.physio-pedia.com/Electrotherapy_Contraindications' },
    PHYSIOLLLT:{ lab:'Physiopedia LLLT', n:'Physiopedia — «Low Level Laser Therapy» (elenco attribuito a NAALT, conferenza 2010)', a:'2010', liv:'media',
                 u:'https://www.physio-pedia.com/Low_Level_Laser_Therapy' },
    PPM:       { lab:'Pract.Pain Mgmt', n:'Practical Pain Management — «Contraindications for Use of Therapeutic Laser», vol. 10 n. 7', a:'2010', liv:'media',
                 u:'https://www.medcentral.com/pain/chronic/contraindications-use-therapeutic-laser' },
    STATUS:    { lab:'StatPearls US', n:'StatPearls — Matthews MJ, Stretanski MF, «Ultrasound Therapy»', a:'2023', liv:'media',
                 u:'https://www.ncbi.nlm.nih.gov/books/NBK547717/' },
    STATTENS:  { lab:'StatPearls TENS', n:'StatPearls — Teoli D, Dua A, An J, «Transcutaneous Electrical Nerve Stimulation»', a:'2024', liv:'media',
                 u:'https://www.ncbi.nlm.nih.gov/books/NBK537188/' },
    WATSON:    { lab:'Watson', n:'Tim Watson — electrotherapy.org, FAQs', a:'', liv:'media',
                 u:'https://www.electrotherapy.org/faqs' },
    JOCR:      { lab:'J Orthop Case Rep', n:'Jagadevan M et al. — «Cold Urticaria Following Cryotherapy», J Orthop Case Rep 11(10):41-44', a:'2021', liv:'media',
                 u:'https://pmc.ncbi.nlm.nih.gov/articles/PMC8930304/' },
    HAMBLIN:   { lab:'Hamblin', n:'Hamblin MR, Nelson ST, Strahan JR — «Photobiomodulation and Cancer: What Is the Truth?», Photomed Laser Surg', a:'2018', liv:'media',
                 u:'https://pmc.ncbi.nlm.nih.gov/articles/PMC5946726/' },
    SVEMG:     { lab:'S.Ve.M.G.', n:'S.Ve.M.G. — «Le controindicazioni alle terapie fisiche» (senza autore, senza anno, senza bibliografia)', a:'', liv:'bassa',
                 u:'https://svemg.it/le-controindicazioni-alle-terapie-fisiche/' },
    ITECHUS:   { lab:'I-Tech US', n:'I-Tech Medical Division — «Contraindications of ultrasound therapy» (produttore)', a:'2025', liv:'bassa',
                 u:'https://itechmedicaldivision.com/en/ultrasonotherapy-contraindications/' },
    ITECHPEMF: { lab:'I-Tech PEMF', n:'I-Tech Medical Division — «Contraindications of PEMF therapy» (produttore)', a:'2022', liv:'bassa',
                 u:'https://itechmedicaldivision.com/en/contraindications-pemf-therapy/' },
    FISIORAPIDO:{lab:'Fisiorapido', n:'Fisiorapido — «Magnetoterapia: controindicazioni ed effetti collaterali» (noleggiatore)', a:'', liv:'bassa',
                 u:'https://www.fisiorapido.com/approfondimenti-magnetoterapia/magnetoterapia-controindicazioni/' },
    IGEA:      { lab:'Igea', n:'Igea La Sanitaria — «Le controindicazioni della magnetoterapia» (rivenditore)', a:'', liv:'bassa',
                 u:'https://www.igealasanitaria.it/en/pagine/controindicazioni-magnetoterapia' },
    FSM:       { lab:'FSM', n:'Frequency Specific Microcurrent — «FSM Contraindications and Precautions» (formatore/venditore)', a:'2024', liv:'bassa',
                 u:'https://frequencyspecific.com/frequency-specific-microcurrent-contraindications-and-precautions/' },
    SAEBO:     { lab:'Saebo', n:'Saebo UK — Bean A, «Electrical Stimulation Contraindications: Facts and Myth Busting»', a:'2023', liv:'bassa',
                 u:'https://uk.saebo.com/electrical-stimulation-contraindications-facts-and-myth-bustin/' },
    ECEC:      { lab:'clinica USA', n:'East Coast Elite Care — pagina di servizio EMTT/Storz Magnetolith (clinica utilizzatrice)', a:'', liv:'bassa',
                 u:'https://eastcoastelitecare.com/services/emtt-therapy/' },
    FDA:       { lab:'FDA 510(k)', n:'FDA 510(k) K203710 — Storz Medical AG, MAGNETOLITH (verificato: NON elenca controindicazioni)', a:'2021', liv:'alta',
                 u:'https://www.accessdata.fda.gov/cdrh_docs/pdf20/K203710.pdf' },
    SIMFER:    { lab:'LG SIMFER', n:'SIMFER/ISS — LG «Terapie fisiche strumentali nel dolore muscoloscheletrico», SNLG C0050 (verificato: NON contiene elenchi di controindicazioni)', a:'2026', liv:'alta',
                 u:'https://www.iss.it/documents/20126/10776488/LG_C0050_SIMFER_Terapie+fisiche+strumentali.pdf' },
    NESSUNA:   { n:'NESSUNA FONTE TROVATA — voce da confermare o cancellare', a:'', liv:'assente', u:'' }
  }

  /* ── LE VOCI ─────────────────────────────────────────────────────────
     id : stabile, e' quello che torna nell'esportazione
     t  : il testo della controindicazione
     g  : 'A' assoluta · 'R' relativa
     f  : chiavi di FONTI
     n  : nota (eccezione, precisazione, avvertenza operativa) */

  var TRASVERSALI = [
    { id:'tr1',  g:'A', t:'Gravidanza', f:['BTL4000','SVEMG'], n:'BTL registra un\'eccezione: l\'elettroterapia fuori dal distretto addomino-pelvico.' },
    { id:'tr2',  g:'A', t:'Neoplasia nota o sospetta nell\'area da trattare, o radioterapia in corso', f:['BTL4000','PHYSIOEL'] },
    { id:'tr3',  g:'A', t:'Dispositivi elettronici impiantati attivi: pacemaker, defibrillatore, pompa da insulina, impianto cocleare, neurostimolatore', f:['BTL4000','PHYSIOEL'] },
    { id:'tr4',  g:'A', t:'Stato febbrile di qualsiasi origine', f:['BTL4000','SVEMG'] },
    { id:'tr5',  g:'A', t:'Infezione acuta locale o sistemica; tessuti infetti da tubercolosi o altri batteri virulenti', f:['BTL4000'] },
    { id:'tr6',  g:'A', t:'Trombosi venosa profonda', f:['PHYSIOEL'], n:'Physiopedia la mette fra le assolute: rischio di mobilizzare l\'embolo.' },
    { id:'tr7',  g:'A', t:'Disturbi della coagulazione, emorragia in atto, terapia anticoagulante', f:['BTL4000','PHYSIOEL'] },
    { id:'tr8',  g:'A', t:'Cute lesa, dermatite, alterazioni trofiche nell\'area di applicazione', f:['BTL4000'], n:'BTL esclude esplicitamente la laserterapia da questo divieto.' },
    { id:'tr9',  g:'A', t:'Alterata sensibilità (ipoestesia o anestesia) nell\'area di applicazione', f:['BTL4000','PHYSIOEL'], n:'Toglie al paziente il modo di dire che sta bruciando: è il segnale d\'allarme, non un dettaglio.' },
    { id:'tr10', g:'R', t:'Deficit cognitivo che impedisce di riferire il dolore, o consenso non valido', f:['PHYSIOEL','POGP'] },
    { id:'tr11', g:'R', t:'Applicazione su tiroide, altre ghiandole endocrine, gonadi, grandi plessi simpatici', f:['BTL4000'] },
    { id:'tr12', g:'R', t:'Insufficienza cardiaca o respiratoria grave', f:['BTL4000'] },
    { id:'tr13', g:'R', t:'Cachessia di qualsiasi origine', f:['BTL4000'], n:'BTL eccettua la TENS nel malato oncologico in fase terminale.' },
    { id:'tr14', g:'R', t:'Mestruazione', f:['BTL4000'] }
  ]

  var APPARECCHI = [
    /* ─────────────────────────────────────────────────────── 1. TECAR */
    { k:'tecar', nome:'Tecar Terapia (Resistiva/Capacitiva)', famiglia:'diatermia', num:1,
      voci:[
        { id:'tec1', g:'A', t:'Oggetti metallici o dispositivi impiantati attivi nella sede e sul percorso della corrente (pacemaker, endoprotesi, placche, viti, piercing)', f:['BTLTR','WATSON'], dubbio:'D1' },
        { id:'tec2', g:'A', t:'Paziente anestetizzato o con soglia del dolore innalzata', f:['BTLTR'], n:'Il manuale lo scrive fra le avvertenze: la tecar può provocare ustioni locali, e il dolore è l\'unico allarme.' },
        { id:'tec3', g:'A', t:'Neoplasia nota o sospetta nell\'area; paziente in radioterapia', f:['BTLTR'] },
        { id:'tec4', g:'R', t:'Infiammazione acuta in atto', f:['BTLTR'] },
        { id:'tec5', g:'R', t:'Nervi periferici superficiali, immediatamente sotto la cute', f:['BTLTR'] },
        { id:'tec6', g:'R', t:'Diabete non controllato', f:['NESSUNA'], n:'Era nella bozza del PIANO. Nel manuale BTL della tecar non compare: o si trova una fonte, o si toglie.' }
      ],
      lacune:[] },

    /* ────────────────────────────────────────────────── 2. LASER 904 */
    { k:'laser904', nome:'Laser Terapia 904 nm', famiglia:'laser', num:2,
      voci:[
        { id:'la1', g:'A', t:'Non dirigere mai il fascio verso gli occhi. Occhiali protettivi per il paziente e per chiunque sia presente', f:['PHYSIOLLLT'] },
        { id:'la2', g:'A', t:'Non trattare sopra un carcinoma primitivo o una metastasi noti', f:['PHYSIOLLLT'], n:'Eccezione della fonte: la LLLT è ammessa in chemioterapia per ridurre la mucosite.', dubbio:'D2' },
        { id:'la3', g:'A', t:'Non trattare direttamente sopra l\'utero gravido', f:['PHYSIOLLLT'] },
        { id:'la4', g:'R', t:'Epilessia fotosensibile: la luce pulsata visibile sotto i 30 Hz può scatenare una crisi', f:['PHYSIOLLLT','PPM'] },
        { id:'la5', g:'R', t:'Farmaci fotosensibilizzanti e fotosensibilità nota', f:['BTLHIL'], n:'La fonte è il manuale di un laser ad ALTA potenza: da confermare per il 904 nm.' },
        { id:'la6', g:'R', t:'Tiroide e altre ghiandole endocrine', f:['PPM'] },
        { id:'la7', g:'R', t:'Cartilagini di accrescimento nel bambino', f:['PPM'], n:'La fonte precisa che gli studi non hanno mostrato differenze osservabili.' },
        { id:'la8', g:'R', t:'Pacemaker', f:['BTLHIL','PPM'], dubbio:'D3' }
      ],
      lacune:['Nessun manuale d\'uso di un laser 904 nm / GaAs è risultato accessibile: le voci qui sopra vengono da fonti su laser in generale o ad alta potenza.'] },

    /* ─────────────────────────────────────── 3. LASER ALTA + CRIO */
    { k:'laser_alta', nome:'Laser alta tecnologia — Chronic Five Crio Plus', famiglia:'laser_crio', num:3,
      voci:[
        { id:'lc1',  g:'A', t:'Neoplasia nota, sospetta, o anamnesi oncologica di qualsiasi tipo', f:['BTLHIL'], n:'Il manuale ad alta potenza è più restrittivo del laser di bassa potenza: comprende anche il pregresso.', dubbio:'D2' },
        { id:'lc2',  g:'A', t:'Entro 4-6 mesi da una radioterapia', f:['BTLHIL'] },
        { id:'lc3',  g:'A', t:'Gravidanza in corso', f:['BTLHIL'] },
        { id:'lc4',  g:'A', t:'Area periorbitaria e area genitale', f:['BTLHIL'] },
        { id:'lc5',  g:'A', t:'Perdita di sensibilità nell\'area da trattare', f:['BTLHIL'], n:'Con l\'alta potenza il dolore è il segnale che precede l\'ustione.' },
        { id:'lc6',  g:'A', t:'Emorragia nell\'area; terapia anticoagulante o disturbi emorragici', f:['BTLHIL'] },
        { id:'lc7',  g:'A', t:'Epilessia', f:['BTLHIL'] },
        { id:'lc8',  g:'R', t:'Fotosensibilità e farmaci che aumentano la sensibilità alla luce', f:['BTLHIL'] },
        { id:'lc9',  g:'R', t:'Tatuaggi e aree molto pigmentate nella zona da trattare', f:['BTLHIL'] },
        { id:'lc10', g:'R', t:'Corticosteroidi o infiltrazioni nell\'area negli ultimi 3 mesi; uso protratto di corticosteroidi', f:['BTLHIL'] },
        { id:'lc11', g:'R', t:'Diabete non controllato, LES e altre malattie sistemiche importanti', f:['BTLHIL'] },
        { id:'lc12', g:'R', t:'Applicazione su tiroide e ghiandole endocrine', f:['BTLHIL'] },
        { id:'lc13', g:'R', t:'Pacemaker', f:['BTLHIL'], dubbio:'D3' },
        { id:'lc14', g:'A', t:'CRIO — Ipersensibilità al freddo, crioglobulinemia, malattia da agglutinine fredde, orticaria da freddo', f:['ZIMMER','JOCR'] },
        { id:'lc15', g:'A', t:'CRIO — Malattia di Raynaud', f:['ZIMMER','JOCR'] },
        { id:'lc16', g:'A', t:'CRIO — Aree con sensibilità alterata o con circolazione compromessa', f:['ZIMMER'] },
        { id:'lc17', g:'A', t:'CRIO — Ferite aperte; congelamenti pregressi; non usare durante o dopo un\'iniezione', f:['ZIMMER'] },
        { id:'lc18', g:'R', t:'CRIO — Proteggere gli occhi durante le applicazioni al volto; non tenere l\'ugello a meno di 10 cm (rischio di congelamento cutaneo)', f:['ZIMMER'] },
        { id:'lc19', g:'R', t:'OPERATIVO — Tenere l\'applicatore sempre in movimento: mai un\'applicazione statica, né col laser né col freddo', f:['BTLHIL','ZIMMER'] },
        { id:'lc20', g:'R', t:'OPERATIVO — Con laser e raffreddamento insieme, Zimmer indica 5 cm di distanza per 10 cm² di superficie trattata', f:['ZIMMER'] }
      ],
      lacune:['⚠️ Nessuna fonte tratta HILT + crioterapia come protocollo unico. E resta un punto aperto vero: il freddo attenua il dolore, che nell\'alta potenza è il principale segnale d\'allarme dell\'ustione — e Zimmer mette le «aree con sensibilità alterata» fra le controindicazioni al freddo stesso. Vedi la decisione D11.'] },

    /* ──────────────────────────────────────────── 4. ULTRASUONI */
    { k:'ultrasuoni', nome:'Ultrasuoni Terapia', famiglia:'ultrasuoni', num:4,
      voci:[
        { id:'us1',  g:'A', t:'Occhi, encefalo, torace e cuore, midollo spinale', f:['BTL4000','STATUS'] },
        { id:'us2',  g:'A', t:'Organi parenchimatosi: fegato, milza, polmoni; ghiandole endocrine e gonadi', f:['BTL4000'] },
        { id:'us3',  g:'A', t:'Utero gravido', f:['CHATT'] },
        { id:'us4',  g:'A', t:'Cartilagini di accrescimento e centri di ossificazione, finché la crescita non è completa', f:['BTL4000','CHATT'] },
        { id:'us5',  g:'A', t:'Frattura in consolidamento', f:['BTL4000','CHATT','STATUS'] },
        { id:'us6',  g:'A', t:'Lesione neoplastica presente nell\'area di trattamento', f:['CHATT','STATUS'] },
        { id:'us7',  g:'A', t:'Infezione attiva nell\'area; tessuti ischemici', f:['STATUS'] },
        { id:'us8',  g:'R', t:'Prominenze ossee superficiali: processi spinosi, malleoli, epicondili', f:['BTL4000'] },
        { id:'us9',  g:'R', t:'Nervi periferici superficiali', f:['BTL4000'] },
        { id:'us10', g:'R', t:'Esiti di laminectomia', f:['BTL4000','CHATT','PHYSIOEL'] },
        { id:'us11', g:'R', t:'Allergia al gel di accoppiamento', f:['BTL4000'] },
        { id:'us12', g:'R', t:'Aree anestetiche; diatesi emorragica', f:['CHATT'] },
        { id:'us13', g:'A', t:'Mezzi di sintesi, protesi (in particolare cementate) nell\'area', f:['BTL4000','PHYSIOEL','WATSON'], dubbio:'D4' },
        { id:'us14', g:'A', t:'Pacemaker', f:['CHATT','ITECHUS'], dubbio:'D5' }
      ],
      lacune:[] },

    /* ──────────────────────────── 5. ULTRASUONI + MICROCORRENTI */
    { k:'us_micro', nome:'Ultrasuoni con Microcorrenti Antalgiche', famiglia:'ultrasuoni_corrente', num:5,
      voci:[
        { id:'um0',  g:'A', t:'REGOLA — Si applicano tutte le controindicazioni degli ultrasuoni PIÙ tutte quelle dell\'elettroterapia. Si sommano, non si incrociano', f:['BTL4000','CHATT'], n:'Verificato: né BTL né Chattanooga prevedono un elenco ridotto per la terapia combinata.' },
        { id:'um1',  g:'A', t:'Applicazione su torace, cuore, occhi', f:['BTL4000'] },
        { id:'um2',  g:'A', t:'Regione del seno carotideo', f:['CHATT'] },
        { id:'um3',  g:'A', t:'Elettroanalgesia senza una diagnosi eziologica del dolore', f:['BTL4000','CHATT'], n:'Togliere il dolore senza sapere da dove viene: è una controindicazione clinica, non tecnica.' },
        { id:'um4',  g:'A', t:'Alterata sensibilità nella sede degli elettrodi', f:['BTL4000'] },
        { id:'um5',  g:'A', t:'Gravidanza', f:['FSM'] },
        { id:'um6',  g:'A', t:'Non trattare aree di infezione attiva né lesioni neoplastiche', f:['FSM'] },
        { id:'um7',  g:'R', t:'Pacemaker: cautela; se il paziente è totalmente pacemaker-dipendente, non trattare', f:['FSM'], dubbio:'D6' },
        { id:'um8',  g:'R', t:'Allergia alle soluzioni protettive delle spugnette o al materiale degli elettrodi', f:['BTL4000'] },
        { id:'um9',  g:'R', t:'Malattie cardiovascolari; infiammazione di vasi sanguigni e linfatici', f:['BTL4000'] },
        { id:'um10', g:'R', t:'Sclerosi multipla; sindromi psicopatologiche', f:['BTL4000'], n:'Voce del manuale 2008, riportata com\'è: da valutare se ha ancora senso.' }
      ],
      lacune:['Nessuna fonte tratta ultrasuoni + microcorrenti come protocollo unico. Le voci sulle microcorrenti vengono da un formatore/venditore (FSM), non da una società scientifica.'] },

    /* ──────────────────────────────────────────────── 6. EMTT */
    { k:'emtt', nome:'EMTT — magnetoterapia induttiva pulsata', famiglia:'campo_magnetico', num:6,
      voci:[
        { id:'em1', g:'A', t:'Impianti elettronici attivi: pacemaker, defibrillatore, pompa da insulina, impianto cocleare', f:['ECEC'] },
        { id:'em2', g:'A', t:'Gravidanza', f:['ECEC'] },
        { id:'em3', g:'A', t:'Neoplasia attiva nella regione da trattare', f:['ECEC'] },
        { id:'em4', g:'A', t:'Epilessia', f:['ECEC'] },
        { id:'em5', g:'R', t:'Impianti metallici passivi (protesi articolari): spesso accettabili', f:['ECEC'] }
      ],
      lacune:['🔴 QUESTA È LA MACCHINA MESSA PEGGIO. Storz Medical NON pubblica le controindicazioni del MAGNETOLITH: verificati la pagina prodotto, il flyer ufficiale, il whitepaper e il 510(k) FDA K203710 — nessuno dei quattro le contiene. Le cinque voci qui sopra vengono da una clinica utilizzatrice americana, non dal produttore.',
              '➡️ DA FARE: chiedere l\'IFU/eIFU ufficiale a Storz Medical o al distributore italiano. Finché non arriva, sull\'EMTT gli avvisi restano dichiaratamente incompleti.'] },

    /* ───────────────────────── 7. MAGNETOTERAPIA CLASSICA CEMP */
    { k:'magneto', nome:'Magnetoterapia classica (CEMP a solenoidi)', famiglia:'campo_magnetico', num:7, nuova:true,
      voci:[
        { id:'mg1', g:'A', t:'Pacemaker, defibrillatore e altri dispositivi elettronici impiantati', f:['FISIORAPIDO','IGEA','ITECHPEMF'], n:'I-Tech precisa che i pacemaker di ultima generazione possono non essere interessati.' },
        { id:'mg2', g:'A', t:'Gravidanza accertata o presunta', f:['FISIORAPIDO','IGEA','ITECHPEMF'], n:'Igea segnala i primi due mesi come i più delicati. Nessuno studio clinico su gravide.' },
        { id:'mg3', g:'A', t:'Patologia tumorale accertata o sospetta', f:['FISIORAPIDO','IGEA','ITECHPEMF'] },
        { id:'mg4', g:'A', t:'Infezioni e stati febbrili acuti; virosi in fase acuta; tubercolosi', f:['FISIORAPIDO','ITECHPEMF'] },
        { id:'mg5', g:'A', t:'Emorragia in atto', f:['IGEA'] },
        { id:'mg6', g:'A', t:'Epilessia, anche se in trattamento farmacologico', f:['IGEA','ITECHPEMF'] },
        { id:'mg7', g:'R', t:'Bambini e adolescenti in fase di crescita (stimolazione della calcificazione ossea)', f:['FISIORAPIDO','ITECHPEMF'] },
        { id:'mg8', g:'R', t:'Protesi e mezzi di sintesi magnetizzabili (ferromagnetici)', f:['ITECHPEMF','IGEA','FISIORAPIDO'], dubbio:'D8' },
        { id:'mg9', g:'R', t:'Cardiopatie, aritmie severe, ipertiroidismo, diabete giovanile, micosi', f:['ITECHPEMF','FISIORAPIDO'] }
      ],
      lacune:['⚠️ Nessuna fonte italiana indipendente. Tutte le fonti trovate sulla magnetoterapia CEMP sono commerciali: produttori, noleggiatori, rivenditori. Se hai il manuale del TUO apparecchio, quello vale più di tutte e tre.'] },

    /* ───────────────────────────────────────────────── 8. TENS */
    { k:'tens', nome:'TENS Antalgica', famiglia:'elettro', num:8,
      voci:[
        { id:'te1',  g:'A', t:'Regione del seno carotideo', f:['CHATT','PHYSIOEL'] },
        { id:'te2',  g:'A', t:'Collo anteriore e bocca (rischio di spasmo grave)', f:['CHATT'] },
        { id:'te3',  g:'A', t:'Applicazione transtoracica (rischio di aritmia)', f:['CHATT'] },
        { id:'te4',  g:'A', t:'Sopra o vicino a una lesione neoplastica', f:['CHATT','PHYSIOEL'], n:'BTL registra un\'eccezione: la TENS antalgica nel malato oncologico in fase terminale.' },
        { id:'te5',  g:'A', t:'Area gonfia, infetta, infiammata, o con eruzioni cutanee', f:['CHATT'] },
        { id:'te6',  g:'A', t:'Dolore di cui non è stata stabilita l\'eziologia', f:['CHATT'] },
        { id:'te7',  g:'A', t:'Sopra sistemi transdermici di rilascio del farmaco (cerotti medicati)', f:['STATTENS'] },
        { id:'te8',  g:'A', t:'Pacemaker o defibrillatore impiantato', f:['CHATT','PHYSIOEL','STATTENS','ARAIN','BADGER'], dubbio:'D6' },
        { id:'te9',  g:'A', t:'Utero gravido e regione lombo-pelvica, soprattutto nel primo trimestre', f:['PHYSIOEL','WATSON','CHATT'], dubbio:'D7' },
        { id:'te10', g:'A', t:'Epilessia, per le applicazioni cervicali o craniali', f:['PHYSIOEL','STATTENS'], n:'Chattanooga la tratta come precauzione, non come divieto.' },
        { id:'te11', g:'R', t:'Alterata sensibilità sotto gli elettrodi', f:['PHYSIOEL'] },
        { id:'te12', g:'R', t:'Arteriopatia periferica; radioterapia negli ultimi 6 mesi', f:['PHYSIOEL'] },
        { id:'te13', g:'R', t:'Cardiopatia sospetta o diagnosticata', f:['CHATT'] },
        { id:'te14', g:'R', t:'Neuropatie avanzate', f:['NESSUNA'], n:'Era nella bozza del PIANO. Nessuna delle fonti consultate la elenca come voce a sé: o si trova, o si fonde con «alterata sensibilità».' }
      ],
      lacune:[] },

    /* ────────────────────────────────────────────────── 9. EMS */
    { k:'ems', nome:'EMS ad impulsi variabili', famiglia:'elettro', num:9,
      voci:[
        { id:'es1',  g:'A', t:'Consenso non valido, o paziente che non è in grado di usare il dispositivo', f:['POGP'] },
        { id:'es2',  g:'A', t:'Assenza di sensibilità nell\'area', f:['POGP'] },
        { id:'es3',  g:'A', t:'Pacemaker cardiaco impiantato', f:['POGP','CHATT','BADGER','SAEBO'], dubbio:'D9' },
        { id:'es4',  g:'A', t:'Gravidanza, o ricerca attiva di una gravidanza', f:['POGP','SAEBO'], n:'È l\'unica voce su cui tutte le fonti consultate vanno d\'accordo.' },
        { id:'es5',  g:'A', t:'Trauma o ematoma recente nell\'area', f:['POGP'] },
        { id:'es6',  g:'A', t:'Meno di 12 settimane da un intervento chirurgico o dal parto', f:['POGP'] },
        { id:'es7',  g:'A', t:'Tessuti irradiati negli ultimi 6 mesi', f:['POGP','PHYSIOEL'] },
        { id:'es8',  g:'A', t:'Cute lesa dove va posizionato l\'elettrodo', f:['POGP'] },
        { id:'es9',  g:'A', t:'Reazione allergica al materiale degli elettrodi o al gel', f:['POGP'] },
        { id:'es10', g:'A', t:'Neoplasia attiva o pregressa nell\'area', f:['POGP','CHATT','PHYSIOEL','SAEBO'], dubbio:'D10' },
        { id:'es11', g:'A', t:'Fratture instabili; osteomielite; emorragia attiva; infezione attiva', f:['PHYSIOEL'] },
        { id:'es12', g:'R', t:'Emofilia e disturbi della coagulazione', f:['POGP'] },
        { id:'es13', g:'R', t:'Epilessia', f:['POGP','SAEBO'], n:'Saebo segnala che il divieto vale nel Regno Unito e negli USA ma non in Australia: è un disaccordo geografico, non scientifico.' },
        { id:'es14', g:'R', t:'Diabete; ipertensione non controllata', f:['POGP'] },
        { id:'es15', g:'R', t:'Tessuto cicatriziale nell\'area', f:['POGP'] },
        { id:'es16', g:'R', t:'Mezzi di sintesi nell\'area', f:['BTL4000'], n:'Solo dall\'elenco generale BTL: nessuna fonte specifica per la NMES.' }
      ],
      lacune:['La fonte migliore (POGP 2019) è un documento di fisioterapia pelvi-perineale. Le voci qui sopra sono quelle trasferibili alla NMES degli arti; sono state lasciate fuori quelle intracavitarie (pap-test anomalo, spirale in rame, prolasso, pessario).'] },

    /* ───────────────────── MANUALE / ESERCIZIO: volutamente vuoto */
    { k:'manuale_esercizio', nome:'Terapia manuale, esercizio, rieducazione, elicoidali', famiglia:'manuale', num:0, vuota:true,
      voci:[],
      lacune:['Qui non c\'è nessuna bozza, ed è voluto: non è stata cercata né trovata una fonte per le controindicazioni della terapia manuale e dell\'esercizio, e inventarle sarebbe peggio che lasciarle vuote. Se le vuoi, scrivile tu qui sotto con «+ Aggiungi»: quello che scrivi tu ha come fonte te, ed è una fonte migliore di un sito commerciale.'] }
  ]

  /* ── LE DECISIONI ────────────────────────────────────────────────────
     Sono i punti in cui le fonti si contraddicono. Non li può sciogliere
     l'assistente e non li può sciogliere il modello: li scioglie il
     professionista che firma, e la scelta va scritta. */
  var DECISIONI = [
    { id:'D1', dove:'Tecar', tit:'Tecar sopra mezzi di sintesi e protesi',
      desc:'Il manuale BTL della tecar li vieta senza sfumature, ed è il documento regolatorio dell\'apparecchio. Le fonti divulgative italiane restringono il divieto alle protesi «non schermate». Non è stata trovata nessuna fonte autorevole che dichiari sicura la tecar sopra un mezzo di sintesi.',
      opz:[ {l:'A', t:'Divieto assoluto, come dice il manuale'},
            {l:'B', t:'Permessa su protesi moderne non ferromagnetiche'},
            {l:'C', t:'Caso per caso, con la scelta scritta nel progetto'} ], f:['BTLTR','WATSON'] },

    { id:'D2', dove:'Laser 904 e Laser alta', tit:'Laser e neoplasia',
      desc:'Quattro posizioni diverse: il manuale BTL vieta anche a chi ha un\'anamnesi oncologica remota; Physiopedia/NAALT vieta solo sopra il sito noto, con un\'eccezione per la mucosite in chemioterapia; Practical Pain Management sostiene che sia un limite legale più che clinico; Hamblin 2018 invita a superare il timore.',
      opz:[ {l:'A', t:'Divieto esteso a tutta l\'anamnesi oncologica'},
            {l:'B', t:'Divieto solo sopra il sito noto o sospetto'},
            {l:'C', t:'Solo con parere oncologico scritto'} ], f:['BTLHIL','PHYSIOLLLT','PPM','HAMBLIN'] },

    { id:'D3', dove:'Laser 904 e Laser alta', tit:'Laser e pacemaker',
      desc:'Il manuale BTL del laser ad alta potenza lo elenca fra le controindicazioni. Practical Pain Management scrive che è «erroneamente considerato controindicato», perché l\'involucro metallico del dispositivo è impermeabile ai fotoni.',
      opz:[ {l:'A', t:'Controindicato, come dice il manuale'},
            {l:'B', t:'Non controindicato, si tratta normalmente'} ], f:['BTLHIL','PPM'] },

    { id:'D4', dove:'Ultrasuoni', tit:'Ultrasuoni sopra mezzi di sintesi',
      desc:'È il disaccordo più marcato di tutta la ricerca. BTL e I-Tech vietano; Tim Watson scrive che l\'ultrasuono in modalità PULSATA non termica è accettabile sopra il metallo e che il divieto riguarda onde corte e microonde; Physiopedia lo declassa a relativa e segnala in particolare le protesi cementate.',
      opz:[ {l:'A', t:'Vietato in ogni caso'},
            {l:'B', t:'Permesso solo in pulsato non termico'},
            {l:'C', t:'Permesso tranne che sopra protesi cementate'} ], f:['BTL4000','WATSON','PHYSIOEL','ITECHUS'] },

    { id:'D5', dove:'Ultrasuoni', tit:'Ultrasuoni e pacemaker',
      desc:'Chattanooga limita il divieto all\'area toracica. I-Tech lo estende a tutto il corpo. StatPearls attribuisce la controindicazione da pacemaker al solo ultrasuono focalizzato guidato da RM, non alla terapia.',
      opz:[ {l:'A', t:'Divieto solo sull\'area toracica'},
            {l:'B', t:'Divieto su tutto il corpo'} ], f:['CHATT','ITECHUS','STATUS'] },

    { id:'D6', dove:'TENS e US+microcorrenti', tit:'Corrente antalgica e pacemaker / defibrillatore',
      desc:'È il punto clinicamente più pesante. I manuali dei produttori vietano in modo assoluto (posizione medico-legale). StatPearls 2024 ammette l\'uso se non su addome, testa e torace. La revisione sistematica Badger 2017 conclude che la stimolazione dell\'arto inferiore è meno esposta all\'interferenza, ma raccomanda cautela. Arain 2023 su ICD ha trovato interferenze solo intermittenti e lievi nel 15,9% dei pazienti — in netto calo rispetto al 75% del 2003 — e chiede che il paziente sia testato sotto supervisione cardiologica.',
      opz:[ {l:'A', t:'Divieto assoluto, chiunque abbia un dispositivo'},
            {l:'B', t:'Permesso fuori da testa, torace e addome'},
            {l:'C', t:'Solo dopo un test sotto supervisione cardiologica'} ], f:['CHATT','STATTENS','BADGER','ARAIN','PHYSIOEL'] },

    { id:'D7', dove:'TENS', tit:'TENS e gravidanza',
      desc:'Physiopedia la mette fra le assolute sopra l\'utero gravido e la regione lombo-pelvica. Tim Watson scrive che la TENS al tronco «non è più considerata una controindicazione assoluta». Chattanooga si limita a dire che la sicurezza in gravidanza non è stata stabilita.',
      opz:[ {l:'A', t:'Assoluta, in gravidanza non si usa'},
            {l:'B', t:'Relativa: si evita il tronco, il resto si può'} ], f:['PHYSIOEL','WATSON','CHATT'] },

    { id:'D8', dove:'Magnetoterapia CEMP', tit:'Magnetoterapia e protesi metalliche',
      desc:'Le fonti specifiche di magnetoterapia restringono il divieto alle protesi magnetizzabili e dicono che le protesi moderne quasi mai lo sono. L\'elenco generale BTL vieta genericamente ogni oggetto metallico per tutte le terapie.',
      opz:[ {l:'A', t:'Vietata con qualsiasi protesi metallica'},
            {l:'B', t:'Vietata solo con protesi ferromagnetiche'} ], f:['ITECHPEMF','IGEA','FISIORAPIDO','BTL4000'] },

    { id:'D9', dove:'EMS', tit:'EMS e pacemaker',
      desc:'POGP 2019 e Chattanooga la mettono fra le assolute. Badger 2017 (revisione sistematica) conclude che la stimolazione dell\'arto inferiore «potrebbe essere usata in sicurezza», raccomandando comunque cautela finché non ci sarà uno studio dedicato.',
      opz:[ {l:'A', t:'Assoluta'},
            {l:'B', t:'Permessa sull\'arto inferiore, con cautela'} ], f:['POGP','CHATT','BADGER','SAEBO'] },

    { id:'D10', dove:'EMS', tit:'EMS e neoplasia',
      desc:'POGP, Chattanooga e Physiopedia la mettono fra le assolute. Saebo sostiene che non è stata trovata evidenza di rischio e che alcuni studi hanno usato la stimolazione come trattamento oncologico — ma è una fonte commerciale.',
      opz:[ {l:'A', t:'Assoluta'},
            {l:'B', t:'Relativa, valutazione caso per caso'} ], f:['POGP','CHATT','PHYSIOEL','SAEBO'] },

    { id:'D11', dove:'Laser alta + crio', tit:'Il freddo che nasconde l\'ustione',
      desc:'Non è un disaccordo fra fonti: è un buco. Nessuna fonte tratta HILT e crioterapia insieme. Il problema è reale: il raffreddamento attenua il dolore, che nell\'alta potenza è il segnale che precede l\'ustione, e Zimmer mette le «aree con sensibilità alterata» fra le controindicazioni al freddo stesso. Qui decide chi tiene in mano il manipolo.',
      opz:[ {l:'A', t:'Non raffreddare durante l\'erogazione'},
            {l:'B', t:'Raffreddare solo fra un passaggio e l\'altro'},
            {l:'C', t:'Come faccio adesso — lo scrivo io nelle note'} ], f:['BTLHIL','ZIMMER','NESSUNA'] }
  ]

  window.polControindicazioniBozza = {
    marker: 'controindicazioni-v1',
    fonti: FONTI,
    trasversali: TRASVERSALI,
    apparecchi: APPARECCHI,
    decisioni: DECISIONI
  }
})()
