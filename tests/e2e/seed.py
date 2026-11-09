"""Put test mail into the greenmail server of the e2e stack."""
import os, smtplib, email.utils, time
from email.message import EmailMessage
from email.mime.image import MIMEImage
RCPT = "glenn@example.org"
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc000000301010018dd8db00000000049454e44ae426082")
def send(msg):
    msg["To"] = RCPT; msg["Date"] = email.utils.formatdate(); msg["Message-ID"] = email.utils.make_msgid(domain="example.com")
    with smtplib.SMTP(os.environ.get("SMTP_HOST", "localhost"), int(os.environ.get("SMTP_PORT", "3025"))) as s: s.send_message(msg)
    time.sleep(0.05)
def plain(frm, subj, body):
    m = EmailMessage(); m["From"] = frm; m["Subject"] = subj; m.set_content(body); send(m)
plain("Anna Müller <anna@example.com>", "Willkommen – Größe & Übergröße ✓", "Hallo Glenn,\n\nschön, dass du da bist.\n\n> zitierter Text\n\nSchau mal auf https://example.com/test vorbei.\n\nViele Grüße\nAnna")
plain("Bob <bob@example.net>", "Meeting tomorrow", "Short plain mail.\nSecond line.")
for i in range(1, 31):
    plain(f"Newsletter {i} <news{i}@example.org>", f"Newsletter issue {i}", f"Body of newsletter {i}.")
m = EmailMessage(); m["From"] = "Shop <shop@example.com>"; m["Subject"] = "Your order #4711 (HTML)"
m.set_content("Plain fallback of the order mail.")
m.add_alternative('<html><head><style>body{font-family:serif}</style></head><body><h1>Thanks for your order</h1><p style="color:#c00">Total: <b>42 €</b></p><img src="cid:logo" alt="logo"><img src="https://tracker.example.com/pixel.gif" width="1" height="1"><script>alert(1)</script><a href="https://example.com/track">Track</a><form action="https://evil.example"><input name=x></form></body></html>', subtype="html")
m.get_payload()[1].add_related(PNG, "image", "png", cid="<logo>")
send(m)
m = EmailMessage(); m["From"] = "Carla <carla@example.com>"; m["Subject"] = "Report with attachment"; m.set_content("See attached report.")
m.add_attachment(b"col1,col2\n1,2\n", maintype="text", subtype="csv", filename="Bericht Q3 äöü.csv")
m.add_attachment(PNG, maintype="image", subtype="png", filename="pixel.png")
m.add_attachment(b"<html><script>alert(document.domain)</script></html>", maintype="text", subtype="html", filename="evil.html")
send(m)
print("seeded")
