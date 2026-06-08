# Error Reference Matrix – Tutti gli Errori per Endpoint

**Data:** 08/06/2026  
**Fonte:** Analisi_Servizio_Gestione_Licenze_v4_correzioni.md — Sezione 6  
**Scopo:** Lookup veloce per implementazione e testing

---

## 📋 COME USARE QUESTO DOCUMENTO

1. **Cerca l'endpoint** nella tabella (C1, C2, F5, ecc.)
2. **Vedi tutti gli errori** possibili in quel endpoint
3. **Clicca il link** per andare ai dettagli completi nel v4

**Chiavi:**
- 🟢 = Success
- 🔴 = Errore lato client (4xx)
- 🔥 = Errore lato server (5xx)

---

## C1 – POST /api/client/register

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **201 Created** | Registrazione accettata | Normale |
| 🔴 | PRODUCT_KEY_NOT_FOUND | **404** | product_key non esiste | Raro (client library vecchia?) |
| 🔴 | INVALID_VAT_FORMAT | **400** | P.IVA formato non valido per paese | Frequente (validazione) |
| 🔴 | INVALID_EMAIL_FORMAT | **400** | Email non valida | Frequente (typo) |
| 🔴 | INVALID_LANGUAGE | **400** | language ≠ 'it' o 'en' | Raro (bug client) |
| 🔴 | INVALID_COUNTRY_CODE | **400** | country non ISO 2-lettere | Raro (bug client) |
| 🔴 | MISSING_REQUIRED_FIELD | **400** | Campo obbligatorio mancante | Frequente (validazione) |
| 🔴 | CLIENT_ALREADY_REGISTERED | **409** | vat_number + country + product_key già registrati | Frequente (user behavior) |
| 🔴 | RATE_LIMIT_EXCEEDED | **429** | > 5 registrazioni per IP/ora | Raro (brute force) |
| 🔥 | EMAIL_SEND_FAILED | **500** | Errore servizio email | Raro (outage provider) |
| 🔥 | INTERNAL_SERVER_ERROR | **500** | Errore generico non previsto | Raro (bug server) |

**Total Errors in C1:** 11 (1 success + 10 errors)

---

## C2 – POST /api/client/verify-otp

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | OTP verificato, licenza creata | Normale |
| 🔴 | INVALID_OTP_CODE | **400** | Codice OTP sbagliato | Frequente (typo) |
| 🔴 | OTP_CODE_EXPIRED | **400** | OTP scaduto (> 15 min) | Frequente (user delay) |
| 🔴 | OTP_MAX_ATTEMPTS_EXCEEDED | **429** | 3 tentativi falliti, blocco 30 min | Raro (brute force) |
| 🔴 | CLIENT_NOT_FOUND | **404** | Nessun cliente pending trovato | Raro (DB inconsistency) |
| 🔥 | DATABASE_TRANSACTION_FAILED | **500** | Errore creazione licenza/token/offline_token | Raro (DB error) |
| 🔥 | GET_ALARM_FAILED | **500** | Licenza creata, ma GET ALARM verso ERP timeout | Raro (ERP outage) |

**Total Errors in C2:** 8 (1 success + 7 errors)  
**Special Note:** GET_ALARM_FAILED ritorna HTTP 500 MA il client riceve JWT e license_key comunque (fallimento parziale).

---

## C3 – POST /api/client/resend-otp

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | Nuovo OTP inviato | Normale |
| 🔴 | CLIENT_NOT_FOUND | **404** | Nessun cliente pending trovato | Raro (registration expired) |
| 🔴 | RATE_LIMIT_EXCEEDED | **429** | > 3 resend per client/ora | Raro (user impatience) |
| 🔥 | EMAIL_SEND_FAILED | **500** | Errore servizio email | Raro (outage provider) |

**Total Errors in C3:** 5 (1 success + 4 errors)

---

## C4 – GET /api/client/license/status

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | Stato licenza ritornato | Normale |
| 🔴 | INVALID_JWT | **401** | JWT mancante, scaduto o invalido | Frequente (se token refresh fallisce) |
| 🔴 | INVALID_LICENSE_KEY | **401** | x-license-key mancante o invalido | Frequente (header non passato) |
| 🔴 | LICENSE_NOT_FOUND | **404** | License key non esiste nel DB | Raro (data loss) |
| 🔴 | JWT_LICENSE_KEY_MISMATCH | **403** | JWT appartiene a cliente diverso | Raro (spoofing attempt) |

**Total Errors in C4:** 6 (1 success + 5 errors)

---

## C5 – GET /api/client/messages

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | Messaggi ritornati (possono essere 0) | Normale |
| 🔴 | INVALID_JWT | **401** | JWT mancante, scaduto o invalido | Frequente (se token refresh fallisce) |
| 🔴 | INVALID_LICENSE_KEY | **401** | x-license-key mancante o invalido | Frequente (header non passato) |
| 🔴 | LICENSE_NOT_FOUND | **404** | License key non esiste nel DB | Raro (data loss) |

