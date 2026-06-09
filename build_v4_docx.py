"""
Genera Analisi_Servizio_Gestione_Licenze_v4_correzioni.docx
partendo da v2_AGGIORNATA.docx, mantenendo tutti gli stili.
Le inserzioni nuove sono taggate con [v4].
"""
import shutil, sys
from docx import Document
from docx.oxml import OxmlElement
from copy import deepcopy

sys.stdout.reconfigure(encoding='utf-8')

W   = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
XML = '{http://www.w3.org/XML/1998/namespace}'

def w(tag):  return W + tag

# ---------- helpers ----------

def _get_pPr(elem):
    return elem.find(w('pPr'))

def _get_rPr(elem):
    for r in elem.findall(f'.//{w("r")}'):
        rpr = r.find(w('rPr'))
        if rpr is not None:
            return rpr
    return None

def make_run(text, rPr_src=None):
    r = OxmlElement('w:r')
    if rPr_src is not None:
        r.append(deepcopy(rPr_src))
    t = OxmlElement('w:t')
    t.text = text
    t.set(f'{XML}space', 'preserve')
    r.append(t)
    return r

def make_para(src_elem, text, v4_tag=True):
    """Clona struttura/stile di src_elem, imposta testo (con [v4] se v4_tag)."""
    new_p = OxmlElement('w:p')
    pPr = _get_pPr(src_elem)
    if pPr is not None:
        new_p.append(deepcopy(pPr))
    full = ('[v4] ' + text) if v4_tag else text
    new_p.append(make_run(full, _get_rPr(src_elem)))
    return new_p

def make_heading(doc, level, text, v4_tag=True):
    """Crea paragrafo heading clonando stile dal primo heading dello stesso livello."""
    style_name = {1: 'Heading1', 2: 'Heading2', 3: 'Heading3', 4: 'Heading4'}.get(level, 'Heading3')
    src = None
    for elem in doc.element.body:
        if elem.tag.split('}')[-1] == 'p':
            se = elem.find(f'.//{w("pStyle")}')
            if se is not None and se.get(w('val')) == style_name:
                src = elem
                break
    if src is None:
        src = list(doc.element.body)[0]
    return make_para(src, text, v4_tag=v4_tag)

def make_normal(doc, text, v4_tag=True):
    """Crea paragrafo Normal."""
    src = None
    for elem in doc.element.body:
        if elem.tag.split('}')[-1] == 'p':
            se = elem.find(f'.//{w("pStyle")}')
            style = se.get(w('val')) if se is not None else 'Normal'
            if style == 'Normal':
                txt = ''.join(t.text or '' for t in elem.findall(f'.//{w("t")}'))
                if txt.strip():
                    src = elem
                    break
    if src is None:
        src = list(doc.element.body)[1]
    return make_para(src, text, v4_tag=v4_tag)

def make_bullet(doc, text, v4_tag=True):
    src = None
    for elem in doc.element.body:
        if elem.tag.split('}')[-1] == 'p':
            se = elem.find(f'.//{w("pStyle")}')
            if se is not None and se.get(w('val')) == 'ListBullet':
                src = elem
                break
    if src is None:
        return make_normal(doc, '• ' + text, v4_tag=v4_tag)
    return make_para(src, text, v4_tag=v4_tag)

def add_row_to_table(tbl_elem, cells, v4_tag=True):
    """Aggiunge riga a tabella clonando stile dall'ultima riga."""
    rows = tbl_elem.findall(w('tr'))
    last_row = rows[-1]
    new_row = deepcopy(last_row)
    tcs = new_row.findall(f'.//{w("tc")}')
    for i, tc in enumerate(tcs):
        text = cells[i] if i < len(cells) else ''
        if v4_tag and i == 0:
            text = '[v4] ' + text
        # Pulisce runs esistenti
        for p in tc.findall(w('p')):
            for r in p.findall(w('r')):
                p.remove(r)
            # Aggiunge nuovo run
            r = OxmlElement('w:r')
            t_elem = OxmlElement('w:t')
            t_elem.text = text
            t_elem.set(f'{XML}space', 'preserve')
            r.append(t_elem)
            p.append(r)
            break  # solo primo paragrafo della cella
    tbl_elem.append(new_row)

