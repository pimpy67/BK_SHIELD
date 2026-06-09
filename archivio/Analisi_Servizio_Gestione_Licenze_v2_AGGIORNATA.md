# Analisi – Servizio Gestione Licenze (v2 Aggiornata)

> **Changelog v2 → v2 Aggiornata:**
> - Mantenuti tutti i contenuti originali di v2
> - Aggiunte 6 nuove sezioni: Error Handling, Idempotenza, Sicurezza, Design API, Nuovi Endpoint, Edge Cases
> - Aggiunti dettagli mancanti: algoritmi JWT, generazione license_key, rate limiting, OTP, API key hashing
> - Aggiornate tabelle: vendors, alarm_logs con nuovi campi
> - Aggiunte 3 nuove tabelle: otp_attempts, rate_limits, idempotency_keys
> - Documento pronto per implementazione e presentazione

---

## 1. Panoramica generale

Il Servizio Gestione Licenze è un sistema back-end che si posiziona come intermediario tra due attori: la libreria client installata nelle applicazioni del produttore, e il sistema ERP del fornitore (il produttore stesso). Il servizio non inizia mai comunicazioni verso i clienti o il fornitore di propria iniziativa, ad eccezione di un'unica notifica uscente verso l'ERP (il GET ALARM) e dei messaggi email/in-app schedulati.

Il suo scopo principale è gestire il ciclo di vita delle licenze software: dalla prima registrazione del cliente, all'attivazione della trial demo, fino al rinnovo o alla scadenza della licenza a pagamento. Ogni operazione transita attraverso questo servizio, che funge da unica fonte di verità sullo stato delle licenze.

### Architettura a tre livelli

Le frecce blu da sinistra verso il centro rappresentano le chiamate della libreria client (endpoint C1–C6). Le frecce gialle da destra verso il centro rappresentano le chiamate del fornitore (endpoint F1–F6). L'unica freccia rossa tratteggiata dal centro verso destra è il GET ALARM (O1), che il server invia per notificare il fornitore di nuove iscrizioni o scadenze imminenti.

### Punti chiave

- Il servizio è **passivo**: risponde alle chiamate, non le inizia (ad eccezione di O1 e dei messaggi schedulati)
- Ogni cliente è identificato da una `license_key` univoca generata al momento dell'attivazione
- L'autenticazione è **separata** per cliente (JWT + refresh token) e fornitore (JWT + refresh token)
- Il sistema è **multilingua** (italiano e inglese) e predisposto per futura gestione multi-fornitore
- Tutti i messaggi email e in-app sono generati e gestiti internamente dal servizio

---

## 2. Descrizione dettagliata del funzionamento

### 2.1 Configurazione iniziale del fornitore

Prima che qualsiasi cliente possa registrarsi, il fornitore deve autenticarsi sul servizio e registrare i propri prodotti. Questa fase avviene una tantum per ogni nuovo prodotto messo in commercio.

#### F1 – Autenticazione fornitore
`POST /api/vendor/auth/login`

Il sistema ERP del fornitore si autentica inviando la propria API key statica. Il servizio verifica che la chiave esista nella tabella `vendors` e restituisce un JWT di breve durata e un refresh token valido un'ora. Da questo momento tutte le chiamate del fornitore includeranno il JWT nell'header Authorization.

**Tabella: `vendors`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco del fornitore |
| name | VARCHAR(255) | Nome del fornitore |
| api_key_hash | VARCHAR(60) | Chiave API hashata con bcrypt (rounds=12) |
| erp_alarm_url | VARCHAR(500) | URL endpoint GET ALARM dell'ERP del fornitore |
| api_key_revoked_at | TIMESTAMP | Data revoca vecchia API key (NULL se attiva) |
| created_at | TIMESTAMP | Data e ora di inserimento |
| updated_at | TIMESTAMP | Data ultimo aggiornamento |

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

Quando il JWT scade, il fornitore usa il refresh token per ottenerne uno nuovo senza dover reinserire le credenziali. Il refresh token viene ruotato ad ogni utilizzo (token rotation) per maggiore sicurezza.

#### F6 – Registrazione nuovo prodotto
`POST /api/vendor/products`

Il fornitore registra un nuovo prodotto comunicando la sua chiave univoca (product_key) e il nome leggibile.

**Tabella: `products`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco del prodotto |
| product_key | VARCHAR(100) | Chiave univoca del prodotto, inclusa nella libreria client |
| name | VARCHAR(255) | Nome leggibile del prodotto |
| created_at | TIMESTAMP | Data e ora di inserimento del record |

---

### 2.2 Registrazione del cliente

