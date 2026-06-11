# Rapportino attività — BK_SHIELD

> Destinatario: Alvise | Compilato da: Andrea Pavan

---

## 2026-06-10 (sessione 2)

### Attività svolte

- **Revisione struttura backend:** verificato stato TD-01 completato — Express + better-sqlite3 + env config + middleware errorHandler + chiavi JWT
- **Aggiornamento `.gitignore`:** aggiunte voci mancanti (`coverage/`, `*.log`, `.env.local`, `.env.*.local`) in `backend/.gitignore`

### In corso

- Prossimo step: TD-02 — schema DB + migrazioni (tabelle principali + tabelle v4 + vendor_general_setup + vendor_event_config)

### Bloccanti / Note

- Nessun bloccante

---

## 2026-06-10

### Attività svolte

- **Pulizia repository:** archiviati DOCX/PDF obsoleti, tracciati deliverable più recenti
- **Conversione PDF:** `A_Piano_di_Progetto_Servizio_Gestione_Licenze_v1.docx` → PDF (55 KB)
- **README aggiornato:** sostituito README sintetico con specifica completa v1 integrato (setup, endpoint dettagliati, tabelle DB, template email, job schedulati)
- **Repository GitHub allineato:** push su `pimpy67/BK_SHIELD` — 5 file modificati/aggiunti
- **Setup backend avviato (TD-01):**
  - Installazione Node.js v22.22.3
  - Creazione cartella `backend/`
  - Inizializzazione `package.json` con `npm init`

### In corso

- Installazione dipendenze npm (express, better-sqlite3, dotenv, …)
- Scaffolding cartelle src/

### Bloccanti / Note

- Nessun bloccante oggi

---

<!-- Aggiungi nuove date in cima, formato ## YYYY-MM-DD -->