def insert_after(ref_elem, new_elems):
    """Inserisce new_elems (lista) subito dopo ref_elem, nell'ordine dato."""
    cur = ref_elem
    for e in new_elems:
        cur.addnext(e)
        cur = e

def find_para_by_text(doc, fragment):
    for elem in doc.element.body:
        if elem.tag.split('}')[-1] == 'p':
            text = ''.join(t.text or '' for t in elem.findall(f'.//{w("t")}'))
            if fragment in text:
                return elem
    return None

def find_table_after_para(doc, para_fragment):
    elems = list(doc.element.body)
    for i, elem in enumerate(elems):
        if elem.tag.split('}')[-1] == 'p':
            text = ''.join(t.text or '' for t in elem.findall(f'.//{w("t")}'))
            if para_fragment in text:
                if i+1 < len(elems) and elems[i+1].tag.split('}')[-1] == 'tbl':
                    return elems[i+1]
    return None

def sep(doc):
    return make_normal(doc, '---', v4_tag=False)

# ============================================================
# MAIN
# ============================================================

shutil.copy(
    'Analisi_Servizio_Gestione_Licenze_v2_AGGIORNATA.docx',
    'Analisi_Servizio_Gestione_Licenze_v4_correzioni.docx'
)
doc = Document('Analisi_Servizio_Gestione_Licenze_v4_correzioni.docx')

# ------------------------------------------------------------------
# 1. TITOLO
# ------------------------------------------------------------------
title_elem = list(doc.element.body)[0]
for t in title_elem.findall(f'.//{w("t")}'):
    if t.text and 'v2 Aggiornata' in t.text:
        t.text = t.text.replace('v2 Aggiornata', 'v4 Correzioni')

# ------------------------------------------------------------------
# 2. CHANGELOG — aggiorna riga "3 nuove tabelle" e aggiungi righe
# ------------------------------------------------------------------
for elem in doc.element.body:
    if elem.tag.split('}')[-1] == 'p':
        for t in elem.findall(f'.//{w("t")}'):
            if t.text and '3 nuove tabelle' in t.text:
                t.text = '> - Aggiunte nuove tabelle: otp_attempts, rate_limits, idempotency_keys, client_billing, email_templates'
            if t.text and 'Documento pronto' in t.text:
                t.text = '> - Documento pronto per implementazione e presentazione'

last_chg = find_para_by_text(doc, 'Documento pronto')
if last_chg:
    insert_after(last_chg, [
        make_normal(doc, '> - Aggiunti endpoint mancanti: F7 (billing dati fatturazione), F8 (revoca licenza), C7b (verifica cambio email)', v4_tag=False),
        make_normal(doc, '> - Aggiunto campo offline_token / offline_token_expires_at in tabella licenses', v4_tag=False),
        make_normal(doc, '> - Aggiunti campi trial_duration_days, trial_max_users, license_check_frequency_days in tabella products', v4_tag=False),
        make_normal(doc, '> - Aggiornata terminologia: licenses (ex contratti), tipi monthly/annual (ex standard/provisional)', v4_tag=False),
    ])

# ------------------------------------------------------------------
# 3. TABELLA products — aggiungi 3 campi mancanti
# ------------------------------------------------------------------
ptbl = find_table_after_para(doc, '**Tabella: `products`**')
if ptbl:
    add_row_to_table(ptbl, ['trial_duration_days',           'INT',       'Durata della trial in giorni (es. 30) — configurabile per prodotto'])
    add_row_to_table(ptbl, ['trial_max_users',               'INT',       'Max utenti durante la trial — NULL = illimitato'])
    add_row_to_table(ptbl, ['license_check_frequency_days',  'INT',       'Ogni quanti giorni il client chiama C4 e rinnova l\'offline_token'])