Quando un cliente installa per la prima volta un'applicazione del fornitore, la libreria client integrata avvia automaticamente il processo di registrazione. Questo processo si articola in due fasi: invio dei dati e verifica via OTP.

#### C1 – Registrazione cliente
`POST /api/client/register`

La libreria client invia i dati anagrafici del cliente: product_key (già inclusa nella libreria), P.IVA o VAT number, ragione sociale, paese, email di contatto, lingua preferita e, opzionalmente, telefono e nome del referente.

Il servizio verifica che la product_key esista nella tabella products. Verifica poi che la coppia vat_number + country non sia già associata a quella product_key: se lo fosse, significherebbe che quel cliente ha già usufruito della trial per quel prodotto — il tentativo viene bloccato.

Se i dati sono validi, il cliente viene salvato nella tabella clients con stato pending, viene generato un codice OTP e inviata un'email di verifica.

**Tabella: `clients`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| vat_number | VARCHAR(30) | P.IVA o VAT number |
| country | VARCHAR(2) | Codice paese ISO (es. IT, DE, FR) |
| company_name | VARCHAR(255) | Ragione sociale |
| contact_email | VARCHAR(255) | Email per notifiche e OTP |
| language | VARCHAR(2) | Lingua preferita — valori: it, en |
| contact_phone | VARCHAR(30) | Telefono — opzionale |
| referent_name | VARCHAR(255) | Nome e cognome del referente — opzionale |
| status | ENUM | Stato: pending (attesa OTP) oppure active |
| created_at | TIMESTAMP | Data e ora di inserimento del record |

**Tabella: `otp_codes`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| client_id | INT | Riferimento al cliente in clients |
| code | VARCHAR(10) | Codice OTP generato (6 cifre, hashato con SHA256) |
| expires_at | TIMESTAMP | Scadenza del codice (15 minuti) |
| used_at | TIMESTAMP | Data utilizzo — NULL se non ancora usato |
| created_at | TIMESTAMP | Data e ora di generazione |

**Tabella: `otp_attempts` (NUOVO)**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | PK |
| otp_id | INT | FK a otp_codes |
| provided_code | VARCHAR(6) | Il codice fornito dal client |
| result | ENUM | `success` oppure `failed` |
| created_at | TIMESTAMP | Quando è stato tentato |

Email inviata in questa fase:

```
Oggetto: Verifica il tuo indirizzo email – {product_name}

Gentile {company_name},

abbiamo ricevuto la sua richiesta di registrazione a {product_name}.
Per completare la registrazione e attivare la Trial Demo, la invitiamo a inserire
il seguente codice di verifica nell'applicazione:

    Codice OTP: {otp_code}

Il codice è valido per {otp_expiry_minutes} minuti.

Cordiali saluti, Il team di {product_name}
```

#### C2 – Verifica OTP
`POST /api/client/verify-otp`

Il cliente inserisce il codice OTP nell'applicazione e la libreria lo invia al servizio. Se il codice è valido e non scaduto, il servizio:

- Attiva il cliente (status → active)
- Genera la license_key univoca: `HMAC_SHA256(random_uuid + timestamp + vat_number + country + product_key, server_secret)`
- Crea la licenza trial nella tabella licenses
- Emette JWT + refresh token per il client
- Triggera il GET ALARM verso l'ERP del fornitore

**Tabella: `licenses`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco della licenza |
| client_id | INT | Riferimento al cliente in clients |
| product_id | INT | Riferimento al prodotto in products |
| license_key | VARCHAR(255) | Chiave univoca HMAC-SHA256 — identificativo usato dalla libreria client |
| license_type | ENUM | Tipo: trial, monthly, annual |
| status | ENUM | Stato: active, expired, suspended |
| max_users | INT | Numero massimo utenti — NULL per trial |
| starts_at | TIMESTAMP | Inizio validità |
| expires_at | TIMESTAMP | Scadenza |
| activated_at | TIMESTAMP | Data di attivazione |
| deactivated_at | TIMESTAMP | Data disattivazione — NULL se ancora attiva |
| vendor_synced | BOOL | FALSE finché il fornitore non conferma via F4 |
| created_at | TIMESTAMP | Data di inserimento del record |

**Tabella: `client_tokens`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| client_id | INT | Riferimento al cliente in clients |
| refresh_token | VARCHAR(512) | Refresh token (hash) — ruotato ad ogni utilizzo |
| expires_at | TIMESTAMP | Scadenza (1 ora) |
| revoked | BOOL | TRUE se revocato anticipatamente |
| created_at | TIMESTAMP | Data e ora di emissione |

Email inviata in questa fase:

