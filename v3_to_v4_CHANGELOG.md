# Changelog: v3 → v4 (Correzioni e Completamenti)

**Data:** 08/06/2026  
**Autore:** Andrea Pavan + Claude Code  
**Precedente:** Analisi_Servizio_Gestione_Licenze_v3.md  
**Nuovo:** Analisi_Servizio_Gestione_Licenze_v4_correzioni.md

---

## 📋 RIEPILOGO ESECUTIVO

v4 **non scarta niente di v3**, ma **aggiunge 6 sezioni critiche** per portare l'analisi da "architettura" a "pronto per implementazione":

| Aspetto | v3 | v4 |
|---------|----|----|
| **Panoramica + Endpoint** | ✅ Completo | ✅ Identico |
| **Error Handling** | ❌ Assente | ✅ **60+ errori dettagliati** |
| **Idempotenza** | ❌ Assente | ✅ **3 strategie implementate** |
| **Sicurezza Tecnica** | ⚠️ Vago | ✅ **Algoritmi esatti, TTL, rate limiting** |
| **Design API** | ⚠️ Parziale | ✅ **HTTP status, response body, paginazione** |
| **Nuovi Endpoint** | 8 endpoint | ✅ **+2 endpoint (C7, F9)** |
| **Scenari Edge-Case** | ❌ Assente | ✅ **5 scenari critici** |

---

## 📊 DETTAGLIO CAMBIAMENTI

### 1️⃣ SEZIONE 6 – ERROR HANDLING & CODICI ERRORE (NUOVO)

**Problema v3:** "Se va male, il client ottiene un errore." Non specificato come.

**Soluzione v4:**
- ✅ Formato **JSON standardizzato** per tutti gli errori
- ✅ Ogni endpoint ha lista esatta di errori che può ritornare
- ✅ Per ogni errore: **codice**, **HTTP status**, **quando accade**, **example request/response**

**Esempio – C1 (register):**

```
❌ C1.1 – PRODUCT_KEY_NOT_FOUND (404)
   Quando: product_key non esiste in DB
   
❌ C1.2 – INVALID_VAT_FORMAT (400)
   Quando: P.IVA formato non valido per paese
   
❌ C1.3 – INVALID_EMAIL_FORMAT (400)
   Quando: Email non è valida
   
❌ C1.4 – INVALID_LANGUAGE (400)
   Quando: language non è 'it' o 'en'
   
❌ C1.5 – INVALID_COUNTRY_CODE (400)
   Quando: country non è ISO 2-lettere
   
❌ C1.6 – MISSING_REQUIRED_FIELD (400)
   Quando: Campo obbligatorio mancante
   
❌ C1.7 – CLIENT_ALREADY_REGISTERED (409)
   Quando: vat_number + country + product_key già registrati
   
❌ C1.8 – RATE_LIMIT_EXCEEDED (429)
   Quando: > 5 registrazioni per IP per hora
   
❌ C1.9 – EMAIL_SEND_FAILED (500)
   Quando: Errore servizio email
   
❌ C1.10 – INTERNAL_SERVER_ERROR (500)
   Quando: Errore generico
```

**Impatto:** Implementazione può validare e rispondere correttamente. Client sa esattamente come gestire ogni caso.

---

### 2️⃣ SEZIONE 7 – IDEMPOTENZA (NUOVO)

**Problema v3:** "Se la richiesta fallisce per timeout, il client la ritenta. Viene creato un duplicato?"

**Soluzione v4:** 3 strategie diverse per 3 endpoint critici.

#### Strategia A: C2 (verify-otp) – Check-before-create

```python
# Server riceve C2 due volte con stesso OTP

Tentativo 1:
POST /api/client/verify-otp { otp: "123456" }
→ Crea licenza, JWT, offline_token
→ Ritorna HTTP 200

Tentativo 2 (timeout, client ritenta):
POST /api/client/verify-otp { otp: "123456" }
→ Query: SELECT * FROM contratti WHERE client_id=? AND product_id=?
→ Licenza esiste già!
→ Ritorna HTTP 200 CON GLI STESSI DATI (nessun duplicato)
```

#### Strategia B: F4 (confirm) – Idempotent Update

```sql
-- Vendor chiama F4 due volte con stessi ID

Tentativo 1:
POST /api/vendor/registrations/confirm { ids: [1,2,3] }
→ UPDATE contratti SET vendor_synced=true WHERE id IN (1,2,3) AND vendor_synced=false
→ 3 record aggiornati
→ Ritorna: { confirmed_count: 3 }

Tentativo 2 (timeout, vendor ritenta):
POST /api/vendor/registrations/confirm { ids: [1,2,3] }
→ UPDATE contratti SET vendor_synced=true WHERE id IN (1,2,3) AND vendor_synced=false
→ 0 record aggiornati (già true)
→ Ritorna: { confirmed_count: 3 } (stessa risposta!)
```

