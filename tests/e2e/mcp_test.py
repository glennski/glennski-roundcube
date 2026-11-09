"""MCP test against a running stack (see README.md). Needs the seeded mails of seed.py; run after api_test.py."""
import base64, http.cookiejar, json, os, time, urllib.error, urllib.request

BASE = os.environ.get("API_BASE", "http://localhost:3003/")
fails = 0


def check(name, cond, extra=""):
    global fails
    print(("ok   " if cond else "FAIL ") + name + (f"  {extra}" if not cond and extra else ""))
    fails += 0 if cond else 1


def post(url, body=None, headers=None, method=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json", **(headers or {})}, method=method)
    try:
        r = urllib.request.urlopen(req)
        return r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers


# ---- get a token through the API, as the settings page does
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def api(method, path, body=None, token=""):
    req = urllib.request.Request(BASE + "api.php/" + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Content-Type": "application/json", "X-Roundcube-Request": token})
    return json.loads(op.open(req).read())


tok = api("GET", "v1/session")["token"]
tok = api("POST", "v1/auth/login", {"username": "glenn", "password": "correct horse"}, tok)["token"]
created = api("POST", "v1/tokens/create", {"name": "e2e"}, tok)
token = created["access_token"]
check("token has the documented shape", token.startswith("gl_") and len(token) == 51 and created["tokens"][-1]["name"] == "e2e", created)

MCP = BASE + "mcp.php"
AUTH = {"Authorization": "Bearer " + token}
n = 0


def rpc(method, params=None, auth=AUTH, notify=False):
    global n
    n += 1
    msg = {"jsonrpc": "2.0", "method": method, **({"params": params} if params is not None else {}), **({} if notify else {"id": n})}
    s, out, h = post(MCP, msg, auth)
    return s, (json.loads(out) if out else None)


def tool(name, args=None):
    s, j = rpc("tools/call", {"name": name, "arguments": args or {}})
    assert s == 200 and "result" in j, (s, j)
    r = j["result"]
    text = r["content"][0]["text"]
    return r.get("isError", False), (json.loads(text) if not r.get("isError") else text)


# ---- protocol and auth
s, out, h = post(MCP, {"jsonrpc": "2.0", "id": 1, "method": "ping"})
check("no token: 401 with challenge", s == 401 and "Bearer" in (h.get("WWW-Authenticate") or ""))
s, out, h = post(MCP, {"jsonrpc": "2.0", "id": 1, "method": "ping"}, {"Authorization": "Bearer gl_" + "0" * 48})
check("wrong token: 401", s == 401)
s, out, h = post(MCP, method="GET")
check("GET: 405", s == 405)
s, j = rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "e2e", "version": "1"}})
check("initialize", s == 200 and j["result"]["protocolVersion"] == "2025-06-18" and "tools" in j["result"]["capabilities"] and j["result"]["serverInfo"]["name"] == "glennski-webmail", j)
s, j = rpc("notifications/initialized", notify=True)
check("notification: 202 without body", s == 202 and j is None)
s, j = rpc("nope")
check("unknown method: -32601", j["error"]["code"] == -32601)
s, j = rpc("tools/list")
names = [t["name"] for t in j["result"]["tools"]]
check("tools/list", {"search_messages", "read_message", "send_message", "message_action", "list_mailboxes"} <= set(names) and all(t["inputSchema"]["type"] == "object" for t in j["result"]["tools"]), names)

# ---- mail
err, boxes = tool("list_mailboxes")
check("list_mailboxes", not err and boxes["mailboxes"][0]["email"] == "glenn@example.org", boxes)
err, folders = tool("list_folders")
check("list_folders has INBOX", not err and any(f["role"] == "inbox" for f in folders["folders"]), folders)
err, found = tool("search_messages", {"folder": "INBOX", "q": "Willkommen"})
check("search_messages", not err and found["total"] == 1, found)
uid = found["messages"][0]["uid"]
err, m = tool("read_message", {"folder": "INBOX", "uid": uid})
check("read_message gives text, no html", not err and "schön" in m["text"] and "html" not in m, m)
err, m = tool("read_message", {"folder": "INBOX", "uid": 999999})
check("unknown message is a tool error", err and "message_not_found" in m, m)
err, text = tool("search_messages", {"folder": "Nope"})
check("unknown folder is a tool error", err and "folder_not_found" in text, text)
err, text = tool("read_message", {"folder": "INBOX"})
check("missing parameter is a tool error", err and "uid" in text, text)
err, text = tool("no_such_tool")
check("unknown tool is a tool error", err and "unknown_tool" in text, text)

