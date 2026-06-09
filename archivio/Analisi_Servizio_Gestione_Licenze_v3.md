# Analisi – Servizio Gestione Licenze v3

> **Changelog rispetto a v2:**
> - Aggiunto tipo di licenza "Provvisoria" (continuità in attesa di pagamento)
> - Aggiunta sezione validazione offline con stringa crittografata
> - Aggiunta tabella `email_templates` nel DB (template non più hardcoded)
> - Aggiunto parametro frequenza check licenza configurabile da DB
> - Aggiunta sezione raccolta dati fatturazione al primo acquisto
> - Aggiunta logica di revoca licenza per mancato pagamento
> - Aggiunta nota su validazione P.IVA esterna
> - Aggiunto trigger configurabile per attivazione/rinnovo licenza
> - Chiarimento nomenclatura: la tabella ponte cliente-prodotto-moduli è denominata "contratti" (allineato con Alvise)

---

## 1. Panoramica generale

Il Servizio Gestione Licenze è un sistema back-end che si posiziona come intermediario tra due attori: la libreria client installata nelle applicazioni del produttore, e il sistema ERP del fornitore (il produttore stesso).

Il servizio non inizia mai comunicazioni verso i clienti o il fornitore di propria iniziativa, ad eccezione di un'unica notifica uscente verso l'ERP (il GET ALARM) e dei messaggi email/in-app schedulati. Il suo scopo principale è gestire il ciclo di vita delle licenze software: dalla prima registrazione del cliente, all'attivazione della trial demo, fino al rinnovo o alla scadenza della licenza a pagamento.

Ogni operazione transita attraverso questo servizio, che funge da unica fonte di verità sullo stato delle licenze.

### Architettura a tre livelli

- **Frecce blu** (da sinistra verso il centro): chiamate della libreria client (endpoint C1–C6)
- **Frecce gialle** (da destra verso il centro): chiamate del fornitore (endpoint F1–F6)
- **Freccia rossa tratteggiata** (dal centro verso destra): GET ALARM (O1), inviato dal server per notificare il fornitore

### Punti chiave

- Il servizio è **passivo**: risponde alle chiamate, non le inizia (eccetto O1 e messaggi schedulati)
- Ogni cliente è identificato da una `license_key` univoca generata al momento dell'attivazione
- L'autenticazione è **machine-to-machine**: nessun login utente finale; JWT separati per client e fornitore
- Il sistema è **multilingua** (italiano e inglese) e predisposto per futura gestione multi-fornitore
- Tutti i messaggi email e in-app sono generati da template salvati nel database con chiavi di sostituzione dinamiche

---

## 2. Descrizione dettagliata del funzionamento

### 2.1 Configurazione iniziale del fornitore

Prima che qualsiasi cliente possa registrarsi, il fornitore deve autenticarsi e registrare i propri prodotti. Questa fase avviene una tantum per ogni nuovo prodotto.

#### F1 – Autenticazione fornitore
`POST /api/vendor/auth/login`

Il sistema ERP del fornitore si autentica inviando la propria API key statica. Il servizio verifica che la chiave esista nella tabella `vendors` e restituisce un JWT di breve durata e un refresh token valido un'ora.

**Tabella: `vendors`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco del fornitore |
| name | VARCHAR(255) | Nome del fornitore |
| api_key | VARCHAR(255) | Chiave API statica (hash) |
| erp_alarm_url | VARCHAR(500) | URL endpoint GET ALARM dell'ERP |
| created_at | TIMESTAMP | Data e ora di inserimento |

**Tabella: `vendor_tokens`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| vendor_id | INT | Riferimento al fornitore |
| refresh_token | VARCHAR(512) | Refresh token (hash) — ruotato ad ogni utilizzo |
| expires_at | TIMESTAMP | Scadenza (1 ora) |
| revoked | BOOL | TRUE se revocato anticipatamente |
| created_at | TIMESTAMP | Data e ora di emissione |

#### F2 – Rinnovo token fornitore
`POST /api/vendor/token/refresh`

Quando il JWT scade, il fornitore usa il refresh token per ottenerne uno nuovo. Il refresh token viene ruotato ad ogni utilizzo (token rotation).

#### F6 – Registrazione nuovo prodotto
`POST /api/vendor/products`

Il fornitore registra un prodotto comunicando la `product_key` univoca e il nome leggibile.

