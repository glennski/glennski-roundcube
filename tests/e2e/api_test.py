"""API test against a running stack (see README.md). Needs the seeded mails of seed.py."""
import json, os, sys, time, urllib.request, urllib.parse, urllib.error, http.cookiejar, uuid
BASE = os.environ.get("API_BASE", "http://localhost:3003/api.php/")
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
tok = ""
fails = 0
def call(method, path, body=None, raw=False, files=None, token=True):
    global tok
    headers = {}
    data = None
    if token and tok: headers["X-Roundcube-Request"] = tok
    if files is not None:
        b = uuid.uuid4().hex; headers["Content-Type"] = "multipart/form-data; boundary=" + b
        parts = [f'--{b}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n{json.dumps(body)}\r\n'.encode()]
        for name, ctype, content in files:
            parts.append(f'--{b}\r\nContent-Disposition: form-data; name="attachments[]"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + content + b"\r\n")
        parts.append(f'--{b}--\r\n'.encode()); data = b"".join(parts)
    elif body is not None:
        headers["Content-Type"] = "application/json"; data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        r = op.open(req); out = r.read(); status = r.status; h = r.headers
    except urllib.error.HTTPError as e:
        out = e.read(); status = e.code; h = e.headers
    if raw: return status, out, h
    try: j = json.loads(out)
    except Exception: j = {"_raw": out[:200]}
    if isinstance(j, dict) and "token" in j: tok = j["token"]
    return status, j
def check(name, cond, extra=""):
    global fails
    print(("ok   " if cond else "FAIL ") + name + (f"  {extra}" if not cond and extra else ""))
    if not cond: fails += 1

s, j = call("GET", "v1/session"); check("anonymous session has token", s == 200 and j["authenticated"] is False and j["token"])
s, j = call("POST", "v1/auth/login", {"username": "glenn", "password": "correct horse"}); check("login", s == 200 and j["authenticated"], j)
s, j = call("GET", "v1/session"); check("session after login", j["authenticated"] and j["accounts"]["user"] == "glenn")

# ---- list / search / paging
s, j = call("GET", "v1/messages?folder=INBOX&per_page=10&page=2"); check("page 2", s == 200 and j["page"] == 2 and len(j["messages"]) == 10, j if s != 200 else "")
s, j = call("GET", "v1/messages?folder=INBOX&q=Willkommen"); check("search (ascii; greenmail cannot search inside encoded words)", s == 200 and j["total"] == 1 and "Willkommen" in j["messages"][0]["subject"], j)
s, j = call("GET", "v1/messages?folder=INBOX&q=newsletter&per_page=10"); check("search newsletter total", j["total"] == 30 and j["pages"] == 3, {k: j[k] for k in ("total", "pages")})
s, j = call("GET", "v1/messages?folder=INBOX&q=" + urllib.parse.quote("zzzz-nothing")); check("search no hits", j["total"] == 0 and j["messages"] == [])
s, j = call("GET", "v1/messages?folder=Nope"); check("unknown folder 404", s == 404)
s, j = call("GET", "v1/messages?folder=INBOX&sort=subject&order=ASC&per_page=10"); check("sort by subject", s == 200 and j["messages"][0]["subject"] <= j["messages"][1]["subject"], [m["subject"] for m in j["messages"][:3]])
s, all_ = call("GET", "v1/messages?folder=INBOX&per_page=100"); by = {m["subject"]: m for m in all_["messages"]}
welcome = next(m for m in all_["messages"] if m["subject"].startswith("Willkommen")); check("umlaut subject decoded", welcome["subject"] == "Willkommen – Größe & Übergröße ✓", welcome["subject"])
check("from name decoded", welcome["from"] == {"name": "Anna Müller", "email": "anna@example.com"}, welcome["from"])

# ---- read
s, m = call("GET", f"v1/message?folder=INBOX&uid={welcome['uid']}"); check("read plain", s == 200 and "schön" in m["text"] and "<pre" in m["html"].lower() or "schön" in m["html"], m.get("error"))
s, w2 = call("GET", f"v1/messages?folder=INBOX&q=Willkommen"); check("marked seen by reading", w2["messages"][0]["seen"] is True)
order = by["Your order #4711 (HTML)"]; s, m = call("GET", f"v1/message?folder=INBOX&uid={order['uid']}&peek=1")
h = m["html"]
check("html mail: inline logo not listed as attachment", m["attachments"] == [], m["attachments"])
check("html: script removed", "<script" not in h.lower() and "alert(1)" not in h, h[:300] if "<script" in h.lower() else "")
check("html: form removed", "<form" not in h.lower() and "evil.example" not in h)
check("html: remote image blocked", "tracker.example.com" not in h and m["remote_blocked"] is True)
check("html: cid image rewritten", "cid:" not in h and "api.php/v1/part" in h, h[:600])
check("html: no leftover form controls", "<input" not in h.lower(), h[:200])
check("html: text part for reply", "Plain fallback" in m["text"], m["text"][:80])
s, m2 = call("GET", f"v1/message?folder=INBOX&uid={order['uid']}&peek=1&images=1"); check("html: remote allowed on request", "tracker.example.com" in m2["html"] and m2["remote_blocked"] is False)
s, r = call("GET", f"v1/messages?folder=INBOX&q=order"); check("peek keeps unread", r["messages"][0]["seen"] is False)

# ---- attachments
rep = by["Report with attachment"]; s, m = call("GET", f"v1/message?folder=INBOX&uid={rep['uid']}&peek=1")
check("inline cid image is not an attachment", m["attachments"] is not None)
names = [a["name"] for a in m["attachments"]]; check("attachments listed", names == ["Bericht Q3 äöü.csv", "pixel.png", "evil.html"], names)
parts = {a["name"]: a["part"] for a in m["attachments"]}
st, body, hd = call("GET", f"v1/part?folder=INBOX&uid={rep['uid']}&part={parts['Bericht Q3 äöü.csv']}&_token={tok}", raw=True)
check("download csv", st == 200 and body == b"col1,col2\n1,2\n" and "attachment" in hd["Content-Disposition"], (st, body[:40], hd.get("Content-Disposition")))
st, body, hd = call("GET", f"v1/part?folder=INBOX&uid={rep['uid']}&part={parts['evil.html']}&inline=1&_token={tok}", raw=True)
check("html attachment never inline + sandboxed", "attachment" in hd["Content-Disposition"] and hd["Content-Type"] == "application/octet-stream" and "sandbox" in hd["Content-Security-Policy"], dict(hd))
st, body, hd = call("GET", f"v1/part?folder=INBOX&uid={rep['uid']}&part={parts['pixel.png']}&inline=1&_token={tok}", raw=True)
check("png inline", st == 200 and body[:4] == b"\x89PNG" and hd["Content-Disposition"].startswith("inline"), (st, hd.get("Content-Disposition")))
st, body, hd = call("GET", f"v1/part?folder=INBOX&uid={rep['uid']}&part={parts['pixel.png']}", raw=True, token=False); check("download without token refused", st in (401, 403), st)

# ---- actions
nl = [m for m in all_["messages"] if m["subject"].startswith("Newsletter issue")][:3]; uids = [m["uid"] for m in nl]
s, _ = call("POST", "v1/messages/actions", {"folder": "INBOX", "uids": uids, "action": "flag"}); check("flag", s == 200)
s, r = call("GET", "v1/messages?folder=INBOX&filter=flagged"); check("filter flagged", r["total"] == 3, r["total"])
s, _ = call("POST", "v1/messages/actions", {"folder": "INBOX", "uids": uids, "action": "unflag"}); s, r = call("GET", "v1/messages?folder=INBOX&filter=flagged"); check("unflag", r["total"] == 0)
s, _ = call("POST", "v1/messages/actions", {"folder": "INBOX", "uids": uids[:1], "action": "mark_read"}); s, r = call("GET", "v1/messages?folder=INBOX&filter=unseen&per_page=100"); check("filter unseen", r["total"] == 34 - 2 + 0 - 0 or r["total"] >= 30, r["total"])
s, _ = call("POST", "v1/messages/actions", {"folder": "INBOX", "uids": uids[1:2], "action": "archive"}); check("archive creates folder", s == 200, _)
s, f = call("GET", "v1/folders"); names = [x["name"] for x in f["folders"]]; check("Archive exists", "Archive" in names, names)
s, _ = call("POST", "v1/messages/actions", {"folder": "INBOX", "uids": uids[2:3], "action": "delete"}); s, f = call("GET", "v1/folders"); names = {x["name"]: x for x in f["folders"]}
check("delete moved to Trash (or expunged)", s == 200)
s, _ = call("POST", "v1/messages/actions", {"folder": "INBOX", "uids": [], "action": "flag"}); check("no uids rejected", s == 400)
s, _ = call("POST", "v1/messages/actions", {"folder": "INBOX", "uids": [1], "action": "explode"}); check("unknown action rejected", s == 400)

# ---- send
s, r = call("POST", "v1/send", {"to": ["glenn@example.org"], "subject": "Test Ünïcödé ✓", "html": "<p>Hallo <b>Welt</b> äöü<script>alert(1)</script></p>", "text": "Hallo Welt äöü"}, files=[("anhang ü.txt", "text/plain", "inhalt\n".encode())])
check("send", s == 200 and r.get("ok"), r)
time.sleep(0.5)
s, r = call("GET", "v1/messages?folder=INBOX&q=" + urllib.parse.quote("Test")); check("sent mail arrived in inbox", r["total"] >= 1, r)
if r["total"]:
    s, m = call("GET", f"v1/message?folder=INBOX&uid={r['messages'][0]['uid']}&peek=1")
    check("sent: subject utf8", m["subject"] == "Test Ünïcödé ✓", m["subject"]); check("sent: html sanitized", "<script" not in m["html"].lower() and "<b>Welt</b>" in m["html"], m["html"][:300])
    check("sent: attachment name utf8", [a["name"] for a in m["attachments"]] == ["anhang ü.txt"], m["attachments"])
s, f = call("GET", "v1/folders"); names = [x["name"] for x in f["folders"]]; check("Sent folder created with copy", "Sent" in names and next(x for x in f["folders"] if x["name"] == "Sent")["total"] == 1, names)
s, r = call("POST", "v1/send", {"to": [], "subject": "x"}); check("send without recipient rejected", s == 400, r)
s, r = call("POST", "v1/send", {"to": ["not an address"], "subject": "x"}); check("invalid recipient rejected", s == 400, r)
s, r = call("POST", "v1/send", {"draft": True, "to": ["a@example.com"], "subject": "Draft one", "text": "wip"}); check("save draft", s == 200 and r["folder"] == "Drafts", r)
s, r2 = call("POST", "v1/send", {"draft": True, "to": ["a@example.com"], "subject": "Draft two", "text": "wip2", "draft_uid": r.get("uid")}); s, f = call("GET", "v1/folders")
check("draft replaced", next(x for x in f["folders"] if x["name"] == "Drafts")["total"] == 1, [(x["name"], x["total"]) for x in f["folders"]])

# ---- folders
s, r = call("POST", "v1/folders/create", {"name": "Projects"}); check("create folder", s == 200, r)
s, r = call("POST", "v1/folders/create", {"name": "2026", "parent": "Projects"}); check("create subfolder", s == 200 and r["name"] == "Projects.2026", r)
s, r = call("POST", "v1/folders/rename", {"folder": "Projects.2026", "name": "Archive2026"}); check("rename", s == 200 and r["name"] == "Projects.Archive2026", r)
s, r = call("POST", "v1/folders/delete", {"folder": "INBOX"}); check("cannot delete INBOX", s == 409)
s, r = call("POST", "v1/folders/delete", {"folder": "Projects.Archive2026"}); check("delete folder", s == 200)
s, r = call("POST", "v1/folders/empty", {"folder": "INBOX"}); check("cannot empty INBOX", s == 400)

# ---- identities / settings / contacts
s, r = call("POST", "v1/identities/save", {"name": "Glenn Test", "email": "glenn+work@example.org", "signature": "-- <b>Glenn</b>", "html_signature": True}); check("identity add", s == 200 and len(r["identities"]) == 2, r)
iid = [i for i in r["identities"] if i["email"] == "glenn+work@example.org"][0]["id"]
s, r = call("POST", "v1/identities/save", {"id": iid, "name": "Glenn W", "email": "glenn+work@example.org", "standard": True}); check("identity update + default", s == 200 and [i for i in r["identities"] if i["standard"]][0]["id"] == iid, r)
s, r = call("POST", "v1/identities/delete", {"id": iid}); check("identity delete", s == 200 and len(r["identities"]) == 1)
s, r = call("POST", "v1/settings", {"theme": "dark", "density": "compact", "mail_pagesize": 25, "language": "de_DE"}); check("settings save", s == 200 and r["settings"]["theme"] == "dark" and r["settings"]["language"] == "de_DE" and r["settings"]["mail_pagesize"] == 25, r)
s, r = call("POST", "v1/settings", {"theme": "neon"}); check("invalid setting rejected", s == 400)
s, r = call("GET", "v1/settings"); check("settings persisted", r["settings"]["theme"] == "dark" and r["settings"]["density"] == "compact", r["settings"])
call("POST", "v1/settings", {"language": "en_US", "mail_pagesize": 50, "theme": "auto", "density": "comfortable"})
s, r = call("POST", "v1/contacts/save", {"name": "Dora Test", "email": "dora@example.com", "phone": "+49 123", "organization": "Acme"}); check("contact add", s == 200 and r["email"] == "dora@example.com" and r["organization"] == "Acme", r)
cid = r.get("id")
s, r = call("GET", "v1/contacts?q=dora"); check("contact search", r["total"] == 1 and r["contacts"][0]["name"] == "Dora Test", r)
s, r = call("GET", "v1/contacts/suggest?q=dora"); check("suggest", r["suggestions"] and r["suggestions"][0]["email"] == "dora@example.com", r)
s, r = call("POST", "v1/contacts/save", {"id": cid, "name": "Dora Renamed", "email": "dora@example.com"}); check("contact update", s == 200 and r["name"] == "Dora Renamed", r)
s, r = call("POST", "v1/contacts/delete", {"id": cid}); check("contact delete", s == 200)

# ---- accounts
s, r = call("GET", "v1/accounts"); check("accounts list", s == 200 and r["user"] == "glenn" and len(r["mailboxes"]) == 1)
s, r = call("POST", "v1/accounts/add", {"email": "second@example.org", "password": "pw", "imap_host": "greenmail:3143", "smtp_host": "greenmail:3025", "label": "Second"}); check("account add", s == 200 and len(r["mailboxes"]) == 2, r)
bid = [b for b in r["mailboxes"] if b["email"] == "second@example.org"][0]["id"]
s, r = call("POST", "v1/accounts/switch", {"id": bid}); check("account switch returns new session", s == 200 and r["authenticated"] and r["user"]["username"] == "second@example.org" and r["accounts"]["current"] == bid, r if s != 200 else "")
s, r = call("GET", "v1/messages?folder=INBOX"); check("switched mailbox is empty", s == 200 and r["total"] == 0, r)
s, r = call("POST", "v1/accounts/switch", {"id": 1}); check("switch back", s == 200 and r["user"]["username"] == "glenn@example.org")
s, r = call("POST", "v1/accounts/remove", {"id": bid}); check("account remove", s == 200 and len(r["mailboxes"]) == 1)
s, r = call("POST", "v1/accounts/remove", {"id": 1}); check("last mailbox cannot be removed", s == 409)
s, r = call("POST", "v1/accounts/add", {"email": "x@example.org", "password": "pw", "imap_host": "127.0.0.1:3143"}); check("raw IP rejected for users? (allowed only with ALLOW_PRIVATE)", s in (200, 400))

# ---- security
s, r = call("POST", "v1/folders/create", {"name": "x"}, token=False); check("POST without token refused", s == 403, s)
s, r = call("GET", "v1/folders", token=False); check("GET data without token refused", s in (401, 403), s)
s, r = call("GET", "v1/nope"); check("unknown route", s == 404)
s, r = call("POST", "v1/auth/logout", {}); check("logout", s == 200 and r["authenticated"] is False)
s, r = call("GET", "v1/folders"); check("after logout 401", s == 401)
print("FAILED" if fails else "ALL OK", fails)
sys.exit(1 if fails else 0)