# ------------------------------------------------------------------
# 4. TABELLA licenses — aggiungi offline_token
# ------------------------------------------------------------------
ltbl = find_table_after_para(doc, '**Tabella: `licenses`**')
if ltbl:
    add_row_to_table(ltbl, ['offline_token',          'TEXT',      'JWT RS256 firmato salvato localmente dal client per validazione offline'])
    add_row_to_table(ltbl, ['offline_token_expires_at','TIMESTAMP', 'Scadenza dell\'offline_token (T_attivazione + license_check_frequency_days)'])

# ------------------------------------------------------------------
# 5. O1 — aggiungi testo completo email fallback
# ------------------------------------------------------------------
o1_retry = find_para_by_text(doc, 'poi invia email fallback al fornitore')
if o1_retry:
    insert_after(o1_retry, [
        make_normal(doc, 'Email fallback GET ALARM → Fornitore', v4_tag=True),
        make_normal(doc, 'Oggetto: ATTENZIONE: GET ALARM non riuscito — Nuova registrazione non sincronizzata', v4_tag=False),
        make_normal(doc, '', v4_tag=False),
        make_normal(doc, 'Gentile team,', v4_tag=False),
        make_normal(doc, '', v4_tag=False),
        make_normal(doc, 'il servizio di gestione licenze ha tentato di notificare una nuova registrazione clienti,', v4_tag=False),
        make_normal(doc, 'ma l\'endpoint ERP non è raggiungibile da 24 ore.', v4_tag=False),
        make_normal(doc, '', v4_tag=False),
        make_normal(doc, 'Dettagli:', v4_tag=False),
        make_normal(doc, '- Azienda: {company_name} | Prodotto: {product_name}', v4_tag=False),
        make_normal(doc, '- License key: {license_key}', v4_tag=False),
        make_normal(doc, '- Data registrazione: {registered_at}', v4_tag=False),
        make_normal(doc, '- Numero tentativi: {retry_count} | Ultimo errore: {last_error}', v4_tag=False),
        make_normal(doc, '', v4_tag=False),
        make_normal(doc, 'AZIONE RICHIESTA:', v4_tag=False),
        make_normal(doc, '1. Verificare che l\'endpoint ERP sia raggiungibile', v4_tag=False),
        make_normal(doc, '2. Controllare i log del servizio ERP', v4_tag=False),
        make_normal(doc, '3. Se necessario, contattare il supporto BK-Service', v4_tag=False),
        make_normal(doc, '', v4_tag=False),
        make_normal(doc, 'Cordiali saluti, Il sistema di gestione licenze', v4_tag=False),
    ])

# ------------------------------------------------------------------
# 6. Sezione 2.5 — aggiungi F7 e F8 dopo F5 (dopo i messaggi attivazione)
# ------------------------------------------------------------------
after_f5 = find_para_by_text(doc, 'Per maggiori informazioni contattare {contact_email} oppure {contact_phone}.')
# Prendo l'ultimo paragrafo della sezione F5 (il messaggio in-app)
# Cerco "---" o heading successivo dopo il testo in-app
elems = list(doc.element.body)
f5_end = None
for i, elem in enumerate(elems):
    if elem.tag.split('}')[-1] == 'p':
        txt = ''.join(t.text or '' for t in elem.findall(f'.//{w("t")}'))
        if 'Per maggiori informazioni contattare {contact_email} oppure {contact_phone}.' in txt:
            # Verifica che sia dopo F5 (ci sarà un Heading3 "2.6" dopo)
            if i+1 < len(elems):
                next_txt = ''.join(t.text or '' for t in elems[i+1].findall(f'.//{w("t")}'))
                if '2.6' in next_txt or i+2 < len(elems):
                    f5_end = elem
                    break