#### Strategia C: F5 (activate) – Idempotency-Key Header

```
Tentativo 1:
POST /api/vendor/license/activate
Header: Idempotency-Key: "activate_order_12345_20260608"
Body: { vat_number, product_key, license_type, dates, ... }
→ Crea licenza
→ Salva response in tabella idempotency_keys
→ Ritorna: { license_key: "lk_...", status: 201 }

Tentativo 2 (timeout, vendor ritenta con STESSA Idempotency-Key):
POST /api/vendor/license/activate
Header: Idempotency-Key: "activate_order_12345_20260608"
Body: { vat_number, product_key, license_type, dates, ... }
→ Query idempotency_keys WHERE key = "activate_order_12345_20260608"
→ Trovato! Ritorna response salvata
→ Status: 201 (come primo tentativo, nessun duplicato)
```

**Tabella nuova: `idempotency_keys`**
```
- idempotency_key (PK)
- vendor_id
- endpoint
- request_hash (SHA256 del body)
- response_body (JSON)
- response_status_code
- created_at
- expires_at (24 ore)
```

**Impatto:** Zero duplicati, vendor può ritentare con sicurezza.

---

### 3️⃣ SEZIONE 8 – SICUREZZA TECNICA (NUOVO)

**Problema v3:** "JWT" e "license_key" menzionati ma senza dettagli implementativi.

**Soluzione v4:** Specifiche esatte per ogni componente di sicurezza.

#### 8.1 – JWT

```
Algoritmo: RS256 (RSA + SHA256)
TTL JWT: 60 secondi
TTL Refresh Token: 1 ora

Payload JWT Client:
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

Payload JWT Vendor:
{
  "iss": "bk-service",
  "sub": "vendor_5",
  "aud": "bk-vendor-api",
  "exp": 1717941000,
  "vendor_id": 5,
  "vendor_name": "Acme Software"
}
```

#### 8.2 – License Key

```
Algoritmo: HMAC-SHA256
Formula:
  license_key = "lk_" + HMAC_SHA256(
    random_uuid + 
    timestamp_epoch +
    vat_number +
    country +
    product_key,
    server_secret_key
  )

Lunghezza: 67 caratteri (3 prefix + 64 hash)

Proprietà:
- Univoco per cliente + prodotto
- Non predibile (dipende da random_uuid)
- Verificabile (HMAC)
- Non contiene dati sensibili in chiaro
```

#### 8.3 – OTP

```
Generazione: 6 cifre numeriche (000000-999999)
TTL: 15 minuti
Max tentativi falliti: 3
Lockout dopo 3 fallimenti: 30 minuti
Storage: SHA256 hashato nel DB
```

#### 8.4 – API Key Vendor

```
Generazione: UUID4 + random_32_hex_chars
Prefisso: "bk_"
Esempio: bk_550e8400-e29b-41d4-a716-446655440000_3f5c8a1b2c3d4e5f6g7h8i9j0k1l2m3
Lunghezza: ~80 caratteri
Hashing: bcrypt (rounds=12)
Storage: bcrypt hash in vendors.api_key_hash
```

#### 8.5 – Rate Limiting

```
Endpoint | Limite | Finestra | Chiave
C1       | 5      | 1 ora    | IP
C3       | 3      | 1 ora    | client_id
F1       | 10     | 1 ora    | IP

Tabella: rate_limits
- endpoint
- key_type (ip, client_id, vendor_id)
- key_value
- attempt_count
- window_reset_at
- blocked_until

Soft block: 30 minuti dopo raggiungimento limite
```

#### 8.6 – HTTPS/TLS

```
Protocollo: TLS 1.2+ (obbligatorio)
Certificato: CA-signed per production, self-signed per dev
HSTS: Abilitato (max-age=31536000)
```

**Impatto:** Backend ha specifiche di sicurezza concrete, non vaghe.

---

### 4️⃣ SEZIONE 9 – DESIGN API COMPLETATO (NUOVO)

**Problema v3:** "C1 ritorna 201 o 200? Quali campi nella response?"

**Soluzione v4:** Specificazioni esatte per ogni endpoint.

#### HTTP Status Codes

