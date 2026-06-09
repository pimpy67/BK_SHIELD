# Sviluppo BK_SHIELD — Guida di avvio backend (v0)

> Documento redatto il 09/06/2026 sulla base di:
> - `Analisi_Servizio_Gestione_Licenze_v4_correzioni.md`
> - `Piano_di_Progetto_Servizio_Gestione_Licenze (to_do).docx`

---

## Prima dell'OK di Alvise: 3 decisioni da portargli già risolte

Il Piano di Progetto è già ottimo — 12 TO-DO, 27 giorni stimati. Prima di scrivere la prima riga di codice, ci sono tre gap tecnici che lui (o il team) deve sbloccare, altrimenti ci si blocca al TD-01:

| Decisione | Opzioni | Raccomandazione |
|---|---|---|
| **Framework** | Express vs Fastify | **Fastify** — validazione schema integrata (rilevante per 60+ codici errore v4), più performante, differenza minima di apprendimento |
| **ORM/Query builder** | Knex.js, Drizzle ORM, better-sqlite3 nativo | **Knex.js** — migrazioni integrate, supporto SQLite maturo, già citato nel Piano |
| **Provider email** | SendGrid, Mailgun, Brevo, SMTP generico | Qualunque — ma va deciso ora perché C1/C2 dipendono da Nodemailer configurato |

---

## Come si parte: TD-01 + TD-02 in dettaglio

Una volta avuto l'OK, la sequenza concreta è:

### Settimana 1 — TD-01: Setup (3gg)

Struttura cartelle del progetto:

```
BK_SHIELD/
├── src/
│   ├── routes/          ← endpoint C* e F*
│   ├── services/        ← logica business
│   ├── middleware/      ← auth JWT, rate limit
│   ├── db/              ← init SQLite + migration runner
│   └── utils/           ← generazione OTP, HMAC, AES
├── migrations/          ← file .js Knex in ordine numerato
├── tests/               ← Jest + Supertest
├── .env.example
└── server.js
```

Dipendenze da installare:

```bash
npm init -y
npm install fastify @fastify/jwt knex better-sqlite3 bcryptjs nodemailer dotenv
npm install -D jest supertest
```

### Settimana 1 — TD-02: Schema DB (2gg)

Le tabelle v4 da aggiungere rispetto a quelle già nel Piano di Progetto:

```sql
-- Nuove in v4
CREATE TABLE otp_attempts (...)
CREATE TABLE rate_limits (...)
CREATE TABLE idempotency_keys (...)

-- Modifiche a tabelle esistenti
ALTER TABLE vendors ADD COLUMN api_key_hash ...
ALTER TABLE alarm_logs ADD COLUMN retry_count ...
ALTER TABLE alarm_logs ADD COLUMN last_retry_at ...
ALTER TABLE alarm_logs ADD COLUMN next_retry_at ...
ALTER TABLE alarm_logs ADD COLUMN max_retries ...
```

> **Attenzione:** Il Piano di Progetto non ha ancora recepito le 3 nuove tabelle di v4 (`otp_attempts`, `rate_limits`, `idempotency_keys`) né le colonne aggiuntive su `vendors` e `alarm_logs`. Il TD-02 va aggiornato prima di iniziare.

---

## Ordine di sviluppo consigliato (fedele al Piano)

```
Sett.1  TD-01 Setup ──────────────────────────────────── [3gg]
        TD-02 Schema DB + migrazioni ─────────────────── [2gg]

Sett.2  TD-03 Auth fornitore F1+F2 ──────────────────── [2gg]
        TD-04 Registra prodotto F6 ───────────────────── [1gg]
        TD-05 C1+C2+C3 (VIES, OTP, AES) ──────────────  [4gg] ← più rischi

Sett.3  TD-06 C4+C5+C6 ──────────────────────────────── [2gg]
        TD-07 F3+F4+O1 ───────────────────────────────── [2gg]

Sett.4  TD-08 F5 licenza a pagamento ────────────────── [2gg]
        TD-09 Licenza Provvisoria F7+F8 ─────────────── [3gg]

Sett.5  TD-10 Job cron ───────────────────────────────── [3gg]
        TD-11 Messaggi + template ───────────────────── [2gg]

Sett.6  TD-12 Test Jest + Swagger + bugfix ──────────── [3gg]

TOTALE: 27gg (~5,5 settimane) + 7gg buffer = 7 settimane
```

---

## Il punto di attenzione più critico: TD-05

Il Piano stesso lo segnala come il TO-DO con più GAP. Contiene:

- Chiamata VIES (REST/SOAP, gestione timeout, fallback)
- Generazione file AES-256-GCM con `crypto` nativo Node
- Nodemailer configurato con provider reale
- Rate limiting OTP

**Suggerimento pratico:** Prima ancora di iniziare TD-05, aprire uno spike di mezza giornata su VIES — verificare che il servizio risponda e capire se usare l'interfaccia REST o SOAP. È il rischio tecnico più alto dell'intero progetto.

---

## Cosa portare ad Alvise per l'OK

Checklist minima per la riunione:

- [ ] Fastify o Express?
- [ ] Provider email scelto?
- [ ] VIES obbligatorio o facoltativo nella v1?
- [ ] Comportamento `offline_token` scaduto (sezione 11.5 v4 — 3 scenari: blocco immediato, grazia 3gg, downgrade funzioni)
- [ ] Chi sviluppa cosa? (Andrea + Cristina — divisione TO-DO tra i due)

---

## Stack tecnologico riepilogativo

| Livello | Scelta | Note |
|---|---|---|
| Runtime | Node.js | Decisione di Alvise (C# escluso) |
| Framework | Fastify (raccomandato) | Alternativa: Express |
| Database | SQLite via Knex.js | better-sqlite3 come driver |
| Auth | JWT RS256 + refresh token rotation | TTL 60s JWT, TTL 1h refresh |
| Hashing | bcrypt (rounds=12) per API key, SHA256 per OTP | |
| Crittografia offline | AES-256-GCM via `crypto` nativo Node | Nessuna dipendenza esterna |
| Email | Nodemailer + provider da scegliere | SendGrid / Mailgun / Brevo |
| Test | Jest + Supertest | |
| Documentazione API | Swagger UI (swagger-jsdoc) | |
| Job schedulati | node-cron | |
| Frontend | Ionic | Fase successiva — non in scope v1 |

---

*Aggiornare questo file man mano che le decisioni vengono prese e i TO-DO completati.*
