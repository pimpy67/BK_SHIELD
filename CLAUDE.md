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

- **Backend:** Python o Node.js (C# escluso — decisione di Alvise)
- **Frontend:** Ionic — sviluppo posticipato
- **Repository GitHub:** https://github.com/pimpy67/BK_SHIELD
- **Git identity:** user.name = pimpy67, user.email = andreapavan67@gmail.com

## File nel repository

| File | Descrizione |
|---|---|
| `Analisi_Servizio_Gestione_Licenze_v2.docx` / `.odt` | Analisi originale del team (con lacune rispetto alle direttive di Alvise) |
| `Analisi_Servizio_Gestione_Licenze_v2_AGGIORNATA.md` / `.docx` | Versione v2 con correzioni intermedie |
| `Analisi_Servizio_Gestione_Licenze_v3.md` | Analisi con correzioni di Alvise (sezioni 1–5) |
| `Analisi_Servizio_Gestione_Licenze_v4_correzioni.md` | **Versione corrente** — estende v3 con error handling, idempotenza, sicurezza, edge case |
| `v3_to_v4_CHANGELOG.md` | Changelog dettagliato delle novità v3→v4 |
| `ERROR_REFERENCE_MATRIX.md` | Matrice di riferimento di tutti i codici errore |
| `Flowchart_Servizio_Gestione_Licenze.md` | 9 diagrammi Mermaid del flusso completo (richiesti da Luca) |
| `Riepilogo servizio fatturazione.md` | Verbale della riunione del 04/06/2026 con le direttive di Alvise |

## Architettura del sistema

Tre componenti:
1. **Service Invoice** — server backend centrale
2. **Libreria Client** — integrata nelle app del produttore, comunica via C1–C6
3. **App Fornitore / ERP** — comunica via F1–F8, riceve notifiche O1

Il server è **passivo**: risponde alle chiamate, non le inizia (unica eccezione: O1 GET ALARM e messaggi schedulati).

## Endpoint principali

### Client (C1–C7b)
- `C1 POST /api/client/register` — registrazione automatica all'installazione
- `C2 POST /api/client/verify-otp` — verifica OTP, attiva trial, genera license_key *(idempotente)*
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
| Standard | `standard` | Licenza a pagamento mensile o annuale |
| Provvisoria | `provisional` | Stessa della standard ma breve (~30 gg), in attesa di pagamento |

## Tabelle DB principali

`vendors`, `vendor_tokens`, `products`, `clients`, `client_billing`, `otp_codes`, `contratti`, `client_tokens`, `modules`, `contratto_modules`, `messages`, `email_templates`, `client_activity_logs`, `alarm_logs`

**Nuove in v4:** `otp_attempts` (tentativi OTP falliti), `rate_limits` (rate limiting per IP/client), `idempotency_keys` (cache risposte F5)

**Aggiornate in v4:** `vendors` (+`api_key_hash`, `api_key_revoked_at`, `api_key_history`), `alarm_logs` (+`retry_count`, `last_retry_at`, `next_retry_at`, `max_retries`)

> La tabella ponte cliente-prodotto-moduli si chiama **`contratti`** (nomenclatura stabilita da Alvise).

## Punti chiave dell'analisi v3 (correzioni rispetto a v2)

1. **Licenza Provvisoria** — terzo tipo aggiunto
2. **Validazione offline** — `offline_token` crittografato salvato localmente dal client
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
6. **Scenari edge-case** — O1 retry ogni 15min (max 3, poi email fallback), C2 con O1 parziale (HTTP 500 ma JWT+license_key ritornati al client), provisional→standard via F5, idempotency recovery su timeout F5, offline >7 giorni

## Visualizzare i diagrammi

Aprire `Flowchart_Servizio_Gestione_Licenze.md` in VS Code con `Ctrl+Shift+V`.
Estensione richiesta: **Markdown Preview Mermaid Support** (già installata).
In alternativa i diagrammi si vedono direttamente su GitHub.

## Domande aperte (da risolvere col team)

- Quale provider email usare (SendGrid, Mailgun, ecc.)?
- Comportamento alla scadenza dell'`offline_token`: blocco immediato, modalità di grazia 3 giorni, o downgrade funzioni? (v4 sezione 11.5 documenta i 3 scenari)
- Servizio esterno per validazione P.IVA: quale e a che costo? (VIES per EU)
- Pannello di amministrazione per il Service Invoice: sì o no?
