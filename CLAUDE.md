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
| `Analisi_Servizio_Gestione_Licenze_v3.md` | Analisi aggiornata con tutte le correzioni di Alvise |
| `Flowchart_Servizio_Gestione_Licenze.md` | 9 diagrammi Mermaid del flusso completo (richiesti da Luca) |
| `Riepilogo servizio fatturazione.md` | Verbale della riunione del 04/06/2026 con le direttive di Alvise |

## Architettura del sistema

Tre componenti:
1. **Service Invoice** — server backend centrale
2. **Libreria Client** — integrata nelle app del produttore, comunica via C1–C6
3. **App Fornitore / ERP** — comunica via F1–F8, riceve notifiche O1

Il server è **passivo**: risponde alle chiamate, non le inizia (unica eccezione: O1 GET ALARM e messaggi schedulati).

## Endpoint principali

### Client (C1–C6)
- `C1 POST /api/client/register` — registrazione automatica all'installazione
- `C2 POST /api/client/verify-otp` — verifica OTP, attiva trial, genera license_key
- `C3 POST /api/client/resend-otp` — nuovo OTP se scaduto
- `C4 GET /api/client/license/status` — check periodico (frequenza configurabile in DB)
- `C5 GET /api/client/messages` — poll messaggi in-app
- `C6 POST /api/client/token/refresh` — rinnovo JWT

### Fornitore (F1–F8)
- `F1 POST /api/vendor/auth/login` — autenticazione con API key
- `F2 POST /api/vendor/token/refresh` — rinnovo token fornitore
- `F3 GET /api/vendor/registrations/new` — nuove iscrizioni da processare
- `F4 POST /api/vendor/registrations/confirm` — conferma ricezione iscrizioni
- `F5 POST /api/vendor/license/activate` — attivazione licenza a pagamento
- `F6 POST /api/vendor/products` — registrazione nuovo prodotto
- `F7 POST /api/vendor/client/billing` — dati fatturazione al primo acquisto
- `F8 POST /api/vendor/license/revoke` — revoca licenza

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

## Visualizzare i diagrammi

Aprire `Flowchart_Servizio_Gestione_Licenze.md` in VS Code con `Ctrl+Shift+V`.
Estensione richiesta: **Markdown Preview Mermaid Support** (già installata).
In alternativa i diagrammi si vedono direttamente su GitHub.

## Domande aperte (da risolvere col team)

- Quale provider email usare (SendGrid, Mailgun, ecc.)?
- Quanto tempo può funzionare un client offline prima del blocco?
- Comportamento alla scadenza del token offline: blocco immediato o modalità di grazia?
- Servizio esterno per validazione P.IVA: quale e a che costo?
- Passaggio automatico da `provisional` a `standard` dopo conferma pagamento?
- Pannello di amministrazione per il Service Invoice: sì o no?
