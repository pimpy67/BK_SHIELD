### **Riepilogo Riunione: Analisi e Progettazione Servizio di Gestione Licenze ("Service Invoice")**

- **Data e Ora:** 4 giugno 2026, 08:44:02
- **Partecipanti:** Alvise, Luca (Speaker 4), Pavanandrea Pavanesira (Speaker 2), Speaker 3, Cristina (Speaker 5)
- **Riassunto della Riunione:** La riunione è stata convocata per definire la struttura, i requisiti e l'architettura di un nuovo sistema di gestione delle licenze software, provvisoriamente chiamato "Service Invoice" o "BK Invoice Service". Alvise ha guidato la discussione, correggendo le interpretazioni errate del team (Pavanandrea e Speaker 3) emerse da un'analisi preliminare, in particolare riguardo al flusso di iscrizione automatica delle app client e all'autenticazione. Luca è intervenuto criticando la mancanza di un workflow chiaro nel documento iniziale. Sono stati definiti i componenti chiave dell'architettura (Service Invoice, Libreria Client, App Fornitore) e il loro flusso di comunicazione, basato su notifiche attive dal server e chiamate API REST. La discussione ha coperto in dettaglio la gestione delle licenze (standard, trial, provvisorie), la validazione offline tramite chiavi crittografate, la struttura del database e la definizione degli endpoint. Si è deciso di concentrarsi sulla progettazione del backend, posticipando lo sviluppo del frontend, e di utilizzare l'AI come supporto dopo una fase di analisi autonoma. La riunione si è conclusa assegnando compiti specifici con una scadenza per una revisione intermedia fissata per mezzogiorno dello stesso giorno.

---

### **Argomento 1: Feedback sull'Analisi Preliminare e Definizione del Flusso di Iscrizione**

- **Riepilogo Dettagliato:**
  - Alvise ha iniziato la riunione rivedendo un documento di analisi preparato da Pavanandrea e Speaker 3, correggendo l'interpretazione del flusso di registrazione utente. Ha chiarito che non si tratta di un processo manuale, ma di un'iscrizione automatica che avviene quando un'app client (descritta come una "libreria") viene installata.
  - **Flusso di Iscrizione corretto:**
    - Un'app client si registra tramite una chiamata API REST (`POST`) a un servizio centrale, passando una chiave prodotto univoca e dati anagrafici del cliente (ragione sociale, Partita IVA).
    - **Alvise:** *"Questo è un'iscrizione, che è un endpoint... in cui gli viene data una chiave univoca che dice 'sono l'app della fatturazione elettronica'... e i parametri sono ragione sociale, BK Solution, partita iva..."*.
  - **Controlli lato Server:** Il servizio deve verificare che la chiave prodotto esista nel catalogo delle app autorizzate e che il cliente (identificato da P.IVA/Codice Fiscale) non sia già registrato. È stata discussa l'integrazione di un servizio esterno per validare la P.IVA.
  - **Feedback di Luca (Speaker 4):** Ha criticato duramente l'analisi iniziale per la mancanza di un diagramma di flusso (flowchart) che rappresentasse il processo complessivo. Ha sottolineato che il team si era concentrato troppo sui dettagli tecnici ("come") invece di comprendere il flusso funzionale ("dove arrivare").
    - **Luca (Speaker 4):** *"Se questa è tutta l'analisi, qui in realtà manca workflow. Cioè manca un flowchart che mi faccia capire al volo che se io vi ho consegnato le mie richieste, mi faccia capire al volo che le richieste le avete raggiunte."*
  - **Notifiche:** A seguito di un'iscrizione, il sistema deve inviare una notifica email (es. all'amministrazione del fornitore).