```
Oggetto: Benvenuto in {product_name} – Attivazione Trial Demo

Gentile {company_name},

siamo lieti di comunicarle che la Trial Demo di {product_name} è stata attivata con successo.
La Trial Demo sarà disponibile fino al {expires_at}.
Al termine del periodo di prova potrà procedere con l'acquisto di una licenza.

Cordiali saluti, Il team di {product_name}
```

#### C3 – Nuovo OTP
`POST /api/client/resend-otp`

Se il cliente non riceve l'OTP o se scade prima che venga inserito, la libreria client può richiederne uno nuovo. Il servizio invalida il codice precedente nella tabella otp_codes e ne genera uno nuovo.

**Rate Limiting:** Max 3 resend per client per ora. Superato il limite, risposta HTTP 429.

---

### 2.3 Funzionamento ordinario della licenza

Una volta registrato, il cliente dispone di una license_key e di un JWT valido. La libreria client utilizza questi due elementi per tutte le comunicazioni successive con il servizio.

#### C4 – Verifica stato licenza
`GET /api/client/license/status`

La libreria client chiama questo endpoint periodicamente per verificare lo stato della licenza. Ogni chiamata include il JWT nell'header `Authorization` e la license_key nell'header `x-license-key`. Il servizio verifica entrambi, controlla lo stato della licenza nella tabella licenses e, se nel frattempo è scaduta, aggiorna automaticamente lo stato in active → expired.

Il servizio restituisce lo stato corrente (active, expired, suspended), il tipo di licenza, la data di scadenza, il numero massimo di utenti e i moduli abilitati.

**Tabella: `modules`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco del modulo |
| name | VARCHAR(100) | Nome identificativo del modulo (es. modulo_contabilita) |
| description | VARCHAR(255) | Descrizione leggibile — opzionale |
| created_at | TIMESTAMP | Data di inserimento del record |

**Tabella: `license_modules`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| license_id | INT | Riferimento alla licenza in licenses |
| module_id | INT | Riferimento al modulo in modules |

#### C5 – Poll messaggi in-app
`GET /api/client/messages`

La libreria client fa polling periodico per ricevere eventuali messaggi in-app in coda (banner di avviso scadenza, conferme di attivazione, avvisi di errore, ecc.). Il servizio restituisce tutti i messaggi con delivered_at NULL destinati a quel client, li marca come consegnati e aggiorna il log di attività nella tabella client_activity_logs.

Questo endpoint è anche il meccanismo con cui il servizio monitora la salute del client: se per 7 giorni consecutivi non arriva nessuna chiamata C5, il servizio invia un'email di allerta al fornitore.

**Tabella: `messages`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco del messaggio |
| license_id | INT | Riferimento alla licenza — NULL per messaggi generali |
| target | ENUM | Destinatario: client oppure vendor |
| channel | ENUM | Canale: email oppure in_app |
| type | ENUM | Tipo: banner, alert, info |
| language | VARCHAR(2) | Lingua: it oppure en |
| title | VARCHAR(255) | Titolo del messaggio |
| body | TEXT | Corpo del messaggio |
| cta_url | VARCHAR(500) | URL call-to-action — opzionale |
| delivered_at | TIMESTAMP | NULL finché non consegnato |
| created_at | TIMESTAMP | Data di creazione del messaggio |

**Tabella: `client_activity_logs`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco |
| license_id | INT | Riferimento alla licenza in licenses |
| last_seen_at | TIMESTAMP | Data e ora dell'ultima chiamata C5 ricevuta |
| inactivity_notified_at | TIMESTAMP | Data invio email inattività — NULL se non inviata |

#### C6 – Rinnovo token cliente
`POST /api/client/token/refresh`

Il JWT del client ha una durata molto breve (60 secondi). Quando scade, la libreria usa il refresh token per ottenerne uno nuovo senza richiedere nuovamente le credenziali. Il refresh token viene ruotato ad ogni utilizzo. Se anche il refresh token è scaduto (dopo 1 ora di inattività), il client dovrà contattare il produttore per ripristinare l'accesso.

---

### 2.4 Sincronizzazione con il fornitore

Ogni volta che un cliente completa la registrazione (C2 andata a buon fine), il servizio invia immediatamente un GET ALARM all'ERP del fornitore per segnalare che ci sono nuove iscrizioni da processare.

#### O1 – GET ALARM verso ERP fornitore
`GET {vendor_erp_url}/alarm`

Il servizio invia una chiamata GET all'URL dell'ERP del fornitore con un alarm_code che identifica il tipo di evento. I valori possibili sono NEW_REGISTRATION, LICENSE_EXPIRING e LICENSE_EXPIRED. L'ERP risponde con 200 OK; il servizio logga l'esito ma non blocca il flusso in caso di errore.

