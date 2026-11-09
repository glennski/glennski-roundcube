# End-to-end tests

`./run.sh` builds this repository as a container next to a throw-away mail server (Greenmail),
runs the installer, seeds a few mails (umlauts, HTML with an inline image and a tracking pixel,
attachments) and then runs

* `api_test.py` - the JSON API (`api.php/v1/*`): login and CSRF, folders, search, reading with
  sanitized HTML, attachments and their download rules, actions, sending, drafts, contacts,
  identities, settings and switching between mailboxes
* `mcp_test.py` - the MCP server (`mcp.php`): token auth, protocol basics, every group of tools,
  tool errors, mailbox selection, revoking a token
* `ui_test.py` - the new frontend in Chromium: sign in, read, search, select, reply, compose with
  attachment, settings, language and theme, switching mailboxes, and a phone-sized viewport.
  It also fails on JavaScript errors and CSP violations. Screenshots go to `./screenshots`.

Requires docker and python3. Greenmail cannot search inside MIME-encoded headers, so searches
with non-ASCII words are not part of the tests.