# Cerca l'heading "2.6" e inserisce prima di esso
h26 = find_para_by_text(doc, '2.6 Avvisi di scadenza')
if h26:
    # Trovo il paragrafo immediatamente prima di h26
    elems = list(doc.element.body)
    idx_h26 = elems.index(h26)
    ref_before_h26 = elems[idx_h26 - 1]  # paragrafo "---" o simile

    # Creo tabella client_billing manualmente
    def make_db_table(doc, header_row, data_rows):
        """Crea una tabella DB clonando stile da tabella esistente."""
        # Trova una tabella esistente con struttura Campo/Tipo/Descrizione
        src_tbl = None
        for elem in doc.element.body:
            if elem.tag.split('}')[-1] == 'tbl':
                rows = elem.findall(w('tr'))
                if rows:
                    first_cells = [c for c in rows[0].findall(f'.//{w("t")}')]
                    texts = [c.text or '' for c in first_cells]
                    if 'Campo' in texts and 'Tipo' in texts:
                        src_tbl = elem
                        break
        if src_tbl is None:
            return None

        new_tbl = deepcopy(src_tbl)
        # Rimuovi tutte le righe tranne la prima (header)
        all_rows = new_tbl.findall(w('tr'))
        for row in all_rows[1:]:
            new_tbl.remove(row)

        # Aggiorna header
        header_cells = new_tbl.findall(w('tr'))[0].findall(f'.//{w("tc")}')
        for i, hc in enumerate(header_cells):
            txt = header_row[i] if i < len(header_row) else ''
            for p in hc.findall(w('p')):
                for r in p.findall(w('r')):
                    p.remove(r)
                r = OxmlElement('w:r')
                t_e = OxmlElement('w:t')
                t_e.text = txt
                r.append(t_e)
                p.append(r)
                break

        # Aggiungi righe dati
        src_data_row = all_rows[0]  # usa header come template per le righe dati
        for row_data in data_rows:
            new_row = deepcopy(src_data_row)
            tcs = new_row.findall(f'.//{w("tc")}')
            for i, tc in enumerate(tcs):
                txt = row_data[i] if i < len(row_data) else ''
                for p in tc.findall(w('p')):
                    for r in p.findall(w('r')):
                        p.remove(r)
                    r = OxmlElement('w:r')
                    t_e = OxmlElement('w:t')
                    t_e.text = txt
                    t_e.set(f'{XML}space', 'preserve')
                    r.append(t_e)
                    p.append(r)
                    break
            new_tbl.append(new_row)

        return new_tbl

    client_billing_rows = [
        ['id',               'INT',          'Identificativo univoco'],
        ['client_id',        'INT',          'Riferimento al cliente in clients'],
        ['pec',              'VARCHAR(255)',  'Indirizzo PEC per fatturazione elettronica'],
        ['sdi_code',         'VARCHAR(7)',    'Codice SDI destinatario (7 caratteri)'],
        ['billing_address',  'VARCHAR(500)',  'Indirizzo di fatturazione'],
        ['billing_country',  'VARCHAR(2)',    'Paese di fatturazione (codice ISO)'],
        ['created_at',       'TIMESTAMP',     'Data di inserimento'],
        ['updated_at',       'TIMESTAMP',     'Data ultimo aggiornamento'],
    ]
    cb_table = make_db_table(doc, ['Campo', 'Tipo', 'Descrizione'], client_billing_rows)

    email_tpl_rows = [
        ['id',           'INT',          'Identificativo univoco'],
        ['template_key', 'VARCHAR(100)', 'Chiave identificativa (es. OTP_VERIFICATION, WELCOME_TRIAL, LICENSE_EXPIRING_7D)'],
        ['language',     'VARCHAR(2)',   'Lingua: it oppure en'],
        ['channel',      'ENUM',         'Canale: email oppure in_app'],
        ['subject',      'VARCHAR(255)', 'Oggetto email — NULL per messaggi in-app'],
        ['body',         'TEXT',         'Corpo con placeholder {variabile}'],
        ['created_at',   'TIMESTAMP',    'Data di inserimento'],
    ]
    et_table = make_db_table(doc, ['Campo', 'Tipo', 'Descrizione'], email_tpl_rows)

    new_sections = [
        make_normal(doc, '---', v4_tag=False),
        make_heading(doc, 3, '2.5b F7 – Raccolta dati fatturazione cliente', v4_tag=True),
        make_normal(doc, '`POST /api/vendor/client/billing`', v4_tag=False),
        make_normal(doc,
            'Al primo acquisto, prima di chiamare F5, il fornitore invia i dati di fatturazione del cliente: PEC, '
            'codice SDI, indirizzo. Questi dati vengono salvati nella tabella client_billing separata da clients '
            'perché non tutti i clienti arrivano all\'acquisto.', v4_tag=False),
        make_normal(doc, '**Header:** Authorization: Bearer <jwt_vendor>', v4_tag=False),
        make_normal(doc, '**Flusso tipico:** Vendor riceve pagamento nel suo ERP → raccoglie PEC/SDI → chiama F7 → chiama F5', v4_tag=False),
        make_normal(doc, '**[v4] Tabella: `client_billing`**', v4_tag=False),
    ]
    if cb_table is not None:
        new_sections.append(cb_table)

    new_sections += [
        make_normal(doc, '', v4_tag=False),
        make_heading(doc, 3, '2.5c F8 – Revoca licenza', v4_tag=True),
        make_normal(doc, '`POST /api/vendor/license/revoke`', v4_tag=False),
        make_normal(doc,
            'Il fornitore revoca una licenza attiva (es. mancato pagamento, frode, richiesta di cancellazione). '
            'Il servizio imposta licenses.status → revoked e invalida l\'offline_token, '
            'impedendo al client di operare anche offline.', v4_tag=False),
        make_normal(doc, '**Errori possibili:**', v4_tag=False),
        make_bullet(doc, 'INVALID_JWT (401)', v4_tag=False),
        make_bullet(doc, 'LICENSE_NOT_FOUND (404)', v4_tag=False),
        make_bullet(doc, 'LICENSE_ALREADY_EXPIRED (409) — licenza già revocata o scaduta', v4_tag=False),
        make_normal(doc, '**Success response (200 OK):**', v4_tag=False),
        make_normal(doc, '{ "license_key": "lk_...", "status": "revoked", "revoked_at": "2026-06-08T15:30:00Z" }', v4_tag=False),
        make_normal(doc, '', v4_tag=False),
        make_heading(doc, 3, '2.5d Tabella email_templates', v4_tag=True),
        make_normal(doc,
            'Tutti i testi di email e messaggi in-app sono salvati in questa tabella con placeholder {variabile}. '
            'Nessun testo è hardcoded nel codice: modifiche ai testi non richiedono un nuovo deploy.', v4_tag=False),
        make_normal(doc, '**[v4] Tabella: `email_templates`**', v4_tag=False),
    ]
    if et_table is not None:
        new_sections.append(et_table)
    new_sections.append(make_normal(doc, '', v4_tag=False))

    insert_after(ref_before_h26, new_sections)