Se O1 fallisce, il server ritenta ogni 15 minuti per max 3 tentativi (24 ore), poi invia email fallback al fornitore.

**Tabella: `alarm_logs`**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | Identificativo univoco del log |
| alarm_code | ENUM | Tipo di evento: NEW_REGISTRATION, LICENSE_EXPIRING, LICENSE_EXPIRED |
| license_id | INT | Riferimento alla licenza — NULL se non applicabile |
| sent_at | TIMESTAMP | Data e ora invio |
| response_status | INT | Codice HTTP restituito dall'ERP |
| success | BOOL | TRUE se l'ERP ha risposto 200 |
| retry_count | INT | Numero tentativi (DEFAULT 0) |
| last_retry_at | TIMESTAMP | Quando è stato ritentato l'ultimo |
| next_retry_at | TIMESTAMP | Quando sarà ritentato il prossimo |
| max_retries | INT | Max tentativi consentiti (DEFAULT 3) |

#### F3 – Recupero nuove iscrizioni
`GET /api/vendor/registrations/new`

Ricevuto il GET ALARM, il fornitore chiama questo endpoint per scaricare la lista delle nuove iscrizioni non ancora processate (vendor_synced = false nella tabella licenses). Il servizio restituisce tutti i dati del cliente e della licenza, inclusa la license_key.

**Paginazione:** `?page=1&limit=50` (max 100)

#### F4 – Conferma ricezione nuove iscrizioni
`POST /api/vendor/registrations/confirm`

Il fornitore conferma di aver ricevuto e processato le iscrizioni inviando la lista degli ID. Il servizio marca le relative licenze con vendor_synced = true, in modo che non vengano restituite nelle chiamate successive a F3.

**Idempotenza:** Idempotente — Retrying con stessi ID produce lo stesso risultato.

---

### 2.5 Attivazione licenza a pagamento

Quando un cliente decide di acquistare una licenza mensile o annuale (tipicamente al termine del periodo di prova o per rinnovo), il fornitore gestisce il processo di pagamento sul proprio sistema e, una volta confermato, notifica il servizio tramite F5.

#### F5 – Attivazione licenza a pagamento
`POST /api/vendor/license/activate`

**Header OBBLIGATORIO:** `Idempotency-Key: <unique_key>`

Il fornitore invia i dettagli della nuova licenza: vat_number e product_key del cliente, tipo di licenza (monthly o annual), date di inizio e fine, numero massimo di utenti e moduli abilitati. Il servizio verifica l'esistenza del cliente, controlla la coerenza delle date, disattiva la licenza precedente (valorizzando deactivated_at) e crea la nuova licenza attiva.

**Idempotenza:** La stessa `Idempotency-Key` + stesso body = stessa risposta senza duplicati (implementazione con tabella `idempotency_keys`).

**Tabella: `idempotency_keys` (NUOVO)**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | PK |
| idempotency_key | VARCHAR(255) | La chiave fornita nel header |
| vendor_id | INT | FK a vendors |
| endpoint | VARCHAR(100) | Es. POST /api/vendor/license/activate |
| request_hash | VARCHAR(64) | Hash SHA256 del corpo della richiesta |
| response_body | JSON | La risposta originale |
| response_status_code | INT | HTTP status della risposta |
| created_at | TIMESTAMP | Quando è stata registrata |
| expires_at | TIMESTAMP | Scadenza della cache (24 ore) |

Email inviata in questa fase:

```
Oggetto: Licenza {product_name} attivata – Accesso confermato

Gentile {company_name},

siamo lieti di comunicarle che la sua licenza di {product_name} è stata attivata.
Tipo: {license_type} | Valida fino al: {expires_at}

Cordiali saluti, Il team di {product_name}
```

---

### 2.6 Avvisi di scadenza e disattivazione automatica

Il servizio gestisce in modo proattivo la scadenza delle licenze attraverso job schedulati. Per ogni tipo di licenza sono previste notifiche anticipate a scadenze fisse.

- **Trial Demo:** avvisi 7, 3 e 1 giorno prima della scadenza
- **Licenza mensile:** avvisi 7, 3 e 1 giorno prima della scadenza
- **Licenza annuale:** avvisi a 3 mesi, 2 mesi, 6 settimane, 1 mese, 3 settimane, 2 settimane, 10 giorni, 7 giorni, 3 e 1 giorno prima della scadenza

Per ogni scadenza imminente il servizio triggera inoltre un GET ALARM verso l'ERP del fornitore con alarm_code = LICENSE_EXPIRING.

Il giorno stesso della scadenza, se la licenza non è stata rinnovata, il servizio disattiva automaticamente la licenza (status → expired) e triggera un GET ALARM con alarm_code = LICENSE_EXPIRED.

