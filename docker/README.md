# Docker

```sh
docker compose up -d        # http://localhost:8080
```

Default: SQLite. On the first visit the browser is sent to the installer, which asks how the mail
servers are found: detect at every login (`autoconfig` plugin), fixed servers detected once from an
address/domain, or entered manually. The answer is stored in `/var/roundcube/setup.json`; once it
exists the installer is disabled. Delete that file to run the choice again.
Data (database, `des_key`, temp, logs, setup) lives in `./data` (mounted at `/var/roundcube`); its content is git-ignored.
On Linux the entrypoint sets the owner of that folder to the container user `www-data` (uid 33).
Build and tag with the current version: `make docker`.

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `ROUNDCUBE_IMAP_HOST` | – | Fixed IMAP server, e.g. `tls://imap.example.com:143`. Disables detection |
| `ROUNDCUBE_SMTP_HOST` | `localhost:587` | Fixed SMTP server (with `IMAP_HOST`) |
| `ROUNDCUBE_USERNAME_DOMAIN` | – | Domain appended to bare user names (with `IMAP_HOST`) |
| `ROUNDCUBE_SETUP_MODE` | – | `auto` = detect at login, skips the installer (non-interactive) |
| `ROUNDCUBE_SETUP_EMAIL` / `ROUNDCUBE_SETUP_DOMAIN` | – | Detect fixed servers **once** at start and store them, skips the installer |
| `ROUNDCUBE_SETUP_REFRESH` | – | Set to any value to repeat that detection |
| `ROUNDCUBE_DB_DSN` | SQLite in volume | e.g. `pgsql://user:pass@db/roundcube` |
| `ROUNDCUBE_DES_KEY` | generated, persisted | Session encryption key |
| `ROUNDCUBE_PLUGINS` | `archive,zipdownload` | Comma separated |
| `ROUNDCUBE_AUTOCONFIG_ALLOW_PRIVATE` | `false` | Allow detected hosts in private ranges (mail server in the same network) |
| `ROUNDCUBE_AUTOCONFIG_ALLOW_PLAIN` | `false` | Allow servers without TLS (not recommended) |
| `ROUNDCUBE_TRUSTED_PROXIES` | – | Reverse proxies whose `X-Forwarded-*` is trusted |
| `ROUNDCUBE_PRODUCT_NAME`, `ROUNDCUBE_SKIN` | `Webmail`, `elastic` | |

Logs go to stdout. Setting any of `IMAP_HOST`, `SETUP_MODE`, `SETUP_EMAIL` or `SETUP_DOMAIN` skips the installer.