```
Endpoint         | Metodo | Success Status | Motivo
C1 (register)    | POST   | 201 Created    | Nuova registrazione creata
C2 (verify-otp)  | POST   | 200 OK         | Licenza creata, dati ritornati
C3 (resend-otp)  | POST   | 200 OK         | OTP inviato
C4 (status)      | GET    | 200 OK         | Read-only
C5 (messages)    | GET    | 200 OK         | Read-only
C6 (token)       | POST   | 200 OK         | Token aggiornato
F1 (login)       | POST   | 200 OK         | Autenticazione
F5 (activate)    | POST   | 201 Created    | Nuova licenza creata
F6 (products)    | POST   | 201 Created    | Nuovo prodotto
F8 (revoke)      | POST   | 200 OK         | Revoca completata
```

#### Response Body Precisi

**C1 Success (201 Created):**
```json
{
  "status": "pending",
  "message": "Registrazione ricevuta. Controlla email.",
  "otp_expires_in_seconds": 900,
  "company_name": "Acme Corp"
}
```

**C2 Success (200 OK):**
```json
{
  "status": "active",
  "license_key": "lk_...",
  "license_type": "trial",
  "license_status": "active",
  "expires_at": "2026-07-08T23:59:59Z",
  "jwt": "eyJ...",
  "jwt_expires_in_seconds": 60,
  "refresh_token": "rt_...",
  "refresh_token_expires_in_seconds": 3600,
  "offline_token": "eyJ...",
  "offline_token_expires_at": "2026-06-18T15:30:00Z"
}
```

**C1 quando client già registrato (201 Created):**
```json
{
  "status": "already_registered",
  "message": "Cliente già registrato. Licenza attiva.",
  "license_key": "lk_...",
  "license_type": "trial",
  "license_status": "active",
  "expires_at": "2026-07-08T23:59:59Z",
  "action": "retrieve_existing_license"
}
```

#### Paginazione F3

```
Query: GET /api/vendor/registrations/new?page=1&limit=50

Response:
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

**Impatto:** Frontend/client sa esattamente cosa aspettarsi.

---

### 5️⃣ SEZIONE 10 – NUOVI ENDPOINT (NUOVO)

**Problema v3:** Scenario non coperto: cliente cambia email. Fornitore ruota API key.

**Soluzione v4:** 2 nuovi endpoint.

#### C7 – POST /api/client/change-email

```
Uso: Cliente cambia indirizzo email di contatto

Request:
POST /api/client/change-email
{
  "new_email": "newemail@acme.com"
}

Response (200 OK):
{
  "message": "Codice di verifica inviato al nuovo indirizzo",
  "new_email": "newemail@acme.com",
  "otp_expires_in_seconds": 900
}

Flusso:
1. Genera OTP e invia a new_email
2. Client verifica OTP con C7b (verify-email-change)
3. Aggiorna clients.contact_email
```

#### F9 – POST /api/vendor/auth/rotate-key

```
Uso: Vendor genera nuova API key e revoca la vecchia

Request:
POST /api/vendor/auth/rotate-key
{
  "revoke_old_key": true
}

Response (200 OK):
{
  "message": "Nuova API key generata",
  "new_api_key": "bk_550e8400-...",
  "warning": "Salva la nuova key. Non sarà più visibile.",
  "old_key_revoked_at": "2026-06-08T15:30:00Z"
}

Flusso:
1. Genera nuova API key
2. Hashata con bcrypt e salvata in DB
3. Invalida vecchia key (soft delete)
4. Ritorna nuova key UNA SOLA VOLTA
```

**Impatto:** Due scenari importanti ora hanno endpoint.

---

### 6️⃣ SEZIONE 11 – SCENARI EDGE-CASE (NUOVO)

**Problema v3:** "Che succede se...?" non documentato.

**Soluzione v4:** 5 scenari critici con implementazione esatta.

#### 11.1 – GET ALARM (O1) fallisce per 24 ore

```
Scenario: Client verifica OTP (C2), ma server non riesce a notificare ERP

Azioni:
- Licenza creata con vendor_synced = false
- O1 è ritentato automaticamente ogni 15 minuti
- Max 3 tentativi
- Dopo max retry, email fallback inviata al fornitore

Job schedulato:
Every 15 minutes:
  SELECT * FROM alarm_logs 
  WHERE success = false AND retry_count < 3
    AND next_retry_at <= now
  
  For each:
    Retry O1
    If success: update success=true, retry_count=0
    If fail: increment retry_count, set next_retry_at = now+15min
    
    If retry_count == 3:
      Send email fallback to vendor
      Mark permanently_failed
```

#### 11.2 – C2 fallimento parziale (O1 non termina)

```
Scenario: C2 crea licenza, ma O1 (GET ALARM) timeout

Response al client:
HTTP 500 Internal Server Error
{
  "error_code": "GET_ALARM_FAILED",
  "message": "Licenza creata, ma notifica al fornitore fallita",
  "license_key": "lk_...",
  "jwt": "eyJ...",
  "jwt_expires_in_seconds": 60,
  ...
}

