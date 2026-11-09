#!/bin/sh
# Build the stack, set it up through the installer (multi-account mode), seed mail, run the API and browser tests.
# Needs docker and python3. Screenshots of the browser test land in ./screenshots.
set -e
cd "$(dirname "$0")"

PROJECT=glennski-e2e
URL=http://localhost:3003
export VERSION="$(cat ../../VERSION)"

rm -rf data screenshots && mkdir -p data screenshots
trap 'docker compose -p $PROJECT down >/dev/null 2>&1' EXIT

docker compose -p $PROJECT up -d --build
until [ "$(curl -s -o /dev/null -w '%{http_code}' $URL/installer.php)" = 200 ]; do sleep 1; done

# first run: the installer, as a user would do it
JAR=$(mktemp)
TOKEN=$(curl -s -c "$JAR" $URL/installer.php | grep -o 'name="_token" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"//')
curl -s -b "$JAR" -c "$JAR" --data-urlencode _token="$TOKEN" -d _mode=multi -d _admin_user=glenn \
    --data-urlencode _admin_pass='correct horse' --data-urlencode _admin_pass2='correct horse' \
    -d _mb_email=glenn@example.org --data-urlencode _mb_pass=x -d _mb_imap_host=greenmail:3143 -d _mb_smtp_host=greenmail:3025 \
    $URL/installer.php | grep -q 'All set'
rm -f "$JAR"

python3 seed.py
# an account without a mailbox (installer step skipped)
docker compose -p $PROJECT exec -T -u www-data webmail php bin/accounts.php add-user nobox 'correct horse' >/dev/null
python3 pending_test.py
docker compose -p $PROJECT exec -T -u www-data webmail php bin/accounts.php add-user uibox 'correct horse' >/dev/null
python3 api_test.py
API_BASE=$URL/ python3 mcp_test.py

docker run --rm --add-host=host.docker.internal:host-gateway -v "$PWD":/work -v "$PWD/screenshots":/out \
    mcr.microsoft.com/playwright/python:v1.49.0-noble \
    sh -c "pip install -q --disable-pip-version-check playwright==1.49.0 2>/dev/null; python /work/ui_test.py"
