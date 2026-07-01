#!/usr/bin/env bash
# Yerel Edge Functions için eksik AUTH_* secret üretir (supabase/.env).
# Dolu olan anahtarlara asla dokunmaz.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/supabase/.env"
EXAMPLE="$ROOT/supabase/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  echo "Oluşturuldu: supabase/.env (örnekten kopyalandı)"
fi

key_is_set() {
  local key="$1"
  local line val
  line="$(grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null || true)"
  [[ -z "$line" ]] && return 1
  val="${line#*=}"
  [[ -n "${val// }" ]]
}

replace_or_append() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    fi
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

set_key_if_empty() {
  local key="$1"
  local value="$2"
  if key_is_set "$key"; then
    echo "$key zaten tanımlı — değiştirilmedi."
  else
    replace_or_append "$key" "$value"
    echo "$key yazıldı."
  fi
}

if key_is_set AUTH_MASTER_KEY && key_is_set AUTH_JWT_SECRET && key_is_set AUTH_REFRESH_PEPPER; then
  echo "Tüm AUTH_* secret'ları zaten tanımlı — değiştirilmedi."
  exit 0
fi

set_key_if_empty "AUTH_MASTER_KEY" "$(openssl rand -base64 32)"
set_key_if_empty "AUTH_JWT_SECRET" "$(openssl rand -hex 32)"
set_key_if_empty "AUTH_REFRESH_PEPPER" "$(openssl rand -hex 24)"

echo "AUTH_* kontrolü tamamlandı (sadece boş olanlar dolduruldu)."

bash "$ROOT/scripts/ensure-supabase-env.sh"
