"""An account without a mailbox (installer step skipped): signs in, can only add its first mailbox, then gets the mail view.
Needs the user 'nobox' (run.sh creates it with bin/accounts.php add-user)."""
import json, os, sys, urllib.request, urllib.error, http.cookiejar
BASE = os.environ.get("API_BASE", "http://localhost:3003/api.php/")
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
tok = ""
fails = 0
def call(method, path, body=None):
    global tok
    headers = {"X-Roundcube-Request": tok} if tok else {}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"; data = json.dumps(body).encode()
    try:
        r = op.open(urllib.request.Request(BASE + path, data=data, headers=headers, method=method)); out, status = r.read(), r.status
    except urllib.error.HTTPError as e:
        out, status = e.read(), e.code
    j = json.loads(out)
    if isinstance(j, dict) and "token" in j: tok = j["token"]
    return status, j
def check(name, cond, extra=""):
    global fails
    print(("ok   " if cond else "FAIL ") + name + (f"  {extra}" if not cond and extra else ""))
    if not cond: fails += 1

call("GET", "v1/session")
s, j = call("POST", "v1/auth/login", {"username": "nobox", "password": "wrong"}); check("wrong password is refused", s == 401, (s, j))
s, j = call("POST", "v1/auth/login", {"username": "nobox", "password": "correct horse"})
check("account without mailbox signs in as pending", s == 200 and j.get("authenticated") and j.get("pending") and j["accounts"]["mailboxes"] == [], (s, j))
check("pending session has no mail identities", j.get("identities") == [] and j["user"]["username"] == "nobox")
s, j = call("GET", "v1/session"); check("session survives and stays pending", j.get("authenticated") and j.get("pending"), j)
for path in ("v1/folders", "v1/messages", "v1/contacts", "v1/identities", "v1/settings", "v1/tokens"):
    s, j = call("GET", path); check(f"pending: GET {path} refused", s == 401, (s, j))
s, j = call("POST", "v1/send", {"to": ["x@example.org"], "subject": "x", "body": "x"}); check("pending: send refused", s == 401, (s, j))
s, j = call("POST", "v1/accounts/remove", {"id": 1}); check("pending: remove refused", s == 401, (s, j))
s, j = call("GET", "v1/accounts"); check("pending: accounts list is empty", s == 200 and j["mailboxes"] == [], (s, j))
s, j = call("POST", "v1/accounts/detect", {"email": "someone@example.org"}); check("pending: detect works", s == 200, (s, j))

# logout while pending, then back in
s, j = call("POST", "v1/auth/logout", {}); check("pending: logout", s == 200 and not j["authenticated"], (s, j))
s, j = call("GET", "v1/accounts"); check("after logout accounts need a login", s == 401, (s, j))
s, j = call("POST", "v1/auth/login", {"username": "nobox", "password": "correct horse"}); check("sign in again", j.get("pending"), j)

s, j = call("POST", "v1/accounts/add", {"email": "nobox@example.org", "password": "x", "imap_host": "nonexistent.invalid:3143"}); check("unreachable server is rejected", s == 400 and j["error"]["code"] == "mailbox_rejected", (s, j))
s, j = call("POST", "v1/accounts/add", {"email": "nobox@example.org", "password": "x", "imap_host": "greenmail:3143", "smtp_host": "greenmail:3025"})
check("first mailbox added", s == 200 and len(j["mailboxes"]) == 1, (s, j))
mid = j["mailboxes"][0]["id"]
s, j = call("POST", "v1/accounts/switch", {"id": mid})
check("opening it gives a full session", s == 200 and j.get("authenticated") and not j.get("pending") and j["user"]["email"] == "nobox@example.org", (s, j))
s, j = call("GET", "v1/folders"); check("mail routes work now", s == 200 and any(f["name"] == "INBOX" for f in j["folders"]), (s, j))
call("POST", "v1/auth/logout", {})
s, j = call("POST", "v1/auth/login", {"username": "nobox", "password": "correct horse"}); check("next login goes straight to the mailbox", j.get("authenticated") and not j.get("pending"), j)
print("FAILED" if fails else "ALL OK", fails); sys.exit(1 if fails else 0)
