#!/usr/bin/env bash
# Yerel geliştirmede Mac LAN IP'sini .env.local → EXPO_PUBLIC_DEV_API_HOST olarak yazar.
# lib/dev-api-host.ts fiziksel cihazda loopback URL'leri bu host ile çözümler.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_LOCAL="$ROOT/.env.local"
ENV_EXAMPLE="$ROOT/.env.example"

get_lan_ip() {
  if [[ "$(uname)" != "Darwin" ]]; then
    hostname -I 2>/dev/null | awk '{print $1}' || true
    return
  fi
  ipconfig getifaddr en0 2>/dev/null \
    || ipconfig getifaddr en1 2>/dev/null \
    || true
}

ensure_trailing_newline() {
  if [[ ! -s "$ENV_LOCAL" ]]; then
    return
  fi
  local last_byte
  last_byte="$(tail -c 1 "$ENV_LOCAL" | od -An -tu1 | tr -d ' ')"
  if [[ "$last_byte" != "10" ]]; then
    printf '\n' >> "$ENV_LOCAL"
  fi
}

# Önceki hatalı çalıştırmada API_BASE_URL satırına yapışmış anahtarı ayır.
repair_merged_env_line() {
  if [[ ! -f "$ENV_LOCAL" ]]; then
    return
  fi
  if ! grep -q '^EXPO_PUBLIC_API_BASE_URL=.*EXPO_PUBLIC_DEV_API_HOST=' "$ENV_LOCAL" 2>/dev/null; then
    return
  fi
  local line merged_host url_value
  line="$(grep '^EXPO_PUBLIC_API_BASE_URL=' "$ENV_LOCAL" | head -n 1)"
  merged_host="${line#*EXPO_PUBLIC_DEV_API_HOST=}"
  if [[ -z "$merged_host" ]]; then
    return
  fi
  url_value="${line#EXPO_PUBLIC_API_BASE_URL=}"
  url_value="${url_value%%EXPO_PUBLIC_DEV_API_HOST=*}"
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^EXPO_PUBLIC_API_BASE_URL=.*|EXPO_PUBLIC_API_BASE_URL=${url_value}|" "$ENV_LOCAL"
  else
    sed -i "s|^EXPO_PUBLIC_API_BASE_URL=.*|EXPO_PUBLIC_API_BASE_URL=${url_value}|" "$ENV_LOCAL"
  fi
  replace_or_append "EXPO_PUBLIC_DEV_API_HOST" "$merged_host"
  echo "Onarıldı: EXPO_PUBLIC_API_BASE_URL satırındaki yapışık EXPO_PUBLIC_DEV_API_HOST ayrıldı."
}

replace_or_append() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_LOCAL" 2>/dev/null; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_LOCAL"
    else
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_LOCAL"
    fi
  else
    ensure_trailing_newline
    printf '%s=%s\n' "$key" "$value" >> "$ENV_LOCAL"
  fi
}

LAN_IP="$(get_lan_ip)"
if [[ -z "$LAN_IP" ]]; then
  echo "Uyarı: LAN IP bulunamadı (en0/en1) — EXPO_PUBLIC_DEV_API_HOST güncellenmedi." >&2
  exit 0
fi

if [[ ! -f "$ENV_LOCAL" ]]; then
  if [[ -f "$ENV_EXAMPLE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_LOCAL"
    echo "Oluşturuldu: .env.local (.env.example'dan)"
  else
    touch "$ENV_LOCAL"
  fi
fi

repair_merged_env_line
replace_or_append "EXPO_PUBLIC_DEV_API_HOST" "$LAN_IP"
echo "EXPO_PUBLIC_DEV_API_HOST=$LAN_IP → .env.local"
