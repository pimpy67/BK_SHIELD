# Flowchart – Servizio Gestione Licenze

> Visualizzare in VS Code con l'estensione **Markdown Preview Mermaid Support**, oppure su GitHub / [mermaid.live](https://mermaid.live).

---

## Diagramma 1 — Architettura generale

```mermaid
flowchart LR
    subgraph CLIENT["App Cliente"]
        LIB["Libreria Client\n(integrata nell'app)"]
    end

    subgraph SERVER["Service Invoice (Backend)"]
        SRV["Service Invoice"]
    end

    subgraph FORNITORE["ERP Fornitore"]
        ERP["Sistema ERP"]
    end

    LIB -->|"C1–C6  REST"| SRV
    ERP -->|"F1–F8  REST"| SRV
    SRV -->|"O1  GET ALARM"| ERP
    SRV -->|"Email / In-app"| LIB
    SRV -->|"Email fallback"| ERP
```

---

## Diagramma 2 — Configurazione iniziale del fornitore

```mermaid
flowchart TD
    START(["Nuovo fornitore"]) --> F1["F1: POST /api/vendor/auth/login\nInvia API key statica"]
    F1 --> AUTH{"API key\nvalida?"}
    AUTH -->|No| ERR1["Errore 401"]
    AUTH -->|Sì| JWT1["Emette JWT breve durata\n+ refresh token 1h"]
    JWT1 --> F6["F6: POST /api/vendor/products\nRegistra product_key + nome prodotto"]
    F6 --> PROD["Prodotto salvato in DB\ncon parametri:\n- durata trial\n- max utenti trial\n- frequenza check licenza"]
    PROD --> READY(["Fornitore operativo\nClienti possono registrarsi"])

    JWT1 --> F2["F2: POST /api/vendor/token/refresh\nQuando JWT scade"]
    F2 --> JWT1
```

---

## Diagramma 3 — Registrazione cliente e attivazione trial

```mermaid
flowchart TD
    START(["App installata\nprima volta"]) --> C1["C1: POST /api/client/register\nproduct_key + P.IVA + ragione sociale\n+ paese + email + lingua"]

    C1 --> CHK1{"product_key\nesiste?"}
    CHK1 -->|No| ERR1["Errore 400\nProdotto non trovato"]

    CHK1 -->|Sì| CHK2{"P.IVA + product_key\ngià registrati?"}
    CHK2 -->|Sì - licenza attiva| RETURN(["Restituisce dati\nlicenza esistente\nvedi Diagramma 6"])
    CHK2 -->|Sì - trial già usata| BLOCK["Errore 409\nMessaggio in-app:\nREGISTRAZIONE_BLOCCATA"]
    CHK2 -->|No| SAVE["Salva cliente\nstatus: pending"]

    SAVE --> OTP["Genera codice OTP\nInvia email OTP_VERIFICA"]
    OTP --> C2["C2: POST /api/client/verify-otp\nCliente inserisce codice"]

    C2 --> CHK3{"OTP valido\ne non scaduto?"}
    CHK3 -->|Codice errato| ERR2["Errore 401"]
    CHK3 -->|OTP scaduto| C3["C3: POST /api/client/resend-otp\nNuovo OTP generato"]
    C3 --> OTP

    CHK3 -->|Sì| ACT["Attiva cliente\nstatus: active"]
    ACT --> CONT["Genera license_key con salt random\nCrea contratto tipo: trial\nstatus: active"]
    CONT --> OFFLINE["Genera offline_token\ncrittografato"]
    OFFLINE --> TOKENS["Emette JWT + refresh token\nper il client"]
    TOKENS --> ALARM["O1: GET ALARM\nNEW_REGISTRATION → ERP"]
    ALARM --> NOTIFY["Email BENVENUTO_TRIAL → Cliente\nIn-app BENVENUTO_TRIAL → Cliente\nEmail NUOVA_REGISTRAZIONE → Fornitore"]
    NOTIFY --> END(["Client operativo\nin modalità trial"])
```

---

## Diagramma 4 — Funzionamento ordinario della licenza

