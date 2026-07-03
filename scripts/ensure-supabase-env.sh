#!/usr/bin/env bash
# supabase/.env dosyasının var olduğundan emin olur; Edge runtime için
# supabase/functions/.env dosyasına senkronlar (supabase start bunu okur).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/supabase/.env"
FUNCTIONS_ENV="$ROOT/supabase/functions/.env"
EXAMPLE="$ROOT/supabase/.env.example"

sync_functions_env() {
  # Yorum ve boş satırları atla; SUPABASE_* CLI tarafından zaten enjekte edilir.
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" | grep -v '^SUPABASE_' > "$FUNCTIONS_ENV"
  echo "Senkron: supabase/.env → supabase/functions/.env"
}

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  echo "Oluşturuldu: supabase/.env (örnekten kopyalandı)"
  echo "İlk kurulum: npm run supabase:env:init"
  exit 0
fi

missing=()
for key in AUTH_MASTER_KEY AUTH_JWT_SECRET AUTH_REFRESH_PEPPER; do
  line="$(grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null || true)"
  val="${line#*=}"
  if [[ -z "${val// }" ]]; then
    missing+=("$key")
  fi
done

if ((${#missing[@]} > 0)); then
  echo "Uyarı: supabase/.env içinde boş secret var: ${missing[*]}"
  echo "Bir kez çalıştır: npm run supabase:env:init"
fi

sync_functions_env