---

### 2.7 Caso eccezionale: tentativo di ri-registrazione bloccato

La license_key viene emessa una sola volta per ogni coppia cliente+prodotto. Se un client tenta di registrarsi nuovamente con la stessa P.IVA e product_key, il servizio blocca il tentativo restituendo un errore 409.

Messaggio in-app restituito al cliente:

```
Titolo: Registrazione non consentita
Testo: Non è possibile completare la registrazione. La Trial Demo per questo prodotto 
è già stata utilizzata in precedenza con questo account. Per accedere nuovamente al 
servizio è necessario contattare direttamente il produttore.
```

---

### 2.8 Monitoraggio attività client e notifica inattività

Ad ogni chiamata C5 (poll messaggi in-app), il servizio aggiorna il campo last_seen_at nella tabella client_activity_logs. Un job schedulato verifica periodicamente se ci sono client con licenza attiva che non effettuano chiamate C5 da almeno 7 giorni consecutivi.

In tal caso, il servizio aggiorna inactivity_notified_at per evitare invii duplicati e notifica il fornitore via email.

---

### 2.9 Riapertura dell'applicazione da parte di un cliente già registrato

Quando un cliente già registrato riapre l'applicazione, la libreria client chiama nuovamente C1. Il servizio riconosce che vat_number + product_key sono già associati a una licenza attiva e restituisce direttamente i dati della licenza esistente (license_key, tipo, scadenza) senza avviare un nuovo processo di registrazione.

La libreria client utilizza poi la license_key e il meccanismo di token refresh (C6) per riottenere un JWT valido e riprendere il funzionamento ordinario (C4 e C5).

---

## 3. SEZIONE NUOVA – ERROR HANDLING & CODICI ERRORE

### 3.1 Formato standardizzato risposta errore

Tutte le risposte di errore seguono questo formato JSON:

```json
{
  "error_code": "DESCRITTIVO_SNAKE_CASE",
  "message": "Descrizione leggibile per il client",
  "details": {
    "field": "nome_campo_opzionale",
    "constraint": "vincolo_violato_opzionale"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "uuid_per_tracciamento"
}
```

### 3.2 HTTP Status Code per Successo

| Endpoint | Metodo | Success Status | Motivo |
|---|---|---|---|
| C1 (register) | POST | **201 Created** | Nuova registrazione (OTP) creata |
| C2 (verify-otp) | POST | **200 OK** | Licenza creata, dati ritornati |
| C3 (resend-otp) | POST | **200 OK** | OTP inviato |
| C4 (license/status) | GET | **200 OK** | Read-only |
| C5 (messages) | GET | **200 OK** | Read-only |
| C6 (token/refresh) | POST | **200 OK** | Token aggiornato |
| F1 (auth/login) | POST | **200 OK** | Autenticazione riuscita |
| F2 (token/refresh) | POST | **200 OK** | Token aggiornato |
| F3 (registrations/new) | GET | **200 OK** | Read-only |
| F4 (registrations/confirm) | POST | **200 OK** | Conferma completata |
| F5 (license/activate) | POST | **201 Created** | Nuova licenza creata |
| F6 (products) | POST | **201 Created** | Nuovo prodotto creato |

### 3.3 Errori per endpoint

**C1 (register):** 11 possibili errori
- PRODUCT_KEY_NOT_FOUND (404)
- INVALID_VAT_FORMAT (400)
- INVALID_EMAIL_FORMAT (400)
- INVALID_LANGUAGE (400)
- INVALID_COUNTRY_CODE (400)
- MISSING_REQUIRED_FIELD (400)
- CLIENT_ALREADY_REGISTERED (409)
- RATE_LIMIT_EXCEEDED (429) — max 5 per IP/ora
- EMAIL_SEND_FAILED (500)
- INTERNAL_SERVER_ERROR (500)

**C2 (verify-otp):** 8 possibili errori
- INVALID_OTP_CODE (400)
- OTP_CODE_EXPIRED (400)
- OTP_MAX_ATTEMPTS_EXCEEDED (429) — max 3 tentativi, blocco 30 min
- CLIENT_NOT_FOUND (404)
- DATABASE_TRANSACTION_FAILED (500)
- GET_ALARM_FAILED (500) — Licenza creata, ma notifica ERP fallita

**C3 (resend-otp):** 4 possibili errori
- CLIENT_NOT_FOUND (404)
- RATE_LIMIT_EXCEEDED (429) — max 3 resend/ora
- EMAIL_SEND_FAILED (500)