- **Azioni da Intraprendere:**  
  
  | Azione                               | Descrizione                                                                                                     | Responsabile           | Scadenza             | Note                                                                                       |
  |:------------------------------------ |:--------------------------------------------------------------------------------------------------------------- |:---------------------- |:-------------------- |:------------------------------------------------------------------------------------------ |
  | **Creare un diagramma di flusso**    | Sviluppare un flowchart che illustri l'intero processo, dall'iscrizione automatica alla gestione della licenza. | Pavanandrea, Speaker 3 | 4 Giugno 2026, 12:00 | Questo diagramma servirà come base per tutta l'analisi successiva.                         |
  | **Rivedere l'analisi**               | Riscrivere il documento di analisi basandosi sui chiarimenti emersi, concentrandosi sul flusso funzionale.      | Pavanandrea, Speaker 3 | 4 Giugno 2026, 12:00 | L'obiettivo è dimostrare la comprensione dei requisiti.                                    |
  | **Definire il flusso di iscrizione** | Dettagliare il processo di iscrizione automatica, inclusi parametri API e controlli server.                     | Pavanandrea, Speaker 3 | 4 Giugno 2026, 12:00 | Il flusso deve basarsi su una chiamata API REST `POST` con chiave prodotto e dati cliente. |
  | **Pianificare integrazione P.IVA**   | Valutare l'uso di un servizio esterno per la validazione delle partite IVA/Codici Fiscali.                      | Pavanandrea, Speaker 3 | Da definire          | Questo aggiunge un livello di sicurezza e accuratezza dei dati.                            |
- **Domande Aperte:**
  - Quali sono esattamente tutti i parametri obbligatori che la libreria client deve passare durante l'iscrizione?
  - Quale servizio esterno possiamo utilizzare per la verifica della Partita IVA e quali sono i costi associati?
  - Come gestiremo le diverse codifiche fiscali per i clienti esteri?
  - Quale sarà il formato esatto del payload della chiamata API di iscrizione?
  - Qual è il formato preferito per il diagramma di flusso (es. BPMN, UML, ecc.)?

---

### **Argomento 2: Architettura Generale e Definizione degli Endpoint API**

- **Riepilogo Dettagliato:**
  - Alvise ha definito l'architettura del sistema, composta da tre parti: **Service Invoice** (il server centrale), la **Libreria Client** (integrata nelle app) e l'**App del Fornitore** (gestionale per la fatturazione).
  - È stato chiarito il meccanismo di comunicazione: il Service Invoice notifica attivamente l'App del Fornitore tramite una chiamata `GET` a un endpoint parametrizzato ("campanello"). Successivamente, l'app del fornitore richiama endpoint specifici del servizio per ottenere i dettagli.
    - **Alvise:** *"sarà Service Invoice che chiama un GET scelto dal fornitore parametrizzato, in cui gli dice 'Din don, fammi una chiamata di questo tipo che c'è apposta per te' ok TAC"*.
  - È stato discusso il malinteso sull'autenticazione JWT: il team aveva erroneamente previsto un login per l'utente finale, mentre Alvise ha chiarito che l'autenticazione riguarda la comunicazione sicura tra i sistemi.
  - Alvise ha insistito sulla necessità di comprendere le basi dei metodi API (POST vs GET). Ha spiegato che la `POST` è adatta a inviare dati strutturati (come un JSON nel body), mentre la `GET` è per richieste leggere e query parametriche.
  - **Decisione:** Il focus dello sviluppo iniziale sarà sul backend (definizione di endpoint API per la gestione di cataloghi, clienti e contratti), rimandando l'implementazione del frontend.
    - **Alvise:** *"probabilmente userà gli stessi endpoint che lascerete anche al fornitore di utilizzare per aggiornarli dal suo gestionale"*.
