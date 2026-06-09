import markdown
import pathlib
from xhtml2pdf import pisa

MD_FILE = pathlib.Path(r"C:\Users\andrea.pavan\Documents\BK_SHIELD\Endpoint_Servizio_Gestione_Licenze_v5.md")
PDF_FILE = MD_FILE.with_suffix(".pdf")

md_text = MD_FILE.read_text(encoding="utf-8")

extensions = ["tables", "fenced_code", "toc", "attr_list", "nl2br"]
html_body = markdown.markdown(md_text, extensions=extensions)

CSS = """
@page {
    size: A4;
    margin: 20mm 18mm 22mm 18mm;
}

body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.6;
    color: #1e293b;
}

h1 {
    font-size: 20pt;
    font-weight: bold;
    color: #0f172a;
    border-bottom: 3px solid #3b82f6;
    padding-bottom: 6px;
    margin-top: 0;
    margin-bottom: 14px;
}

h2 {
    font-size: 14pt;
    font-weight: bold;
    color: #1e40af;
    border-bottom: 1px solid #bfdbfe;
    padding-bottom: 4px;
    margin-top: 24px;
    margin-bottom: 10px;
}

h3 {
    font-size: 11pt;
    font-weight: bold;
    color: #1d4ed8;
    margin-top: 16px;
    margin-bottom: 6px;
}

h4 {
    font-size: 10pt;
    font-weight: bold;
    color: #334155;
    margin-top: 12px;
    margin-bottom: 4px;
}

p { margin: 0 0 8px 0; }

blockquote {
    border-left: 4px solid #3b82f6;
    background: #eff6ff;
    padding: 6px 12px;
    margin: 10px 0;
    color: #1e40af;
    font-size: 9pt;
}

code {
    font-family: Courier, monospace;
    font-size: 8pt;
    background: #f1f5f9;
    color: #be185d;
    padding: 1px 4px;
}

pre {
    background: #1e293b;
    color: #e2e8f0;
    padding: 10px 12px;
    font-size: 7.5pt;
    line-height: 1.45;
    margin: 8px 0;
    border-left: 3px solid #3b82f6;
    word-wrap: break-word;
    white-space: pre-wrap;
}

pre code {
    background: none;
    color: inherit;
    padding: 0;
    font-size: inherit;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0;
    font-size: 9pt;
}

th {
    background: #1e40af;
    color: white;
    padding: 6px 8px;
    text-align: left;
    font-weight: bold;
}

td {
    padding: 5px 8px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
}

tr.even td { background: #f8fafc; }

ul, ol {
    padding-left: 18px;
    margin: 4px 0 8px 0;
}

li { margin: 2px 0; }

strong { font-weight: bold; color: #0f172a; }

hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 16px 0;
}
"""

# Zebra stripes via Python (xhtml2pdf non supporta CSS :nth-child)
import re
def add_zebra(html):
    def stripe_table(m):
        rows = m.group(0)
        count = [0]
        def tag_row(r):
            if r.group(1).lower() == 'tr':
                count[0] += 1
                cls = ' class="even"' if count[0] % 2 == 0 else ''
                return f'<tr{cls}>'
            return r.group(0)
        return re.sub(r'<(tr)([^>]*)>', tag_row, rows, flags=re.IGNORECASE)
    return re.sub(r'<table.*?</table>', stripe_table, html, flags=re.DOTALL | re.IGNORECASE)

html_body = add_zebra(html_body)

html_full = f"""<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<style>{CSS}</style>
</head>
<body>
{html_body}
</body>
</html>"""

print(f"Conversione: {MD_FILE.name} -> {PDF_FILE.name}")
with open(PDF_FILE, "wb") as f:
    result = pisa.CreatePDF(html_full.encode("utf-8"), dest=f, encoding="utf-8")

if result.err:
    print(f"Errore durante la conversione: {result.err}")
else:
    size_kb = PDF_FILE.stat().st_size / 1024
    print(f"PDF generato: {PDF_FILE}")
    print(f"Dimensione: {size_kb:.1f} KB")