```mermaid
flowchart TD
    START(["Client operativo"]) --> C4["C4: GET /api/client/license/status\nperiodico ogni N giorni\ndove N = license_check_frequency_days"]

    C4 --> CHK_AUTH{"JWT valido?"}
    CHK_AUTH -->|No| C6["C6: POST /api/client/token/refresh\nUsa refresh token"]
    C6 --> CHK_REF{"Refresh token\nvalido?"}
    CHK_REF -->|No - scaduto dopo 1h| CONTACT["Client contatta\nil produttore"]
    CHK_REF -->|Sì| NEW_JWT["Nuovo JWT\nRefresh token ruotato"]
    NEW_JWT --> C4

    CHK_AUTH -->|Sì| CHK_LIC{"Licenza\nancora valida?"}
    CHK_LIC -->|No| EXP["status → expired\nO1: LICENSE_EXPIRED"]
    EXP --> NOTIFY_EXP["Email LICENZA_SCADUTA → Cliente\nIn-app LICENZA_SCADUTA → Cliente\nEmail LICENZA_SCADUTA → Fornitore"]

    CHK_LIC -->|Sì| UPD["Aggiorna offline_token\nRestituisce stato + moduli"]
    UPD --> C5["C5: GET /api/client/messages\nPoll periodico messaggi in-app"]
    C5 --> MSG{"Messaggi\nin coda?"}
    MSG -->|Sì| DELIVER["Consegna messaggi\nAggiorna delivered_at"]
    MSG -->|No| LOG["Aggiorna last_seen_at\nin client_activity_logs"]
    DELIVER --> LOG
    LOG --> START
```

---

## Diagramma 5 — Sincronizzazione fornitore e attivazione licenza a pagamento

```mermaid
flowchart TD
    ALARM_IN(["O1: GET ALARM ricevuto\ndall'ERP del fornitore"]) --> F3["F3: GET /api/vendor/registrations/new\nScarica nuove iscrizioni\nvendor_synced = false"]
    F3 --> PROCESS["ERP processa i dati\ndel cliente"]
    PROCESS --> F4["F4: POST /api/vendor/registrations/confirm\nConferma ricezione ID iscrizioni"]
    F4 --> SYNCED["vendor_synced = true\nIscrizioni non restituite\nalle chiamate successive"]

    PAYMENT(["Cliente paga la licenza"]) --> TRIGGER{"Trigger\nconfigurabile"}
    TRIGGER -->|invoice_issued| F5
    TRIGGER -->|payment_received| F5
    F5["F5: POST /api/vendor/license/activate\nvat_number + product_key\ntipo: standard o provisional\ndate + max_users + moduli"] --> CHK_CLIENT{"Cliente\nesiste?"}
    CHK_CLIENT -->|No| ERR["Errore 404"]
    CHK_CLIENT -->|Sì| DEACT["Disattiva contratto\nprecedente\ndeactivated_at = now"]
    DEACT --> NEW_LIC["Crea nuovo contratto\ntipo: standard o provisional"]
    NEW_LIC --> NEW_OFFLINE["Aggiorna offline_token"]
    NEW_OFFLINE --> NOTIFY_ACT["Email LICENZA_ATTIVATA → Cliente\nIn-app LICENZA_ATTIVATA → Cliente"]
    NOTIFY_ACT --> END(["Licenza attiva"])

    BILLING(["Primo acquisto"]) --> F7["F7: POST /api/vendor/client/billing\nPEC + SDI + indirizzo fatturazione"]
    F7 --> SAVED_BILL["Dati salvati in client_billing\nUsati per fatturazione elettronica"]
```

---

## Diagramma 6 — Ciclo di vita della licenza e tipi