- **Azioni da Intraprendere:**  
  
  | Azione                                    | Descrizione                                                                                                                 | Responsabile                              | Scadenza             | Note                                               |
  |:----------------------------------------- |:--------------------------------------------------------------------------------------------------------------------------- |:----------------------------------------- |:-------------------- |:-------------------------------------------------- |
  | **Rimuovere il concetto di login utente** | Eliminare dall'analisi la funzionalità di login manuale per l'utente finale.                                                | Pavanandrea, Speaker 3                    | Immediata            | L'autenticazione è tra sistemi (client-server).    |
  | **Definire Endpoint API del Server**      | Elencare e definire la struttura (input/output) degli endpoint che il Service Invoice esporrà per gestire dati e notifiche. | Team di sviluppo (Pavanandrea, Speaker 3) | 4 Giugno 2026, 12:00 | Focus sulla definizione, non sull'implementazione. |
  | **Specificare endpoint Fornitore**        | Definire path, schema JSON, e auth per la `POST` di sincronizzazione dati e per la `GET` di notifica ("campanello").        | Team di sviluppo                          | 4 Giugno 2026, 12:00 | Allineare con le linee guida API interne.          |
  | **Ripasso HTTP/REST**                     | Preparare una scheda sintetica su POST/GET, header/body, query params e formati di risposta.                                | Pavanandrea (Speaker 2)                   | 4 Giugno 2026, 12:00 | Per colmare il gap di competenze evidenziato.      |
- **Domande Aperte:**
  - Sarà necessario un pannello di amministrazione per il servizio centrale? Se sì, quali saranno i meccanismi di autenticazione e autorizzazione?
  - Quale standard di autenticazione e autorizzazione verrà utilizzato per proteggere gli endpoint API tra i servizi (API key, OAuth)?
  - Quali codici di stato e convenzioni di errore (error codes) adottare?

---

### **Argomento 3: Progettazione del Database e Gestione dei Dati**

- **Riepilogo Dettagliato:**
  - La discussione si è concentrata sulla struttura del database necessaria a supportare il servizio. Alvise ha richiesto la definizione delle tabelle per una revisione congiunta.
  - **Tabelle necessarie:**
    - **Clienti:** Anagrafica con dati fiscali. Deve gestire la relazione 1-a-N con i prodotti.
    - **Prodotti/Catalogo App:** Elenco delle applicazioni gestite, con parametri configurabili.
    - **Moduli App:** Tabella per i moduli specifici di ogni applicazione.
    - **Contratti/Vendite:** Una tabella ponte per definire la combinazione di app, moduli, numero utenti e durata della licenza per ogni cliente. **Alvise:** *"lo chiamo contratto, perché effettivamente è un contratto"*.
  - **Supporto Multilingua:** Alvise ha richiesto che il sistema sia progettato fin dall'inizio per essere multilingua, partendo da italiano e inglese.
  - **Dati di Fatturazione:** È stato chiarito che i dati per la fatturazione elettronica (PEC, SDI) saranno raccolti solo al momento del primo acquisto, non durante la trial.
- **Azioni da Intraprendere:**  
  
  | Azione                                  | Descrizione                                                                                               | Responsabile                                         | Scadenza             | Note                                                     |
  |:--------------------------------------- |:--------------------------------------------------------------------------------------------------------- |:---------------------------------------------------- |:-------------------- |:-------------------------------------------------------- |
  | **Progettazione Database**              | Definire la struttura delle tabelle (Clienti, Prodotti, Moduli, Contratti) e le loro relazioni.           | Team di sviluppo (Pavanandrea, Speaker 3, Speaker 5) | 4 Giugno 2026, 12:00 | Presentare una bozza di schema ad Alvise.                |
  | **Progettare Architettura Multilingua** | Includere nella progettazione del DB e delle API il supporto per testi multilingua.                       | Team di sviluppo                                     | Da definire          | Iniziare con italiano e inglese.                         |
  | **Gestire Dati di Fatturazione**        | Progettare l'endpoint e la logica per la raccolta dei dati di fatturazione al momento del primo acquisto. | Team di sviluppo                                     | Da definire          | Distinguere i dati della trial da quelli per l'acquisto. |
- **Domande Aperte:**
  - Quali sono i campi esatti da includere in ogni tabella del database?
  - Qual era il significato esatto della nota "tabella licenze e storico" nell'integrazione con Business Central?
  - Quale formato (tracciato) esatto dovrà avere il file CSV per l'eventuale importazione dei dati dei clienti?