**Tabella: `products`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco del prodotto |
| product_key | VARCHAR(100) | Chiave univoca inclusa nella libreria client |
| name | VARCHAR(255) | Nome leggibile del prodotto |
| trial_duration_days | INT | Durata della trial in giorni (configurabile per prodotto) |
| trial_max_users | INT | Numero massimo utenti in trial (NULL = illimitato) |
| license_check_frequency_days | INT | Frequenza in giorni del check periodico della licenza (es. 10) |
| created_at | TIMESTAMP | Data e ora di inserimento |

> **Nota:** `license_check_frequency_days` è il parametro configurabile per prodotto che determina ogni quanti giorni la libreria client deve contattare il server per confermare la validità della licenza (allineato con le direttive di Alvise).

---

### 2.2 Registrazione del cliente

Quando un cliente installa per la prima volta un'applicazione, la libreria client avvia automaticamente il processo di registrazione.

#### C1 – Registrazione cliente
`POST /api/client/register`

La libreria client invia: `product_key`, P.IVA o VAT number, ragione sociale, paese, email di contatto, lingua preferita, e opzionalmente telefono e nome del referente.

Il servizio esegue i seguenti controlli:
1. Verifica che la `product_key` esista in `products`
2. Verifica che la coppia `vat_number + country` non sia già associata a quella `product_key` (blocco re-registrazione, vedi sezione 2.7)
3. **[Facoltativo]** Validazione P.IVA tramite servizio esterno (es. VIES per P.IVA europee) — da valutare costi e copertura per clienti esteri

Se i dati sono validi, il cliente viene salvato con stato `pending`, viene generato un OTP e inviata un'email di verifica.

**Tabella: `clients`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| vat_number | VARCHAR(30) | P.IVA o VAT number |
| country | VARCHAR(2) | Codice paese ISO (es. IT, DE) |
| company_name | VARCHAR(255) | Ragione sociale |
| contact_email | VARCHAR(255) | Email per notifiche e OTP |
| language | VARCHAR(2) | Lingua preferita: `it`, `en` |
| contact_phone | VARCHAR(30) | Telefono (opzionale) |
| referent_name | VARCHAR(255) | Nome referente (opzionale) |
| status | ENUM | `pending` oppure `active` |
| created_at | TIMESTAMP | Data e ora di inserimento |

**Tabella: `otp_codes`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| client_id | INT | Riferimento al cliente |
| code | VARCHAR(10) | Codice OTP generato |
| expires_at | TIMESTAMP | Scadenza (es. 15 minuti) |
| used_at | TIMESTAMP | Data utilizzo — NULL se non usato |
| created_at | TIMESTAMP | Data e ora di generazione |

**Email inviata:** Template `OTP_VERIFICA` → Cliente

#### C2 – Verifica OTP
`POST /api/client/verify-otp`

Se il codice è valido e non scaduto, il servizio:
1. Attiva il cliente (`status → active`)
2. Genera la `license_key` univoca con salt random
3. Crea la licenza trial nella tabella `contratti`
4. Emette JWT + refresh token per il client
5. Triggera il GET ALARM verso l'ERP del fornitore
6. Genera la stringa crittografata di licenza offline (vedi sezione 2.10)

**Tabella: `contratti`**

> Questa tabella è la fonte di verità per ogni licenza attiva. Il nome "contratto" riflette la natura dell'accordo tra fornitore e cliente (nomenclatura stabilita da Alvise).

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| client_id | INT | Riferimento al cliente |
| product_id | INT | Riferimento al prodotto |
| license_key | VARCHAR(255) | Chiave univoca con salt random |
| license_type | ENUM | `trial`, `standard`, `provisional` |
| status | ENUM | `active`, `expired`, `suspended`, `revoked` |
| max_users | INT | Numero massimo utenti (NULL = illimitato per trial) |
| starts_at | TIMESTAMP | Inizio validità |
| expires_at | TIMESTAMP | Scadenza |
| activated_at | TIMESTAMP | Data di attivazione |
| deactivated_at | TIMESTAMP | Data disattivazione — NULL se ancora attiva |
| vendor_synced | BOOL | FALSE finché il fornitore non conferma via F4 |
| offline_token | TEXT | Stringa crittografata per validazione offline (vedi 2.10) |
| offline_token_expires_at | TIMESTAMP | Scadenza del token offline |
| created_at | TIMESTAMP | Data di inserimento |