```mermaid
flowchart TD
    REG(["Cliente registrato"]) --> TRIAL["Contratto: TRIAL\nDurata configurabile per prodotto\nModuli configurabili"]

    TRIAL --> WARN_T["Avvisi scadenza trial:\n7 gg, 3 gg, 1 gg prima\nO1: LICENSE_EXPIRING"]
    WARN_T --> CHK_T{"Rinnovo\npagato?"}

    CHK_T -->|Sì - pagamento immediato| STANDARD["Contratto: STANDARD\nstessa licenza, durata piena\nstessi moduli"]
    CHK_T -->|In attesa di pagamento| PROV["Contratto: PROVISIONAL\nstessi moduli della standard\ndurata breve ~30 gg\nin attesa di conferma pagamento"]
    CHK_T -->|No| EXPIRED(["Contratto: EXPIRED\nAccesso sospeso"])

    PROV --> CHK_P{"Pagamento\nconfermato?"}
    CHK_P -->|Sì - F5| STANDARD
    CHK_P -->|No entro scadenza| EXPIRED

    STANDARD --> WARN_S["Avvisi scadenza standard:\nMensile: 7,3,1 gg\nAnnuale: 10 step da 3 mesi a 1 gg\nO1: LICENSE_EXPIRING"]
    WARN_S --> CHK_S{"Rinnovo\npagato?"}
    CHK_S -->|Sì| STANDARD
    CHK_S -->|In attesa| PROV
    CHK_S -->|No| EXPIRED

    STANDARD --> REVOKE["F8: POST /api/vendor/license/revoke\nRevoca per mancato pagamento"]
    REVOKE --> REVOKED(["Contratto: REVOKED\noffline_token invalidato\nEmail LICENZA_REVOCATA → Cliente"])
```

---

## Diagramma 7 — Validazione offline

```mermaid
flowchart TD
    START(["App avviata"]) --> CONN{"Connessione\ndisponibile?"}

    CONN -->|Sì| C4["C4: GET /api/client/license/status"]
    C4 --> SRV_OK{"Risposta\nserver OK?"}
    SRV_OK -->|Licenza valida| UPD["Aggiorna offline_token\nlocale"]
    UPD --> RUN(["App operativa"])
    SRV_OK -->|Licenza expired/revoked| BLOCK(["App bloccata\nnotifica utente"])

    CONN -->|No| READ["Legge offline_token\nsalvato localmente"]
    READ --> CHK{"offline_token\nvalido e non scaduto?"}
    CHK -->|Sì| RUN_OFF(["App operativa\nmodalità offline\nfinché token valido"])
    CHK -->|Scaduto| GRACE{"Policy\nprodotto"}
    GRACE -->|Grazia configurata| WARN_RUN(["App operativa con avviso\nrichiedere connessione\nal più presto"])
    GRACE -->|Blocco immediato| BLOCK
```

---

## Diagramma 8 — Job schedulati e monitoraggio

```mermaid
flowchart TD
    JOB(["Job schedulato\neseguito periodicamente"]) --> CHK1{"Licenze con\nscadenza imminente?"}
    CHK1 -->|Sì| WARN["Invia avvisi scadenza\nEmail + In-app SCADENZA_IMMINENTE\nO1: LICENSE_EXPIRING → ERP"]

    JOB --> CHK2{"Licenze scadute\noggi?"}
    CHK2 -->|Sì| EXP["status → expired\nO1: LICENSE_EXPIRED\nEmail LICENZA_SCADUTA → Cliente\nEmail LICENZA_SCADUTA → Fornitore"]

    JOB --> CHK3{"Client senza C5\nda 7 giorni?"}
    CHK3 -->|Sì| INACT["Email CLIENT_INATTIVO → Fornitore\nAggiorna inactivity_notified_at"]

    JOB --> CHK4{"GET ALARM\nfallito?"}
    CHK4 -->|Sì - ERP non raggiungibile| FALLBACK["Email GET_ALARM_FALLBACK\n→ Fornitore\nLog in alarm_logs"]

    WARN --> CONT(["Continua monitoraggio"])
    EXP --> CONT
    INACT --> CONT
    FALLBACK --> CONT
```

---

## Diagramma 9 — Riapertura app da cliente già registrato

```mermaid
flowchart TD
    START(["Cliente già registrato\nriapre l'app"]) --> C1["C1: POST /api/client/register\nStessa P.IVA + product_key"]
    C1 --> CHK{"P.IVA + product_key\ngià in DB?"}
    CHK -->|No| REG(["Avvia nuova\nregistrazione\nvedi Diagramma 3"])
    CHK -->|Sì - licenza attiva| RETURN["Restituisce direttamente:\nlicense_key + tipo + scadenza\nNessun OTP, nessun messaggio in-app"]
    RETURN --> C6["C6: POST /api/client/token/refresh\nOttiene nuovo JWT\nusando refresh token"]
    C6 --> OPS(["Ripresa funzionamento ordinario\nC4 + C5 periodici\nvedi Diagramma 4"])
    CHK -->|Sì - trial già usata e scaduta| BLOCK["Errore 409\nIn-app: REGISTRAZIONE_BLOCCATA"]
```
