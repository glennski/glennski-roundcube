# MCP server

`public_html/mcp.php` lets AI assistants and other programs work with the mailboxes of an account:
search, read, send, sort, manage folders and contacts. It speaks the Model Context Protocol over
HTTP (JSON-RPC via POST, no streaming) and sits on the same code as the [JSON API](API.md).

**Only in multi-account mode.** The server signs in to the mailbox on its own, so it needs the
mailbox credentials that the account stores. With a single mailbox (classic login) there is nothing
stored and `mcp.php` answers 401.

## Connect

1. Sign in, open **Settings > Integrations** and create a token for the program. It is shown once.
   (Without a browser: `php bin/accounts.php token <account> [name]`.)
2. Point the program at `https://<your server>/mcp.php` with the header
   `Authorization: Bearer <token>`. For Claude Code:

   ```
   claude mcp add --transport http glennski-mail https://mail.example.com/mcp.php \
       --header "Authorization: Bearer gl_..."
   ```

Tokens belong to the account, can be revoked individually in the same place, and are stored as
SHA-256 hashes (they carry 192 random bits). A token gives access to **all mailboxes of the
account**; treat it like a password and use HTTPS.

## Tools

Every tool takes an optional `mailbox` (id or address from `list_mailboxes`); without it the default
mailbox is used.

| Tool | Does |
|---|---|
| `list_mailboxes` | Mailboxes of the account |
| `list_folders` | Folders with role and unread/total counts |
| `search_messages` | List or search one folder (`q`, `filter`, `page`, `sort`) |
| `read_message` | Headers, text body, attachment list. Does not mark as read unless `mark_read` |
| `get_attachment` | One attachment, text as text, otherwise base64 (up to 10 MB) |
| `message_action` | `mark_read`, `mark_unread`, `flag`, `unflag`, `move`, `copy`, `delete`, `archive`, `spam` |
| `send_message` | Send. Optional `html`, `attach` (base64 files), reply/thread headers |
| `save_draft` | Same fields, saved to Drafts |
| `create_folder` `rename_folder` `delete_folder` `empty_folder` | Folder management |
| `list_contacts` `save_contact` `delete_contact` | Address book |
| `list_identities` | Sender identities |

Errors of a tool (unknown folder, bad address, ...) come back as a normal result with `isError: true`
and a short `code: message`, so the model can react. Tools carry `readOnlyHint`/`destructiveHint`
annotations; clients that ask before running destructive tools will therefore ask before sending or
deleting.

## Behavior

* Stateless: each call signs in to the mailbox, runs, and drops its session. Nothing is kept between
  calls, and there is no Roundcube session cookie involved.
* HTML bodies are not returned; `read_message` gives the text version (converted from HTML if need be).
* Not available through MCP, on purpose: adding mailboxes (it would put passwords through the model),
  changing the account password, and managing tokens.
* Protocol: `initialize`, `ping`, `tools/list`, `tools/call`; protocol versions 2025-06-18,
  2025-03-26 and 2024-11-05. `GET` answers 405 (no server-initiated messages).

Tests: `tests/e2e/mcp_test.py` (run by `tests/e2e/run.sh`).