**C4 (license/status):** 5 possibili errori
- INVALID_JWT (401)
- INVALID_LICENSE_KEY (401)
- LICENSE_NOT_FOUND (404)
- JWT_LICENSE_KEY_MISMATCH (403)

**C5 (messages):** 4 possibili errori
- INVALID_JWT (401)
- INVALID_LICENSE_KEY (401)
- LICENSE_NOT_FOUND (404)

**C6 (token/refresh):** 3 possibili errori
- INVALID_REFRESH_TOKEN (401)
- CLIENT_NOT_FOUND (404)

**F1 (auth/login):** 3 possibili errori
- INVALID_API_KEY (401)
- VENDOR_DISABLED (403)

**F5 (license/activate):** 8 possibili errori
- INVALID_JWT (401)
- IDEMPOTENCY_KEY_REQUIRED (400)
- CLIENT_NOT_FOUND (404)
- INVALID_DATE_RANGE (400)
- INVALID_MAX_USERS (400)
- INVALID_MODULE_ID (400)

*Per dettagli completi (example request/response) di ogni errore, vedi documento ERROR_REFERENCE_MATRIX.md*

---

## 4. SEZIONE NUOVA – IDEMPOTENZA

### 4.1 Strategia C2 (verify-otp) – Check-before-create

Se C2 viene chiamato due volte con lo stesso OTP, il secondo tentativo ritorna HTTP 200 con gli stessi dati della licenza già creata (nessun duplicato).

```sql
SELECT * FROM licenses 
WHERE client_id = ? AND product_id = ? AND status = 'active'
```

Se licenza esiste, ritorna i dati. Se non esiste, crea e ritorna nuovi dati.

### 4.2 Strategia F4 (confirm) – Idempotent Update

```sql
UPDATE contratti SET vendor_synced = true 
WHERE id IN (1,2,3) AND vendor_synced = false
```

Se già marcate come true, nessun cambiamento. Risposta identica.

### 4.3 Strategia F5 (activate) – Idempotency-Key Header

**Header OBBLIGATORIO:** `Idempotency-Key: activate_order_12345_20260608`

Se vendor ritenta con stessa key, server ritorna la risposta salvata dalla prima chiamata senza creare duplicati.

Implementazione: Query in `idempotency_keys` per chiave + vendor_id. Se trovato, ritorna response salvato. Cache scade dopo 24 ore.

---

## 5. SEZIONE NUOVA – SICUREZZA TECNICA

### 5.1 JWT (JSON Web Tokens)

**Algoritmo:** RS256 (RSA Signature with SHA-256)

**TTL:**
- JWT Client: 60 secondi
- JWT Vendor: 60 secondi
- Refresh Token: 1 ora

**Payload JWT Client:**
```json
{
  "iss": "bk-service",
  "sub": "client_123",
  "aud": "bk-client-library",
  "exp": 1717941000,
  "iat": 1717940940,
  "jti": "jwt_token_id_xxx",
  "client_id": 123,
  "vat_number": "12345678901",
  "country": "IT",
  "product_key": "FATTURA-2026"
}
```

### 5.2 License Key – Generazione

**Algoritmo:** HMAC-SHA256

```
license_key = "lk_" + HMAC_SHA256(
  random_uuid + 
  timestamp_epoch +
  vat_number +
  country +
  product_key,
  server_secret_key
)
```

**Lunghezza:** 67 caratteri (3 prefix + 64 hash)

**Proprietà:**
- Univoco per cliente + prodotto
- Non predibile (dipende da random_uuid)
- Verificabile (HMAC)
- Non contiene dati sensibili in chiaro

### 5.3 OTP (One Time Password)

**Generazione:** 6 cifre numeriche (000000-999999)

**TTL:** 15 minuti

**Max tentativi falliti:** 3 (then blocco 30 minuti)

**Storage:** Hashato con SHA256 nel DB (non in chiaro)

### 5.4 API Key Vendor – Hashing e Storage

**Generazione:** UUID4 + random_32_hex_chars

```
api_key = "bk_" + UUID4() + "_" + random_32_hex()
Esempio: bk_550e8400-e29b-41d4-a716-446655440000_3f5c8a1b2c3d...
```

**Storage:** Hashato con bcrypt (rounds=12) in `vendors.api_key_hash`

```python
hashed = bcrypt.hashpw(api_key.encode(), bcrypt.gensalt(rounds=12))
```

### 5.5 Rate Limiting

**Tabella: `rate_limits` (NUOVO)**

| Endpoint | Limite | Finestra | Chiave |
|---|---|---|---|
| C1 (register) | 5 | 1 ora | IP source |
| C3 (resend-otp) | 3 | 1 ora | client_id |
| F1 (auth/login) | 10 | 1 ora | IP source |

