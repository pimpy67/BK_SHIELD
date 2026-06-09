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

- [ ] **Comportamento `offline_token` scaduto** — quale dei 3 scenari?

  > **Cos'è l'`offline_token`:** token crittografato salvato localmente sull'app del cliente.
  > Permette all'app di funzionare **senza connessione internet** per 7–10 giorni.
  > (Il JWT normale — usato per le chiamate API — si rinnova da solo ogni 60 secondi e non è mai un problema.)
  > Se il cliente non si connette entro la scadenza dell'`offline_token`, cosa succede?

  - **Blocco immediato** — l'app si ferma finché non si riconnette
  - **Modalità di grazia 3 giorni** — l'app continua con avviso "sincronizza entro X giorni"
  - **Downgrade funzioni** — l'app continua con solo i moduli base, quelli premium disabilitati

- [ ] **Pannello di amministrazione** per il Service Invoice: sì o no?

- [ ] **IBAN del cliente** in `client_billing`: necessario?
  *(Solo se il fornitore usa addebito diretto SEPA)*

---

## Organizzazione team

- [ ] **Divisione TO-DO tra Andrea e Cristina**
  *(12 TO-DO, 27 giorni lavorativi stimati — ~7 settimane con buffer)*

---

*BK_SHIELD — Servizio Gestione Licenze — 09/06/2026*
