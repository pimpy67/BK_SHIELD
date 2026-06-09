# BK_SHIELD — Servizio Gestione Licenze

Backend per la gestione del ciclo di vita delle licenze software, denominato **Service Invoice** (o BK Invoice Service). Fa da intermediario tra la libreria client (integrata nelle app del produttore) e l'ERP del fornitore.

---

## Architettura

Tre componenti principali:

```
App Cliente                 Service Invoice             ERP Fornitore
┌──────────────┐            ┌─────────────┐            ┌──────────────┐
│ Libreria     │ C1–C7b     │             │ F1–F9      │              │
│ Client       │ ─────────► │   Backend   │ ◄───────── │  Sistema ERP │
│ (integrata)  │            │             │            │              │
└──────────────┘            │             │ ──────────►│  O1 GET ALARM│
                            └─────────────┘            └──────────────┘
```

Il server è **passivo**: risponde alle chiamate, non le inizia — unica eccezione: **O1 GET ALARM**, chiamata uscente gestita esclusivamente dai job schedulati (mai in real-time da una chiamata API).

---

## Stack tecnologico

| Componente | Tecnologia |
|---|---|
| Backend | Node.js + Fastify |
| Database | SQLite |
| ORM | Knex.js + better-sqlite3 |
| Auth | JWT RS256 + refresh token rotation; API key bcrypt rounds=12 |
| Crittografia offline | AES-256-GCM via `crypto` nativo Node.js |
| Email | Nodemailer |
| Job schedulati | node-cron |
| Test | Jest + Supertest |
| Documentazione API | Swagger UI (swagger-jsdoc) |

---

## Endpoint

### Lato cliente (C1–C7b)

| Codice | Metodo | Path | Descrizione |
|---|---|---|---|
| C1 | POST | `/api/client/register` | Registrazione, salva cliente come `pending`, invia OTP |
| C2 | POST | `/api/client/verify-otp` | Verifica OTP, attiva trial, genera JWT + license_key |
| C3 | POST | `/api/client/resend-otp` | Nuovo OTP se scaduto |
| C4 | GET | `/api/client/license/status` | Check periodico stato licenza |
| C5 | GET | `/api/client/messages` | Poll messaggi in-app |
| C6 | POST | `/api/client/token/refresh` | Rinnovo JWT (refresh token rotation) |
| C7 | POST | `/api/client/change-email` | Avvia cambio email con OTP |
| C7b | POST | `/api/client/verify-email-change` | Completa cambio email |

### Lato fornitore (F1–F9)

| Codice | Metodo | Path | Descrizione |
|---|---|---|---|
| F1 | POST | `/api/vendor/auth/login` | Autenticazione con API key |
| F2 | POST | `/api/vendor/token/refresh` | Rinnovo token fornitore |
| F3 | GET | `/api/vendor/registrations/new` | Nuove iscrizioni da processare (paginato) |
| F4 | POST | `/api/vendor/registrations/confirm` | Conferma ricezione iscrizioni *(idempotente)* |
| F5 | POST | `/api/vendor/license/activate` | Attivazione licenza a pagamento *(idempotente via Idempotency-Key)* |
| F6 | POST | `/api/vendor/products` | Registrazione nuovo prodotto |
| F7 | POST | `/api/vendor/client/billing` | Dati fatturazione al primo acquisto |
| F8 | POST | `/api/vendor/license/revoke` | Revoca licenza |
| F9 | POST | `/api/vendor/auth/rotate-key` | Rotation API key vendor |

### Uscente (O1)

| Codice | Metodo | Path | Descrizione |
|---|---|---|---|
| O1 | GET | `{vendor_erp_url}/alarm` | GET ALARM verso ERP — esclusivamente dai job schedulati |

---

## Sistema eventi schedulati

Ogni notifica verso l'ERP è gestita da **job indipendenti**, configurati nella tabella `vendor_event_config`. Ogni evento può essere abilitato o disabilitato singolarmente.

| Evento | Condizione | O1 |
|---|---|---|
| `NEW_REGISTRATION` | `vendor_synced = false` | ✅ |
| `LICENSE_EXPIRING` | Scadenza entro soglia configurata | ✅ |
| `LICENSE_EXPIRED` | `expires_at < now()` | ✅ |
| `CLIENT_INACTIVE` | Nessuna chiamata C5 da N giorni | ❌ |
| `ALARM_RETRY` | Retry GET ALARM falliti | ✅ |

---

## Tipi di licenza

| Tipo | Codice | Descrizione |
|---|---|---|
| Trial Demo | `trial` | Prova gratuita, durata e moduli configurabili per prodotto |
| Mensile | `monthly` | Licenza a pagamento a rinnovo mensile |
| Annuale | `annual` | Licenza a pagamento a rinnovo annuale |
| Provvisoria | `provisional` | In attesa di conferma pagamento, upgradabile tramite F5 |

---

## Documentazione

| File | Descrizione |
|---|---|
| `Endpoint_Servizio_Gestione_Licenze_v5.md` | Riferimento endpoint — scopo, request body, controlli, risposte JSON |
| `Analisi_Servizio_Gestione_Licenze_v4_correzioni.md` | Analisi tecnica master — error handling, idempotenza, sicurezza, sezione 12 |
| `Flowchart_Servizio_Gestione_Licenze.md` | 13 diagrammi Mermaid del flusso completo |
| `ERROR_REFERENCE_MATRIX.md` | Matrice di tutti i codici errore |
| `sviluppo_v0.md` | Guida avvio sviluppo — struttura progetto, Gantt |

> I diagrammi Mermaid si visualizzano direttamente su GitHub o in VS Code con l'estensione **Markdown Preview Mermaid Support**.

---

## Piano di sviluppo

12 TO-DO in ordine logico di implementazione — circa **7 settimane** (27gg lavoro + 7gg buffer).

| TO-DO | Descrizione | Settimana |
|---|---|---|
| TD-01 | Setup Node.js + Fastify + SQLite + Knex | Sett. 1 |
| TD-02 | Schema DB + migrazioni (incl. `vendor_general_setup`, `vendor_event_config`) | Sett. 1 |
| TD-03 | Auth fornitore JWT — F1, F2 | Sett. 2 |
| TD-04 | Registrazione prodotti — F6 | Sett. 2 |
| TD-05 | Registrazione cliente + OTP + VIES + AES — C1, C2, C3 | Sett. 2–3 |
| TD-06 | Verifica licenza + poll messaggi — C4, C5, C6 | Sett. 3 |
| TD-07 | Sincronizzazione fornitore — F3, F4, O1 | Sett. 3 |
| TD-08 | Attivazione licenze a pagamento — F5 | Sett. 4 |
| TD-09 | Licenza provvisoria — F7, F8 | Sett. 4 |
| TD-10 | Job schedulati node-cron — sistema eventi da `vendor_event_config` | Sett. 5 |
| TD-11 | Sistema messaggi + template Handlebars | Sett. 5 |
| TD-12 | Test Jest + Swagger + bugfix | Sett. 6 |

---

*Ultimo aggiornamento: 09/06/2026*
