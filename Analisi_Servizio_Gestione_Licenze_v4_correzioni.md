# Analisi – Servizio Gestione Licenze v4 (Correzioni)

> **Changelog rispetto a v3:**
> - Aggiunto Error Handling standardizzato (Sezione 6) con codici errore per ogni endpoint
> - Aggiunta Idempotenza (Sezione 7): C2, F4, F5 sono idempotenti con strategie esplicite
> - Aggiunta Sicurezza Tecnica (Sezione 8): algoritmi JWT, generazione license_key, OTP, rate limiting
> - Completato Design API (Sezione 9): HTTP status codes, response body esatti, paginazione
> - Aggiunti 2 endpoint nuovi: C7 (cambio email), F9 (rotation API key)
> - Aggiunti scenari edge-case (Sezione 11): timeout O1, fallimento parziale C2, trial→monthly/annual

---

## ⚠️ NOTE PRELIMINARI

Il presente documento **estende v3 preservando tutto il contenuto**. Le sezioni 1-5 rimangono invariate. Le sezioni 6-11 sono completamente nuove. Tutti gli endpoint hanno ora:
- ✅ HTTP status code esatto per successo e errori
- ✅ Formato request/response esplicito con esempi
- ✅ Codici errore standardizzati
- ✅ Indicazioni su idempotenza, timeout, rate limiting

---

# PARTE 1: Contenuto da v3 (integrale — dal changelog alla sezione 5)

[Vedi documento v3 per sezioni 1-5: Panoramica generale, Configurazione fornitore, Registrazione cliente, Funzionamento ordinario, Sincronizzazione, Attivazione licenza a pagamento, Tipi di licenza, Avvisi di scadenza, Raccolta dati fatturazione, Revoca licenza, Validazione offline, Template email, Caso ri-registrazione, Monitoraggio inattività, Riapertura applicazione, Riepilogo endpoint, Riepilogo tabelle DB, Domande aperte]

---

# SEZIONE 6: ERROR HANDLING & CODICI ERRORE

## 6.1 Formato standardizzato risposta errore

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

**Campi:**
- `error_code` — sempre presente, maiuscolo, costante per il client
- `message` — descrizione user-friendly, localizzata secondo header `Accept-Language`
- `details` — opzionale, più informazioni specifiche per l'errore
- `timestamp` — ISO 8601 per debug
- `request_id` — UUID generato dal server per ogni richiesta, usato per tracciamento log

### Esempio errore con details:
```json
HTTP 400 Bad Request

{
  "error_code": "INVALID_VAT_FORMAT",
  "message": "Il formato della P.IVA non è valido per il paese IT",
  "details": {
    "field": "vat_number",
    "constraint": "must_be_11_digits_for_country_IT",
    "provided_value": "123456789",
    "expected_format": "11 numeric digits"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 6.2 Errori per endpoint C1 – POST /api/client/register

### Success: HTTP 201 Created
```json
{
  "status": "pending",
  "message": "Registrazione ricevuta. Controlla la tua email per il codice OTP.",
  "otp_expires_in_seconds": 900,
  "company_name": "Acme Corp"
}
```

### Errori possibili

#### C1.1 – PRODUCT_KEY_NOT_FOUND (HTTP 404)
**Quando:** La `product_key` inviata non esiste nella tabella `products`

**Request:**
```json
POST /api/client/register
{
  "product_key": "FATTURA-NONEXISTENT",
  "vat_number": "12345678901",
  "country": "IT",
  "company_name": "Acme Corp",
  "contact_email": "info@acme.com",
  "language": "it"
}
```

**Response:**
```json
HTTP 404 Not Found