---

### **Argomento 4: Rilascio e Gestione delle Licenze**

- **Riepilogo Dettagliato:**
  - Alvise ha specificato che ogni licenza deve gestire dinamicamente durata, moduli inclusi e numero di utenti.
  - Sono stati distinti tre tipi di licenze:
    1. **Licenza Standard:** Basata su un "contratto" che definisce parametri specifici per il cliente.
    2. **Trial Demo:** Una versione di prova gratuita (es. 30 giorni) con moduli e durata configurabili a livello di prodotto nel catalogo.
    3. **Licenza Provvisoria (o di continuità):** Una licenza standard con scadenza breve (es. 30 giorni) emessa in attesa del pagamento per il rinnovo, per garantire continuità di servizio. **Alvise:** *"non è una vera e propria trial, è la stessa licenza con gli stessi moduli, però non annuale e provvisoriamente di un mese, perché attendo che tu mi paghi"*.
  - **Gestione Offline:** È stato affrontato il funzionamento in assenza di connessione. L'idea è di salvare una stringa crittografata localmente sul client che contiene le informazioni di validità della licenza.
  - **Check Periodico:** La libreria client dovrà contattare periodicamente il server per confermare la validità della licenza. La frequenza sarà un parametro configurabile nel DB (es. ogni 10 giorni). Questo permette al server di monitorare i client attivi e inviare comandi di sospensione.
  - **Trigger di Attivazione:** L'attivazione o il rinnovo della licenza potrà scattare in base a eventi configurabili dal fornitore, come l'emissione della fattura o il ricevimento del pagamento.
- **Azioni da Intraprendere:**  
  
  | Azione                                    | Descrizione                                                                                                               | Responsabile                 | Scadenza             | Note                                                                       |
  |:----------------------------------------- |:------------------------------------------------------------------------------------------------------------------------- |:---------------------------- |:-------------------- |:-------------------------------------------------------------------------- |
  | **Definire logiche delle licenze**        | Dettagliare le regole per la gestione dei tre tipi di licenza (Standard, Trial, Provvisoria), incluse durata e notifiche. | Pavanandrea, Speaker 3       | Da definire          | Il sistema deve essere flessibile e configurabile.                         |
  | **Progettare validazione offline**        | Specificare come la licenza verrà salvata e convalidata localmente (stringa crittografata).                               | Pavanandrea, Speaker 3, Luca | Da definire          | L'obiettivo è rendere il client indipendente dal server per brevi periodi. |
  | **Definire i "contratti" della libreria** | Specificare le interfacce che la libreria client esporrà agli sviluppatori per interrogare lo stato della licenza.        | Pavanandrea, Speaker 3, Luca | Da definire          | Cruciale per l'adozione da parte di partner.                               |
  | **Definire endpoint Check Licenza**       | Specificare input/output, frequenze configurabili e policy per mancato check.                                             | Pavanandrea (Speaker 2)      | 4 Giugno 2026, 12:00 | Integrare con una tabella di parametri nel database.                       |
  | **Sviluppare protocollo di check chiavi** | Implementare il meccanismo per cui il client restituisce le chiavi temporanee al server per una verifica di integrità.    | Team di sviluppo             | Da definire          | Cruciale per il sistema di sblocco offline di emergenza.                   |
- **Domande Aperte:**
  - Quali informazioni esatte conterrà la stringa di licenza crittografata?
  - Per quanto tempo un'app potrà funzionare offline prima di richiedere una nuova sincronizzazione?
  - Come verrà gestita la revoca di una licenza (es. per mancato pagamento)?
  - Quali sono i criteri per decidere quali moduli disattivare in una Trial Demo?
  - Come gestire il passaggio automatico da licenza provvisoria a standard dopo il pagamento?

---

### **Argomento 5: Processi Automatici, Notifiche e Tecnologie**

