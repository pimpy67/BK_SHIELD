# BK_SHIELD — Servizio Gestione Licenze

## Cos'è questo progetto

Backend per la gestione del ciclo di vita delle licenze software, denominato **Service Invoice** (o BK Invoice Service). Fa da intermediario tra la libreria client (integrata nelle app del produttore) e l'ERP del fornitore.

## Team

- **Alvise** — Product Owner / Responsabile tecnico, guida le decisioni architetturali
- **Luca** — Revisore tecnico, ha richiesto esplicitamente un flowchart del processo
- **Pavanandrea (Andrea Pavan)** — Sviluppatore
- **Cristina** — Sviluppatore
- **Speaker 3** — Sviluppatore

## Decisioni tecnologiche prese

- **Backend:** Node.js + Fastify (raccomandato) o Express — C# escluso per decisione di Alvise
- **ORM/Query builder:** Knex.js con better-sqlite3
- **Database:** SQLite
- **Frontend:** Ionic — sviluppo posticipato
- **Auth:** JWT RS256 + refresh token rotation; API key vendor con bcrypt rounds=12
- **Crittografia offline:** AES-256-GCM via `crypto` nativo Node.js
- **Email:** Nodemailer — provider da scegliere (SendGrid / Mailgun / Brevo)
- **Test:** Jest + Supertest
- **Job schedulati:** node-cron
- **Documentazione API:** Swagger UI (swagger-jsdoc)
- **Repository GitHub:** https://github.com/pimpy67/BK_SHIELD
- **Git identity:** user.name = pimpy67, user.email = andreapavan67@gmail.com

## File nel repository

| File | Descrizione |
|---|---|
| `Analisi_Servizio_Gestione_Licenze_v4_correzioni.md` | **Analisi tecnica master** — endpoint, errori, sicurezza, idempotenza, edge case |
| `Analisi_Servizio_Gestione_Licenze_v4_correzioni.docx` | Versione Word dell'analisi v4 |
| `ERROR_REFERENCE_MATRIX.md` | Matrice di riferimento di tutti i codici errore |
| `Endpoint_Servizio_Gestione_Licenze_v5.md` | **Riferimento endpoint da presentare** — scopo, request body commentato, controlli, risposte JSON per tutti gli endpoint C1–C7b, F1–F9, O1 (aggiornato a v4 + sezione 12) |
| `Flowchart_Servizio_Gestione_Licenze.md` | 13 diagrammi Mermaid del flusso completo (richiesti da Luca; Diag.10–13 aggiunti per sezione 12) |
| `Riepilogo servizio fatturazione.md` | Verbale della riunione del 04/06/2026 con le direttive di Alvise |
| `Piano_di_Progetto_Servizio_Gestione_Licenze (to_do).docx` | Piano di progetto con 12 TO-DO, stime e analisi rischi |
| `sviluppo_v0.md` | Guida di avvio sviluppo backend — decisioni pre-OK, struttura progetto, Gantt |
| `Descrizione_Servizio_Gestione_Licenze.pdf` | Descrizione sintetica del servizio |
| `archivio/` | Versioni precedenti (v2, v3, changelog, script) — solo riferimento storico |

## Architettura del sistema

Tre componenti:
1. **Service Invoice** — server backend centrale
2. **Libreria Client** — integrata nelle app del produttore, comunica via C1–C6
3. **App Fornitore / ERP** — comunica via F1–F8, riceve notifiche O1

Il server è **passivo**: risponde alle chiamate, non le inizia (unica eccezione: O1 GET ALARM e messaggi schedulati).

## Endpoint principali

### Client (C1–C7b)
- `C1 POST /api/client/register` — registrazione automatica all'installazione
- `C2 POST /api/client/verify-otp` — verifica OTP, attiva trial, genera license_key, imposta `vendor_synced=false` *(idempotente; non chiama O1 direttamente — sezione 12)*
- `C3 POST /api/client/resend-otp` — nuovo OTP se scaduto
- `C4 GET /api/client/license/status` — check periodico (frequenza configurabile in DB)
- `C5 GET /api/client/messages` — poll messaggi in-app
- `C6 POST /api/client/token/refresh` — rinnovo JWT
- `C7 POST /api/client/change-email` — avvia cambio email con OTP *(nuovo in v4)*
- `C7b POST /api/client/verify-email-change` — verifica OTP per confermare cambio email *(nuovo in v4)*

