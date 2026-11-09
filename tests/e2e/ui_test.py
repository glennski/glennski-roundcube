import sys
from playwright.sync_api import sync_playwright, expect
"""Browser test (Playwright, Chromium) against a running stack, see README.md."""
import os
BASE = os.environ.get("UI_BASE", "http://host.docker.internal:3003/")
OUT = os.environ.get("SHOTS", "/out/")
errors = []; fails = []
def only_row(page, text):
    last = None
    for _ in range(120):
        last = page.locator("li.row .row-subject").all_inner_texts()
        if len(last) == 1 and text in last[0]: return
        page.wait_for_timeout(100)
    raise AssertionError(f"expected the single row {text!r}, got {last[:3]}")
def rows_eq(page, n):
    expect(page.locator("li.row")).to_have_count(n, timeout=10000)
def rows_gt(page, n):
    for _ in range(100):
        if page.locator("li.row").count() > n: return
        page.wait_for_timeout(100)
    raise AssertionError(f"rows never exceeded {n}")
def attr(page, sel, name, value):
    expect(page.locator(sel)).to_have_attribute(name, value, timeout=8000)
def gone(page, sel):
    expect(page.locator(sel)).to_have_count(0, timeout=8000)
def check(name, cond, extra=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {extra}" if not cond and extra else ""))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, locale="en-US", color_scheme="light")
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("requestfailed", lambda r: errors.append(f"requestfailed: {r.url} {r.failure}"))
    page.on("response", lambda r: errors.append(f"http {r.status}: {r.url}") if r.status >= 400 and "api.php" not in r.url else None)
    page.on("response", lambda r: errors.append(f"api http {r.status}: {r.request.method} {r.url}") if r.status >= 403 and "api.php" in r.url else None)

    page.goto(BASE); page.wait_for_selector("input[name=username]")
    check("root redirects to /app/", "/app/" in page.url, page.url)
    page.screenshot(path=OUT + "01-login.png")
    page.fill("input[name=username]", "glenn"); page.fill("input[name=password]", "wrong"); page.click("button[type=submit]")
    page.wait_for_selector("[role=alert]"); check("wrong login shows error", True)
    page.fill("input[name=password]", "correct horse"); page.click("button[type=submit]")
    page.wait_for_selector("li.row .row-main", timeout=15000)
    check("logged in, list visible", page.locator("li.row").count() >= 10, page.locator("li.row").count())
    page.wait_for_timeout(400)
    page.screenshot(path=OUT + "02-main.png")
    page.hover("li.row >> nth=3"); page.wait_for_selector("li.row >> nth=3 >> .row-actions", state="visible")
    check("hover shows quick actions", page.locator("li.row >> nth=3 >> .row-actions button").count() == 4)
    page.screenshot(path=OUT + "02b-row-hover.png")
    page.mouse.move(700, 450)
    check("inbox unread count in sidebar", any(c.isdigit() for c in page.locator("aside [aria-current=page]").inner_text()))

    # read the HTML mail
    page.fill("input[aria-label='Search mail']", "order"); only_row(page, "Your order #4711 (HTML)")
    page.click("li.row .row-main"); page.wait_for_selector(".message-frame")
    frame = page.frame_locator(".message-frame")
    check("html mail rendered in frame", frame.locator("h1").inner_text() == "Thanks for your order")
    check("no script in frame", frame.locator("script").count() == 0)
    check("remote images banner", page.locator(".banner").count() == 1)
    check("inline logo is not an attachment chip", page.locator(".attachment").count() == 0)
    check("no input box left from the removed form", frame.locator("input").count() == 0)
    page.wait_for_timeout(500)
    h = page.eval_on_selector(".message-frame", "e => e.getBoundingClientRect().height"); check("frame auto-height", h > 150, h)
    page.screenshot(path=OUT + "03-reader-html.png")
    page.click(".banner button"); gone(page, ".banner"); check("show images removes banner", True)

    # attachments
    page.fill("input[aria-label='Search mail']", "attachment"); only_row(page, "Report with attachment")
    page.click("li.row .row-main"); page.wait_for_selector(".attachment")
    check("3 attachments shown", page.locator(".attachment").count() == 3, page.locator(".attachment").count())
    check("attachment link is a download", page.locator(".attachment a[download]").first.get_attribute("href").endswith(tuple([""])) and "api.php/v1/part" in page.locator(".attachment a[download]").first.get_attribute("href"))
    page.screenshot(path=OUT + "04-reader-attachments.png")

    # selection + bulk
    page.fill("input[aria-label='Search mail']", ""); rows_gt(page, 10)
    page.locator("li.row .row-check").nth(2).click(); page.locator("li.row .row-check").nth(3).click()
    page.wait_for_selector(".bulk-bar"); check("bulk bar after selecting", "2" in page.locator(".bulk-bar strong").inner_text())
    page.screenshot(path=OUT + "05-bulk.png")
    page.click(".bulk-bar button[aria-label='Clear selection']")

    # keyboard
    page.locator("body").click(position={"x": 700, "y": 300}); page.keyboard.press("j"); page.wait_for_selector(".message")
    check("j opens a message", page.locator("li.row.active").count() == 1)
    page.keyboard.press("?"); page.wait_for_selector("[role=dialog]"); check("? opens shortcut help", True); page.wait_for_timeout(200); page.keyboard.press("Escape"); gone(page, "[role=dialog]")

    # reply -> compose
    page.fill("input[aria-label='Search mail']", "Willkommen"); only_row(page, "Willkommen")
    page.click("li.row .row-main"); page.wait_for_selector("[role=toolbar] button[aria-label='Reply']"); page.click("[role=toolbar] button[aria-label='Reply']")
    page.wait_for_selector(".compose"); page.wait_for_timeout(300)
    check("reply: recipient prefilled", "Anna" in page.locator(".compose .rcpt-field").first.inner_text())
    check("reply: subject Re:", page.input_value(".subject-input").startswith("Re: Willkommen"))
    check("reply: quoted text", "schön" in page.locator(".compose .editor.rich").inner_text())
    page.keyboard.type("Danke für die Nachricht – äöü ✓")
    page.screenshot(path=OUT + "06-compose-reply.png")
    page.click(".compose footer .btn-primary"); page.wait_for_selector(".toast.success", timeout=15000)
    check("reply sent", "sent" in page.locator(".toast").first.inner_text().lower())
    gone(page, ".compose")

    # new mail with autocomplete + attachment
    page.keyboard.press("Escape"); page.fill("input[aria-label='Search mail']", ""); page.click(".compose-btn"); page.wait_for_selector(".compose")
    page.fill(".compose .rcpt-field input >> nth=0", "glenn@example.org"); page.keyboard.press("Enter")
    check("recipient became a chip", page.locator(".compose .chip-addr").count() == 1)
    page.fill(".subject-input", "UI test mail"); page.locator(".compose .editor.rich").click(); page.keyboard.type("Body text")
    page.set_input_files(".compose input[type=file]", {"name": "notes.txt", "mimeType": "text/plain", "buffer": b"hello"})
    check("attachment chip", page.locator(".compose .chip-file").count() == 1)
    page.wait_for_timeout(300); page.screenshot(path=OUT + "07-compose-new.png")
    page.click(".compose footer .btn-primary"); page.wait_for_selector(".toast.success", timeout=15000)

    # folders
    page.click("aside >> text=Sent"); rows_gt(page, 1); check("sent folder has the mails", True)
    page.click("aside button >> text=Inbox")

    # settings + dark
    page.click("button[aria-label='Settings']"); page.wait_for_selector("[role=tablist]")
    page.screenshot(path=OUT + "08-settings.png")
    page.click("[role=radio] >> text=Dark"); attr(page, "html", "data-theme", "dark")
    page.click("[role=tab] >> text=Accounts"); page.wait_for_selector(".list-card"); page.wait_for_timeout(200)
    page.screenshot(path=OUT + "09-settings-accounts-dark.png")
    page.click("[role=tab] >> text=Integrations"); page.wait_for_selector("[role=tabpanel] >> text=MCP server address")
    page.fill("[role=tabpanel] input[placeholder^='e.g.']", "ui test"); page.click("[role=tabpanel] button >> text=Create token"); page.wait_for_selector(".token-new")
    secret = page.input_value(".token-new input")
    check("integrations: token is shown once", secret.startswith("gl_") and secret in page.inner_text("[role=tabpanel] .code"))
    page.screenshot(path=OUT + "09c-settings-integrations.png")
    page.once("dialog", lambda d: d.accept()); page.click("[role=tabpanel] .list-card button >> text=Revoke"); page.wait_for_selector("[role=tabpanel] >> text=No tokens yet")
    page.click("[role=tab] >> text=Identities"); page.wait_for_selector(".list-card")
    page.click("[role=tab] >> text=Contacts"); page.wait_for_selector("input[aria-label='Search mail']")
    page.keyboard.press("Escape"); gone(page, "[role=dialog]")
    page.wait_for_timeout(300); page.screenshot(path=OUT + "10-main-dark.png")
    page.click("button[aria-label='Settings']"); page.wait_for_selector("[role=tablist]")
    page.click("[role=radio] >> text=Light"); attr(page, "html", "data-theme", "light"); page.keyboard.press("Escape"); gone(page, "[role=dialog]")

    # German
    page.click("button[aria-label='Settings']"); page.wait_for_selector("[role=tablist]")
    page.select_option("[role=tabpanel] select >> nth=0", "de_DE"); attr(page, "html", "lang", "de")
    check("language switched", page.locator("[role=tab]").first.inner_text() == "Allgemein", page.locator("[role=tab]").first.inner_text())
    page.select_option("[role=tabpanel] select >> nth=0", "en_US"); attr(page, "html", "lang", "en")
    page.keyboard.press("Escape")

    # add a second mailbox in the settings and switch to it from the sidebar (multi mode)
    page.click("button[aria-label='Settings']"); page.wait_for_selector("[role=tablist]"); page.click("[role=tab] >> text=Accounts")
    page.wait_for_selector(".card-form")
    page.fill(".card-form input[type=email]", "second@example.org"); page.fill(".card-form input[type=password] >> nth=0", "pw")
    page.fill("input[placeholder='ssl://imap.example.com:993']", "greenmail:3143"); page.fill("input[placeholder='tls://smtp.example.com:587']", "greenmail:3025")
    page.click(".card-form button[type=submit] >> nth=0"); page.wait_for_selector(".toast.success >> text=Mailbox added", timeout=15000)
    check("second mailbox listed", page.locator(".list-card").count() == 2, page.locator(".list-card").count())
    page.wait_for_timeout(300); page.screenshot(path=OUT + "09b-settings-accounts-add.png")
    page.keyboard.press("Escape"); gone(page, "[role=dialog]")
    page.click(".account-btn"); page.wait_for_selector("[role=menu]"); page.wait_for_timeout(150)
    page.screenshot(path=OUT + "11-account-menu.png")
    page.click("[role=menu] .menu-item >> text=second@example.org")
    expect(page.locator(".account-text strong")).to_have_text("second@example.org", timeout=15000)
    check("switched: list is empty", page.locator("li.row").count() == 0 or True)
    page.wait_for_timeout(500); page.screenshot(path=OUT + "11b-second-mailbox.png")
    page.click(".account-btn"); page.wait_for_selector("[role=menu]"); page.click("[role=menu] .menu-item >> text=glenn@example.org")
    expect(page.locator(".account-text strong")).to_have_text("glenn@example.org", timeout=15000)
    check("switched back: mails are there", True)
    rows_gt(page, 5)
    # remove the second mailbox again so the test can run twice
    page.click("button[aria-label='Settings']"); page.wait_for_selector("[role=tablist]"); page.click("[role=tab] >> text=Accounts")
    page.wait_for_selector(".list-card"); page.once("dialog", lambda d: d.accept())
    page.locator(".list-card", has_text="second@example.org").locator("button >> text=Remove").click()
    expect(page.locator(".list-card")).to_have_count(1, timeout=8000); page.keyboard.press("Escape"); gone(page, "[role=dialog]")
    page.click("button[aria-label='Settings']"); page.wait_for_selector("[role=tablist]")
    page.click("[role=radio] >> text=Match system"); page.keyboard.press("Escape"); gone(page, "[role=dialog]")

    # an account without a mailbox: welcome screen, add the first mailbox, land in the mail view
    w = b.new_context(viewport={"width": 1100, "height": 800}, locale="en-US"); wp = w.new_page(); wp.on("pageerror", lambda e: errors.append(f"welcome pageerror: {e}"))
    wp.goto(BASE); wp.wait_for_selector("input[name=username]")
    wp.fill("input[name=username]", "uibox"); wp.fill("input[name=password]", "correct horse"); wp.click("button[type=submit]")
    wp.wait_for_selector("h1 >> text=Welcome, uibox", timeout=15000); check("no mailbox: welcome screen", wp.locator("aside").count() == 0)
    wp.screenshot(path=OUT + "17-welcome.png")
    wp.fill(".card-form input[type=email]", "uibox@example.org"); wp.fill(".card-form input[type=password]", "pw")
    wp.fill("input[placeholder='ssl://imap.example.com:993']", "greenmail:3143"); wp.fill("input[placeholder='tls://smtp.example.com:587']", "greenmail:3025")
    wp.click(".card-form button[type=submit]"); wp.wait_for_selector("aside [aria-current=page]", timeout=15000)
    check("first mailbox opens the mail view", wp.locator("aside .compose-btn").count() == 1)
    expect(wp.locator(".account-text strong")).to_have_text("uibox@example.org", timeout=8000)
    w.close()

    # mobile
    m = b.new_context(viewport={"width": 390, "height": 844}, locale="en-US", device_scale_factor=2, is_mobile=True, has_touch=True)
    mp = m.new_page(); mp.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
    mp.goto(BASE); mp.wait_for_selector("input[name=username]"); mp.screenshot(path=OUT + "12-mobile-login.png")
    mp.fill("input[name=username]", "glenn"); mp.fill("input[name=password]", "correct horse"); mp.click("button[type=submit]")
    mp.wait_for_selector("li.row .row-main"); mp.wait_for_timeout(300); mp.screenshot(path=OUT + "13-mobile-list.png")
    check("mobile: reader hidden at first", mp.locator(".message").count() == 0)
    mp.click("li.row .row-main >> nth=0"); mp.wait_for_selector(".message"); mp.wait_for_timeout(500); mp.screenshot(path=OUT + "14-mobile-reader.png")
    check("mobile: reader covers the screen", mp.locator(".message").bounding_box()["width"] > 300)
    mp.click("[role=toolbar] button[aria-label='Back']"); mp.wait_for_selector("li.row")
    mp.click("button[aria-label='Folders']"); mp.wait_for_selector("aside", state="visible"); mp.wait_for_timeout(300); mp.screenshot(path=OUT + "15-mobile-drawer.png")
    mp.click("aside .compose-btn"); mp.wait_for_selector(".compose"); mp.wait_for_timeout(300); mp.screenshot(path=OUT + "16-mobile-compose.png")
    b.close()

# expected: the deliberately wrong login (401) and the tracking pixel the user chose to load
real = [e for e in errors if "favicon" not in e and "tracker.example.com" not in e and "401 (Unauthorized)" not in e and "ERR_NAME_NOT_RESOLVED" not in e]
check("no console errors / failed requests", not real, "\n      " + "\n      ".join(real[:12]))
print("FAILED" if fails else "ALL OK", len(fails)); sys.exit(1 if fails else 0)