# ------------------------------------------------------------------
# 7. Sezione 7 — aggiungi C7b dopo C7
# ------------------------------------------------------------------
c7b_ref = find_para_by_text(doc, '3. Aggiorna clients.contact_email')
f9_heading = find_para_by_text(doc, '7.2 F9 –')
if c7b_ref and f9_heading:
    elems = list(doc.element.body)
    idx_c7b = elems.index(c7b_ref)
    idx_f9 = elems.index(f9_heading)
    ref = elems[idx_f9 - 1]  # elemento prima dell'heading F9

    insert_after(ref, [
        make_heading(doc, 3, '7.1b C7b – POST /api/client/verify-email-change', v4_tag=True),
        make_normal(doc, '**Uso:** Verifica il codice OTP ricevuto alla nuova email e aggiorna clients.contact_email', v4_tag=False),
        make_normal(doc, '**Request:**', v4_tag=False),
        make_normal(doc, '{ "new_email": "newemail@acme.com", "otp_code": "123456" }', v4_tag=False),
        make_normal(doc, '**Success Response (200 OK):**', v4_tag=False),
        make_normal(doc, '{ "message": "Email aggiornata con successo", "contact_email": "newemail@acme.com" }', v4_tag=False),
        make_normal(doc, '**Errori possibili:** INVALID_OTP_CODE (400), OTP_CODE_EXPIRED (400), OTP_MAX_ATTEMPTS_EXCEEDED (429)', v4_tag=False),
        make_normal(doc, '', v4_tag=False),
    ])

