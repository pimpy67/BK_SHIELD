# BK_SHIELD — Domande per Alvise
### Riunione pre-avvio sviluppo

---

## Decisioni tecniche bloccanti

- [ ] **Framework backend:** Fastify o Express?
  *(Fastify consigliato: validazione schema integrata, più performante)*

- [ ] **Provider email:** SendGrid, Mailgun o Brevo?
  *(Necessario per C1/C2 — invio OTP)*

- [ ] **VIES obbligatorio nella v1?**
  *(Validazione P.IVA EU — ha dipendenza esterna e rischio timeout)*

---

## Decisioni funzionali

- [ ] **Comportamento offline_token scaduto** — quale dei 3 scenari?
  - Blocco immediato
  - Modalità di grazia 3 giorni (funzionamento limitato)
  - Downgrade funzioni (solo moduli essenziali)

- [ ] **Pannello di amministrazione** per il Service Invoice: sì o no?

- [ ] **IBAN del cliente** in `client_billing`: necessario?
  *(Solo se il fornitore usa addebito diretto SEPA)*

---

## Organizzazione team

- [ ] **Divisione TO-DO tra Andrea e Cristina**
  *(12 TO-DO, 27 giorni lavorativi stimati — ~7 settimane con buffer)*

---

*BK_SHIELD — Servizio Gestione Licenze — 09/06/2026*
