#!/bin/sh
# Prepare persistent data, detect mail servers once, migrate the database, start Apache.
set -eu

DATA="${ROUNDCUBE_DATA:-/var/roundcube}"
APP=/var/www/html
mkdir -p "$DATA/db" "$DATA/temp" "$DATA/logs"

# des_key: stable across restarts unless provided via ROUNDCUBE_DES_KEY
if [ ! -s "$DATA/des_key" ]; then
    head -c 18 /dev/urandom | base64 > "$DATA/des_key"
fi

# Server setup. Without ROUNDCUBE_IMAP_HOST / SETUP_EMAIL / SETUP_DOMAIN / SETUP_MODE=auto the
# browser is sent to the installer on first visit, which saves $DATA/setup.json.
# Re-run env-based detection with ROUNDCUBE_SETUP_REFRESH=1.
if [ -z "${ROUNDCUBE_IMAP_HOST:-}" ]; then
    SETUP_INPUT="${ROUNDCUBE_SETUP_EMAIL:-${ROUNDCUBE_SETUP_DOMAIN:-}}"
    if [ -n "$SETUP_INPUT" ] || [ "${ROUNDCUBE_SETUP_MODE:-}" = "auto" ]; then
        if [ -n "${ROUNDCUBE_SETUP_REFRESH:-}" ] || [ ! -s "$DATA/setup.json" ]; then
            EXTRA=""
            case "${ROUNDCUBE_AUTOCONFIG_ALLOW_PRIVATE:-}" in 1|true|yes|on) EXTRA="--allow-private" ;; esac
            if [ -n "$SETUP_INPUT" ]; then
                php "$APP/bin/setup.php" --mode=fixed --email="$SETUP_INPUT" $EXTRA --json > "$DATA/setup.json.tmp"
            else
                php "$APP/bin/setup.php" --mode=auto --json > "$DATA/setup.json.tmp"
            fi
            mv "$DATA/setup.json.tmp" "$DATA/setup.json"
        fi
    fi
fi

chown -R www-data:www-data "$DATA"
chmod 600 "$DATA/des_key"

# create or upgrade the schema
su -s /bin/sh www-data -c "php $APP/bin/initdb.sh --dir=$APP/SQL --update"

exec docker-php-entrypoint "$@"
