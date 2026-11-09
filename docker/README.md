# Docker

```sh
docker compose up -d        # http://localhost:8080
```

Default: SQLite, and the mail servers are detected from the address typed at login
(`autoconfig` plugin). Data (database, `des_key`, temp, setup) lives in the `/var/roundcube` volume.
Build and tag with the current version: `make docker`.

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `ROUNDCUBE_IMAP_HOST` | – | Fixed IMAP server, e.g. `tls://imap.example.com:143`. Disables detection |
| `ROUNDCUBE_SMTP_HOST` | `localhost:587` | Fixed SMTP server (with `IMAP_HOST`) |
| `ROUNDCUBE_USERNAME_DOMAIN` | – | Domain appended to bare user names (with `IMAP_HOST`) |
| `ROUNDCUBE_SETUP_EMAIL` / `ROUNDCUBE_SETUP_DOMAIN` | – | Detect fixed servers **once** at start and store them |
| `ROUNDCUBE_SETUP_REFRESH` | – | Set to any value to repeat that detection |
| `ROUNDCUBE_DB_DSN` | SQLite in volume | e.g. `pgsql://user:pass@db/roundcube` |
| `ROUNDCUBE_DES_KEY` | generated, persisted | Session encryption key |
| `ROUNDCUBE_PLUGINS` | `archive,zipdownload` | Comma separated |
| `ROUNDCUBE_AUTOCONFIG_ALLOW_PRIVATE` | `false` | Allow detected hosts in private ranges (mail server in the same network) |
| `ROUNDCUBE_AUTOCONFIG_ALLOW_PLAIN` | `false` | Allow servers without TLS (not recommended) |
| `ROUNDCUBE_TRUSTED_PROXIES` | – | Reverse proxies whose `X-Forwarded-*` is trusted |
| `ROUNDCUBE_PRODUCT_NAME`, `ROUNDCUBE_SKIN` | `Webmail`, `elastic` | |

Logs go to stdout. The web installer is not part of the image; use the variables above.