**Soft block:** 30 minuti dopo raggiungimento limite.

**Response:** HTTP 429 Too Many Requests con header `Retry-After`

### 5.6 HTTPS/TLS

**Requisito:** Tutte le comunicazioni DEVONO essere HTTPS (TLS 1.2+)

**HSTS:** Abilitato (`Strict-Transport-Security: max-age=31536000`)

---

## 6. SEZIONE NUOVA – DESIGN API COMPLETATO

### 6.1 Response di C1 per client già registrato

Quando client chiama C1 con vat_number + product_key che esiste già:

```json
HTTP 201 Created

{
  "status": "already_registered",
  "message": "Cliente già registrato. Licenza attiva.",
  "license_key": "lk_6f8d3c1a2b9e4f5c...",
  "license_type": "trial",
  "license_status": "active",
  "expires_at": "2026-07-08T23:59:59Z",
  "action": "retrieve_existing_license"
}
```

### 6.2 Paginazione F3 (registrations/new)

**Query:** `GET /api/vendor/registrations/new?page=1&limit=50`

**Response:**
```json
{
  "registrations": [...],
  "pagination": {
    "total": 127,
    "page": 1,
    "limit": 50,
    "pages": 3,
    "has_more": true,
    "has_previous": false
  }
}
```

### 6.3 Response di C4 quando licenza appena scaduta

```json
HTTP 200 OK

{
  "license_key": "lk_...",
  "status": "expired",
  "expires_at": "2026-06-08T23:59:59Z",
  "just_expired": true,
  "offline_token": "eyJ...",
  "offline_token_expires_at": "2026-06-18T15:30:00Z"
}
```

**Nota:** `just_expired: true` indica che il cambio di stato è avvenuto in questa stessa chiamata.

---

## 7. SEZIONE NUOVA – NUOVI ENDPOINT

### 7.1 C7 – POST /api/client/change-email

**Uso:** Cliente cambia indirizzo email di contatto

**Request:**
```json
{
  "new_email": "newemail@acme.com"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Codice di verifica inviato al nuovo indirizzo",
  "new_email": "newemail@acme.com",
  "otp_expires_in_seconds": 900
}
```

**Flusso:**
1. Genera OTP e invia a new_email
2. Client verifica OTP con C7b (verify-email-change)
3. Aggiorna clients.contact_email

### 7.2 F9 – POST /api/vendor/auth/rotate-key

**Uso:** Vendor genera nuova API key e revoca la vecchia

**Request:**
```json
{
  "revoke_old_key": true
}
```

**Success Response (200 OK):**
```json
{
  "message": "Nuova API key generata",
  "new_api_key": "bk_550e8400-..._3f5c8a1b...",
  "warning": "Salva la nuova key. Non sarà più visibile.",
  "old_key_revoked_at": "2026-06-08T15:30:00Z"
}
```

**Flusso:**
1. Genera nuova API key
2. Hashata con bcrypt e salvata in DB
3. Invalida vecchia key
4. Ritorna nuova key UNA SOLA VOLTA

---

## 8. SEZIONE NUOVA – SCENARI EDGE-CASE

### 8.1 GET ALARM (O1) fallisce per 24 ore

**Scenario:** Client verifica OTP (C2), ma server non riesce a notificare ERP

**Azioni:**
- Licenza creata con vendor_synced = false
- O1 ritentato automaticamente ogni 15 minuti
- Max 3 tentativi
- Dopo max retry, email fallback inviata al fornitore

### 8.2 C2 fallimento parziale (O1 non termina)

**Scenario:** C2 crea licenza, ma O1 (GET ALARM) timeout

**Response al client:**
```json
HTTP 500 Internal Server Error

{
  "error_code": "GET_ALARM_FAILED",
  "message": "Licenza creata, ma notifica al fornitore fallita",
  "license_key": "lk_...",
  "jwt": "eyJ...",
  "jwt_expires_in_seconds": 60,
  "refresh_token": "rt_..."
}
```

**IMPORTANTE:** Anche se status è 500, client riceve JWT e license_key. Licenza è nel DB con vendor_synced = false. Client può salvare dati e procedere. Server ritenta O1 in background.

### 8.3 Passaggio Provisional → Standard

**Scenario:** Cliente ha licenza provvisoria (30 giorni), paga il rinnovo, vendor chiama F5 con standard (1 anno)

**Logica F5:**
1. Disattiva vecchia: contratti.status = expired
2. Crea nuova: license_type = standard
3. Genera nuovo offline_token
4. Ritorna HTTP 201 Created

**Bonus:** F5 è idempotente, quindi se vendor ritenta → STESSA risposta, zero duplicati.

