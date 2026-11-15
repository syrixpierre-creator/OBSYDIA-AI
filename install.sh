#!/usr/bin/env bash
set -Eeuo pipefail
{

REPO_URL="${OBSYDIA_REPO:-https://github.com/syrixpierre-creator/OBSYDIA-AI.git}"
BRANCH="${OBSYDIA_BRANCH:-main}"
INSTALL_DIR="${OBSYDIA_DIR:-/opt/obsydia-ai}"
MIN_RAM_MB=1500
MIN_DISK_GB=6

c_reset=$'\033[0m'; c_dim=$'\033[2m'; c_bold=$'\033[1m'; c_violet=$'\033[38;5;141m'; c_green=$'\033[32m'; c_red=$'\033[31m'; c_yellow=$'\033[33m'
step() { printf '\n%s▸ %s%s\n' "$c_violet$c_bold" "$*" "$c_reset"; }
info() { printf '  %s\n' "$*"; }
ok() { printf '  %s✓%s %s\n' "$c_green" "$c_reset" "$*"; }
warn() { printf '  %s!%s %s\n' "$c_yellow" "$c_reset" "$*"; }
die() { printf '\n%s✗ %s%s\n' "$c_red" "$*" "$c_reset" >&2; exit 1; }
trap 'die "Installation failed at line $LINENO. Fix the problem above and re-run the same command — the installer is safe to repeat."' ERR

ask() {
  local prompt="$1" default="${2:-}" answer=""
  if [[ -r /dev/tty ]] && [[ -z "${OBSYDIA_NONINTERACTIVE:-}" ]]; then
    read -r -p "  $prompt${default:+ [$default]}: " answer </dev/tty || true
  fi
  printf '%s' "${answer:-$default}"
}

ask_secret() {
  local prompt="$1" answer=""
  if [[ -r /dev/tty ]] && [[ -z "${OBSYDIA_NONINTERACTIVE:-}" ]]; then
    read -r -s -p "  $prompt: " answer </dev/tty || true
    printf '\n' >/dev/tty
  fi
  printf '%s' "$answer"
}

env_get() { { grep -E "^$1=" "$INSTALL_DIR/.env" 2>/dev/null || true; } | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

env_set_if_empty() {
  local key="$1" value="$2" current
  current="$(env_get "$key" || true)"
  if [[ -n "$current" && "$current" != "[]" ]]; then return 0; fi
  [[ -z "$value" ]] && return 0
  local escaped
  escaped="$(printf '%s' "$value" | sed -e 's/[\/&|]/\\&/g')"
  if grep -qE "^$key=" "$INSTALL_DIR/.env"; then
    sed -i "s|^$key=.*|$key=$escaped|" "$INSTALL_DIR/.env"
  else
    printf '%s=%s\n' "$key" "$value" >>"$INSTALL_DIR/.env"
  fi
}

printf '%s\n' "${c_bold}OBSYDIA AI${c_reset} ${c_dim}· Think. Create. Build. Deploy.${c_reset}"
printf '%s\n' "${c_dim}by Inconnu Boy Sensei — one-command VPS installer${c_reset}"

step "Checking system"
[[ $EUID -eq 0 ]] || die "Run as root: curl -fsSL <install-url> | sudo bash"
[[ -f /etc/os-release ]] || die "Unsupported system: /etc/os-release not found"
. /etc/os-release
case "${ID:-}" in
  ubuntu|debian) ok "$PRETTY_NAME" ;;
  *) case "${ID_LIKE:-}" in *debian*|*ubuntu*) warn "Debian-like system ($PRETTY_NAME) — continuing" ;; *) die "Ubuntu or Debian is required (found ${PRETTY_NAME:-unknown})" ;; esac ;;
