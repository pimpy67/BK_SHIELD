# Flowchart – Servizio Gestione Licenze

> Visualizzare in VS Code con l'estensione **Markdown Preview Mermaid Support**, oppure su GitHub / [mermaid.live](https://mermaid.live).

> **Aggiornamento 09/06/2026 — Sezione 12 (decisione Alvise):**
> - Diagramma 3 aggiornato: C2 non chiama più O1 direttamente → imposta `vendor_synced = false`
> - Diagramma 4 aggiornato: C4 non fa più scattare O1/notifiche per licenze scadute
> - Diagramma 8 aggiornato: bootstrap scheduler con sistema eventi indipendenti dalle API
> - Diagrammi 10–13 aggiunti: struttura dati, registrazione job, esecuzione per ogni evento

> Per request body, controlli e risposte JSON di ogni endpoint vedere: **`Endpoint_Servizio_Gestione_Licenze_v5.md`**

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

## Diagramma 3 — Registrazione cliente e attivazione trial *(aggiornato — C2 disaccoppiata da O1)*

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
    TOKENS --> SET_SYNC["Imposta vendor_synced = false\nO1 delegato al job NEW_REGISTRATION\n(vedi Diagramma 11 — sezione 12)"]
    SET_SYNC --> NOTIFY["Email BENVENUTO_TRIAL → Cliente\nIn-app BENVENUTO_TRIAL → Cliente\nEmail NUOVA_REGISTRAZIONE → Fornitore"]
    NOTIFY --> END(["Client operativo\nin modalità trial\nHTTP 201 Created"])
```

---

## Diagramma 4 — Funzionamento ordinario della licenza *(aggiornato — C4 non fa scattare O1)*

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
    CHK_LIC -->|No| EXP["Ritorna status: expired\nO1 + notifiche gestiti\ndal job LICENSE_EXPIRED\n(vedi Diagramma 12 — sezione 12)"]

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

## Diagramma 8 — Bootstrap scheduler: registrazione job per eventi attivi *(aggiornato — sezione 12)*

```mermaid
flowchart TD
    START(["Server avviato"]) --> READ_GS["Legge vendor_general_setup\n→ default_check_interval_hours\n(default: 24h)"]
    READ_GS --> READ_EC["Legge vendor_event_config\nWHERE enabled = true"]

    READ_EC --> LOOP{"Per ogni\nevento attivo"}

    LOOP -->|"NEW_REGISTRATION"| JOB1["Registra job separato\nScansiona vendor_synced=false\nInterval: check_interval_hours"]
    LOOP -->|"LICENSE_EXPIRING"| JOB2["Registra job separato\nAvvisi scadenza imminente\nInterval: check_interval_hours"]
    LOOP -->|"LICENSE_EXPIRED"| JOB3["Registra job separato\nScadenza licenze\nInterval: check_interval_hours"]
    LOOP -->|"CLIENT_INACTIVE"| JOB4["Registra job separato\nMonitoraggio inattività\nInterval: check_interval_hours"]
    LOOP -->|"ALARM_RETRY"| JOB5["Registra job separato\nRetry GET ALARM falliti\nInterval: check_interval_hours"]

    JOB1 & JOB2 & JOB3 & JOB4 & JOB5 --> READY(["Jobs attivi e indipendenti\nNessuna dipendenza\ndalle chiamate API C1–F9"])

    LOOP -->|"enabled=false"| SKIP["Job non registrato\nEvento disattivato"]
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

---

## Diagramma 10 — Struttura istanza multi-tenant: vendor, setup e configurazione eventi *(sezione 12)*

```mermaid
flowchart TD
    subgraph INSTANCE["Istanza BK_SHIELD — 1 installazione per vendor"]
        V["vendors\n(1 record — chiave principale)\n• name\n• api_key_hash\n• erp_alarm_url"]
        GS["vendor_general_setup\n(1 record per vendor)\n• default_check_interval_hours\n• vendor_id FK"]
        EC["vendor_event_config\n(1 riga per tipo evento)\n• event_code\n• enabled  ← ON / OFF\n• check_interval_hours (NULL = usa default)\n• settings_json\n• last_run_at"]
    end

    V -->|"1 : 1"| GS
    V -->|"1 : N"| EC

    EC --> E1["NEW_REGISTRATION\nenabled: true\nsettings: {}"]
    EC --> E2["LICENSE_EXPIRING\nenabled: true\nsettings: warning_days per tipo"]
    EC --> E3["LICENSE_EXPIRED\nenabled: true\nsettings: {}"]
    EC --> E4["CLIENT_INACTIVE\nenabled: true\nsettings: threshold_days=7"]
    EC --> E5["ALARM_RETRY\nenabled: true\nsettings: max_retries=3"]

    style E1 fill:#d4f0d4
    style E2 fill:#d4f0d4
    style E3 fill:#d4f0d4
    style E4 fill:#d4f0d4
    style E5 fill:#d4f0d4
```

---

## Diagramma 11 — Esecuzione job: NEW_REGISTRATION e ALARM_RETRY *(sezione 12)*