### Fornitore (F1–F9)
- `F1 POST /api/vendor/auth/login` — autenticazione con API key
- `F2 POST /api/vendor/token/refresh` — rinnovo token fornitore
- `F3 GET /api/vendor/registrations/new` — nuove iscrizioni da processare (paginato: `?page=1&limit=50`)
- `F4 POST /api/vendor/registrations/confirm` — conferma ricezione iscrizioni *(idempotente)*
- `F5 POST /api/vendor/license/activate` — attivazione licenza a pagamento *(idempotente via `Idempotency-Key` header)*
- `F6 POST /api/vendor/products` — registrazione nuovo prodotto
- `F7 POST /api/vendor/client/billing` — dati fatturazione al primo acquisto
- `F8 POST /api/vendor/license/revoke` — revoca licenza
- `F9 POST /api/vendor/auth/rotate-key` — rotation API key vendor *(nuovo in v4)*

### Uscente (O1)
- `O1 GET {vendor_erp_url}/alarm` — GET ALARM verso ERP fornitore

## Tipi di licenza

| Tipo | Codice | Descrizione |
|---|---|---|
| Trial Demo | `trial` | Prova gratuita, durata/moduli configurabili per prodotto |
| Mensile | `monthly` | Licenza a pagamento a rinnovo mensile |
| Annuale | `annual` | Licenza a pagamento a rinnovo annuale |

## Tabelle DB principali

`vendors`, `vendor_tokens`, `products`, `clients`, `client_billing`, `otp_codes`, `licenses`, `client_tokens`, `modules`, `license_modules`, `messages`, `email_templates`, `client_activity_logs`, `alarm_logs`

**Nuove in v4:** `otp_attempts` (tentativi OTP falliti), `rate_limits` (rate limiting per IP/client), `idempotency_keys` (cache risposte F5)

**Nuove in v4 — sezione 12 (decisione Alvise 09/06/2026):**
- `vendor_general_setup` — 1 record per istanza; contiene `default_check_interval_hours` (default 24h)
- `vendor_event_config` — 1 riga per tipo evento; campi: `event_code`, `enabled` (ON/OFF), `check_interval_hours` (NULL = usa default), `settings_json`, `last_run_at`

**Aggiornate in v4:** `vendors` (+`api_key_hash`, `api_key_revoked_at`, `api_key_history`), `alarm_logs` (+`retry_count`, `last_retry_at`, `next_retry_at`, `max_retries`, `permanently_failed`)

## Punti chiave dell'analisi v3 (correzioni rispetto a v2)

1. **Validazione offline** — `offline_token` crittografato salvato localmente dal client
3. **Frequenza check configurabile** — `license_check_frequency_days` in tabella `products`
4. **Template email in DB** — tabella `email_templates` con chiavi `{placeholder}`, nessun testo hardcoded
5. **Dati fatturazione separati** — raccolti solo al primo acquisto (tabella `client_billing`)
6. **Revoca licenza** — endpoint F8 con invalidazione offline_token
7. **Trigger attivazione configurabile** — `invoice_issued` o `payment_received`
8. **Email fallback GET ALARM** — inviata al fornitore se ERP non raggiungibile
9. **Validazione P.IVA esterna** — da valutare (es. VIES per clienti EU)

## Novità v4 (pronto per implementazione)