**Tabella: `client_tokens`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| client_id | INT | Riferimento al cliente |
| refresh_token | VARCHAR(512) | Refresh token (hash) — ruotato ad ogni utilizzo |
| expires_at | TIMESTAMP | Scadenza (1 ora) |
| revoked | BOOL | TRUE se revocato anticipatamente |
| created_at | TIMESTAMP | Data e ora di emissione |

**Messaggi inviati:** Template `BENVENUTO_TRIAL` → Cliente (email + in-app), `NUOVA_REGISTRAZIONE` → Fornitore (email)

#### C3 – Nuovo OTP
`POST /api/client/resend-otp`

Se l'OTP scade o non viene ricevuto, la libreria può richiederne uno nuovo. Il servizio invalida il precedente e ne genera uno nuovo.

**Email inviata:** Template `OTP_VERIFICA` → Cliente

---

### 2.3 Funzionamento ordinario della licenza

#### C4 – Verifica stato licenza
`GET /api/client/license/status`

La libreria client chiama questo endpoint periodicamente, con frequenza definita dal parametro `license_check_frequency_days` del prodotto. Ogni chiamata include JWT nell'header `Authorization` e `license_key` nell'header `x-license-key`.

Il servizio:
- Verifica JWT e license_key
- Controlla lo stato in `contratti` (se scaduta, aggiorna `active → expired`)
- Restituisce stato, tipo, scadenza, max_users, moduli abilitati
- **Aggiorna il token offline** con una nuova stringa crittografata valida fino alla prossima scadenza configurata (vedi sezione 2.10)

**Tabella: `modules`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| name | VARCHAR(100) | Nome identificativo (es. `modulo_contabilita`) |
| description | VARCHAR(255) | Descrizione leggibile (opzionale) |
| created_at | TIMESTAMP | Data di inserimento |

**Tabella: `contratto_modules`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| contratto_id | INT | Riferimento al contratto |
| module_id | INT | Riferimento al modulo |

#### C5 – Poll messaggi in-app
`GET /api/client/messages`

La libreria fa polling periodico per ricevere messaggi in-app (avvisi scadenza, conferme, ecc.). Il servizio restituisce tutti i messaggi con `delivered_at NULL`, li marca come consegnati e aggiorna `client_activity_logs`.

Se per 7 giorni consecutivi non arriva nessuna chiamata C5, il servizio invia un'email di allerta al fornitore (vedi sezione 2.8).

**Tabella: `messages`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| contratto_id | INT | Riferimento al contratto (NULL se non legato a una licenza) |
| target | ENUM | `client` oppure `vendor` |
| channel | ENUM | `email` oppure `in_app` |
| type | ENUM | `banner`, `alert`, `info` |
| language | VARCHAR(2) | `it` oppure `en` |
| title | VARCHAR(255) | Titolo del messaggio |
| body | TEXT | Corpo del messaggio |
| cta_url | VARCHAR(500) | URL call-to-action (opzionale) |
| delivered_at | TIMESTAMP | NULL finché non consegnato |
| created_at | TIMESTAMP | Data di creazione |

**Tabella: `client_activity_logs`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| contratto_id | INT | Riferimento al contratto |
| last_seen_at | TIMESTAMP | Data e ora dell'ultima chiamata C5 |
| inactivity_notified_at | TIMESTAMP | Data invio email inattività — NULL se non inviata |

#### C6 – Rinnovo token cliente
`POST /api/client/token/refresh`

Il JWT client ha durata breve (es. 60 secondi). La libreria usa il refresh token per ottenerne uno nuovo. Il refresh token viene ruotato ad ogni utilizzo. Se scaduto (dopo 1 ora di inattività), il client deve contattare il produttore.

---

### 2.4 Sincronizzazione con il fornitore

#### O1 – GET ALARM verso ERP fornitore
`GET {vendor_erp_url}/alarm`

Il servizio invia una chiamata GET con un `alarm_code`. Valori possibili: `NEW_REGISTRATION`, `LICENSE_EXPIRING`, `LICENSE_EXPIRED`. L'ERP risponde con 200 OK; il servizio logga l'esito ma non blocca il flusso in caso di errore. In caso di errore (ERP non raggiungibile), il servizio invia comunque una **email di fallback** al fornitore.

**Tabella: `alarm_logs`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| alarm_code | ENUM | `NEW_REGISTRATION`, `LICENSE_EXPIRING`, `LICENSE_EXPIRED` |
| contratto_id | INT | Riferimento al contratto (NULL se non applicabile) |
| sent_at | TIMESTAMP | Data e ora invio |
| response_status | INT | Codice HTTP dell'ERP (es. 200, 500) |
| success | BOOL | TRUE se ERP ha risposto 200 |