- **Riepilogo Dettagliato:**
  - **Processi Automatici:** Il Service Invoice dovrà eseguire controlli periodici per monitorare la connessione dei client, inviare avvisi per licenze in scadenza (es. 2 mesi prima) e segnalare scadenze non fatturate.
  - **Notifiche Email:** È stato deciso di implementare un sistema di notifiche email per comunicare con il fornitore, come backup nel caso in cui le chiamate API falliscano. Le email saranno basate su template HTML salvati in una tabella del database con chiavi di sostituzione dinamiche.
    - **Alvise:** *"se dopo io ti faccio una chiamata ma il campanello è rotto... io ti mando anche un'email e ti dico 'guarda che per questo cliente bisogna fatturare'"*.
  - **Stack Tecnologico:**
    - **Backend:** Alvise ha dato libertà di scelta tra **Node.js** e **Python**, escludendo C#. **Alvise:** *"Node.js? Accendiamo. Python? Io ho scelto Python per una uniformità però se voi vi sentite meglio con Node.js per me va bene lo stesso."*
    - **Frontend:** **Ionic** è stato accettato come valido, ma il suo sviluppo è posticipato. Alvise ha menzionato la disponibilità di formazione ("Vi do l'accademia").
  - **Uso dell'AI:** Alvise ha insistito affinché il team scrivesse l'analisi in autonomia prima di usare l'AI per migliorare o generare codice boilerplate, per garantire una comprensione profonda dei requisiti.
  - **Requisiti Scartati/Posticipati:** L'idea di sviluppare una Certificate Authority (CAA) proprietaria è stata accantonata, così come la nota poco chiara sul "supporto multi-tenant avanzato".
- **Azioni da Intraprendere:**  
  
  | Azione                                | Descrizione                                                                                                                           | Responsabile            | Scadenza             | Note                                                                 |
  |:------------------------------------- |:------------------------------------------------------------------------------------------------------------------------------------- |:----------------------- |:-------------------- |:-------------------------------------------------------------------- |
  | **Scegliere stack tecnologico**       | Il team di sviluppo deve decidere formalmente lo stack per il backend (Node.js o Python).                                             | Team di sviluppo        | Da definire          | La decisione deve basarsi sulla familiarità e l'efficienza del team. |
  | **Progettare Sistema Email**          | Definire la struttura della tabella per i template email e il meccanismo di invio automatico con chiavi di sostituzione.              | Team di sviluppo        | Da definire          | Prevedere l'uso di chiavi di sostituzione dinamiche.                 |
  | **Definire Processi di Monitoraggio** | Elencare i processi automatici che il servizio dovrà eseguire periodicamente (controlli su connessioni, scadenze, ecc.).              | Team di sviluppo        | Da definire          |                                                                      |
  | **Configurare licenza AI**            | Pavanandrea (Speaker 2) deve farsi supportare da Fabio o Luca per configurare la licenza business dello strumento AI per lo sviluppo. | Pavanandrea (Speaker 2) | Da definire          | Per rendere il team operativo con gli strumenti AI.                  |
  | **Redazione documento funzionale**    | Scrivere un documento testuale ("la storia") che descriva il funzionamento e le interazioni tra i componenti del sistema.             | Team di sviluppo        | 4 Giugno 2026, 12:00 | Documento concettuale da presentare ad Alvise.                       |
  | **Checkpoint di allineamento**        | Presentare i deliverable dell'analisi (flowchart, schemi DB, specifiche) ad Alvise per raccogliere feedback.                          | Tutti                   | 4 Giugno 2026, 12:00 | Portare un elenco di domande e punti bloccanti.                      |
- **Domande Aperte:**
  - Qual era il significato esatto della nota "Scalabilità, supporto più Client Web App contemporaneamente"?
  - Cosa si intende esattamente con "supporto multi-tenant avanzato, isolamento dati completo"?
  - Quale servizio di terze parti verrà utilizzato per l'invio delle email (es. SendGrid, Mailgun)?