### 8.4 Timeout F5 + Idempotency Recovery

**Scenario:** Vendor chiama F5, licenza creata, ma risposta timeout

**Tentativo 1:**
- POST con Idempotency-Key: "activate_order_12345_20260608"
- Licenza creata ✅
- Response salvata in idempotency_keys ✅
- Ma timeout, client non riceve

**Tentativo 2** (vendor ritenta con STESSA key):
- Query idempotency_keys → trovato!
- Ritorna STESSA response (201 Created)
- Zero duplicati

### 8.5 Cliente offline > 7 giorni

**Scenario:** Client non fa C4 da 7 giorni (offline, vacanza, app non usato)

**Azioni:**
- T7: Monitoraggio inattività (C5) scatta → Email al fornitore
- T10: offline_token scade (T0 + license_check_frequency_days)

**Domanda aperta (team decision):**
- Mode 1: Blocco immediato → App non funziona offline
- Mode 2: Modalità di grazia 3 giorni → App continua con avviso
- Mode 3: Downgrade funzioni → Solo moduli essenziali

---

## 9. Riepilogo endpoint

### Endpoint Client (C)

| Codice | Metodo | Path | Descrizione | Status |
|---|---|---|---|---|
| C1 | POST | `/api/client/register` | Registrazione cliente | ✅ |
| C2 | POST | `/api/client/verify-otp` | Verifica OTP e attivazione trial | ✅ |
| C3 | POST | `/api/client/resend-otp` | Nuovo OTP | ✅ |
| C4 | GET | `/api/client/license/status` | Verifica stato licenza | ✅ |
| C5 | GET | `/api/client/messages` | Poll messaggi in-app | ✅ |
| C6 | POST | `/api/client/token/refresh` | Rinnovo token cliente | ✅ |
| C7 | POST | `/api/client/change-email` | Cambio email cliente | 🆕 NUOVO |

### Endpoint Fornitore (F)

| Codice | Metodo | Path | Descrizione | Status |
|---|---|---|---|---|
| F1 | POST | `/api/vendor/auth/login` | Autenticazione fornitore | ✅ |
| F2 | POST | `/api/vendor/token/refresh` | Rinnovo token fornitore | ✅ |
| F3 | GET | `/api/vendor/registrations/new` | Recupero nuove iscrizioni | ✅ |
| F4 | POST | `/api/vendor/registrations/confirm` | Conferma iscrizioni | ✅ |
| F5 | POST | `/api/vendor/license/activate` | Attivazione licenza a pagamento | ✅ |
| F6 | POST | `/api/vendor/products` | Registrazione nuovo prodotto | ✅ |
| F9 | POST | `/api/vendor/auth/rotate-key` | Rotation API key vendor | 🆕 NUOVO |

### Endpoint uscente (O)

| Codice | Metodo | Path | Descrizione |
|---|---|---|---|
| O1 | GET | `{vendor_erp_url}/alarm` | GET ALARM verso ERP fornitore |

---

## 10. Riepilogo tabelle DB

| Tabella | Scopo | Status |
|---|---|---|
| `vendors` | Anagrafica fornitori | ✅ Aggiornata |
| `vendor_tokens` | Refresh token fornitore | ✅ |
| `products` | Catalogo prodotti | ✅ |
| `clients` | Anagrafica clienti | ✅ |
| `otp_codes` | Codici OTP | ✅ |
| `otp_attempts` | Traccia tentativi OTP | 🆕 NUOVO |
| `licenses` | Licenze attive/storiche | ✅ |
| `client_tokens` | Refresh token cliente | ✅ |
| `modules` | Catalogo moduli | ✅ |
| `license_modules` | Associazione moduli-licenze | ✅ |
| `messages` | Messaggi email/in-app | ✅ |
| `client_activity_logs` | Monitoraggio attività | ✅ |
| `alarm_logs` | Log GET ALARM | ✅ Aggiornata |
| `rate_limits` | Traccia rate limiting | 🆕 NUOVO |
| `idempotency_keys` | Cache risposte F5 | 🆕 NUOVO |

---

## 11. Domande aperte (priorità bassa)

- Quale provider email usare (SendGrid, Mailgun, ecc.)?
- Quale servizio esterno per validazione P.IVA (VIES per EU)?
- Pannello di amministrazione per il Service Invoice: sì o no?
- Offline expiry behavior: blocco immediato vs grazia 3 giorni?

---

**Documento v2 Aggiornata — 08/06/2026**  
**Mantiene v2 originale + sezioni 3-8 (Error Handling, Idempotenza, Sicurezza, Design API, Nuovi Endpoint, Edge Cases)**  
**Pronto per presentazione e implementazione**