IMPORTANTE:
- Anche se status è 500, client riceve JWT e license_key
- Licenza è nel DB con vendor_synced = false
- Client può salvare dati e procedere
- Server ritenta O1 in background (sezione 11.1)

Client-side logic:
if response.status === 500 AND response.error_code === 'GET_ALARM_FAILED':
  localStorage.jwt = response.jwt
  localStorage.license_key = response.license_key
  app.unlock()
```

#### 11.3 – Passaggio Provisional → Standard

```
Scenario: Cliente ha licenza provvisoria, paga il rinnovo, vendor chiama F5

Logica F5:
1. Ricerca cliente e licenza attuale
2. Se vecchia è provisional (30gg), nuova è standard (1 anno)
3. Disattiva vecchia: contratti.status = expired
4. CREA nuova licenza: license_type = standard
5. Genera nuovo offline_token per standard
6. Ritorna HTTP 201 Created

Bonus: F5 è idempotente, quindi se vendor ritenta:
→ STESSA risposta, zero duplicati
```

#### 11.4 – Timeout F5 + Idempotency Recovery

```
Scenario: Vendor chiama F5, licenza è creata, ma risposta timeout

Tentativo 1:
POST /api/vendor/license/activate
Idempotency-Key: "activate_order_12345_20260608"
→ Licenza creata ✅
→ Response salvata in idempotency_keys ✅
→ Ma timeout, client non riceve

Tentativo 2 (vendor ritenta con STESSA key):
POST /api/vendor/license/activate
Idempotency-Key: "activate_order_12345_20260608"
→ Query idempotency_keys → trovato!
→ Ritorna STESSA response (200 OK)
→ Zero duplicati
```

#### 11.5 – Cliente offline > 7 giorni

```
Scenario: Client non fa C4 da 7 giorni (offline, vacanza, app non usato)

Azioni:
- T7: Monitoraggio inattività (C5) scatta
  → Email al fornitore: "Cliente inattivo"
  
- T10: offline_token scade
  → offline_token_expires_at = T0 + license_check_frequency_days

Domanda aperta (team decision):
Mode 1: ❌ Blocco immediato
  → App non funziona offline
  
Mode 2: ✅ Modalità di grazia 3 giorni
  → App continua con avviso
  
Mode 3: ⚠️ Downgrade funzioni
  → Solo moduli essenziali
```

**Impatto:** Team sa come gestire situazioni complesse.

---

## 📈 NUOVE TABELLE

| Tabella | Sezione | Scopo |
|---------|---------|-------|
| `otp_attempts` | 8.3 | Traccia tentativi OTP falliti |
| `rate_limits` | 8.4 | Traccia rate limiting per IP/client |
| `idempotency_keys` | 7.4 | Cache risposte F5 per idempotenza |

---

## 🔧 TABELLE AGGIORNATE

| Tabella | Colonne nuove | Sezione |
|---------|---------------|---------|
| `vendors` | `api_key_hash`, `api_key_revoked_at`, `api_key_history` | 8.5, 10.2 |
| `alarm_logs` | `retry_count`, `last_retry_at`, `next_retry_at`, `max_retries` | 11.1 |

---

## ✅ READINESS PER IMPLEMENTAZIONE

| Aspetto | v3 | v4 | Pronto? |
|---------|----|----|---------|
| Architettura | ✅ | ✅ | ✅ |
| Endpoint | ✅ | ✅ (+2) | ✅ |
| Database Schema | ✅ | ✅ (+3) | ✅ |
| Error Handling | ❌ | ✅ | ✅ |
| Idempotenza | ❌ | ✅ | ✅ |
| Sicurezza | ⚠️ | ✅ | ✅ |
| API Design | ⚠️ | ✅ | ✅ |
| Edge Cases | ❌ | ✅ | ✅ |
| **TOTALE** | **~70%** | **~100%** | **✅ SÌ** |

---

## 🎯 AZIONI SUCCESSIVE

**Prima di iniziare implementazione:**

1. ✅ Review documento v4 completo
2. ✅ Team approva algoritmi (JWT RS256, HMAC license_key, bcrypt API key)
3. ✅ Team sceglie "offline expiry behavior" (sezione 11.5)
4. ✅ Team sceglie servizio email (SendGrid? Mailgun?)
5. ➡️ **INIZIARE IMPLEMENTAZIONE BACKEND**

---

## 📞 DOMANDE ANCORA APERTE (da v3, ma priorità bassa)

- Quale provider email usare (SendGrid, Mailgun, ecc.)?
- Quale servizio esterno per validazione P.IVA (VIES per EU)?
- Pannello di amministrazione per il Service Invoice: sì o no?

---

*Documento changelog redatto il 08/06/2026*