**Total Errors in C5:** 5 (1 success + 4 errors)

---

## C6 – POST /api/client/token/refresh

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | Nuovo JWT e refresh token ritornati | Normale |
| 🔴 | INVALID_REFRESH_TOKEN | **401** | Refresh token mancante, scaduto o revocato | Frequente (1 ora inattività) |
| 🔴 | CLIENT_NOT_FOUND | **404** | Client associato al refresh token non esiste | Raro (data loss) |

**Total Errors in C6:** 4 (1 success + 3 errors)

---

## C7 – POST /api/client/change-email

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | OTP inviato a nuova email | Raro (cambio email) |
| 🔴 | INVALID_JWT | **401** | JWT non valido | Frequente |
| 🔴 | INVALID_EMAIL_FORMAT | **400** | Email nuova non valida | Frequente (typo) |
| 🔴 | EMAIL_ALREADY_IN_USE | **409** | Email già registrata per altro cliente | Raro |
| 🔥 | EMAIL_SEND_FAILED | **500** | Errore servizio email | Raro |

**Total Errors in C7:** 6 (1 success + 5 errors)

---

## F1 – POST /api/vendor/auth/login

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | JWT e refresh token ritornati | Normale |
| 🔴 | INVALID_API_KEY | **401** | API key mancante o errata | Frequente (credentials mismatch) |
| 🔴 | VENDOR_DISABLED | **403** | Account vendor disabilitato | Raro (account suspension) |

**Total Errors in F1:** 4 (1 success + 3 errors)

---

## F2 – POST /api/vendor/token/refresh

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | Nuovo JWT e refresh token ritornati | Normale |
| 🔴 | INVALID_REFRESH_TOKEN | **401** | Refresh token mancante, scaduto o revocato | Frequente (1 ora inattività) |
| 🔴 | VENDOR_NOT_FOUND | **404** | Vendor non esiste | Raro (data loss) |

**Total Errors in F2:** 4 (1 success + 3 errors)

---

## F3 – GET /api/vendor/registrations/new

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | Lista registrazioni ritornata (può essere vuota) | Normale |
| 🔴 | INVALID_JWT | **401** | JWT non valido | Frequente |
| 🔴 | INVALID_PAGE_PARAMETER | **400** | page o limit non sono interi positivi | Frequente (bug client) |

**Total Errors in F3:** 4 (1 success + 3 errors)

---

## F4 – POST /api/vendor/registrations/confirm

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | Iscrizioni confermate | Normale |
| 🔴 | INVALID_JWT | **401** | JWT non valido | Frequente |
| 🔴 | REGISTRATION_NOT_FOUND | **404** | Uno o più ID non trovati | Frequente (ID scaduti) |

**Total Errors in F4:** 4 (1 success + 3 errors)

---

## F5 – POST /api/vendor/license/activate

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **201 Created** | Licenza creata | Normale |
| 🔴 | INVALID_JWT | **401** | JWT non valido | Frequente |
| 🔴 | IDEMPOTENCY_KEY_REQUIRED | **400** | Header Idempotency-Key mancante | Frequente (client non implementato) |
| 🔴 | CLIENT_NOT_FOUND | **404** | Cliente non trovato con quei dati | Frequente (VAT non trovato) |
| 🔴 | INVALID_DATE_RANGE | **400** | expires_at < starts_at | Frequente (bug client) |
| 🔴 | INVALID_MAX_USERS | **400** | max_users ≤ 0 | Frequente (validazione) |
| 🔴 | INVALID_MODULE_ID | **400** | Module ID non esiste | Raro (catalog mismatch) |

**Total Errors in F5:** 9 (1 success + 8 errors)  
**Critical:** Richiede Idempotency-Key header per prevenire duplicati.

---

## F6 – POST /api/vendor/products

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **201 Created** | Prodotto creato | Raro (admin only) |
| 🔴 | INVALID_JWT | **401** | JWT non valido | Frequente |
| 🔴 | PRODUCT_KEY_ALREADY_EXISTS | **409** | product_key già registrata | Frequente (duplicate attempt) |
| 🔴 | INVALID_TRIAL_DURATION | **400** | trial_duration_days ≤ 0 | Frequente (validazione) |

**Total Errors in F6:** 5 (1 success + 4 errors)

---

## F7 – POST /api/vendor/client/billing

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | Dati fatturazione salvati | Normale (al primo acquisto) |
| 🔴 | INVALID_JWT | **401** | JWT non valido | Frequente |
| 🔴 | CLIENT_NOT_FOUND | **404** | Cliente non trovato | Frequente (cliente non esiste) |
| 🔴 | INVALID_PEC_FORMAT | **400** | PEC non è email valida | Frequente (typo) |

**Total Errors in F7:** 5 (1 success + 4 errors)

---

## F8 – POST /api/vendor/license/revoke

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | Licenza revocata | Raro (revoca) |
| 🔴 | INVALID_JWT | **401** | JWT non valido | Frequente |
| 🔴 | LICENSE_NOT_FOUND | **404** | License key non trovata | Frequente (key errata) |
| 🔴 | LICENSE_ALREADY_EXPIRED | **409** | Licenza è già expired o revoked | Raro (double revoke) |