```mermaid
flowchart TD
    subgraph JOB_NR["Job: NEW_REGISTRATION (ogni N ore)"]
        NR_S(["Avvio job"]) --> NR_Q["Query licenses\nWHERE vendor_synced = false"]
        NR_Q --> NR_C{"Record\ntrovati?"}
        NR_C -->|No| NR_END(["last_run_at = now\nFine"])
        NR_C -->|Sì| NR_L["Per ogni licenza:"]
        NR_L --> NR_O1["GET erp_alarm_url/alarm\nalarm_code = NEW_REGISTRATION"]
        NR_O1 --> NR_R{"ERP\n200 OK?"}
        NR_R -->|Sì| NR_OK["vendor_synced = true\nalarm_logs (success=true)"]
        NR_R -->|No| NR_F["alarm_logs\n(success=false, retry_count=0)\ngestito da ALARM_RETRY"]
        NR_OK & NR_F --> NR_END
    end

    subgraph JOB_AR["Job: ALARM_RETRY (ogni N ore)"]
        AR_S(["Avvio job"]) --> AR_R["Legge settings_json\n{max_retries: 3}"]
        AR_R --> AR_Q["Query alarm_logs\nWHERE success=false\nAND retry_count < max_retries"]
        AR_Q --> AR_C{"Record\ntrovati?"}
        AR_C -->|No| AR_END(["last_run_at = now\nFine"])
        AR_C -->|Sì| AR_L["Per ogni record:"]
        AR_L --> AR_O1["Retry O1\nstesso alarm_code e payload"]
        AR_O1 --> AR_R2{"ERP\n200 OK?"}
        AR_R2 -->|Sì| AR_OK["success = true\nlast_retry_at = now"]
        AR_R2 -->|No| AR_INC["retry_count++\nlast_retry_at = now"]
        AR_INC --> AR_M{"retry_count ==\nmax_retries?"}
        AR_M -->|Sì| AR_EMAIL["Email GET_ALARM_FALLBACK\n→ Fornitore\npermanently_failed = true"]
        AR_M -->|No| AR_END
        AR_OK & AR_EMAIL --> AR_END
    end
```

---

## Diagramma 12 — Esecuzione job: LICENSE_EXPIRING, LICENSE_EXPIRED, CLIENT_INACTIVE *(sezione 12)*

```mermaid
flowchart TD
    subgraph JOB_LE["Job: LICENSE_EXPIRING (ogni N ore)"]
        LE_S(["Avvio job"]) --> LE_R["Legge settings_json\nwarning_days per tipo licenza"]
        LE_R --> LE_Q["Query licenses\nexpires_at - now() IN warning_days\nAND notifica non ancora inviata per quella soglia"]
        LE_Q --> LE_C{"Trovate?"}
        LE_C -->|No| LE_END(["last_run_at = now\nFine"])
        LE_C -->|Sì| LE_L["Per ogni licenza:"]
        LE_L --> LE_O1["GET erp_alarm_url/alarm\nalarm_code = LICENSE_EXPIRING"]
        LE_O1 --> LE_EMAIL["Email SCADENZA_IMMINENTE → Cliente\nIn-app SCADENZA_IMMINENTE → Cliente"]
        LE_EMAIL --> LE_FLAG["Aggiorna flag notifica\nper la soglia corrente"]
        LE_FLAG --> LE_END
    end

    subgraph JOB_EXP["Job: LICENSE_EXPIRED (ogni N ore)"]
        EXP_S(["Avvio job"]) --> EXP_Q["Query licenses\nexpires_at < now()\nAND status != 'expired'"]
        EXP_Q --> EXP_C{"Trovate?"}
        EXP_C -->|No| EXP_END(["last_run_at = now\nFine"])
        EXP_C -->|Sì| EXP_L["Per ogni licenza:"]
        EXP_L --> EXP_UPD["status → expired\noffline_token invalidato"]
        EXP_UPD --> EXP_O1["GET erp_alarm_url/alarm\nalarm_code = LICENSE_EXPIRED"]
        EXP_O1 --> EXP_EMAIL["Email LICENZA_SCADUTA → Cliente\nEmail LICENZA_SCADUTA → Fornitore"]
        EXP_EMAIL --> EXP_END
    end

    subgraph JOB_CI["Job: CLIENT_INACTIVE (ogni N ore)"]
        CI_S(["Avvio job"]) --> CI_R["Legge settings_json\n{threshold_days: 7}"]
        CI_R --> CI_Q["Query clients\nlast_c5_at < now - threshold_days\nAND inactivity_notified_at IS NULL"]
        CI_Q --> CI_C{"Trovati?"}
        CI_C -->|No| CI_END(["last_run_at = now\nFine"])
        CI_C -->|Sì| CI_L["Per ogni client:"]
        CI_L --> CI_EMAIL["Email CLIENT_INATTIVO → Fornitore\nNessuna chiamata O1"]
        CI_EMAIL --> CI_FLAG["inactivity_notified_at = now()"]
        CI_FLAG --> CI_END
    end
```

---

## Diagramma 13 — Separazione API vs sistema eventi *(sezione 12)*

```mermaid
flowchart LR
    subgraph API["Chiamate API — real-time"]
        C2["C2: verify-otp\n→ vendor_synced = false"]
        C4["C4: license/status\n→ legge stato, non scrive O1"]
        F5["F5: license/activate\n→ aggiorna licenza"]
    end

    subgraph EVENTS["Sistema eventi — schedulato (ogni N ore)"]
        EV1["Job NEW_REGISTRATION\n→ vendor_synced=false → O1"]
        EV2["Job LICENSE_EXPIRING\n→ soglie → O1 + email"]
        EV3["Job LICENSE_EXPIRED\n→ status expired + O1 + email"]
        EV4["Job CLIENT_INACTIVE\n→ email fornitore"]
        EV5["Job ALARM_RETRY\n→ retry O1 falliti"]
    end

    subgraph ERP["ERP Fornitore"]
        O1["GET ALARM\n(O1)"]
    end

    C2 -.->|"vendor_synced=false\n(dati nel DB)"| EV1
    C4 -.->|"legge expires_at\n(solo lettura)"| EV3
    EV1 --> O1
    EV2 --> O1
    EV3 --> O1
    EV5 --> O1

    style API fill:#e8f4fd,stroke:#4a90d9
    style EVENTS fill:#f0fde8,stroke:#5aad3f
    style ERP fill:#fdf4e8,stroke:#d9944a
```
