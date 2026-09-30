#!/usr/bin/env bash
# Install the PartForge MCP server on a fresh Ubuntu 22.04/24.04 or Debian 12 VM.
#
#   curl -fsSL https://raw.githubusercontent.com/hudsonclavin-cloud/Partforge/main/deploy/install.sh -o install.sh
#   sudo DOMAIN=mcp.example.com bash install.sh
#
# Before running it: point an A (and AAAA, if the VM has IPv6) record for DOMAIN at this VM,
# and open ports 80 and 443 in the cloud firewall. Caddy needs both to get a certificate.
#
# What it does, in order, and nothing else:
#   1. installs Node.js 22 (NodeSource) and Caddy (its official apt repository)
#   2. creates a locked system user `partforge`, clones the repo to /opt/partforge
#   3. `npm ci --omit=dev` in headless/ (the engine, the MCP SDK, zod)
#   4. writes /etc/partforge/mcp.env with a random token (kept if the file already exists)
#   5. installs the systemd unit and the Caddyfile, starts both, and checks /health end to end
#   6. prints the connector URL to paste into claude.ai
# Re-running it updates the code to the latest main and restarts; the token is kept.
#
# Environment:
#   DOMAIN        required: the public hostname
#   REPO          default https://github.com/hudsonclavin-cloud/Partforge.git
#   BRANCH        default main
#   RATE_PER_MIN  default 30 calls a minute per client
#   SKIP_SYSTEMD=1  build everything but do not start services (for testing in a container)
set -euo pipefail

DOMAIN="${DOMAIN:?set DOMAIN=your.host.name}"
REPO="${REPO:-https://github.com/hudsonclavin-cloud/Partforge.git}"
BRANCH="${BRANCH:-main}"
RATE_PER_MIN="${RATE_PER_MIN:-30}"
APP=/opt/partforge ETC=/etc/partforge
say(){ printf '\n\033[1m== %s\033[0m\n' "$*"; }

[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }
if ! printf '%s' "$DOMAIN" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'; then
  echo "DOMAIN must be a lowercase hostname like mcp.example.com (got: $DOMAIN)"; exit 1
fi
export DEBIAN_FRONTEND=noninteractive

say "packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git debian-keyring debian-archive-keyring apt-transport-https >/dev/null
install -d -m 0755 /etc/apt/keyrings
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq && apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/caddy-stable.gpg
  echo "deb [signed-by=/etc/apt/keyrings/caddy-stable.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
echo "node $(node -v), caddy $(caddy version | cut -d' ' -f1)"

say "user and code"
id partforge >/dev/null 2>&1 || useradd --system --home-dir "$APP" --shell /usr/sbin/nologin partforge
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch -q origin "$BRANCH" && git -C "$APP" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$APP"
fi
chown -R partforge:partforge "$APP"
(cd "$APP/headless" && sudo -u partforge -H npm ci --omit=dev --no-audit --no-fund --loglevel=error)
echo "at $(git -C "$APP" log --oneline -1)"

say "configuration"
install -d -m 0750 -o root -g partforge "$ETC"
if [ ! -f "$ETC/mcp.env" ]; then
  TOKEN="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)"
  cat > "$ETC/mcp.env" <<ENV
# PartForge MCP server — read by partforge-mcp.service. Keep this file private: the token is the
# only thing between the internet and your CPU.
HOST=127.0.0.1
PORT=8787
ALLOWED_HOSTS=$DOMAIN
PARTFORGE_TOKEN=$TOKEN
TRUST_PROXY=1
RATE_PER_MIN=$RATE_PER_MIN
MAX_QUEUE=4
PARTFORGE_CACHE=/var/cache/partforge
ENV
  chmod 0640 "$ETC/mcp.env"; chown root:partforge "$ETC/mcp.env"
  echo "new token written to $ETC/mcp.env"
else
  sed -i "s/^ALLOWED_HOSTS=.*/ALLOWED_HOSTS=$DOMAIN/" "$ETC/mcp.env"
  echo "kept the existing token in $ETC/mcp.env"
fi
install -d -m 0750 -o partforge -g partforge /var/cache/partforge
install -m 0644 "$APP/deploy/partforge-mcp.service" /etc/systemd/system/partforge-mcp.service
install -d -m 0755 /var/log/caddy
sed "s/__DOMAIN__/$DOMAIN/g" "$APP/deploy/Caddyfile.template" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; exit 1; }
TOKEN="$(sed -n 's/^PARTFORGE_TOKEN=//p' "$ETC/mcp.env")"

if [ "${SKIP_SYSTEMD:-0}" = 1 ]; then
  say "built (SKIP_SYSTEMD=1: services not started)"
  exit 0
fi

say "services"
systemctl daemon-reload
systemctl enable --now partforge-mcp.service >/dev/null
systemctl restart partforge-mcp.service
systemctl enable caddy >/dev/null && systemctl reload-or-restart caddy
for i in $(seq 1 30); do curl -fsS -H "Host: $DOMAIN" http://127.0.0.1:8787/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS -H "Host: $DOMAIN" http://127.0.0.1:8787/health >/dev/null || { journalctl -u partforge-mcp -n 30 --no-pager; exit 1; }
echo "server up on 127.0.0.1:8787"
# The public side needs DNS and a certificate; report it rather than fail the install on it.
if curl -fsS --max-time 60 "https://$DOMAIN/health" >/dev/null 2>&1; then
  echo "https://$DOMAIN/health answers — TLS and DNS are good"
else
  echo "https://$DOMAIN/health does not answer yet. Check the A record for $DOMAIN points here, ports 80/443 are open, then: journalctl -u caddy -n 50"
fi

say "connect it"
cat <<MSG
claude.ai → Settings → Connectors → Add custom connector, URL:

    https://$DOMAIN/mcp/$TOKEN

(the token is in the path because that is the one field every client has; treat the URL as a
password). Claude Code:

    claude mcp add --transport http partforge https://$DOMAIN/mcp --header "Authorization: Bearer $TOKEN"

Update later: re-run this script. New token: delete $ETC/mcp.env and re-run.
Logs: journalctl -u partforge-mcp -f
MSG
