#!/usr/bin/env bash
# Way 2 (no other web server on this VPS): builds and starts the stack with its own Nginx,
# then gets the Let's Encrypt certificate for API_DOMAIN. Run once from deploy/: bash init-ssl.sh
# Needs: deploy/.env filled in, the domain's DNS A record pointing here, ports 80/443 free.
# If the VPS already runs Nginx (port 80 "address already in use"), use way 1 instead.
set -euo pipefail
cd "$(dirname "$0")"

API_DOMAIN="$(grep -E '^API_DOMAIN=' .env | cut -d= -f2-)"
LETSENCRYPT_EMAIL="$(grep -E '^LETSENCRYPT_EMAIL=' .env | cut -d= -f2-)"
if [[ -z "$API_DOMAIN" || "$API_DOMAIN" == "api.example.com" ]]; then
  echo "Set API_DOMAIN in deploy/.env first." >&2
  exit 1
fi
COMPOSE=(docker compose -f docker-compose.prod.yml --profile bundled-nginx)
LIVE="certbot/conf/live/$API_DOMAIN"

mkdir -p certbot/www "$LIVE"

if [[ ! -s "$LIVE/fullchain.pem" ]]; then
  echo "==> Temporary self-signed certificate so Nginx can start"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$LIVE/privkey.pem" -out "$LIVE/fullchain.pem" -subj "/CN=localhost" 2>/dev/null
  TEMP_CERT=1
else
  TEMP_CERT=0
fi

echo "==> Building and starting the stack (first build takes a few minutes)"
"${COMPOSE[@]}" up -d --build

if [[ "$TEMP_CERT" == "1" ]]; then
  echo "==> Requesting the real certificate for $API_DOMAIN"
  rm -rf "$LIVE"
  "${COMPOSE[@]}" run --rm certbot certonly --webroot -w /var/www/certbot \
    -d "$API_DOMAIN" --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email --non-interactive
  "${COMPOSE[@]}" exec nginx nginx -s reload
fi

echo "==> Done. Check: curl https://$API_DOMAIN/api/health"