# ------------------------------------------------------------------
# 8. Sezione 8.3 — aggiorna testi da provisional/standard a trial/monthly
# ------------------------------------------------------------------
for elem in doc.element.body:
    if elem.tag.split('}')[-1] == 'p':
        for t in elem.findall(f'.//{w("t")}'):
            if t.text:
                t.text = (t.text
                    .replace('Passaggio Provisional → Standard', 'Rinnovo licenza: trial → monthly/annual')
                    .replace('licenza provvisoria (30 giorni)', 'licenza trial attiva')
                    .replace('license_type = standard', 'license_type = annual')
                    .replace('contratti.status = expired', 'licenses.status = expired')
                    .replace('Genera nuovo offline_token', '[v4] Genera nuovo offline_token')
                    .replace('UPDATE contratti SET', 'UPDATE licenses SET')
                )

# ------------------------------------------------------------------
# 9. TABELLA RIEPILOGO ENDPOINT CLIENT — aggiungi C7b
# ------------------------------------------------------------------
# Trovare la tabella endpoint client (dopo "Endpoint Client (C)")
client_ep_tbl = find_table_after_para(doc, 'Endpoint Client (C)')
if client_ep_tbl:
    add_row_to_table(client_ep_tbl, ['C7b', 'POST', '/api/client/verify-email-change', 'Verifica OTP per confermare cambio email', '🆕 NUOVO'])

# ------------------------------------------------------------------
# 10. TABELLA RIEPILOGO ENDPOINT FORNITORE — aggiungi F7 e F8
# ------------------------------------------------------------------
vendor_ep_tbl = find_table_after_para(doc, 'Endpoint Fornitore (F)')
if vendor_ep_tbl:
    add_row_to_table(vendor_ep_tbl, ['F7', 'POST', '/api/vendor/client/billing',  'Raccolta dati fatturazione (PEC, SDI)', '🆕 NUOVO'])
    add_row_to_table(vendor_ep_tbl, ['F8', 'POST', '/api/vendor/license/revoke',  'Revoca licenza attiva',                 '🆕 NUOVO'])

# ------------------------------------------------------------------
# 11. TABELLA RIEPILOGO DB — aggiungi client_billing e email_templates
# ------------------------------------------------------------------
db_tbl_elem = find_table_after_para(doc, '10. Riepilogo tabelle DB')
if db_tbl_elem:
    add_row_to_table(db_tbl_elem, ['client_billing',  'Dati fiscali cliente per fatturazione (PEC, SDI, indirizzo)', '🆕 NUOVO'])
    add_row_to_table(db_tbl_elem, ['email_templates', 'Testi email/in-app con placeholder — nessun testo hardcoded',  '🆕 NUOVO'])

# ------------------------------------------------------------------
# 12. DOMANDE APERTE — aggiungi IBAN
# ------------------------------------------------------------------
last_open = find_para_by_text(doc, 'Offline expiry behavior')
if last_open:
    insert_after(last_open, [
        make_bullet(doc, 'IBAN cliente in client_billing: necessario solo se il fornitore usa addebito diretto SEPA, altrimenti il pagamento vive nell\'ERP del fornitore', v4_tag=True),
    ])

# ------------------------------------------------------------------
# 13. FOOTER — aggiorna data e descrizione
# ------------------------------------------------------------------
for elem in doc.element.body:
    if elem.tag.split('}')[-1] == 'p':
        for t in elem.findall(f'.//{w("t")}'):
            if t.text:
                if 'Documento v2 Aggiornata' in t.text:
                    t.text = '**Documento v4 Correzioni — 09/06/2026**'
                elif 'Mantiene v2 originale' in t.text:
                    t.text = '**Mantiene tutto il contenuto v2 Aggiornata + aggiunge: F7, F8, C7b, offline_token, client_billing, email_templates**'
                elif 'Pronto per presentazione' in t.text:
                    t.text = '**Pronto per implementazione — documento di riferimento corrente**'

# ------------------------------------------------------------------
# SALVA
# ------------------------------------------------------------------
doc.save('Analisi_Servizio_Gestione_Licenze_v4_correzioni.docx')
print('OK — Analisi_Servizio_Gestione_Licenze_v4_correzioni.docx generato')