{
  "error_code": "PRODUCT_KEY_NOT_FOUND",
  "message": "Il prodotto con chiave FATTURA-NONEXISTENT non è disponibile",
  "details": {
    "field": "product_key",
    "provided_key": "FATTURA-NONEXISTENT"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C1.2 – INVALID_VAT_FORMAT (HTTP 400)
**Quando:** Format P.IVA non è valido per il paese specificato

**Validation rules:**
- IT (Italia): esattamente 11 cifre numeriche
- DE, FR, ES, ecc.: secondo standard VIES
- Paesi non EU: formato libero (1-30 caratteri alfanumerici)

**Response:**
```json
HTTP 400 Bad Request

{
  "error_code": "INVALID_VAT_FORMAT",
  "message": "La P.IVA fornita non è valida per il paese IT",
  "details": {
    "field": "vat_number",
    "provided_value": "123456789",
    "country": "IT",
    "constraint": "must_be_11_digits_for_IT"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C1.3 – INVALID_EMAIL_FORMAT (HTTP 400)
**Quando:** Email non è un indirizzo valido

**Response:**
```json
HTTP 400 Bad Request

{
  "error_code": "INVALID_EMAIL_FORMAT",
  "message": "L'indirizzo email fornito non è valido",
  "details": {
    "field": "contact_email",
    "provided_value": "notanemail"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C1.4 – INVALID_LANGUAGE (HTTP 400)
**Quando:** `language` non è `it` o `en`

**Response:**
```json
HTTP 400 Bad Request

{
  "error_code": "INVALID_LANGUAGE",
  "message": "Lingua non supportata. Lingue supportate: it, en",
  "details": {
    "field": "language",
    "provided_value": "fr",
    "allowed_values": ["it", "en"]
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C1.5 – INVALID_COUNTRY_CODE (HTTP 400)
**Quando:** `country` non è un codice ISO 2-lettere valido

**Response:**
```json
HTTP 400 Bad Request

{
  "error_code": "INVALID_COUNTRY_CODE",
  "message": "Il codice paese fornito non è valido",
  "details": {
    "field": "country",
    "provided_value": "XX",
    "constraint": "must_be_valid_ISO_2_letter_code"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C1.6 – MISSING_REQUIRED_FIELD (HTTP 400)
**Quando:** Un campo obbligatorio è assente

**Campi obbligatori:** `product_key`, `vat_number`, `country`, `company_name`, `contact_email`, `language`

**Response:**
```json
HTTP 400 Bad Request

{
  "error_code": "MISSING_REQUIRED_FIELD",
  "message": "Campo obbligatorio mancante",
  "details": {
    "field": "contact_email",
    "constraint": "required"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C1.7 – CLIENT_ALREADY_REGISTERED (HTTP 409)
**Quando:** La coppia `vat_number + country + product_key` è già registrata e ha una licenza attiva

**Request:**
```json
POST /api/client/register
{
  "product_key": "FATTURA-2026",
  "vat_number": "12345678901",
  "country": "IT",
  "company_name": "Acme Corp",
  "contact_email": "info@acme.com",
  "language": "it"
}
```
(Stesso client registrato due volte)

**Response:**
```json
HTTP 409 Conflict

{
  "error_code": "CLIENT_ALREADY_REGISTERED",
  "message": "Questo cliente è già registrato per questo prodotto",
  "details": {
    "vat_number": "12345678901",
    "country": "IT",
    "product_key": "FATTURA-2026",
    "existing_license_key": "lk_6f8d3c1a2b9e4f5c...",
    "existing_license_status": "active",
    "existing_license_expires_at": "2026-07-07T23:59:59Z"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Nota:** In questo caso, il client dovrebbe riprovare C1 per ottenere i dati della licenza esistente (vedi sezione 2.14 v3), oppure contattare il produttore.

#### C1.8 – RATE_LIMIT_EXCEEDED (HTTP 429)
**Quando:** Troppi tentativi di registrazione dallo stesso IP in breve tempo

**Limite:** Max 5 registrazioni per IP per ora

**Response:**
```json
HTTP 429 Too Many Requests

{
  "error_code": "RATE_LIMIT_EXCEEDED",
  "message": "Troppi tentativi di registrazione. Riprova tra qualche minuto.",
  "details": {
    "constraint": "max_5_registrations_per_ip_per_hour",
    "retry_after_seconds": 1800
  },
  "retry_after_seconds": 1800,
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C1.9 – EMAIL_SEND_FAILED (HTTP 500)
**Quando:** Errore nel servizio email esterno durante invio OTP

**Response:**
```json
HTTP 500 Internal Server Error

{
  "error_code": "EMAIL_SEND_FAILED",
  "message": "Impossibile inviare l'email di verifica. Contatta il supporto.",
  "details": {
    "field": "contact_email",
    "email_address": "info@acme.com",
    "service": "SendGrid"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Azione server:** Email viene messa in coda di retry. Se fallisce per 3 volte, viene notificato il team di supporto.

#### C1.10 – INTERNAL_SERVER_ERROR (HTTP 500)
**Quando:** Errore generico non previsto

**Response:**
```json
HTTP 500 Internal Server Error

{
  "error_code": "INTERNAL_SERVER_ERROR",
  "message": "Si è verificato un errore interno. Contatta il supporto con il request_id.",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-06-08T15:30:00Z"
}
```

---

## 6.3 Errori per endpoint C2 – POST /api/client/verify-otp

### Success: HTTP 200 OK
```json
{
  "status": "active",
  "license_key": "lk_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h",
  "license_type": "trial",
  "license_status": "active",
  "expires_at": "2026-07-08T23:59:59Z",
  "jwt": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "jwt_expires_in_seconds": 60,
  "refresh_token": "rt_c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1",
  "refresh_token_expires_in_seconds": 3600,
  "offline_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "offline_token_expires_at": "2026-06-18T15:30:00Z"
}
```

### Errori possibili

#### C2.1 – INVALID_OTP_CODE (HTTP 400)
**Quando:** Il codice OTP fornito non corrisponde a quello generato

**Request:**
```json
POST /api/client/verify-otp
{
  "vat_number": "12345678901",
  "country": "IT",
  "product_key": "FATTURA-2026",
  "otp_code": "999999"
}
```

**Response:**
```json
HTTP 400 Bad Request

{
  "error_code": "INVALID_OTP_CODE",
  "message": "Il codice OTP fornito non è corretto",
  "details": {
    "field": "otp_code",
    "attempts_remaining": 2,
    "max_attempts": 3
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C2.2 – OTP_CODE_EXPIRED (HTTP 400)
**Quando:** Il codice OTP è scaduto (> 15 minuti)

**Response:**
```json
HTTP 400 Bad Request

{
  "error_code": "OTP_CODE_EXPIRED",
  "message": "Il codice OTP è scaduto. Richiedi un nuovo codice.",
  "details": {
    "field": "otp_code",
    "expired_at": "2026-06-08T15:45:00Z"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C2.3 – OTP_MAX_ATTEMPTS_EXCEEDED (HTTP 429)
**Quando:** Sono stati superati 3 tentativi falliti

**Response:**
```json
HTTP 429 Too Many Requests

{
  "error_code": "OTP_MAX_ATTEMPTS_EXCEEDED",
  "message": "Troppi tentativi falliti. Richiedi un nuovo OTP per continuare.",
  "details": {
    "field": "otp_code",
    "max_attempts": 3,
    "lockout_expires_at": "2026-06-08T16:00:00Z"
  },
  "retry_after_seconds": 1800,
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Nota:** Il client è bloccato per 30 minuti. Dopo quel tempo, deve richiedere un nuovo OTP tramite C3.

#### C2.4 – CLIENT_NOT_FOUND (HTTP 404)
**Quando:** Nessun cliente pending con quella coppia `vat_number + country + product_key`

**Response:**
```json
HTTP 404 Not Found

{
  "error_code": "CLIENT_NOT_FOUND",
  "message": "Nessun cliente in attesa di verifica trovato per questi dati",
  "details": {
    "vat_number": "12345678901",
    "country": "IT",
    "product_key": "FATTURA-2026"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C2.5 – DATABASE_TRANSACTION_FAILED (HTTP 500)
**Quando:** Errore nella creazione della licenza, token, o offline_token

**Response:**
```json
HTTP 500 Internal Server Error

{
  "error_code": "DATABASE_TRANSACTION_FAILED",
  "message": "Errore nel salvataggio della licenza. Contatta il supporto.",
  "details": {
    "phase": "creating_license",
    "operation": "licenses_insert"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Azione server:** 
- La transazione DB è completamente rollback
- Nessuna licenza, token, offline_token vengono creati
- Il cliente rimane nello stato `pending` con l'OTP ancora valido
- Il client può ritentare C2

#### C2.6 – GET_ALARM_FAILED (HTTP 500)
**Quando:** C2 è riuscita, licenza creata, ma GET ALARM (O1) verso ERP del fornitore fallisce

**Response:**
```json
HTTP 500 Internal Server Error

{
  "error_code": "GET_ALARM_FAILED",
  "message": "Licenza creata, ma notifica al fornitore non è riuscita. Contatta il supporto.",
  "details": {
    "phase": "sending_alarm_to_erp",
    "alarm_code": "NEW_REGISTRATION",
    "erp_status_code": null,
    "error": "connection_timeout"
  },
  "license_key": "lk_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h",
  "jwt": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "jwt_expires_in_seconds": 60,
  "refresh_token": "rt_c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1",
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Importante:** Anche se O1 fallisce, C2 ritorna HTTP 500 **ma la licenza è già stata creata** con `vendor_synced = false`. Il client riceve comunque JWT e license_key e può continuare. Il servizio ritenterà O1 separatamente (vedi sezione 11.2).

---

## 6.4 Errori per endpoint C3 – POST /api/client/resend-otp

### Success: HTTP 200 OK
```json
{
  "message": "Nuovo codice OTP inviato a info@acme.com",
  "otp_expires_in_seconds": 900
}
```

### Errori possibili

#### C3.1 – CLIENT_NOT_FOUND (HTTP 404)
**Quando:** Nessun cliente pending con quella `email`

**Response:**
```json
HTTP 404 Not Found

{
  "error_code": "CLIENT_NOT_FOUND",
  "message": "Nessun cliente in attesa di verifica trovato per questo indirizzo email",
  "details": {
    "field": "contact_email",
    "provided_email": "info@acme.com"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C3.2 – RATE_LIMIT_EXCEEDED (HTTP 429)
**Quando:** Troppi resend OTP dallo stesso client

**Limite:** Max 3 resend per client per ora

**Response:**
```json
HTTP 429 Too Many Requests

{
  "error_code": "RATE_LIMIT_EXCEEDED",
  "message": "Troppi tentativi di reinvio. Riprova tra 20 minuti.",
  "details": {
    "constraint": "max_3_resends_per_client_per_hour",
    "last_request_at": "2026-06-08T15:25:00Z"
  },
  "retry_after_seconds": 1200,
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C3.3 – EMAIL_SEND_FAILED (HTTP 500)
**Quando:** Impossibile inviare l'email con il nuovo OTP

**Response:**
```json
HTTP 500 Internal Server Error

{
  "error_code": "EMAIL_SEND_FAILED",
  "message": "Impossibile inviare il nuovo codice OTP. Contatta il supporto.",
  "details": {
    "field": "contact_email",
    "email_address": "info@acme.com",
    "service": "SendGrid"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 6.5 Errori per endpoint C4 – GET /api/client/license/status

### Success: HTTP 200 OK
```json
{
  "license_key": "lk_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h",
  "license_type": "trial",
  "status": "active",
  "expires_at": "2026-07-08T23:59:59Z",
  "max_users": null,
  "modules": [
    {
      "id": 1,
      "name": "modulo_contabilita",
      "description": "Gestione contabilità"
    },
    {
      "id": 2,
      "name": "modulo_fatturazione",
      "description": "Gestione fatture"
    }
  ],
  "just_expired": false,
  "offline_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "offline_token_expires_at": "2026-06-18T15:30:00Z",
  "jwt": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "jwt_expires_in_seconds": 60,
  "refresh_token": "rt_c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1"
}
```

**Nota:** `just_expired: true` se il servizio ha appena aggiornato lo status da `active` a `expired` in questa chiamata.

### Errori possibili

#### C4.1 – INVALID_JWT (HTTP 401)
**Quando:** JWT non è fornito, è scaduto, o non è valido

**Response:**
```json
HTTP 401 Unauthorized

{
  "error_code": "INVALID_JWT",
  "message": "Token di autenticazione non valido o scaduto. Aggiorna il token.",
  "details": {
    "field": "Authorization",
    "reason": "token_expired"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Azione client:** Deve chiamare C6 (refresh token) per ottenere un nuovo JWT.

#### C4.2 – INVALID_LICENSE_KEY (HTTP 401)
**Quando:** `x-license-key` header non è fornito o non è valido

**Response:**
```json
HTTP 401 Unauthorized

{
  "error_code": "INVALID_LICENSE_KEY",
  "message": "License key non valida o mancante",
  "details": {
    "field": "x-license-key",
    "reason": "missing_or_invalid"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C4.3 – LICENSE_NOT_FOUND (HTTP 404)
**Quando:** License key fornita non esiste nel DB

**Response:**
```json
HTTP 404 Not Found

{
  "error_code": "LICENSE_NOT_FOUND",
  "message": "La licenza non è stata trovata",
  "details": {
    "license_key": "lk_invalid_key_xxx"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C4.4 – JWT_LICENSE_KEY_MISMATCH (HTTP 403)
**Quando:** JWT appartiene a un cliente diverso dalla license_key fornita

**Response:**
```json
HTTP 403 Forbidden

{
  "error_code": "JWT_LICENSE_KEY_MISMATCH",
  "message": "Il token di autenticazione non corrisponde alla license key fornita",
  "details": {
    "jwt_client_id": 123,
    "license_key_client_id": 456
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 6.6 Errori per endpoint C5 – GET /api/client/messages

### Success: HTTP 200 OK
```json
{
  "messages": [
    {
      "id": 1,
      "type": "banner",
      "title": "Licenza in scadenza",
      "body": "La tua licenza scadrà tra 7 giorni. Procedi con il rinnovo.",
      "cta_url": "https://shop.acme.com/renew?license_key=lk_..."
    },
    {
      "id": 2,
      "type": "info",
      "title": "Aggiornamento disponibile",
      "body": "È disponibile una nuova versione del software.",
      "cta_url": null
    }
  ],
  "count": 2
}
```

**Comportamento:** Il servizio marca automaticamente tutti i messaggi come `delivered_at = now` dopo questa risposta.

### Errori possibili

#### C5.1 – INVALID_JWT (HTTP 401)
**Come C4.1**

#### C5.2 – INVALID_LICENSE_KEY (HTTP 401)
**Come C4.2**

#### C5.3 – LICENSE_NOT_FOUND (HTTP 404)
**Come C4.3**

---

## 6.7 Errori per endpoint C6 – POST /api/client/token/refresh

### Success: HTTP 200 OK
```json
{
  "jwt": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "jwt_expires_in_seconds": 60,
  "refresh_token": "rt_new_c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1",
  "refresh_token_expires_in_seconds": 3600
}
```

### Errori possibili

#### C6.1 – INVALID_REFRESH_TOKEN (HTTP 401)
**Quando:** Refresh token non è fornito, è scaduto, o è stato revocato

**Response:**
```json
HTTP 401 Unauthorized

{
  "error_code": "INVALID_REFRESH_TOKEN",
  "message": "Refresh token non valido o scaduto. Effettua una nuova registrazione.",
  "details": {
    "field": "refresh_token",
    "reason": "expired_or_revoked"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C6.2 – CLIENT_NOT_FOUND (HTTP 404)
**Quando:** Il client associato al refresh token non esiste

**Response:**
```json
HTTP 404 Not Found

{
  "error_code": "CLIENT_NOT_FOUND",
  "message": "Cliente non trovato",
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 6.8 Errori per endpoint F1 – POST /api/vendor/auth/login

### Success: HTTP 200 OK
```json
{
  "jwt": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "jwt_expires_in_seconds": 60,
  "refresh_token": "rt_vendor_c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1",
  "refresh_token_expires_in_seconds": 3600,
  "vendor_id": 5,
  "vendor_name": "Acme Software"
}
```

### Errori possibili

#### F1.1 – INVALID_API_KEY (HTTP 401)
**Quando:** API key non è fornita o non è corretta

**Request:**
```bash
curl -X POST https://api.bk-service.com/api/vendor/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "api_key": "invalid_key_xxx" }'
```

**Response:**
```json
HTTP 401 Unauthorized

{
  "error_code": "INVALID_API_KEY",
  "message": "API key non valida",
  "details": {
    "field": "api_key",
    "reason": "not_found_or_incorrect"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### F1.2 – VENDOR_DISABLED (HTTP 403)
**Quando:** Il vendor è stato disabilitato (soft-delete, account sospeso, ecc.)

**Response:**
```json
HTTP 403 Forbidden

{
  "error_code": "VENDOR_DISABLED",
  "message": "Il tuo account fornitore è stato disabilitato. Contatta il supporto.",
  "details": {
    "reason": "account_suspended"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 6.9 Errori per endpoint F2 – POST /api/vendor/token/refresh

### Success: HTTP 200 OK
```json
{
  "jwt": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "jwt_expires_in_seconds": 60,
  "refresh_token": "rt_vendor_new_c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1",
  "refresh_token_expires_in_seconds": 3600
}
```

### Errori possibili

#### F2.1 – INVALID_REFRESH_TOKEN (HTTP 401)
**Quando:** Refresh token non è valido, scaduto, o revocato

**Response:**
```json
HTTP 401 Unauthorized

{
  "error_code": "INVALID_REFRESH_TOKEN",
  "message": "Refresh token non valido o scaduto. Effettua un nuovo login.",
  "details": {
    "field": "refresh_token",
    "reason": "expired_or_revoked"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### F2.2 – VENDOR_NOT_FOUND (HTTP 404)
**Quando:** Il vendor associato al refresh token non esiste

---

## 6.10 Errori per endpoint F3 – GET /api/vendor/registrations/new

### Success: HTTP 200 OK
```json
{
  "registrations": [
    {
      "id": 1,
      "client_id": 123,
      "product_id": 5,
      "product_key": "FATTURA-2026",
      "vat_number": "12345678901",
      "country": "IT",
      "company_name": "Acme Corp",
      "contact_email": "info@acme.com",
      "language": "it",
      "contact_phone": "+39 06 1234567",
      "referent_name": "Mario Rossi",
      "license_key": "lk_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h",
      "license_type": "trial",
      "license_status": "active",
      "license_expires_at": "2026-07-08T23:59:59Z",
      "created_at": "2026-06-08T14:30:00Z",
      "activated_at": "2026-06-08T14:35:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50,
  "has_more": false
}
```

**Paginazione:** Parametri query `?page=1&limit=50` (default). `limit` max 100.

### Errori possibili

#### F3.1 – INVALID_JWT (HTTP 401)
**Quando:** JWT vendor non è fornito o non è valido

#### F3.2 – INVALID_PAGE_PARAMETER (HTTP 400)
**Quando:** `page` o `limit` non sono numeri interi positivi

**Response:**
```json
HTTP 400 Bad Request

{
  "error_code": "INVALID_PAGE_PARAMETER",
  "message": "I parametri di paginazione non sono validi",
  "details": {
    "field": "page",
    "provided_value": "abc",
    "constraint": "must_be_positive_integer"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 6.11 Errori per endpoint F4 – POST /api/vendor/registrations/confirm

### Success: HTTP 200 OK
```json
{
  "confirmed_count": 1,
  "message": "Iscrizioni confermate con successo"
}
```

### Errori possibili

#### F4.1 – INVALID_JWT (HTTP 401)

#### F4.2 – REGISTRATION_NOT_FOUND (HTTP 404)
**Quando:** Uno degli ID nella lista non esiste o non appartiene a questo vendor

**Response:**
```json
HTTP 404 Not Found

{
  "error_code": "REGISTRATION_NOT_FOUND",
  "message": "Alcune iscrizioni non sono state trovate",
  "details": {
    "invalid_ids": [5, 10]
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 6.12 Errori per endpoint F5 – POST /api/vendor/license/activate

### Success: HTTP 201 Created
```json
{
  "license_key": "lk_new_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h",
  "license_type": "annual",
  "status": "active",
  "starts_at": "2026-06-08T23:59:59Z",
  "expires_at": "2027-06-08T23:59:59Z",
  "max_users": 10,
  "modules": [1, 2, 3],
  "offline_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "previous_license_key": "lk_old_xxx",
  "message": "Licenza attivata con successo"
}
```

### Errori possibili

#### F5.1 – INVALID_JWT (HTTP 401)

#### F5.2 – IDEMPOTENCY_KEY_REQUIRED (HTTP 400)
**Quando:** F5 non include l'header `Idempotency-Key`

**Response:**
```json
HTTP 400 Bad Request

{
  "error_code": "IDEMPOTENCY_KEY_REQUIRED",
  "message": "Header Idempotency-Key è obbligatorio per questa operazione",
  "details": {
    "field": "Idempotency-Key",
    "constraint": "required"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### F5.3 – CLIENT_NOT_FOUND (HTTP 404)
**Quando:** Nessun cliente con `vat_number + country + product_key` trovato

**Response:**
```json
HTTP 404 Not Found

{
  "error_code": "CLIENT_NOT_FOUND",
  "message": "Cliente non trovato con i dati forniti",
  "details": {
    "vat_number": "12345678901",
    "country": "IT",
    "product_key": "FATTURA-2026"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### F5.4 – INVALID_DATE_RANGE (HTTP 400)
**Quando:** `expires_at` è prima di `starts_at`

**Response:**
```json
HTTP 400 Bad Request

{
  "error_code": "INVALID_DATE_RANGE",
  "message": "La data di scadenza non può essere prima della data di inizio",
  "details": {
    "field": "expires_at",
    "starts_at": "2026-06-08T23:59:59Z",
    "expires_at": "2026-05-08T23:59:59Z"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### F5.5 – INVALID_MAX_USERS (HTTP 400)
**Quando:** `max_users` è negativo o zero

**Response:**
```json
HTTP 400 Bad Request

{
  "error_code": "INVALID_MAX_USERS",
  "message": "Il numero massimo di utenti deve essere positivo",
  "details": {
    "field": "max_users",
    "provided_value": -5,
    "constraint": "must_be_positive"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### F5.6 – INVALID_MODULE_ID (HTTP 400)
**Quando:** Uno dei `module_id` forniti non esiste

**Response:**
```json
HTTP 400 Bad Request

{
  "error_code": "INVALID_MODULE_ID",
  "message": "Uno o più moduli non sono validi",
  "details": {
    "field": "modules",
    "invalid_ids": [999, 1000]
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 6.13 Errori per endpoint F6 – POST /api/vendor/products

### Success: HTTP 201 Created
```json
{
  "product_id": 5,
  "product_key": "FATTURA-2026",
  "name": "Fattura Elettronica 2026",
  "trial_duration_days": 30,
  "trial_max_users": null,
  "license_check_frequency_days": 10,
  "created_at": "2026-06-08T15:30:00Z"
}
```

### Errori possibili

#### F6.1 – INVALID_JWT (HTTP 401)

#### F6.2 – PRODUCT_KEY_ALREADY_EXISTS (HTTP 409)
**Quando:** La `product_key` è già registrata

**Response:**
```json
HTTP 409 Conflict

{
  "error_code": "PRODUCT_KEY_ALREADY_EXISTS",
  "message": "Una chiave di prodotto con questo valore esiste già",
  "details": {
    "field": "product_key",
    "provided_value": "FATTURA-2026"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### F6.3 – INVALID_TRIAL_DURATION (HTTP 400)
**Quando:** `trial_duration_days` è <= 0

---

## 6.14 Errori per endpoint F7 – POST /api/vendor/client/billing

### Success: HTTP 200 OK
```json
{
  "client_id": 123,
  "pec": "info@pec.acme.com",
  "sdi_code": "AXAXAX",
  "billing_address": "Via Roma 1, 00100 Roma RM",
  "billing_country": "IT",
  "updated_at": "2026-06-08T15:30:00Z"
}
```

### Errori possibili

#### F7.1 – INVALID_JWT (HTTP 401)

#### F7.2 – CLIENT_NOT_FOUND (HTTP 404)

#### F7.3 – INVALID_PEC_FORMAT (HTTP 400)
**Quando:** PEC non è un indirizzo email valido

---

## 6.15 Errori per endpoint F8 – POST /api/vendor/license/revoke

### Success: HTTP 200 OK
```json
{
  "license_key": "lk_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h",
  "status": "revoked",
  "revoked_at": "2026-06-08T15:30:00Z",
  "message": "Licenza revocata con successo"
}
```

### Errori possibili

#### F8.1 – INVALID_JWT (HTTP 401)

#### F8.2 – LICENSE_NOT_FOUND (HTTP 404)

#### F8.3 – LICENSE_ALREADY_EXPIRED (HTTP 409)
**Quando:** La licenza è già `expired` o `revoked`

**Response:**
```json
HTTP 409 Conflict

{
  "error_code": "LICENSE_ALREADY_EXPIRED",
  "message": "La licenza non è attiva e non può essere revocata",
  "details": {
    "license_key": "lk_xxx",
    "current_status": "expired"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

# SEZIONE 7: IDEMPOTENZA

## 7.1 Concetto generale

L'idempotenza garantisce che se un'operazione viene ripetuta più volte con gli stessi parametri, il risultato finale è lo stesso. Crittico per operazioni sensibili quando il client non sa se la prima richiesta è arrivata al server.

**Principio:** Una richiesta idempotente chiamata N volte produce lo stesso effetto di una singola chiamata.

---

## 7.2 Idempotenza per endpoint C2 (verify-otp)

**Status:** ✅ **Idempotente**

### Scenario: Client chiama C2 due volte con lo stesso OTP
```
Primo tentativo:
POST /api/client/verify-otp
{
  "vat_number": "12345678901",
  "country": "IT",
  "product_key": "FATTURA-2026",
  "otp_code": "123456"
}

Risposta: HTTP 200 OK (licenza creata)

Secondo tentativo (rete instabile, client ritenta):
POST /api/client/verify-otp
{
  "vat_number": "12345678901",
  "country": "IT",
  "product_key": "FATTURA-2026",
  "otp_code": "123456"
}

Risposta: HTTP 200 OK (STESSI DATI della licenza, nessun duplicato)
```

### Implementazione lato server

```sql
-- Verificare se esiste già una licenza attiva per questo cliente
SELECT * FROM licenses 
WHERE client_id = ? 
  AND product_id = ? 
  AND status = 'active' 
  AND deactivated_at IS NULL;

-- Se esiste, ritornare i dati senza ricerare
-- Se non esiste, procedere con creazione transazionale
```

**Garanzie:**
- Se C2 è già stata processata, la licenza esiste già con `vendor_synced = false` (se O1 ha fallito) o `vendor_synced = true` (se O1 ha successo)
- Il secondo tentativo ritorna la stessa licenza_key, JWT, offline_token
- Nessun duplicato di licenza, JWT, refresh_token

---

## 7.3 Idempotenza per endpoint F4 (registrations/confirm)

**Status:** ✅ **Idempotente**

### Scenario: Vendor chiama F4 due volte con gli stessi ID
```
Primo tentativo:
POST /api/vendor/registrations/confirm
{
  "registration_ids": [1, 2, 3]
}

Risposta: HTTP 200 OK
{
  "confirmed_count": 3,
  "message": "Iscrizioni confermate"
}

Secondo tentativo (timeout, vendor ritenta):
POST /api/vendor/registrations/confirm
{
  "registration_ids": [1, 2, 3]
}

Risposta: HTTP 200 OK
{
  "confirmed_count": 3,
  "message": "Iscrizioni confermate"
}
```

### Implementazione lato server

```sql
-- Aggiornare solo i record che non sono già confermati
UPDATE licenses 
SET vendor_synced = true 
WHERE id IN (1, 2, 3) 
  AND vendor_synced = false;

-- Ritornare il numero di righe aggiornate (0 se già confermati)
```

**Garanzie:**
- Se i dati non sono già stati marcati come `vendor_synced = true`, li marca
- Se lo sono già, nessun cambiamento
- La risposta è identica in entrambi i casi

---

## 7.4 Idempotenza per endpoint F5 (license/activate)

**Status:** ✅ **Idempotente tramite Idempotency-Key**

### Scenario: Vendor attiva una licenza, ma non sa se è andata a buon fine

```
Primo tentativo:
POST /api/vendor/license/activate
Headers: {
  "Authorization": "Bearer jwt_vendor_xxx",
  "Idempotency-Key": "activate_order_12345_20260608"
}
Body: {
  "vat_number": "12345678901",
  "country": "IT",
  "product_key": "FATTURA-2026",
  "license_type": "annual",
  "starts_at": "2026-06-08T23:59:59Z",
  "expires_at": "2027-06-08T23:59:59Z",
  "max_users": 10,
  "modules": [1, 2, 3]
}

Risposta: HTTP 201 Created
{
  "license_key": "lk_new_12345...",
  "status": "active",
  "expires_at": "2027-06-08T23:59:59Z"
}

Secondo tentativo (timeout, vendor ritenta con STESSA Idempotency-Key):
POST /api/vendor/license/activate
Headers: {
  "Authorization": "Bearer jwt_vendor_xxx",
  "Idempotency-Key": "activate_order_12345_20260608"
}
Body: {
  "vat_number": "12345678901",
  "country": "IT",
  "product_key": "FATTURA-2026",
  "license_type": "annual",
  "starts_at": "2026-06-08T23:59:59Z",
  "expires_at": "2027-06-08T23:59:59Z",
  "max_users": 10,
  "modules": [1, 2, 3]
}

Risposta: HTTP 201 Created (STESSA risposta della prima, da cache)
{
  "license_key": "lk_new_12345...",
  "status": "active",
  "expires_at": "2027-06-08T23:59:59Z"
}
```

### Implementazione lato server

**Tabella: `idempotency_keys` (nuova)**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | PK |
| idempotency_key | VARCHAR(255) | La chiave fornita nel header |
| vendor_id | INT | FK a vendors |
| endpoint | VARCHAR(100) | L'endpoint (es. `POST /api/vendor/license/activate`) |
| request_hash | VARCHAR(64) | Hash SHA256 del corpo della richiesta |
| response_body | JSON | La risposta originale |
| response_status_code | INT | HTTP status della risposta |
| created_at | TIMESTAMP | Quando è stata registrata |
| expires_at | TIMESTAMP | Scadenza della cache (es. 24 ore) |

**Algoritmo:**

```
1. Client chiama F5 con Idempotency-Key: "activate_order_12345_20260608"
2. Server calcola request_hash = SHA256(corpo_richiesta)
3. Server query:
   SELECT response_body, response_status_code
   FROM idempotency_keys
   WHERE idempotency_key = "activate_order_12345_20260608"
     AND vendor_id = client_vendor_id
     AND endpoint = "POST /api/vendor/license/activate"
     AND expires_at > now()

4. Se trovato:
   - Ritorna response_body con status_code (201 Created)
   - Non esegue la logica di attivazione

5. Se non trovato:
   - Procedi con logica di attivazione (crea nuova licenza)
   - Salva response_body in idempotency_keys
   - Salva con expires_at = now + 24 ore

6. Ritorna response (201 Created)
```

**Garanzie:**
- Stessa Idempotency-Key + stesso corpo = stessa risposta, nessun duplicato
- Se vendor cambia i parametri, la Idempotency-Key deve essere diversa
- La cache scade dopo 24 ore (configurable)

---

## 7.5 Endpoint NON-idempotenti

| Endpoint | Idempotente | Motivo |
|---|---|---|
| C1 (register) | ❌ No | Genera nuovo OTP ogni volta se non ancora verificato |
| C3 (resend-otp) | ❌ No | Genera nuovo OTP e invia email ogni volta |
| C4 (license/status) | ✅ Sì | Read-only, nessun side effect |
| C5 (messages) | ✅ Sì | Read-only, mark delivered è idempotente |
| C6 (token/refresh) | ❌ No | Genera nuovo JWT ogni volta (refresh token rotation) |
| F1 (auth/login) | ❌ No | Genera nuovo JWT + refresh token ogni volta |
| F2 (token/refresh) | ❌ No | Genera nuovo JWT + refresh token ogni volta (rotation) |
| F3 (registrations/new) | ✅ Sì | Read-only |
| F6 (products) | ❌ No | Crea nuovo prodotto ogni volta |
| F7 (client/billing) | ✅ Sì | Upsert (sovrascrive) |
| F8 (license/revoke) | ✅ Sì | Idempotente: if already revoked, no-op |

---

# SEZIONE 8: SICUREZZA TECNICA

## 8.1 JWT (JSON Web Tokens)

### Algoritmo e Firma

**Standard:** RS256 (RSA Signature with SHA-256)

**Chiavi:**
- **Private key** — salvata nel server, usata per firmare i JWT
- **Public key** — disponibile per il client per verificare la firma (opzionale, il server verifica sempre)

**Generazione della firma:**
```
JWT = Base64(header) + "." + Base64(payload) + "." + Base64(signature)

Signature = HMAC_SHA256(
  Base64(header) + "." + Base64(payload),
  private_key
)
```

### TTL (Time To Live)

| Token | TTL | Motivo |
|---|---|---|
| JWT Client | 60 secondi | Corto per ridurre il danno se compromesso |
| JWT Vendor | 60 secondi | Come client |
| Refresh Token Client | 1 ora | Scade dopo 1 ora di inattività |
| Refresh Token Vendor | 1 ora | Come client |

### Payload JWT Client

```json
{
  "iss": "bk-service",
  "sub": "client_123",
  "aud": "bk-client-library",
  "exp": 1717941000,
  "iat": 1717940940,
  "nbf": 1717940940,
  "jti": "jwt_token_id_xxx",
  "client_id": 123,
  "vat_number": "12345678901",
  "country": "IT",
  "product_key": "FATTURA-2026"
}
```

**Campi:**
- `iss` — issuer (chi ha creato il token)
- `sub` — subject (chi è il proprietario)
- `aud` — audience (chi può usare il token)
- `exp` — expiration time (scadenza in epoch secondi)
- `iat` — issued at (quando è stato creato)
- `nbf` — not before (non valido prima di)
- `jti` — JWT ID (identificativo univoco per revoca)

### Payload JWT Vendor

```json
{
  "iss": "bk-service",
  "sub": "vendor_5",
  "aud": "bk-vendor-api",
  "exp": 1717941000,
  "iat": 1717940940,
  "nbf": 1717940940,
  "jti": "jwt_token_id_yyy",
  "vendor_id": 5,
  "vendor_name": "Acme Software"
}
```

### Validazione JWT

**Per ogni richiesta autenticata (C4, C5, C6, F2, F3, ecc.):**

```
1. Estrarre JWT dall'header Authorization: "Bearer <jwt>"
2. Decodificare senza verificare (ottenere payload)
3. Verificare che exp > now (non scaduto)
4. Verificare che nbf <= now (non è troppo futuro)
5. Verificare la firma usando la public key / private key del server
6. Se uno di questi fallisce → 401 Unauthorized (INVALID_JWT)
```

---

## 8.2 License Key – Generazione

**Algoritmo:** Combinazione di random, timestamp, e dati del cliente

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

**Lunghezza totale:** 67 caratteri (3 + 64)

**Esempio:**
```
lk_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3
```

**Proprietà:**
- ✅ Univoco per ogni cliente + prodotto
- ✅ Non predibile (dipende da random_uuid e timestamp)
- ✅ Verificabile (HMAC incorpora la firma)
- ✅ Non contiene dati sensibili in chiaro

---

## 8.3 OTP (One Time Password) – Generazione e Validazione

### Generazione

**Standard:** 6 cifre numeriche (000000-999999)

```python
import random

def generate_otp():
    return str(random.randint(0, 999999)).zfill(6)
    # Esempio output: "123456", "000123", "999999"
```

**TTL:** 15 minuti (900 secondi)

**Memorizzazione nel DB:**
```sql
INSERT INTO otp_codes (client_id, code, expires_at)
VALUES (123, SHA256("123456"), NOW() + INTERVAL 15 MINUTE)
```

**Nota:** L'OTP viene hashato prima di salvare nel DB, così anche se il DB è compromesso gli OTP non sono direttamente leggibili.

### Validazione

**Max tentativi:** 3 falliti per OTP

```sql
-- Contare i tentativi falliti
SELECT COUNT(*) AS failed_attempts
FROM otp_attempts
WHERE otp_id = ?
  AND result = 'failed'
  AND created_at > NOW() - INTERVAL 30 MINUTE;

-- Se >= 3, bloccare per 30 minuti
-- Altrimenti, verificare il codice
```

**Tabella: `otp_attempts` (nuova)**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | PK |
| otp_id | INT | FK a otp_codes |
| provided_code | VARCHAR(6) | Il codice fornito dal client |
| result | ENUM | `success` oppure `failed` |
| created_at | TIMESTAMP | Quando è stato tentato |

### Comportamento blocco

```
Tentativo 1: "123456" ❌ failed
Tentativo 2: "654321" ❌ failed
Tentativo 3: "111111" ❌ failed
→ Risposta: OTP_MAX_ATTEMPTS_EXCEEDED, blocco 30 minuti

Client ritorna dopo 30 minuti:
POST /api/client/resend-otp
→ Nuovo OTP generato e inviato
→ Max tentativi resettati
```

---

## 8.4 Rate Limiting

### Rate Limit per endpoint

| Endpoint | Limite | Finestra | Chiave |
|---|---|---|---|
| C1 (register) | 5 | 1 ora | IP source |
| C3 (resend-otp) | 3 | 1 ora | client_id (or email) |
| F1 (auth/login) | 10 | 1 ora | IP source |
| C2, C4, C5, C6 | Nessun limite | — | — |
| F2, F3, F4, F5, F6 | Nessun limite | — | — |

### Implementazione

**Tabella: `rate_limits` (nuova)**

| Campo | Tipo | Descrizione |
|---|---|---|
| id | INT | PK |
| endpoint | VARCHAR(100) | Es. `POST /api/client/register` |
| key_type | ENUM | `ip` oppure `client_id` oppure `vendor_id` |
| key_value | VARCHAR(255) | Es. IP 192.168.1.1 oppure client_id 123 |
| attempt_count | INT | Numero di tentativi nella finestra |
| window_reset_at | TIMESTAMP | Quando la finestra si resetta |
| blocked_until | TIMESTAMP | Se bloccato, fino a quando |

### Algoritmo

```
1. Request arriva a C1 (register)
2. Estrarre IP source (es. 192.168.1.1)
3. Query:
   SELECT attempt_count, window_reset_at, blocked_until
   FROM rate_limits
   WHERE endpoint = 'POST /api/client/register'
     AND key_type = 'ip'
     AND key_value = '192.168.1.1'

4. Se blocked_until > now:
   → Ritornare 429 Too Many Requests (RATE_LIMIT_EXCEEDED)

5. Se window_reset_at < now:
   → Resettare: attempt_count = 1, window_reset_at = now + 1 hour
   → Permettere richiesta

6. Se attempt_count >= 5:
   → Ritornare 429 Too Many Requests (RATE_LIMIT_EXCEEDED)
   → Settare blocked_until = now + 30 minuti (soft block)

7. Altrimenti:
   → Incrementare attempt_count
   → Permettere richiesta
```

**Resposta 429:**
```json
HTTP 429 Too Many Requests

{
  "error_code": "RATE_LIMIT_EXCEEDED",
  "message": "Troppi tentativi. Riprova tra qualche minuto.",
  "retry_after_seconds": 1800,
  "details": {
    "constraint": "max_5_registrations_per_ip_per_hour",
    "limit": 5,
    "window_seconds": 3600
  }
}
```

---

## 8.5 API Key Vendor – Hashing e Storage

### Generazione

**Standard:** UUID4 + random suffix

```
api_key = "bk_" + UUID4() + "_" + random_32_hex_chars()
Esempio: bk_550e8400-e29b-41d4-a716-446655440000_3f5c8a1b2c3d4e5f6g7h8i9j0k1l2m3
Lunghezza: ~80 caratteri
```

**Distribuzione al vendor:**
- Mostrata **una sola volta** al momento della creazione
- Vendor deve copiarla e salvarla da parte loro
- Non può essere recuperata successivamente

### Hashing e Storage nel DB

**Algoritmo:** bcrypt con salt rounds = 12

```python
import bcrypt

api_key = "bk_550e8400-e29b-41d4-a716-446655440000_3f5c8a1b2c3d4e5f6g7h8i9j0k1l2m3"
hashed = bcrypt.hashpw(api_key.encode(), bcrypt.gensalt(rounds=12))
# Esempio hashed: $2b$12$R1c0X8c.Y5p0K3l0M6n0N.Y5p0K3l0M6n0N...

# Salvataggio nel DB
UPDATE vendors SET api_key = hashed WHERE id = 5
```

**Tabella: `vendors` (aggiornamento)**

```sql
ALTER TABLE vendors ADD COLUMN api_key_hash VARCHAR(60) NOT NULL;
ALTER TABLE vendors ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE vendors ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();

-- Cancellare vecchia colonna api_key se presente
```

### Validazione durante Login

```python
def verify_api_key(provided_key, stored_hash):
    return bcrypt.checkpw(provided_key.encode(), stored_hash.encode())
```

**Richiesta F1:**
```json
POST /api/vendor/auth/login
{
  "api_key": "bk_550e8400-e29b-41d4-a716-446655440000_3f5c8a1b2c3d4e5f6g7h8i9j0k1l2m3"
}
```

**Server:**
```
1. Ricercare il vendor per api_key_hash (non possibile — hash è one-way)
2. Ricercare tutti i vendor
3. Per ogni vendor, verifica con bcrypt.checkpw(provided_key, api_key_hash)
4. Se match → login success
5. Se nessun match → 401 INVALID_API_KEY
```

**Nota:** Questo è lento se ci sono molti vendor. Soluzione alternativa: usare una tabella separata `api_key_lookups` con un hash veloce (SHA256) per lookup + bcrypt per verifica.

---

## 8.6 HTTPS/TLS

**Requisito:** Tutte le comunicazioni **DEVONO** essere HTTPS (TLS 1.2+)

**Certificato:** Self-signed per dev, CA-signed per production

**Parametri TLS consigliati:**
- Cipher suites: TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384, TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
- Protocol: TLS 1.2, TLS 1.3
- HSTS: Abilitato (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)

---

## 8.7 CORS (Cross-Origin Resource Sharing)

**Nota:** Il servizio API è backend-to-backend. La libreria client chiama direttamente l'API server, non tramite browser.

**CORS policy:** Dovrebbe essere **restrictive**

```
Access-Control-Allow-Origin: https://app.client.com (specifica, non *)
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, x-license-key
Access-Control-Max-Age: 3600
```

---

# SEZIONE 9: DESIGN API COMPLETATO

## 9.1 HTTP Status Code per Successo

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
| F7 (client/billing) | POST | **200 OK** | Upsert completato |
| F8 (license/revoke) | POST | **200 OK** | Revoca completata |
| C7 (change-email) | POST | **200 OK** | OTP inviato a nuova email |
| F9 (auth/rotate-key) | POST | **200 OK** | API key ruotata |

---

## 9.2 Response Body: C1 per client già registrato

**Scenario:** Client richiama C1 con `vat_number + product_key` che esiste già.

**Caso A: Licenza è active**

```json
HTTP 201 Created

{
  "status": "already_registered",
  "message": "Cliente già registrato. Licenza attiva.",
  "license_key": "lk_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h",
  "license_type": "trial",
  "license_status": "active",
  "expires_at": "2026-07-08T23:59:59Z",
  "action": "retrieve_existing_license"
}
```

**Comportamento:** Il client riceve i dati della licenza esistente **senza generare un nuovo OTP**. La libreria client può usare direttamente la `license_key` per fare C4 e C5.

**Caso B: Licenza è expired**

```json
HTTP 201 Created

{
  "status": "already_registered_expired",
  "message": "Cliente registrato ma licenza scaduta. Contatta il fornitore.",
  "license_key": "lk_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h",
  "license_type": "trial",
  "license_status": "expired",
  "expires_at": "2026-06-08T23:59:59Z",
  "action": "contact_vendor"
}
```

---

## 9.3 Paginazione per F3 (registrations/new)

### Parametri Query

```
GET /api/vendor/registrations/new?page=1&limit=50
```

| Parametro | Tipo | Default | Max | Descrizione |
|---|---|---|---|---|
| `page` | integer | 1 | ∞ | Numero pagina (starts at 1) |
| `limit` | integer | 50 | 100 | Numero record per pagina |

### Response

```json
HTTP 200 OK

{
  "registrations": [
    {
      "id": 1,
      "client_id": 123,
      "product_id": 5,
      "product_key": "FATTURA-2026",
      "vat_number": "12345678901",
      "country": "IT",
      "company_name": "Acme Corp",
      "contact_email": "info@acme.com",
      "language": "it",
      "license_key": "lk_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h",
      "license_type": "trial",
      "license_status": "active",
      "license_expires_at": "2026-07-08T23:59:59Z",
      "created_at": "2026-06-08T14:30:00Z"
    },
    {
      "id": 2,
      ...
    }
  ],
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

### Calcolo paginazione

```
total = 127 record
limit = 50 record per pagina
pages = ceil(127 / 50) = 3 pagine
page 1: record 1-50 (has_more=true)
page 2: record 51-100 (has_more=true)
page 3: record 101-127 (has_more=false)
```

---

## 9.4 Response di C4 quando licenza appena scaduta

**Scenario:** Licenza è scaduta oggi, C4 viene chiamato.

```json
HTTP 200 OK

{
  "license_key": "lk_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h",
  "license_type": "trial",
  "status": "expired",
  "expires_at": "2026-06-08T23:59:59Z",
  "max_users": null,
  "modules": [...],
  "just_expired": true,
  "offline_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "offline_token_expires_at": "2026-06-18T15:30:00Z"
}
```

**Nota:** `just_expired: true` indica al client che il cambio di stato è avvenuto in questa stessa chiamata. Il client può usare questo flag per mostrare una notifica speciale ("La licenza è appena scaduta!").

---

# SEZIONE 10: NUOVI ENDPOINT

## 10.1 C7 – Cambio email cliente

**Endpoint:** `POST /api/client/change-email`

**Quando usare:** Il cliente vuole cambiare l'indirizzo email di contatto registrato.

### Request

```bash
curl -X POST https://api.bk-service.com/api/client/change-email \
  -H "Authorization: Bearer <jwt>" \
  -H "x-license-key: lk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "new_email": "newemail@acme.com"
  }'
```

### Success Response: HTTP 200 OK

```json
{
  "message": "Codice di verifica inviato al nuovo indirizzo email",
  "new_email": "newemail@acme.com",
  "otp_expires_in_seconds": 900,
  "action": "verify_new_email_with_otp"
}
```

### Behavior

1. Ricevuta la richiesta, il server genera un nuovo OTP e lo invia all'email **nuova**
2. Salva `new_email` e `new_email_otp_code` in una tabella temporanea
3. Client riceve l'OTP all'email nuova
4. Client fa richiesta **C7b** (vedi sotto) per verificare l'OTP
5. Se OTP è valido, aggiorna `clients.contact_email = new_email`

### C7b – Verifica cambio email

**Endpoint:** `POST /api/client/verify-email-change`

**Request:**

```json
POST /api/client/verify-email-change

{
  "new_email": "newemail@acme.com",
  "otp_code": "123456"
}
```

**Success Response: HTTP 200 OK**

```json
{
  "message": "Email aggiornata con successo",
  "contact_email": "newemail@acme.com"
}
```

**Errori:** Come C2 (INVALID_OTP_CODE, OTP_CODE_EXPIRED, OTP_MAX_ATTEMPTS_EXCEEDED)

### Errori C7

#### C7.1 – INVALID_JWT (HTTP 401)

#### C7.2 – INVALID_EMAIL_FORMAT (HTTP 400)

#### C7.3 – EMAIL_ALREADY_IN_USE (HTTP 409)
**Quando:** La nuova email è già registrata per un altro cliente nello stesso prodotto

```json
HTTP 409 Conflict

{
  "error_code": "EMAIL_ALREADY_IN_USE",
  "message": "L'indirizzo email fornito è già utilizzato",
  "details": {
    "field": "new_email",
    "provided_email": "newemail@acme.com"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### C7.4 – EMAIL_SEND_FAILED (HTTP 500)

---

## 10.2 F9 – Rotation API key vendor

**Endpoint:** `POST /api/vendor/auth/rotate-key`

**Quando usare:** Il vendor vuole generare una nuova API key e invalidare la vecchia (per motivi di sicurezza).

### Request

```bash
curl -X POST https://api.bk-service.com/api/vendor/auth/rotate-key \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "revoke_old_key": true
  }'
```

### Success Response: HTTP 200 OK

```json
{
  "message": "Nuova API key generata. La vecchia è stata revocata.",
  "new_api_key": "bk_550e8400-e29b-41d4-a716-446655440000_3f5c8a1b2c3d4e5f6g7h8i9j0k1l2m3",
  "warning": "Salva la nuova API key. Non sarà più visibile dopo questa risposta.",
  "old_key_revoked_at": "2026-06-08T15:30:00Z"
}
```

### Behavior

1. Server genera una nuova API key (UUID4 + random suffix)
2. Hashato con bcrypt e salvato in `vendors.api_key_hash`
3. Se `revoke_old_key: true`, invalida la vecchia chiave (soft delete or flag `revoked: true`)
4. Ritorna la nuova API key **una sola volta**
5. Vendor deve salvarla e usarla per future chiamate F1

### Database changes

**Tabella: `vendors` (aggiornamento)**

```sql
ALTER TABLE vendors ADD COLUMN api_key_revoked_at TIMESTAMP NULL;
ALTER TABLE vendors ADD COLUMN api_key_history TEXT NULL;
```

Mantiene uno storico di tutte le API key revocate per audit trail.

### Errori F9

#### F9.1 – INVALID_JWT (HTTP 401)

#### F9.2 – JWT_NOT_FROM_VENDOR_ADMIN (HTTP 403)
**Quando:** Solo admin vendor possono rotare la API key (flag future)

---

# SEZIONE 11: SCENARI EDGE-CASE

## 11.1 GET ALARM (O1) fallisce per 24 ore

### Scenario

```
T0: Client verifica OTP (C2)
    → Licenza creata, JWT e offline_token generati
    → Server tenta O1 verso ERP
    → ERP non risponde (timeout, 500 error, DNS fail)
    → vendor_synced = false (rimane non sincronizzato)

T0 → T24h: Server ritenta O1 ogni 15 minuti
    → Retry 1 (T+15min): FAIL
    → Retry 2 (T+30min): FAIL
    → Retry 3 (T+45min): FAIL (raggiunto max tentativi)
    → Logging: FATAL

T24h: Server invia email di fallback al fornitore
```

### Implementazione

**Tabella: `alarm_logs` — aggiungere retry tracking**

```sql
ALTER TABLE alarm_logs ADD COLUMN retry_count INT DEFAULT 0;
ALTER TABLE alarm_logs ADD COLUMN last_retry_at TIMESTAMP NULL;
ALTER TABLE alarm_logs ADD COLUMN next_retry_at TIMESTAMP NULL;
ALTER TABLE alarm_logs ADD COLUMN max_retries INT DEFAULT 3;
```

### Job schedulato: Retry GET ALARM

```
Every 15 minutes:
  Query alarm_logs WHERE success = false AND retry_count < max_retries
    AND next_retry_at <= now()
  
  For each record:
    Tentare nuovamente O1
    Se success → update success = true, log
    Se fail → increment retry_count, set next_retry_at = now + 15min
    
    Se retry_count == max_retries:
      Inviare email fallback al fornitore
      Mark come permanently_failed
```

### Email fallback al fornitore

**Template: `GET_ALARM_FALLBACK`**

```
Oggetto: ⚠️ ATTENZIONE: GET ALARM non riuscito — Nuova registrazione non sincronizzata

Gentile team,

il servizio di gestione licenze ha tentato di notificare una nuova registrazione clienti,
ma l'endpoint ERP non è raggiungibile da 24 ore.

Dettagli:
- Numero cliente: 123
- Azienda: Acme Corp
- Prodotto: FATTURA-2026
- License key: lk_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h
- Data registrazione: 2026-06-08 14:30:00
- Numero tentativi: 3
- Ultimo errore: connection_timeout

AZIONE RICHIESTA:
1. Verificare che l'endpoint ERP sia raggiungibile
2. Controllare i log del servizio ERP
3. Se necessario, contattare il supporto BK-Service

Cordiali saluti,
Il sistema di gestione licenze
```

---

## 11.2 C2 – Fallimento parziale (O1 non termina)

### Scenario

```
Client chiama C2 (verify-otp)

Operazioni in transazione DB:
1. ✅ Attiva cliente (clients.status → active)
2. ✅ Crea licenza (licenses INSERT)
3. ✅ Genera JWT e refresh token (client_tokens INSERT)
4. ✅ Genera offline_token
5. ❌ Invia GET ALARM verso ERP (timeout, non completato)

Risultato:
- Licenza è creata con vendor_synced = false
- Client riceve HTTP 500 GET_ALARM_FAILED
- Ma licenza è già nel DB e client ha JWT
```

### Cosa ritorna al client?

**Response: HTTP 500 Internal Server Error**

```json
{
  "error_code": "GET_ALARM_FAILED",
  "message": "Licenza creata, ma notifica al fornitore non è riuscita.",
  "license_key": "lk_6f8d3c1a2b9e4f5c8a1b2c3d4e5f6g7h",
  "jwt": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "jwt_expires_in_seconds": 60,
  "refresh_token": "rt_c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1",
  "offline_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "offline_token_expires_at": "2026-06-18T15:30:00Z",
  "details": {
    "phase": "sending_alarm_to_erp",
    "alarm_code": "NEW_REGISTRATION",
    "error": "connection_timeout"
  },
  "timestamp": "2026-06-08T15:30:00Z",
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Importante:**
- Sebbene lo status HTTP sia 500, il client **riceve comunque il JWT e license_key**
- La libreria client può salvare questi dati e procedere
- Il server ritenta O1 in background (sezione 11.1)

### Logica client-side

```
if response.status === 500 AND response.error_code === 'GET_ALARM_FAILED':
  // Licenza è stata creata, salva i dati
  localStorage.jwt = response.jwt
  localStorage.license_key = response.license_key
  localStorage.offline_token = response.offline_token
  
  // Procedi con app
  app.unlock()
  
  // Informa l'utente di un potenziale problema di sincronizzazione
  showWarning("Registrazione completata, ma il fornitore non è stato ancora notificato")
```

---

## 11.3 Rinnovo licenza a pagamento (trial → monthly/annual)

### Scenario

```
T0: Client ha licenza trial attiva
    - status: "active"
    - license_type: "trial"
    - expires_at: 2026-07-08

T20: Client paga il rinnovo
    - Vendor conferma pagamento nel suo ERP
    - Vendor chiama F5 (license/activate) con:
      - vat_number, product_key (stessi del cliente)
      - license_type: "annual"  (oppure "monthly")
      - starts_at: 2026-06-08T23:59:59Z
      - expires_at: 2027-06-08T23:59:59Z
      - max_users: 10
      - modules: [1, 2, 3]
      - Idempotency-Key: "renewal_order_12345_20260608"
```

### Logica F5

```
1. Ricerca il cliente con vat_number + country + product_key
2. Ricerca la LICENZA ATTIVA PRECEDENTE (trial, monthly o annual)
3. Confronta le date:
   - Nuova starts_at è prima della scadenza di vecchia → overlap OK
   - Nuova starts_at è dopo la scadenza di vecchia → gap OK
4. Disattiva licenza vecchia: licenses.status → expired, deactivated_at = now
5. CREA NUOVA licenza:
   - Genera nuova license_key
   - license_type: "annual" (o "monthly")
   - status: "active"
   - vendor_synced: false (non ancora confermato dal vendor)
6. Genera nuovo offline_token per nuova licenza
7. Ritorna con HTTP 201 Created
```

### Response F5

```json
HTTP 201 Created

{
  "license_key": "lk_new_annual_8a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1",
  "license_type": "annual",
  "status": "active",
  "starts_at": "2026-06-08T23:59:59Z",
  "expires_at": "2027-06-08T23:59:59Z",
  "max_users": 10,
  "modules": [1, 2, 3],
  "offline_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "previous_license_key": "lk_old_trial_xxx",
  "message": "Licenza aggiornata da trial ad annuale"
}
```

### Client behavior

```
La libreria client rileva un cambio di license_key:

if (old_license_key !== new_license_key):
  // Vecchia licenza è stata revocata/disattivata
  localStorage.license_key = new_license_key
  localStorage.offline_token = response.offline_token
  
  // Next C4 userà la nuova license_key
  // Nessun servizio viene interrotto
```

---

## 11.4 Timeout durante F5 (Idempotency recovery)

### Scenario

```
Vendor chiama F5 con Idempotency-Key: "activate_order_12345_20260608"

Richiesta inizia → Server processa F5
  1. Ricerca cliente ✅
  2. Valida date ✅
  3. Disattiva licenza vecchia ✅
  4. Crea licenza nuova ✅
  5. Genera offline_token ✅
  6. Salva in idempotency_keys ✅
  7. Prepara response...
  
  → TIMEOUT di rete! La risposta non arriva al vendor

Vendor non sa se la licenza è stata creata o no.
Vendor ritenta la stessa F5 con lo STESSO Idempotency-Key
```

### Recovery tramite Idempotency-Key

```
Secondo tentativo di F5 (STESSA Idempotency-Key):

Server query:
  SELECT response_body, response_status_code
  FROM idempotency_keys
  WHERE idempotency_key = "activate_order_12345_20260608"
    AND vendor_id = current_vendor
    AND expires_at > now

Risultato trovato! → Ritorna la STESSA response del primo tentativo:

HTTP 201 Created
{
  "license_key": "lk_new_annual_8a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1",
  "license_type": "annual",
  "status": "active",
  ...
}
```

**Garantie:**
- ✅ Nessun duplicato di licenza
- ✅ Stessa response come se non fosse avvenuto il timeout
- ✅ Vendor riceve i dati corretti e può procedere con confidenza

---

## 11.5 Cliente offline per > 7 giorni

### Scenario

```
T0: Client attiva licenza, genera offline_token
    → offline_token_expires_at = T0 + 10 giorni (license_check_frequency_days)

T7: Client non fa C4 da 7 giorni (offline, in vacanza, app non usato)
    → Monitoraggio inattività (C5) scatta
    → Server invia email al fornitore: "Cliente inattivo"

T10: offline_token scade (T0 + 10 giorni)
    → Client non ha fatto C4 per refresh della validazione offline
    → Se app tenta di usare offline_token dopo scadenza:
      - Mode 1: Blocco immediato (app non funziona offline)
      - Mode 2: Modalità di grazia per altri 3 giorni (funzionamento limitato)
```

**Domanda aperta (da decidere col team):**
Quale comportamento adottare quando offline_token scade?

1. ❌ **Blocco immediato** — app si ferma, client deve contattare
2. ✅ **Modalità di grazia 3 giorni** — continua ma chiede di sincronizzarsi
3. ⚠️ **Downgrade funzioni** — solo moduli essenziali, senza funzioni premium

---

# APPENDICE: RIEPILOGO CAMBIAMENTI v4

## Nuovi Endpoint

| Codice | Metodo | Path | Descrizione |
|---|---|---|---|
| C7 | POST | `/api/client/change-email` | Cambio email cliente (con OTP) |
| C7b | POST | `/api/client/verify-email-change` | Verifica cambio email |
| F9 | POST | `/api/vendor/auth/rotate-key` | Rotation API key vendor |

## Nuove Tabelle

| Tabella | Scopo |
|---|---|
| `otp_attempts` | Traccia i tentativi di verifica OTP |
| `rate_limits` | Traccia rate limiting per IP/client |
| `idempotency_keys` | Cache delle risposte per idempotenza F5 |

## Tabelle Aggiornate

- `vendors` — aggiunto `api_key_hash`, `api_key_revoked_at`, `api_key_history`
- `alarm_logs` — aggiunto `retry_count`, `last_retry_at`, `next_retry_at`, `max_retries`

## Concetti Nuovi

- ✅ Error handling standardizzato (codici errore, status HTTP, formato response)
- ✅ Idempotenza (C2, F4, F5 con Idempotency-Key)
- ✅ Sicurezza tecnica (JWT RS256, license_key HMAC, OTP hashing, bcrypt API key, rate limiting)
- ✅ Design API completato (HTTP status, response body precisi, paginazione)
- ✅ Scenari edge-case (O1 retry, C2 parziale, trial→monthly/annual, idempotency recovery, offline >7gg)

---

*Documento v4 redatto il 08/06/2026 — estensione di v3 con error handling, idempotenza e sicurezza*