esac
ARCH="$(uname -m)"
[[ "$ARCH" == "x86_64" || "$ARCH" == "aarch64" ]] || die "Unsupported architecture: $ARCH"
RAM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
DISK_GB=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
info "CPU: $(nproc) · RAM: ${RAM_MB} MB · free disk: ${DISK_GB} GB · arch: $ARCH"
if (( RAM_MB < MIN_RAM_MB )); then
  warn "Less than ${MIN_RAM_MB} MB RAM. Creating a 2 GB swap file is recommended."
  if [[ ! -f /swapfile ]] && [[ "$(ask "Create a 2G swap file now? (y/n)" "y")" =~ ^[Yy] ]]; then
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && echo '/swapfile none swap sw 0 0' >>/etc/fstab && ok "Swap enabled"
  fi
fi
(( DISK_GB >= MIN_DISK_GB )) || die "At least ${MIN_DISK_GB} GB of free disk space is required (found ${DISK_GB} GB)"

step "Installing dependencies"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl jq python3 iproute2 >/dev/null
ok "curl, git, openssl, jq"
if ! command -v docker >/dev/null 2>&1; then
  info "Installing Docker Engine…"
  curl -fsSL https://get.docker.com | sh >/dev/null
  ok "Docker installed"
else
  ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) already installed"
fi
systemctl enable --now docker >/dev/null 2>&1 || true
if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y -qq docker-compose-plugin >/dev/null || die "Docker Compose plugin could not be installed"
fi
ok "$(docker compose version | head -1)"

step "Preparing application directory"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Existing installation detected in $INSTALL_DIR — updating code, keeping .env and data"
  git -C "$INSTALL_DIR" fetch --quiet origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout --quiet "$BRANCH"
  git -C "$INSTALL_DIR" reset --quiet --hard "origin/$BRANCH"
  EXISTING=1
else
  [[ -e "$INSTALL_DIR" && -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]] && die "$INSTALL_DIR exists and is not an OBSYDIA installation"
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  EXISTING=0
fi
cd "$INSTALL_DIR"
mkdir -p backups
chmod +x install.sh update.sh backup.sh restore.sh healthcheck.sh 2>/dev/null || true
ok "Code ready at $INSTALL_DIR ($(git rev-parse --short HEAD))"

step "Configuring environment"
if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  ok "Created .env from .env.example"
else
  ok "Keeping existing .env (secrets are never overwritten)"
fi

env_set_if_empty JWT_SECRET "$(openssl rand -hex 32)"
env_set_if_empty SESSION_SECRET "$(openssl rand -hex 32)"
env_set_if_empty ENCRYPTION_KEY "$(openssl rand -hex 32)"
env_set_if_empty MONGO_ROOT_PASSWORD "$(openssl rand -hex 24)"

if [[ -z "$(env_get DOMAIN)" ]]; then
  DOMAIN_INPUT="${DOMAIN:-$(ask "Domain name pointing to this server (leave empty to use the IP address)" "")}"
  env_set_if_empty DOMAIN "$DOMAIN_INPUT"
fi
DOMAIN_VALUE="$(env_get DOMAIN)"
if [[ -n "$DOMAIN_VALUE" ]]; then
  env_set_if_empty ACME_EMAIL "${ACME_EMAIL:-inconnuboytech@gmail.com}"
fi

PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
if [[ -n "$DOMAIN_VALUE" ]]; then APP_URL_VALUE="https://$DOMAIN_VALUE"; else APP_URL_VALUE="http://$PUBLIC_IP"; fi
CURRENT_URL="$(env_get APP_URL)"
if [[ -z "$CURRENT_URL" || "$CURRENT_URL" == "https://your-domain.com" ]]; then
  sed -i "s|^APP_URL=.*|APP_URL=$APP_URL_VALUE|" .env
fi