1. **Error handling standardizzato** — 60+ codici errore per ogni endpoint, formato JSON uniforme con `error_code`, `message`, `details`, `timestamp`, `request_id`
2. **Idempotenza** — C2 (check-before-create), F4 (idempotent UPDATE), F5 (Idempotency-Key header + tabella `idempotency_keys`, cache 24h)
3. **Sicurezza tecnica** — JWT RS256 (TTL 60s), refresh token (TTL 1h), license_key via HMAC-SHA256, OTP SHA256 in DB (max 3 tentativi, lockout 30min), API key vendor bcrypt rounds=12, rate limiting su C1/C3/F1
4. **Design API completato** — HTTP status esatti per ogni endpoint (es. C1→201, C2→200, F5→201), response body completi, paginazione F3 (`?page&limit`, max 100)
5. **Nuovi endpoint** — C7/C7b (cambio email con OTP), F9 (rotation API key vendor)
6. **Scenari edge-case** — provisional→standard via F5, idempotency recovery su timeout F5, offline >7 giorni
7. **[Decisione Alvise 09/06/2026] Architettura multi-tenant + sistema eventi** — istanza mono-vendor (VENDOR come chiave principale); `vendor_general_setup` (1 record di config); `vendor_event_config` (eventi schedulati ON/OFF indipendenti dalle API); C2 non chiama più O1 direttamente (imposta solo `vendor_synced=false`); O1 è esclusivo responsabilità dei job schedulati; 5 eventi predefiniti: `NEW_REGISTRATION`, `LICENSE_EXPIRING`, `LICENSE_EXPIRED`, `CLIENT_INACTIVE`, `ALARM_RETRY`

## Visualizzare i diagrammi

Aprire `Flowchart_Servizio_Gestione_Licenze.md` in VS Code con `Ctrl+Shift+V`.
Estensione richiesta: **Markdown Preview Mermaid Support** (già installata).
In alternativa i diagrammi si vedono direttamente su GitHub.

## Piano di sviluppo (TO-DO)

12 TO-DO in ordine logico di implementazione. Dettaglio completo in `sviluppo_v0.md` e nel Piano di Progetto docx.

| TO-DO | Descrizione | Stima | Settimana |
|---|---|---|---|
| TD-01 | Setup Node.js + Fastify + SQLite + Knex | 3gg | Sett.1 |
| TD-02 | Schema DB + migrazioni (incl. tabelle v4 + `vendor_general_setup` + `vendor_event_config`) | 2gg | Sett.1 |
| TD-03 | Auth fornitore JWT — F1, F2 | 2gg | Sett.2 |
| TD-04 | Registrazione prodotti — F6 | 1gg | Sett.2 |
| TD-05 | Registrazione cliente + OTP + VIES + AES — C1, C2, C3 | 4gg | Sett.2–3 |
| TD-06 | Verifica licenza + poll messaggi — C4, C5, C6 | 2gg | Sett.3 |
| TD-07 | Sincronizzazione fornitore — F3, F4, O1 | 2gg | Sett.3 |
| TD-08 | Attivazione licenze a pagamento — F5 | 2gg | Sett.4 |
| TD-09 | Licenza Provvisoria — F7, F8 | 3gg | Sett.4 |
| TD-10 | Job schedulati node-cron — sistema eventi da `vendor_event_config` (sezione 12) | 3gg | Sett.5 |
| TD-11 | Sistema messaggi + template Handlebars | 2gg | Sett.5 |
| TD-12 | Test Jest + Swagger + bugfix | 3gg | Sett.6 |

**Totale:** 27gg (~5,5 settimane) + 7gg buffer = **7 settimane**

**TO-DO critico:** TD-05 — ha il maggior numero di GAP tecnici (VIES, AES-256-GCM, Nodemailer). Fare uno spike su VIES prima di iniziarlo.

## Domande aperte (da risolvere col team)

- Fastify o Express? (raccomandato Fastify)
- Quale provider email usare (SendGrid, Mailgun, Brevo)?
- VIES obbligatorio o facoltativo nella v1?
- Comportamento alla scadenza dell'`offline_token`: blocco immediato, modalità di grazia 3 giorni, o downgrade funzioni? (v4 sezione 11.5 documenta i 3 scenari)
- Servizio esterno per validazione P.IVA: quale e a che costo? (VIES per EU)
- Pannello di amministrazione per il Service Invoice: sì o no?
- IBAN del cliente in `client_billing`: necessario solo se il fornitore usa addebito diretto SEPA, altrimenti il pagamento vive nell'ERP del fornitore.
- Divisione TO-DO tra Andrea e Cristina.
