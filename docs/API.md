# JSON API

`public_html/api.php/v1/<route>` is the interface of the new frontend (`public_html/app/`) and the
basis for further integrations. It speaks JSON, uses the normal Roundcube session cookie and adds
no new storage.

## Authentication and CSRF

1. `GET v1/session` - works without a session and returns `{ authenticated, token, mode, ... }`.
   `token` is the request token of this session.
2. Every other request carries it in the header `X-Roundcube-Request: <token>`. A cross-site page
   cannot set that header, so this is the CSRF protection. Plain links that must work in `<img>`
   or as downloads (`v1/part`) may pass it as `_token` instead.
3. `POST v1/auth/login` with `{ username, password }`. On success the response is the session state
   with a **new token**. A failed login answers with an error and also a fresh `token`.
   In multi-account mode `username`/`password` are those of the application account.
4. `POST v1/auth/logout`.

Errors are `{ "error": { "code": "...", "message": "..." } }` with an HTTP status:
400 invalid input, 401 `unauthenticated` / `session_expired`, 403 `invalid_token`, 404, 409, 429
(too many login attempts), 502 `storage_error` (the mail server). API requests run as their own
Roundcube task (`api`), so plugins that extend the web UI do not load.

## Routes

| Route | Purpose |
|---|---|
| `GET v1/session` | State: user, identities, settings, `mode` (`single`/`multi`), mailboxes (multi) |
| `POST v1/auth/login`, `v1/auth/logout` | Sign in / out |
| `GET v1/folders` | Folders with `role` (inbox, drafts, sent, junk, trash, archive), unseen/total, quota |
| `POST v1/folders/create` `rename` `delete` `empty` | Folder management (`empty` only for trash and spam) |
| `GET v1/messages?folder&page&per_page&q&filter&sort&order` | List or search (`filter`: `unseen`, `flagged`) |
| `GET v1/message?folder&uid[&images=1][&peek=1]` | One message: headers, sanitized `html`, `text`, attachments. Marks it as read unless `peek` |
| `GET v1/part?folder&uid&part[&inline=1]&_token` | Attachment or inline image. Only png/jpeg/gif/webp/avif/bmp are ever inline, everything else downloads, always with a sandbox CSP |
| `POST v1/messages/actions` `{folder, uids, action, target?}` | `mark_read`, `mark_unread`, `flag`, `unflag`, `move`, `copy`, `delete`, `archive`, `spam` |
| `POST v1/send` (JSON, or multipart with `payload` + `attachments[]`) | Send, or save a draft with `draft: true`. Reply/forward flags, `draft_uid` replaces a draft |
| `GET v1/contacts[?q]`, `GET v1/contacts/suggest?q`, `POST v1/contacts/save` `delete` | Address book and recipient suggestions |
| `GET v1/identities`, `POST v1/identities/save` `delete` | Sender identities |
| `GET v1/settings`, `POST v1/settings` | `theme`, `density`, `mail_pagesize`, `htmleditor`, `language`, `timezone` |
| `GET v1/attachment?folder&uid&part` | Attachment as JSON `{name, type, size, encoding: text\|base64, content}`, up to 10 MB (for clients that cannot follow download links) |
| `GET v1/tokens`, `POST v1/tokens/create` `revoke` | Access tokens for the [MCP server](MCP.md). `create` returns the plain `access_token` once |
| `GET v1/accounts`, `POST v1/accounts/add` `detect` `remove` `default` `switch` `password` | Multi-account mode only. `switch` replaces the session and returns the new state |

## Message HTML

HTML bodies are washed on the server with Roundcube's `rcube_washtml`: no scripts, forms, form
controls or active content; remote images and stylesheets are replaced until `images=1` is
requested (`remote_blocked` tells the client). `cid:` images point to `v1/part`. The frontend
shows the result in a sandboxed frame without script permission.

## Notes

* Folder names are Roundcube's internal (UTF-8) names and travel in the query or body, never in the
  path, because many servers refuse `%2F` in paths.
* Each request connects to the IMAP server again, like every Roundcube request. Folder counts are
  read fresh from the server on `GET v1/folders` (the client polls it).
* Tests: `tests/e2e/` (see its README).