KEYS_NOW="$(env_get AI_API_KEYS)"
if [[ -z "$KEYS_NOW" || "$KEYS_NOW" == "[]" ]]; then
  KEYS_INPUT="${AI_API_KEYS:-${XKIRO_API_KEYS:-$(ask_secret "DeepSeek API keys, comma separated (leave empty to add them later in the admin dashboard)")}}"
  if [[ -n "$KEYS_INPUT" ]]; then
    if [[ "$KEYS_INPUT" == \[* ]]; then JSON_KEYS="$KEYS_INPUT"; else JSON_KEYS="$(printf '%s' "$KEYS_INPUT" | jq -R -c 'split(",") | map(gsub("^\\s+|\\s+$";"")) | map(select(length>0))')"; fi
    if grep -q "^AI_API_KEYS=" .env; then sed -i "s|^AI_API_KEYS=.*|AI_API_KEYS=$JSON_KEYS|" .env; else echo "AI_API_KEYS=$JSON_KEYS" >> .env; fi
    ok "AI provider keys stored in .env"
  else
    warn "No AI provider key yet — add keys later in Administration → Provider keys"
  fi
fi

GENERATED_ADMIN_PASSWORD=""
if [[ -z "$(env_get ADMIN_PASSWORD)" ]]; then
  ADMIN_EMAIL_VALUE="${ADMIN_EMAIL:-$(env_get ADMIN_EMAIL)}"
  ADMIN_EMAIL_VALUE="$(ask "Administrator email" "${ADMIN_EMAIL_VALUE:-inconnuboytech@gmail.com}")"
  sed -i "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=$ADMIN_EMAIL_VALUE|" .env
  GENERATED_ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  env_set_if_empty ADMIN_PASSWORD "$GENERATED_ADMIN_PASSWORD"
fi
chmod 600 .env
ok "Environment configured"

step "Configuring reverse proxy"
if [[ -n "$DOMAIN_VALUE" ]]; then
  sed "s|__DOMAIN__|$DOMAIN_VALUE|g" infrastructure/caddy/Caddyfile.domain.template >infrastructure/caddy/Caddyfile
  ok "Caddy configured for https://$DOMAIN_VALUE (automatic Let's Encrypt certificate)"
  RESOLVED="$(getent ahostsv4 "$DOMAIN_VALUE" | awk '{print $1; exit}' || true)"
  if [[ -n "$PUBLIC_IP" && -n "$RESOLVED" && "$RESOLVED" != "$PUBLIC_IP" ]]; then
    warn "$DOMAIN_VALUE resolves to $RESOLVED but this server is $PUBLIC_IP — HTTPS will fail until DNS is fixed"
  elif [[ -z "$RESOLVED" ]]; then
    warn "$DOMAIN_VALUE does not resolve yet — create an A record pointing to $PUBLIC_IP"
  fi
else
  cp infrastructure/caddy/Caddyfile.ip.template infrastructure/caddy/Caddyfile
  ok "Caddy configured for HTTP on port 80 (no domain)"
fi
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ok "Firewall: ports 80 and 443 opened"
fi

step "Choosing a free Docker network"
if [[ -z "$(env_get OBSYDIA_SUBNET)" ]]; then
  if docker network inspect obsydia_default >/dev/null 2>&1; then
    EXISTING_SUBNET="$(docker network inspect obsydia_default --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}')"
    printf 'OBSYDIA_SUBNET=%s\n' "$EXISTING_SUBNET" >>.env
  else
    USED="$( (docker network inspect $(docker network ls -q) --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' 2>/dev/null; ip -o route show | awk '{print $1}'; ip -o addr show | awk '{print $4}') | tr ' ' '\n' | grep -E '^[0-9]+\.' || true)"
    FREE_SUBNET="$(USED="$USED" python3 - <<'PY'
import ipaddress, os
used = []
for item in os.environ.get("USED", "").split():
    try:
        used.append(ipaddress.ip_network(item, strict=False))
    except ValueError:
        pass
candidates = [f"172.29.{i}.0/24" for i in range(250, 255)] + [f"10.213.{i}.0/24" for i in range(1, 255)] + [f"192.168.{i}.0/24" for i in range(200, 255)]
for c in candidates:
    net = ipaddress.ip_network(c)
    if not any(net.overlaps(u) for u in used if u.prefixlen > 0):
        print(c)
        break
PY
)"
    [[ -n "$FREE_SUBNET" ]] || die "No free private subnet found for the Docker network"
    printf 'OBSYDIA_SUBNET=%s\n' "$FREE_SUBNET" >>.env
  fi