#### F3 – Recupero nuove iscrizioni
`GET /api/vendor/registrations/new`

Il fornitore scarica la lista delle nuove iscrizioni non ancora processate (`vendor_synced = false`).

#### F4 – Conferma ricezione iscrizioni
`POST /api/vendor/registrations/confirm`

Il fornitore conferma di aver processato le iscrizioni inviando la lista degli ID. Il servizio marca le relative licenze con `vendor_synced = true`.

---

### 2.5 Attivazione licenza a pagamento

Quando un cliente acquista una licenza, il fornitore gestisce il pagamento sul proprio sistema e notifica il servizio.

#### F5 – Attivazione licenza a pagamento
`POST /api/vendor/license/activate`

Il fornitore invia: `vat_number`, `product_key`, tipo di licenza (`standard` o `provisional`), date di inizio e fine, max utenti, moduli abilitati, e il **trigger di attivazione** (`invoice_issued` o `payment_received`).

Il servizio:
1. Verifica l'esistenza del cliente
2. Controlla la coerenza delle date
3. Disattiva il contratto precedente (valorizza `deactivated_at`)
4. Crea il nuovo contratto attivo
5. Genera il token offline aggiornato

**Messaggi inviati:** Template `LICENZA_ATTIVATA` → Cliente (email + in-app)

> **Nota:** Il campo `trigger_type` (`invoice_issued` o `payment_received`) è configurabile dal fornitore e determina quale evento aziendale scatena l'attivazione. Questo permette flessibilità tra fornitori con processi diversi.

---

### 2.6 Tipi di licenza

Il sistema gestisce tre tipi di licenza distinti:

| Tipo | Codice | Descrizione |
|---|---|---|
| Trial Demo | `trial` | Versione di prova gratuita. Durata e moduli configurabili per prodotto in `products`. |
| Standard | `standard` | Licenza a pagamento mensile o annuale con moduli e utenti definiti nel contratto. |
| Provvisoria | `provisional` | Stessa licenza standard (stessi moduli, stessi utenti) ma con scadenza breve (es. 30 giorni), emessa in attesa di conferma del pagamento per garantire la continuità del servizio. Al ricevimento del pagamento viene sostituita da una licenza `standard` tramite F5. |

---

### 2.7 Avvisi di scadenza e disattivazione automatica

Il servizio gestisce la scadenza tramite job schedulati con notifiche anticipate a scadenze fisse.

| Tipo licenza | Avvisi anticipati |
|---|---|
| Trial Demo | 7, 3, 1 giorno prima |
| Standard mensile | 7, 3, 1 giorno prima |
| Standard annuale | 3 mesi, 2 mesi, 6 settimane, 1 mese, 3 settimane, 2 settimane, 10 giorni, 7 giorni, 3 e 1 giorno prima |
| Provvisoria | 7, 3, 1 giorno prima |

Per ogni scadenza imminente viene triggerato un GET ALARM con `alarm_code = LICENSE_EXPIRING`.

Il giorno della scadenza, se la licenza non è rinnovata: `status → expired`, GET ALARM con `LICENSE_EXPIRED`.

**Messaggi inviati:**
- Template `SCADENZA_IMMINENTE` → Cliente (email + in-app) con variabile `{days_remaining}`
- Template `LICENZA_SCADUTA_CLIENTE` → Cliente (email + in-app)
- Template `LICENZA_SCADUTA_FORNITORE` → Fornitore (email)

---

### 2.8 Raccolta dati di fatturazione

I dati necessari per la fatturazione elettronica (PEC, codice SDI, indirizzo di fatturazione) **non vengono raccolti durante la trial**, ma solo al momento del **primo acquisto di una licenza a pagamento**.

#### F7 – Aggiornamento dati fatturazione
`POST /api/vendor/client/billing`

Il fornitore invia i dati di fatturazione del cliente dopo la conferma del pagamento. Il servizio li salva nella tabella `client_billing`.

**Tabella: `client_billing`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| client_id | INT | Riferimento al cliente |
| pec | VARCHAR(255) | Indirizzo PEC |
| sdi_code | VARCHAR(10) | Codice destinatario SDI |
| billing_address | TEXT | Indirizzo di fatturazione completo |
| billing_country | VARCHAR(2) | Paese di fatturazione |
| created_at | TIMESTAMP | Data inserimento |
| updated_at | TIMESTAMP | Data ultimo aggiornamento |