# ---- attachment
err, found = tool("search_messages", {"folder": "INBOX", "q": "attachment"})
att_uid = next(x["uid"] for x in found["messages"] if x["has_attachments"])
err, m = tool("read_message", {"folder": "INBOX", "uid": att_uid})
part = m["attachments"][0]
err, a = tool("get_attachment", {"folder": "INBOX", "uid": att_uid, "part": part["part"]})
check("get_attachment", not err and a["name"] == part["name"] and a["size"] > 0 and a["encoding"] in ("text", "base64"), a if err else "")

# ---- change things
err, found = tool("search_messages", {"folder": "INBOX", "q": "Newsletter issue 3", "per_page": 10})
target = found["messages"][0]
err, r = tool("message_action", {"folder": "INBOX", "uids": [target["uid"]], "action": "flag"})
err, one = tool("search_messages", {"folder": "INBOX", "filter": "flagged"})
check("message_action flag", any(x["uid"] == target["uid"] for x in one["messages"]), one)
tool("message_action", {"folder": "INBOX", "uids": [target["uid"]], "action": "unflag"})
err, r = tool("message_action", {"folder": "INBOX", "uids": [target["uid"]], "action": "explode"})
check("bad action is a tool error", err, r)

# ---- send with attachment, then find it again in Sent
subject = "MCP hello " + os.urandom(3).hex()
err, r = tool("send_message", {"to": ["glenn@example.org"], "subject": subject, "text": "Sent by the MCP test", "attach": [{"name": "n.txt", "type": "text/plain", "content_base64": base64.b64encode(b"hello").decode()}]})
check("send_message", not err and r.get("ok"), r)
time.sleep(1)
err, got = tool("search_messages", {"folder": "INBOX", "q": subject})
check("sent mail arrived with attachment", not err and got["total"] == 1 and got["messages"][0]["has_attachments"], got)
err, r = tool("send_message", {"subject": "no recipient"})
check("send without recipient is a tool error", err, r)
err, r = tool("save_draft", {"to": ["glenn@example.org"], "subject": "Draft " + subject, "text": "later"})
check("save_draft", not err, r)

# ---- folders and contacts
err, r = tool("create_folder", {"name": "McpTmp"})
err, r = tool("rename_folder", {"folder": "McpTmp", "name": "McpTmp2"})
err, folders = tool("list_folders")
check("create and rename folder", any(f["name"] == "McpTmp2" for f in folders["folders"]), [f["name"] for f in folders["folders"]])
err, r = tool("delete_folder", {"folder": "McpTmp2"})
err, c = tool("save_contact", {"name": "Mcp Contact", "email": "mcp@example.com"})
check("save_contact", not err and c["email"] == "mcp@example.com", c)
err, l = tool("list_contacts", {"q": "Mcp"})
check("list_contacts", any(x["id"] == c["id"] for x in l["contacts"]), l)
tool("delete_contact", {"id": c["id"]})
err, ids = tool("list_identities")
check("list_identities", not err and ids["identities"], ids)

# ---- mailbox selection
err, text = tool("list_folders", {"mailbox": "nobody@example.org"})
check("unknown mailbox is a tool error", err and "mailbox_unavailable" in text, text)
err, f2 = tool("list_folders", {"mailbox": "glenn@example.org"})
check("mailbox by address", not err)

# ---- no session is left behind, and revoking works
s, j = rpc("tools/list")
tok_id = created["tokens"][-1]["token_id"]
api("POST", "v1/tokens/revoke", {"id": tok_id}, tok)
s, out, h = post(MCP, {"jsonrpc": "2.0", "id": 99, "method": "tools/list"}, AUTH)
check("revoked token no longer works", s == 401)

print("MCP ALL OK" if not fails else f"MCP: {fails} FAILED")
raise SystemExit(1 if fails else 0)