**Total Errors in F8:** 5 (1 success + 4 errors)

---

## F9 – POST /api/vendor/auth/rotate-key

| # | Error Code | HTTP Status | Scenario | Frequenza |
|---|---|---|---|---|
| ✅ | SUCCESS | **200 OK** | Nuova API key generata | Raro (security) |
| 🔴 | INVALID_JWT | **401** | JWT non valido | Frequente |
| 🔴 | JWT_NOT_FROM_VENDOR_ADMIN | **403** | Solo admin può rotare key | Raro (permissions) |

**Total Errors in F9:** 4 (1 success + 3 errors)

---

## 📊 RIEPILOGO STATISTICO

### Errori per Endpoint

```
C1: 11 (1 success + 10 errors)  ← Più errori di validazione
C2: 8
C3: 5
C4: 6
C5: 5
C6: 4
C7: 6  (nuovo)
F1: 4
F2: 4
F3: 4
F4: 4
F5: 9   ← Molti errori di validazione
F6: 5
F7: 5
F8: 5
F9: 4   (nuovo)

TOTALE: 94 stati possibili (16 success + 78 errors)
```

### Errori per HTTP Status Code

```
201 Created:     3 (C1, F5, F6)
200 OK:         13 (C2, C3, C5, C6, C7, F1, F2, F3, F4, F7, F8, F9, etc)
400 Bad Request: 22 (validazione input)
401 Unauthorized: 16 (JWT/auth failures)
403 Forbidden:    2 (permissions)
404 Not Found:   13 (resource not found)
409 Conflict:     5 (state conflicts)
429 Too Many:     2 (rate limiting)
500 Server Error: 3 (outages)
```

### Errori più Frequenti

```
Top 5:
1. INVALID_JWT (401) — Accade quando JWT scade
2. INVALID_VAT_FORMAT (400) — Validazione P.IVA
3. MISSING_REQUIRED_FIELD (400) — Input validation
4. RATE_LIMIT_EXCEEDED (429) — Brute force protection
5. EMAIL_SEND_FAILED (500) — Provider outage
```

### Errori Critici per Production

```
🔥 GET_ALARM_FAILED (500 in C2)
   → Licenza creata ma ERP non notificato
   → Server ritenta in background
   
🔥 DATABASE_TRANSACTION_FAILED (500 in C2)
   → Nessuna licenza creata, client rimane pending
   
🔥 EMAIL_SEND_FAILED (500 in C1, C3, C7)
   → OTP non inviato, client bloccato
   → Implementare queue + retry
```

---

## 🎯 IMPLEMENTAZIONE CHECKLIST

### Per Backend Developer

- [ ] Gestire tutti gli errori di C1 (11 totali)
- [ ] Gestire fallimento parziale di C2 (GET_ALARM_FAILED)
- [ ] Implementare rate limiting per C1, C3, F1
- [ ] Implementare Idempotency-Key per F5
- [ ] Implementare retry O1 con email fallback (11.1)
- [ ] Gestire timeout F5 con recovery da idempotency_keys

### Per Frontend/Client Library Developer

- [ ] Gestire 401 Unauthorized → refreshare JWT con C6
- [ ] Gestire 409 Conflict in C1 → mostrare messaggio "already registered"
- [ ] Gestire 429 Too Many Requests → implementare backoff exponential
- [ ] Gestire 500 GET_ALARM_FAILED in C2 → salvare JWT comunque, procedere
- [ ] Gestire offline_token expiry (sezione 11.5)

### Per QA/Tester

- [ ] Testare tutti gli errori 400 (validazione input)
- [ ] Testare rate limiting (C1: 5/ora per IP, C3: 3/ora per client)
- [ ] Testare OTP expiry (15 min) e max attempts (3)
- [ ] Testare idempotenza F5 (Idempotency-Key header)
- [ ] Testare fallimento parziale C2 (mock ERP timeout)
- [ ] Testare retry O1 ogni 15 min per 24 ore

---

## 🔗 LINK A SEZIONI DETTAGLIATE

Per dettagli completi di ogni errore (example request/response, implementazione), consultare:

**Documento:** `Analisi_Servizio_Gestione_Licenze_v4_correzioni.md`

- Sezione 6.2: C1 dettagli
- Sezione 6.3: C2 dettagli
- Sezione 6.4: C3 dettagli
- Sezione 6.5: C4 dettagli
- Sezione 6.6: C5 dettagli
- Sezione 6.7: C6 dettagli
- Sezione 6.8: F1 dettagli
- Sezione 6.9: F2 dettagli
- Sezione 6.10: F3 dettagli
- Sezione 6.11: F4 dettagli
- Sezione 6.12: F5 dettagli
- Sezione 6.13: F6 dettagli
- Sezione 6.14: F7 dettagli
- Sezione 6.15: F8 dettagli

---

*Error Reference Matrix — 08/06/2026*