---

### 2.9 Revoca licenza

In caso di mancato pagamento o richiesta esplicita, il fornitore può revocare una licenza attiva.

#### F8 – Revoca licenza
`POST /api/vendor/license/revoke`

Il fornitore invia `license_key` e opzionalmente un motivo. Il servizio:
1. Imposta `status → revoked` e valorizza `deactivated_at`
2. Invalida il token offline
3. Invia notifica al cliente

**Messaggio inviato:** Template `LICENZA_REVOCATA` → Cliente (email + in-app)

---

### 2.10 Validazione offline

Per permettere all'applicazione client di funzionare anche in assenza di connessione, il servizio genera una **stringa crittografata** (`offline_token`) salvata localmente dalla libreria client.

#### Contenuto del token offline

Il token è firmato con chiave privata del server e contiene (in forma crittografata):
- `license_key`
- `license_type`
- `status`
- `expires_at` (scadenza della licenza)
- `offline_token_expires_at` (scadenza del token offline, allineata alla frequenza di check)
- `max_users`
- Lista dei moduli abilitati

#### Funzionamento

1. Il token offline viene **generato al momento dell'attivazione** (C2) e **aggiornato ad ogni chiamata C4** riuscita
2. La libreria client lo salva in locale e lo usa per validare la licenza senza connessione
3. La scadenza del token offline coincide con la data del prossimo check atteso (`now + license_check_frequency_days`)
4. Se il token offline è scaduto (il client non ha fatto C4 nei tempi previsti), l'applicazione entra in modalità di grazia o si blocca secondo la policy del prodotto

---

### 2.11 Template email e in-app

Tutti i testi delle comunicazioni sono salvati nel database nella tabella `email_templates`, con chiavi di sostituzione dinamiche. Questo permette di aggiornare i testi senza modificare il codice.

**Tabella: `email_templates`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| template_key | VARCHAR(100) | Chiave identificativa (es. `OTP_VERIFICA`, `BENVENUTO_TRIAL`) |
| channel | ENUM | `email` oppure `in_app` |
| target | ENUM | `client` oppure `vendor` |
| language | VARCHAR(2) | `it` oppure `en` |
| subject | VARCHAR(255) | Oggetto (solo per email) |
| title | VARCHAR(255) | Titolo (solo per in-app) |
| body | TEXT | Corpo del messaggio con chiavi `{placeholder}` |
| created_at | TIMESTAMP | Data di inserimento |
| updated_at | TIMESTAMP | Data ultimo aggiornamento |

**Chiavi di sostituzione disponibili:**
`{product_name}`, `{company_name}`, `{otp_code}`, `{otp_expiry_minutes}`, `{expires_at}`, `{license_type}`, `{days_remaining}`, `{last_seen_at}`, `{contact_email}`, `{contact_phone}`

**Template previsti:**

| template_key | Canale | Destinatario | Evento |
|---|---|---|---|
| `OTP_VERIFICA` | email | client | Registrazione / resend OTP |
| `BENVENUTO_TRIAL` | email + in_app | client | Attivazione trial |
| `NUOVA_REGISTRAZIONE` | email | vendor | Nuovo cliente registrato |
| `LICENZA_ATTIVATA` | email + in_app | client | Attivazione licenza a pagamento |
| `SCADENZA_IMMINENTE` | email + in_app | client | Avviso scadenza (tutti i tipi) |
| `LICENZA_SCADUTA_CLIENTE` | email + in_app | client | Licenza scaduta |
| `LICENZA_SCADUTA_FORNITORE` | email | vendor | Licenza cliente scaduta |
| `CLIENT_INATTIVO` | email | vendor | Client senza C5 da 7 giorni |
| `REGISTRAZIONE_BLOCCATA` | in_app | client | Re-registrazione bloccata |
| `LICENZA_REVOCATA` | email + in_app | client | Licenza revocata dal fornitore |
| `GET_ALARM_FALLBACK` | email | vendor | GET ALARM fallito (ERP non raggiungibile) |

---

### 2.12 Caso eccezionale: tentativo di ri-registrazione bloccato

Se un client tenta di registrarsi con la stessa P.IVA e `product_key` già usate, il servizio blocca con errore `409`. Viene generato un messaggio in-app con template `REGISTRAZIONE_BLOCCATA` (nessuna email). Il messaggio viene restituito alla prossima chiamata C5.

