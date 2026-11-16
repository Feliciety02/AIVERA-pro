"""Render the disposable loopback assessment evidence as a reviewable PDF."""
import json
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/evidence/local-lab-2026-11-13/assessment.json"
OUTPUT = ROOT / "output/pdf/local-lab-assessment.pdf"
data = json.loads(SOURCE.read_text(encoding="utf-8"))
raw = json.loads(data["result"]["rawOutput"])
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

navy = colors.HexColor("#0c1830")
teal = colors.HexColor("#087f8c")
gray = colors.HexColor("#526173")
light = colors.HexColor("#eaf1f4")
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleA", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=20, leading=25, textColor=navy, spaceAfter=8))
styles.add(ParagraphStyle(name="SubA", parent=styles["Normal"], fontSize=10, leading=15, textColor=gray, spaceAfter=16))
styles.add(ParagraphStyle(name="HeadA", parent=styles["Heading2"], fontSize=11, leading=14, textColor=teal, spaceBefore=9, spaceAfter=4))
styles.add(ParagraphStyle(name="BodyA", parent=styles["Normal"], fontSize=9, leading=12, textColor=navy, spaceAfter=4))
styles.add(ParagraphStyle(name="SmallA", parent=styles["Normal"], fontSize=8, leading=11, textColor=gray, spaceAfter=4))
styles.add(ParagraphStyle(name="BannerA", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=13, textColor=navy, alignment=TA_CENTER))

def p(value, style="BodyA"):
    return Paragraph(escape(str(value)), styles[style])

def local(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=8))).strftime("%d %b %Y, %I:%M:%S %p SGT")

def details(rows):
    t = Table([[p(k, "SmallA"), p(v)] for k, v in rows], colWidths=[1.55 * inch, 4.9 * inch], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), light),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, colors.white),
    ]))
    return t

story = [
    p("AIVERA | LOCAL LAB ASSESSMENT", "TitleA"),
    p("Verified workflow evidence - disposable loopback fixture - 13 November 2026", "SubA"),
    Table([[p("TEST DATA - LOCAL LAB ONLY", "BannerA")]], colWidths=[6.45 * inch], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#dff4ed")),
        ("BOX", (0, 0), (-1, -1), 0.7, teal), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ])),
    Paragraph("Scope and authorization", styles["HeadA"]),
    details([
        ("Authorization", data["authorization"]),
        ("Target", data["targetUrl"]),
        ("Scope", "Exact loopback host and port; GET / only; no external hosts or active payloads"),
        ("Tool", "AIVERA HTTP security inspector (one GET; no crawling or attacks)"),
        ("Start", local(data["scan"]["startedAt"])),
        ("Completion", local(data["scan"]["completedAt"])),
    ]),
    Paragraph("Method and observed evidence", styles["HeadA"]),
    p("The inspector requested the owned test page once. It recorded HTTP 200, the response headers, and a redacted Set-Cookie line. The initial cookie did not carry HttpOnly or SameSite. The raw tool output is retained in assessment.json."),
    details([
        ("Request", raw["request"]),
        ("HTTP response", str(raw["status"])),
        ("Initial cookie", raw["setCookies"][0]),
        ("Finding", f'{data["reviewedFinding"]["code"]}: {data["reviewedFinding"]["title"]}'),
        ("Severity", data["reviewedFinding"]["severity"].title()),
    ]),
    Paragraph("Role workflow and remediation", styles["HeadA"]),
    p("The automated test used the assessor role to confirm the recorded observation. After the developer role marked work ready, the test fixture changed its cookie flags. The test checked the new response, recorded a passed retest as the assessor, and approved closure as a separate lead role."),
    details([
        ("Retest observation", data["reviewedFinding"]["retestCookie"]),
        ("Remediation state", data["reviewedFinding"]["remediation"]),
        ("Report state", data["report"]["status"].title() + " - approved by a different role"),
        ("Restart recovery", data["restartRecovery"]["status"].title() + " on a second test scan"),
    ]),
    Paragraph("Limits", styles["HeadA"]),
    p(data["limitations"]),
    p("This PDF documents a repeatable integration test, including scripted role actions. It is not a human assessment of the deployed UMERCH target or any third-party system. The ephemeral target address and test database no longer exist after the test finishes.", "SmallA"),
]

def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor("#c9d6dc"))
    canvas.line(0.75 * inch, 0.62 * inch, 7.75 * inch, 0.62 * inch)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(gray)
    canvas.drawString(0.75 * inch, 0.43 * inch, "AIVERA local lab - synthetic target, real HTTP observation")
    canvas.drawRightString(7.75 * inch, 0.43 * inch, f"Page {doc.page}")

SimpleDocTemplate(str(OUTPUT), pagesize=(8.5 * inch, 11 * inch),
                  leftMargin=0.85 * inch, rightMargin=0.85 * inch,
                  topMargin=0.62 * inch, bottomMargin=0.68 * inch).build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
