#!/bin/bash
# ==============================================================================
# Pictolabs Zero-Failure Let's Encrypt SSL Bootstrapping Script
# Resolves the chicken-and-egg problem for Nginx on a fresh Ubuntu 24.04 VPS
# ==============================================================================

set -e

DOMAINS=("api.pictolabs.id" "admin.pictolabs.id" "dl.pictolabs.id")
CERT_NAME="api.pictolabs.id"
RSA_KEY_SIZE=4096
DATA_PATH="./nginx/certs"
WEBROOT_PATH="./nginx/certbot-challenge"
EMAIL="ops@pictolabs.id"
STAGING=0 # Set to 1 if testing to avoid Let's Encrypt rate limits

echo "==================================================================="
echo "  Pictolabs Production SSL Bootstrap (Let's Encrypt)"
echo "  Domains: ${DOMAINS[*]}"
echo "==================================================================="

# 1. Verify Docker and Docker Compose
if ! [ -x "$(command -v docker)" ]; then
  echo "Error: docker is not installed. Please install Docker first." >&2
  exit 1
fi

# 2. Check if certificates already exist
if [ -d "$DATA_PATH/live/$CERT_NAME" ]; then
  echo "Existing certificate found at $DATA_PATH/live/$CERT_NAME."
  read -p "Do you want to replace existing certificates? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    echo "Skipping SSL bootstrap."
    exit 0
  fi
fi

# 3. Create required challenge and cert directories
echo "Creating SSL and challenge directories..."
mkdir -p "$DATA_PATH/live/$CERT_NAME"
mkdir -p "$WEBROOT_PATH"

# 4. Generate dummy self-signed certificate to allow Nginx to start
echo "Generating dummy self-signed certificate for $CERT_NAME..."
docker run --rm -v "$(pwd)/$DATA_PATH:/certs" alpine/openssl \
  req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout "/certs/live/$CERT_NAME/privkey.pem" \
  -out "/certs/live/$CERT_NAME/fullchain.pem" \
  -subj "/CN=localhost"

# 5. Start Nginx with dummy certificate
echo "Starting Nginx reverse proxy with dummy certificates..."
docker compose -f docker-compose.prod.yml up -d nginx

# 6. Delete dummy certificate so Certbot can write fresh certificates
echo "Removing dummy certificates..."
docker run --rm -v "$(pwd)/$DATA_PATH:/certs" alpine sh -c \
  "rm -rf /certs/live/$CERT_NAME && rm -rf /certs/archive/$CERT_NAME && rm -rf /certs/renewal/$CERT_NAME.conf"

# 7. Request real Let's Encrypt certificate
echo "Requesting Let's Encrypt certificate for ${DOMAINS[*]}..."
domain_args=""
for domain in "${DOMAINS[@]}"; do
  domain_args="$domain_args -d $domain"
done

staging_arg=""
if [ $STAGING != "0" ]; then
  staging_arg="--staging"
fi

docker compose -f docker-compose.prod.yml run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    --cert-name $CERT_NAME \
    $domain_args \
    --email $EMAIL \
    --rsa-key-size $RSA_KEY_SIZE \
    --agree-tos \
    --force-renewal \
    --non-interactive" certbot

# 8. Reload Nginx with real certificates
echo "Reloading Nginx with production Let's Encrypt certificates..."
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

echo "==================================================================="
echo "  SSL Bootstrap Complete! All domains secured with HTTPS."
echo "==================================================================="