fi
ok "Docker network subnet: $(env_get OBSYDIA_SUBNET)"

step "Building and starting containers"
if [[ "$EXISTING" == "1" ]] && docker compose ps --status running 2>/dev/null | grep -q mongo; then
  info "Creating a safety backup before upgrading…"
  ./backup.sh --quiet || warn "Pre-upgrade backup failed — continuing"
fi
COMPOSE_PROFILES=""
[[ -n "$(env_get REDIS_URL)" ]] && COMPOSE_PROFILES="redis"
export COMPOSE_PROFILES
docker compose build --pull app
docker compose up -d --remove-orphans
ok "Containers started"

step "Waiting for the application"
for i in $(seq 1 60); do
  if docker compose exec -T app node </dev/null -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    ok "Application healthy (database connected, indexes initialized)"
    HEALTHY=1
    break
  fi
  sleep 3
done
[[ "${HEALTHY:-0}" == "1" ]] || { docker compose logs --tail=60 app; die "The application did not become healthy. See the logs above."; }

HTTPS_STATUS="not configured"
if [[ -n "$DOMAIN_VALUE" ]]; then
  info "Verifying HTTPS certificate for $DOMAIN_VALUE…"
  for i in $(seq 1 20); do
    if curl -fsS --max-time 8 "https://$DOMAIN_VALUE/health" >/dev/null 2>&1; then HTTPS_STATUS="active (certificate verified)"; break; fi
    sleep 6
  done
  [[ "$HTTPS_STATUS" == active* ]] && ok "HTTPS $HTTPS_STATUS" || { HTTPS_STATUS="pending — check DNS and 'docker compose logs caddy'"; warn "HTTPS not verified yet: $HTTPS_STATUS"; }
fi
if curl -fsS --max-time 8 "http://127.0.0.1/health" -H "Host: ${DOMAIN_VALUE:-localhost}" >/dev/null 2>&1 || [[ -n "$DOMAIN_VALUE" ]]; then ok "Reverse proxy responding"; fi

printf '\n%s\n' "${c_bold}${c_green}OBSYDIA AI is running.${c_reset}"
printf '  URL:            %s\n' "$(env_get APP_URL)"
printf '  HTTPS:          %s\n' "$HTTPS_STATUS"
printf '  Health:         %s/health\n' "$(env_get APP_URL)"
printf '  Admin email:    %s\n' "$(env_get ADMIN_EMAIL)"
if [[ -n "$GENERATED_ADMIN_PASSWORD" ]]; then
  printf '  Admin password: %s%s%s  %s(stored in %s/.env — change it after first login)%s\n' "$c_bold" "$GENERATED_ADMIN_PASSWORD" "$c_reset" "$c_dim" "$INSTALL_DIR" "$c_reset"
fi
printf '  Directory:      %s\n' "$INSTALL_DIR"
printf '\n  %sUpdate:%s  sudo %s/update.sh\n' "$c_dim" "$c_reset" "$INSTALL_DIR"
printf '  %sBackup:%s  sudo %s/backup.sh\n' "$c_dim" "$c_reset" "$INSTALL_DIR"
printf '  %sLogs:%s    cd %s && docker compose logs -f\n\n' "$c_dim" "$c_reset" "$INSTALL_DIR"
if [[ -z "$(env_get SMTP_HOST)" ]]; then warn "SMTP is not configured: users cannot receive verification emails until you set SMTP_* in .env and run update.sh"; fi
exit 0
}
