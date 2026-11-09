# Docker

```sh
docker compose up -d        # http://localhost:8080
```

Default: SQLite. On the first visit the browser is sent to the installer, which asks how this
installation is used:

* **One email address** - the classic way. Users log in with the address and password of their mailbox.
  Either fixed servers (detected from an address, or typed in) or *any address* (servers are detected at every login).
* **Account with several mailboxes** - users log in with an account of this application (own password) and
  add mailboxes of any provider under *Settings > Accounts* (server detection, Google/Microsoft/iCloud presets).
  The installer creates the first account and its first mailbox. If a default mailbox becomes unusable, repair it
  with `docker compose exec webmail php bin/accounts.php mailboxes|set-default|passwd` (run without arguments for help).

The answer is stored in `/var/roundcube/setup.json`; once it exists the installer is disabled. Delete that file to run the choice again.
Data (database, `des_key`, temp, logs, setup) lives in `./data` (mounted at `/var/roundcube`); its content is git-ignored.
On Linux the entrypoint sets the owner of that folder to the container user `www-data` (uid 33).
Build and tag with the current version: `make docker`.

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `ROUNDCUBE_IMAP_HOST` | – | Fixed IMAP server, e.g. `tls://imap.example.com:143`. Disables detection |
| `ROUNDCUBE_SMTP_HOST` | `localhost:587` | Fixed SMTP server (with `IMAP_HOST`) |
| `ROUNDCUBE_USERNAME_DOMAIN` | – | Domain appended to bare user names (with `IMAP_HOST`) |
| `ROUNDCUBE_SETUP_MODE` | – | `auto` = single mode, any address, detected at login; skips the installer (multi-account needs the installer) |
| `ROUNDCUBE_SETUP_EMAIL` / `ROUNDCUBE_SETUP_DOMAIN` | – | Detect fixed servers **once** at start and store them, skips the installer |
| `ROUNDCUBE_SETUP_REFRESH` | – | Set to any value to repeat that detection |
| `ROUNDCUBE_DB_DSN` | SQLite in volume | e.g. `pgsql://user:pass@db/roundcube` |
| `ROUNDCUBE_DES_KEY` | generated, persisted | Session encryption key |
| `ROUNDCUBE_ENABLE_PLUGINS` | `archive,zipdownload` | Comma separated |
| `ROUNDCUBE_AUTOCONFIG_ALLOW_PRIVATE` | `false` | Allow detected hosts in private ranges (mail server in the same network) |
| `ROUNDCUBE_AUTOCONFIG_ALLOW_PLAIN` | `false` | Allow servers without TLS (not recommended) |
| `ROUNDCUBE_TRUSTED_PROXIES` | – | Reverse proxies whose `X-Forwarded-*` is trusted |
| `ROUNDCUBE_PRODUCT_NAME`, `ROUNDCUBE_SKIN` | `Webmail`, `elastic` | |
| `ROUNDCUBE_FRONTEND` | `glennski` | `classic` opens the Elastic interface at the root URL instead of the new one |

Logs go to stdout. Setting any of `IMAP_HOST`, `SETUP_MODE`, `SETUP_EMAIL` or `SETUP_DOMAIN` skips the installer.

Roundcube itself maps every `ROUNDCUBE_<OPTION>` variable onto the option of the same name (with JSON for arrays, e.g. `ROUNDCUBE_PLUGINS='["archive"]'`), which is why the plugin list here is called `ENABLE_PLUGINS`.