---

### 2.13 Monitoraggio attività client e notifica inattività

Ad ogni chiamata C5, il servizio aggiorna `last_seen_at` in `client_activity_logs`. Un job schedulato verifica periodicamente i client con licenza attiva senza C5 da almeno 7 giorni e notifica il fornitore con template `CLIENT_INATTIVO`.

---

### 2.14 Riapertura applicazione da cliente già registrato

Quando un cliente già registrato riapre l'applicazione, la libreria chiama nuovamente C1. Il servizio riconosce `vat_number + product_key` già associati e restituisce direttamente i dati della licenza esistente (`license_key`, tipo, scadenza) senza avviare un nuovo processo. La libreria usa poi `license_key` e C6 per riottenere un JWT valido.

---

## 3. Riepilogo endpoint

### Endpoint Client (C)

| Codice | Metodo | Path | Descrizione |
|---|---|---|---|
| C1 | POST | `/api/client/register` | Registrazione cliente |
| C2 | POST | `/api/client/verify-otp` | Verifica OTP e attivazione trial |
| C3 | POST | `/api/client/resend-otp` | Nuovo OTP |
| C4 | GET | `/api/client/license/status` | Verifica stato licenza |
| C5 | GET | `/api/client/messages` | Poll messaggi in-app |
| C6 | POST | `/api/client/token/refresh` | Rinnovo token cliente |

### Endpoint Fornitore (F)

| Codice | Metodo | Path | Descrizione |
|---|---|---|---|
| F1 | POST | `/api/vendor/auth/login` | Autenticazione fornitore |
| F2 | POST | `/api/vendor/token/refresh` | Rinnovo token fornitore |
| F3 | GET | `/api/vendor/registrations/new` | Recupero nuove iscrizioni |
| F4 | POST | `/api/vendor/registrations/confirm` | Conferma iscrizioni |
| F5 | POST | `/api/vendor/license/activate` | Attivazione licenza a pagamento |
| F6 | POST | `/api/vendor/products` | Registrazione nuovo prodotto |
| F7 | POST | `/api/vendor/client/billing` | Aggiornamento dati fatturazione |
| F8 | POST | `/api/vendor/license/revoke` | Revoca licenza |

### Endpoint uscente (O)

| Codice | Metodo | Path | Descrizione |
|---|---|---|---|
| O1 | GET | `{vendor_erp_url}/alarm` | GET ALARM verso ERP fornitore |

---

## 4. Riepilogo tabelle DB

| Tabella | Scopo |
|---|---|
| `vendors` | Anagrafica fornitori |
| `vendor_tokens` | Refresh token fornitore |
| `products` | Catalogo prodotti con parametri configurabili |
| `clients` | Anagrafica clienti |
| `client_billing` | Dati fatturazione (raccolti al primo acquisto) |
| `otp_codes` | Codici OTP per verifica email |
| `contratti` | Licenze attive/storiche per ogni cliente+prodotto |
| `client_tokens` | Refresh token cliente |
| `modules` | Catalogo moduli disponibili |
| `contratto_modules` | Associazione moduli ai contratti |
| `messages` | Messaggi email e in-app in coda |
| `email_templates` | Template messaggi con chiavi di sostituzione |
| `client_activity_logs` | Monitoraggio ultima attività per licenza |
| `alarm_logs` | Log chiamate GET ALARM verso ERP |

---

## 5. Domande aperte

- Quale servizio esterno usare per la validazione P.IVA (es. VIES per EU)? Quali costi e copertura per clienti extra-EU?
- Per quanto tempo un'app può funzionare offline prima del blocco? Esiste una modalità di grazia?
- Quale comportamento adottare alla scadenza del token offline: blocco immediato o modalità degradata?
- Quale provider email usare per l'invio (es. SendGrid, Mailgun)?
- Come gestire il passaggio automatico da licenza `provisional` a `standard` dopo conferma pagamento?
- Sarà necessario un pannello di amministrazione per il Service Invoice?
- Cosa si intende esattamente con "supporto multi-tenant avanzato"?
- Qual è il formato preferito per il diagramma di flusso (BPMN, UML, ecc.)?

---

*Documento redatto il 08/06/2026 — basato su analisi v2 e direttive della riunione del 04/06/2026 (Alvise, Luca, Cristina)*
