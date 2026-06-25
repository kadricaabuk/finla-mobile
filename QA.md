# Finla — QA Checklist

Living QA document for manual and automated testing. Update **Pass / Fail / Notes** as you go.

## How to use this doc

| Column | Meaning |
|--------|---------|
| **Pass / Fail** | Mark `☑` or `☒` (or replace `☐`) when tested |
| **Auto** | `Maestro` = covered by `.maestro/flows/`; `—` = manual only |
| **Notes** | Actual behavior, bug ID, env, screenshot path |

**Log failures as:** `ID | Steps | Expected | Actual | Severity (P0–P3) | Platform | Env`

---

## Automated tests (Maestro)

Prerequisites: app on simulator (`npm run ios`), test env in `.env.local`, Maestro installed (`maestro --version`).

| Command | What it covers |
|---------|----------------|
| `npm run maestro:smoke` | **P0 full path:** login → chat → menu → invoices → logout |
| `npm run maestro:login` | Login only → chat screen |
| `npm run maestro:chat` | Login + send message + assistant reply |
| `npm run maestro:menu` | Login + open side menu + conversations load |
| `npm run maestro:invoices` | Login + menu + Faturalarım list |
| `npm run maestro:logout` | Login + logout → login screen |
| `npm run maestro:test` | All flows in `.maestro/flows/` (slower; runs each file) |

**Test GİB users** (test env): `33333301` … `33333309`, password `1`.  
Usernames are hardcoded in [`.maestro/flows/login.yaml`](.maestro/flows/login.yaml) (not read from `.maestro/.env`).

**Flows:**

| File | Purpose |
|------|---------|
| [`.maestro/flows/smoke.yaml`](.maestro/flows/smoke.yaml) | P0 end-to-end smoke |
| [`.maestro/flows/login.yaml`](.maestro/flows/login.yaml) | Login only |
| [`.maestro/flows/chat-send.yaml`](.maestro/flows/chat-send.yaml) | Login + chat message |
| [`.maestro/flows/menu.yaml`](.maestro/flows/menu.yaml) | Login + side menu |
| [`.maestro/flows/invoices.yaml`](.maestro/flows/invoices.yaml) | Login + Faturalarım |
| [`.maestro/flows/logout.yaml`](.maestro/flows/logout.yaml) | Login + logout |
| [`.maestro/flows/subflows/ensure-logged-in.yaml`](.maestro/flows/subflows/ensure-logged-in.yaml) | Retry login across test users |
| [`.maestro/flows/subflows/attempt-login.yaml`](.maestro/flows/subflows/attempt-login.yaml) | Single login attempt |
| [`.maestro/flows/subflows/send-chat.yaml`](.maestro/flows/subflows/send-chat.yaml) | Send “Merhaba”, wait for reply |
| [`.maestro/flows/subflows/open-menu.yaml`](.maestro/flows/subflows/open-menu.yaml) | Open menu, wait for conversations |
| [`.maestro/flows/subflows/navigate-outgoing-invoices.yaml`](.maestro/flows/subflows/navigate-outgoing-invoices.yaml) | Open Faturalarım |
| [`.maestro/flows/subflows/logout.yaml`](.maestro/flows/subflows/logout.yaml) | Logout |

**MCP (Cursor):** Maestro MCP is configured in [`.cursor/mcp.json`](.cursor/mcp.json). Reload Cursor after changes. Prompt example: *“Run `.maestro/flows/login.yaml` via Maestro MCP and report pass/fail.”*

Debug output on failure: `~/.maestro/tests/<timestamp>/` (screenshots + logs).

---

## Before you start

### Environment prep

| ID | Check | Pass | Fail | Auto | Notes |
|----|-------|------|------|------|-------|
| 0.1 | `.env.local` has `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_URL` | ☐ | ☐ | — | See [`.env.example`](.env.example) |
| 0.2 | Local Supabase running: `npm run supabase:start` | ☐ | ☐ | — | |
| 0.3 | Edge Functions running: `npm run supabase:functions` | ☐ | ☐ | — | Needs `supabase/.env` |
| 0.4 | App starts: `npm start` → iOS simulator or device | ☐ | ☐ | — | |
| 0.5 | Valid GİB test credentials available | ☐ | ☐ | — | `33333301`–`33333309` / `1` in test env |
| 0.6 | `feature_flags` table has flags enabled (all default **off** if `/features` fails) | ☐ | ☐ | — | Without this, most screens redirect to chat |

### Test matrix

Run critical paths on:

- [ ] iOS simulator or device
- [ ] Android emulator or device (if you ship Android)
- [ ] Local vs production Supabase (smoke on prod before release)

---

## P0 — Smoke test (~15 min)

Do this first. If any step fails, fix before deeper QA.

| ID | Flow | Pass | Fail | Auto | Notes |
|----|------|------|------|------|-------|
| S1 | Cold start with no tokens → login screen | ☐ | ☐ | Maestro | `launchApp` with `clearState` |
| S2 | Login with valid GİB credentials → lands on chat | ☐ | ☐ | Maestro | `npm run maestro:login` |
| S3 | Send a simple chat message → streaming response appears | ☐ | ☐ | Maestro | `npm run maestro:chat` |
| S4 | Open side menu → conversations list loads | ☐ | ☐ | Maestro | `npm run maestro:menu` |
| S5 | Navigate to Faturalarım → invoice list loads | ☐ | ☐ | Maestro | `npm run maestro:invoices` |
| S6 | Logout → back to login | ☐ | ☐ | Maestro | `npm run maestro:logout` |
| S7 | Re-login → previous conversation visible in menu | ☐ | ☐ | — | |

---

## 1. Authentication & session

### Login (`/login`)

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 1.1 | Empty fields → submit | Alert: kullanıcı kodu ve şifre gereklidir | ☐ | ☐ | — | |
| 1.2 | Wrong credentials | Alert: kullanıcı kodu veya şifre hatalı | ☐ | ☐ | — | |
| 1.3 | GİB multi-session (`MULTI_SESSION_PERSISTED`) | Alert with e-Arşiv logout instructions | ☐ | ☐ | Maestro | Flow retries next user |
| 1.4 | GİB temporary outage (`GIB_TEMPORARY`) | Friendly retry message | ☐ | ☐ | — | |
| 1.5 | Network offline during login | Bağlantı hatası alert | ☐ | ☐ | — | |
| 1.6 | Successful login | Tokens saved; `router.replace("/")` to chat | ☐ | ☐ | Maestro | Asserts `chat-input` |
| 1.7 | Password field “done” key | Triggers login | ☐ | ☐ | — | |
| 1.8 | IVd link tap | Opens `https://ivd.gib.gov.tr/` in browser | ☐ | ☐ | — | |
| 1.9 | Login button while loading | Disabled + spinner | ☐ | ☐ | — | |
| 1.10 | iOS keyboard | Fields stay visible (`KeyboardAvoidingView`) | ☐ | ☐ | — | Android: no KAV |

### Session bootstrap

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 1.11 | Cold start with valid tokens | Brief spinner → main app (no login flash) | ☐ | ☐ | — | |
| 1.12 | Cold start with expired/invalid tokens | Redirect to login | ☐ | ☐ | — | |
| 1.13 | Access token expires (>15 min idle) | Next API call auto-refreshes silently | ☐ | ☐ | — | Known gap: no proactive refresh |
| 1.14 | Refresh token revoked/expired | Error “Oturum süresi doldu…” — **no auto-redirect to login** | ☐ | ☐ | — | Likely UX gap |
| 1.15 | Re-login as different user | Invoice cache not leaked from previous user | ☐ | ☐ | — | |

### Logout

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 1.16 | Logout from side menu | Server logout (best effort) + clear tokens + `/login` | ☐ | ☐ | Maestro | |
| 1.17 | Logout while offline | Local logout still succeeds | ☐ | ☐ | — | |
| 1.18 | Logout spinner | Shows on logout button during process | ☐ | ☐ | — | |

---

## 2. Side menu (all main screens)

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 2.1 | Header ☰ opens menu | Spring drawer, 280px | ☐ | ☐ | Maestro | |
| 2.2 | Backdrop tap closes menu | Menu dismisses | ☐ | ☐ | — | |
| 2.3 | Menu open dismisses keyboard | Keyboard hidden | ☐ | ☐ | — | |
| 2.4 | Yeni Sohbet | Clears chat, new thread | ☐ | ☐ | — | |
| 2.5 | Faturalarım nav | Goes to `/invoices` (if flag on) | ☐ | ☐ | — | |
| 2.6 | Gelen Faturalar nav | Goes to `/incoming-invoices` (if flag on) | ☐ | ☐ | — | |
| 2.7 | Profil nav | Goes to `/profile` (if flag on) | ☐ | ☐ | — | |
| 2.8 | Current screen highlighted | Active nav item styled | ☐ | ☐ | — | |
| 2.9 | Tap current nav item again | Just closes menu | ☐ | ☐ | — | |
| 2.10 | Conversations list — loading | Spinner + “Yükleniyor…” | ☐ | ☐ | Maestro | Waits until gone |
| 2.11 | Conversations list — empty | “Kayıtlı sohbet yok” | ☐ | ☐ | — | |
| 2.12 | Tap conversation | Loads history in chat; row spinner while loading | ☐ | ☐ | — | |
| 2.13 | Pull-to-refresh in menu | Refreshes conversations + profile | ☐ | ☐ | — | |
| 2.14 | Footer profile row tap | Navigate to profile | ☐ | ☐ | — | |
| 2.15 | Footer logout icon | Logout flow | ☐ | ☐ | Maestro | |
| 2.16 | Display name priority | title → name+surname → username | ☐ | ☐ | — | |
| 2.17 | Feature flags off | Gated nav items hidden | ☐ | ☐ | — | |

---

## 3. Chat screen (`/`)

### Basic messaging

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 3.1 | Empty chat state | Blank (no welcome message) | ☐ | ☐ | — | |
| 3.2 | Send message | User bubble right, black | ☐ | ☐ | Maestro | Asserts “Merhaba” |
| 3.3 | Assistant response | Gray bubble, markdown rendered | ☐ | ☐ | Maestro | Waits for `chat-assistant-message` |
| 3.4 | Markdown tables | Horizontally scrollable | ☐ | ☐ | — | |
| 3.5 | Streaming | Pending bubble + status label | ☐ | ☐ | — | |
| 3.6 | Tool status labels | e.g. “Faturalar araştırılıyor…” (min ~1.5s) | ☐ | ☐ | — | |
| 3.7 | Send while loading/streaming | Input disabled, send hidden | ☐ | ☐ | — | |
| 3.8 | Auto-scroll on send | Scrolls to bottom | ☐ | ☐ | — | |
| 3.9 | Keyboard open (iOS) | Chat padding animates smoothly | ☐ | ☐ | — | |
| 3.10 | Keyboard open (Android) | Same, via `keyboardDidShow` | ☐ | ☐ | — | |
| 3.11 | Send error | Error in assistant bubble (not Alert) | ☐ | ☐ | — | |
| 3.12 | Network offline mid-stream | “Canlı yanıt alınamadı…” style error | ☐ | ☐ | — | |

### Chat input

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 3.13 | Placeholder “Finla'ya sor” | Visible | ☐ | ☐ | Maestro | Post-login assert uses `chat-input` |
| 3.14 | Multiline input | Grows up to ~120px | ☐ | ☐ | — | |
| 3.15 | Send button (↑) | Only when text non-empty | ☐ | ☐ | — | |
| 3.16 | Attach / voice buttons | Not implemented (commented out) | N/A | ☐ | — | Confirm still absent |

### Conversation management

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 3.17 | Yeni Sohbet from menu | Clears messages, modals, conversation ID | ☐ | ☐ | — | |
| 3.18 | Open conversation from menu | Full history restored | ☐ | ☐ | — | |
| 3.19 | New message → appears in side menu | Conversation listed/updated | ☐ | ☐ | — | |
| 3.20 | Load conversation error | Alert: “Sohbet” + error | ☐ | ☐ | — | |
| 3.21 | Open conversation from invoices/profile | Navigates to chat with history | ☐ | ☐ | — | |

---

## 4. Chat action buttons & modals

### `open_invoices` — “Faturaları Gör”

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 4.1 | Outgoing list action | Navigate to `/invoices` with date/filter params | ☐ | ☐ | — | |
| 4.2 | Incoming list action | Navigate to `/incoming-invoices` | ☐ | ☐ | — | |
| 4.3 | Feature flag off | Button hidden | ☐ | ☐ | — | |

### `open_invoice_detail` — “Detayı Gör”

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 4.4 | Tap button | Detail modal opens | ☐ | ☐ | — | |
| 4.5 | Modal fields | Müşteri, Tarih, Durum, VKN, Brüt, KDV, ETTN | ☐ | ☐ | — | |
| 4.6 | Kapat button | Modal closes | ☐ | ☐ | — | |
| 4.7 | Re-open from saved conversation | Action persists on reload | ☐ | ☐ | — | |

### `open_invoice_preview` — draft invoice

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 4.8 | “Faturayı Gör” | Full-screen preview modal | ☐ | ☐ | — | |
| 4.9 | Loading state | “Önizleme yükleniyor…” | ☐ | ☐ | — | |
| 4.10 | HTML via WebView | Renders; JS disabled | ☐ | ☐ | — | |
| 4.11 | Fetch via `invoice-html` when no inline HTML | Fallback works | ☐ | ☐ | — | |
| 4.12 | Error state | Message + “Tekrar dene” | ☐ | ☐ | — | |
| 4.13 | Share (PDF) in header | Print → share sheet | ☐ | ☐ | — | |
| 4.14 | “Onayla ve Kes” | Starts confirm flow | ☐ | ☐ | — | |
| 4.15 | Confirm while processing | Disabled + “Onaylanıyor…” | ☐ | ☐ | — | |
| 4.16 | Re-open saved conversation | Preview action persists (**no HTML** — re-fetched) | ☐ | ☐ | — | |

### `open_sign_otp` — SMS verification

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 4.17 | Auto-open on OTP action | SMS modal appears | ☐ | ☐ | — | |
| 4.18 | Enter SMS code + doğrula | Verification succeeds | ☐ | ☐ | — | |
| 4.19 | Kodu Yeniden Gönder | Resends OTP | ☐ | ☐ | — | |
| 4.20 | Change phone + gönder | Updates number and sends | ☐ | ☐ | — | |
| 4.21 | Kapat while busy | Blocked during verify/send | ☐ | ☐ | — | |
| 4.22 | OTP error inline | Error shown in modal | ☐ | ☐ | — | |
| 4.23 | Re-open saved conversation | OTP action **NOT** persisted | ☐ | ☐ | — | By design |

### Full invoice issue E2E

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 4.24 | Chat: create draft → preview → confirm → OTP → verify → issue | Invoice issued in GİB | ☐ | ☐ | — | Highest-risk; manual |
| 4.25 | GİB session expired mid-flow | `SESSION_EXPIRED` error surfaced | ☐ | ☐ | — | |
| 4.26 | Draft UUID mismatch | “Doğrulanacak taslak değişmiş görünüyor…” | ☐ | ☐ | — | |

### `open_excel_export` — Excel

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 4.27 | Chat asks for Excel export | Button appears in bubble | ☐ | ☐ | — | |
| 4.28 | Tap share button | Downloads `.xlsx` → native share sheet | ☐ | ☐ | — | |
| 4.29 | Open file in Excel/Files app | File valid and readable | ☐ | ☐ | — | |
| 4.30 | Local Supabase on physical device | `kong` URL rewritten correctly | ☐ | ☐ | — | `lib/excel-share.ts` |
| 4.31 | Wait >5 min, tap again | Expiry message | ☐ | ☐ | — | Server TTL 300s |
| 4.32 | Re-open old conversation | Expiry hint only (no button; URL not persisted) | ☐ | ☐ | — | By design |
| 4.33 | Sharing unavailable | “Bu cihazda paylaşım kullanılamıyor…” | ☐ | ☐ | — | |
| 4.34 | >5000 invoices in range | Server error about limit | ☐ | ☐ | — | |

---

## 5. Invoices screens

**Outgoing:** `/invoices` (“Faturalarım”) · **Incoming:** `/incoming-invoices` (“Gelen faturalar”)

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 5.1 | Feature flag off → direct URL | Redirect to `/` | ☐ | ☐ | — | |
| 5.2 | Initial load | Full-screen spinner → list | ☐ | ☐ | Maestro | `maestro:invoices` |
| 5.3 | Preset: Bu Ay | Correct date range | ☐ | ☐ | Maestro | Asserts `invoice-filter-bu_ay` |
| 5.4 | Preset: Geçen Ay | Previous calendar month | ☐ | ☐ | — | |
| 5.5 | Preset: Bu Yıl | Jan 1 – Dec 31 | ☐ | ☐ | — | |
| 5.6 | Empty period | “Bu dönemde fatura bulunamadı.” | ☐ | ☐ | — | |
| 5.7 | Error state | Red icon + message + “Tekrar Dene” | ☐ | ☐ | — | |
| 5.8 | Pull-to-refresh | Re-fetches (bypasses cache) | ☐ | ☐ | — | |
| 5.9 | Cache: second load within 5 min | Uses cache | ☐ | ☐ | — | |
| 5.10 | Cache: after 5 min | Fresh API call | ☐ | ☐ | — | |
| 5.11 | Offline with valid cache | Shows stale list | ☐ | ☐ | — | |
| 5.12 | Offline without cache | Network error | ☐ | ☐ | — | |
| 5.13 | Row tap | Expand/collapse accordion | ☐ | ☐ | — | |
| 5.14 | Expanded row — detail load | Inline spinner “Detay yükleniyor…” | ☐ | ☐ | — | |
| 5.15 | Expanded row — detail fields | Counterparty, dates, amounts, ETTN | ☐ | ☐ | — | |
| 5.16 | Row without ETTN | “Fatura kimliği (ETTN) bulunamadı.” | ☐ | ☐ | — | |
| 5.17 | Row detail error | Red inline text | ☐ | ☐ | — | |
| 5.18 | Incoming vs outgoing labels | Gönderici vs Müşteri correct | ☐ | ☐ | — | |
| 5.19 | Header ✎ (new chat) | Goes to `/` with reset | ☐ | ☐ | — | |

### Chat-originated filters

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 5.20 | Navigate from chat “Faturaları Gör” | Custom date + optional customer/amount filters | ☐ | ☐ | — | |
| 5.21 | Chat filter chip visible | Shows filter details | ☐ | ☐ | — | |
| 5.22 | Preset chips disabled during chat filter | Can’t switch presets | ☐ | ☐ | — | |
| 5.23 | “Preset filtrelere dön” | Resets to preset filters | ☐ | ☐ | — | |
| 5.24 | Chat filters active | Cache skipped | ☐ | ☐ | — | |

---

## 6. Profile screen (`/profile`)

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 6.1 | Feature flag off → direct URL | Redirect to `/` | ☐ | ☐ | — | |
| 6.2 | Loading state | Full-screen spinner | ☐ | ☐ | — | |
| 6.3 | Error state | Alert icon + message + “Tekrar Dene” | ☐ | ☐ | — | |
| 6.4 | Hero section | Avatar initial, name, VKN/TCKN | ☐ | ☐ | — | |
| 6.5 | Kimlik section | Ünvan, ad, soyad, sicil, MERSİS, vergi dairesi, etc. | ☐ | ☐ | — | |
| 6.6 | İletişim section | Phone, fax, email, web (empty → “—”) | ☐ | ☐ | — | |
| 6.7 | Adres section | Only if any address field exists | ☐ | ☐ | — | |
| 6.8 | “İletişim Bilgilerini Düzenle” | Switches to TextInputs | ☐ | ☐ | — | |
| 6.9 | İptal | Reverts without save | ☐ | ☐ | — | |
| 6.10 | Kaydet with changes | PATCH to server; spinner while saving | ☐ | ☐ | — | |
| 6.11 | Kaydet with no changes | Exits edit silently | ☐ | ☐ | — | |
| 6.12 | Save error | Inline red error above buttons | ☐ | ☐ | — | |
| 6.13 | Pull-to-refresh | Reloads profile (disabled while editing) | ☐ | ☐ | — | |
| 6.14 | Edit contact via chat (`update_user_profile` tool) | Profile reflects changes | ☐ | ☐ | — | |

---

## 7. Feature flags (`/features` endpoint)

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 7.1 | All flags **on** (normal dev) | All routes + chat buttons visible | ☐ | ☐ | — | |
| 7.2 | `outgoingInvoices` off | `/invoices` redirects; outgoing chat actions hidden | ☐ | ☐ | — | |
| 7.3 | `incomingInvoices` off | `/incoming-invoices` redirects; incoming actions hidden | ☐ | ☐ | — | |
| 7.4 | `profile` off | `/profile` redirects; menu item hidden | ☐ | ☐ | — | |
| 7.5 | `/features` endpoint down | All flags default **false** — app mostly chat-only | ☐ | ☐ | — | High risk on prod deploy |

---

## 8. API & resilience

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 8.1 | Wrong `API_BASE_URL` | Friendly HTML/404 message | ☐ | ☐ | — | |
| 8.2 | Server 5xx | “Şu anda sunucuya bağlanılamıyor…” | ☐ | ☐ | — | |
| 8.3 | Airplane mode on chat send | Network error in bubble | ☐ | ☐ | — | |
| 8.4 | Airplane mode on invoices (no cache) | Error + retry | ☐ | ☐ | — | |
| 8.5 | GİB unavailable (`GIB_UNAVAILABLE`) | Surfaced in chat tool result | ☐ | ☐ | — | |
| 8.6 | Two-token header regression | Access in `x-finla-access-token`, anon in `Authorization` | ☐ | ☐ | — | Critical security |
| 8.7 | Conversations fetch fails | Empty list, silent (no crash) | ☐ | ☐ | — | |
| 8.8 | Profile fetch fails in shell | `null` profile; side menu still works | ☐ | ☐ | — | |

---

## 9. Platform & build

| ID | Test | Expected | Pass | Fail | Auto | Notes |
|----|------|----------|------|------|------|-------|
| 9.1 | iOS safe areas | Header + chat input not clipped | ☐ | ☐ | — | |
| 9.2 | Android edge-to-edge | Content not under system bars | ☐ | ☐ | — | `edgeToEdgeEnabled: true` |
| 9.3 | iPad layout | Portrait + landscape supported | ☐ | ☐ | — | |
| 9.4 | Android back on modals | Closes modal (`onRequestClose`) | ☐ | ☐ | — | |
| 9.5 | Dark mode | Readable UI (automatic style) | ☐ | ☐ | — | |
| 9.6 | EAS preview build installs | App launches on device | ☐ | ☐ | — | [`eas.json`](eas.json) |
| 9.7 | Production API from device build | Not pointing at `127.0.0.1` | ☐ | ☐ | — | |
| 9.8 | `expo-sharing` patch | Share sheet works | ☐ | ☐ | — | `patches/expo-sharing+55.0.18.patch` |

---

## 10. Backend / Edge Functions (local)

| ID | Function | Test | Pass | Fail | Auto | Notes |
|----|----------|------|------|------|------|-------|
| 10.1 | `login` | GİB auth + JWT issuance | ☐ | ☐ | Maestro | Indirect via app login |
| 10.2 | `refresh` | Token rotation | ☐ | ☐ | — | |
| 10.3 | `logout` | Revokes sessions + GİB logout | ☐ | ☐ | — | |
| 10.4 | `chat` | NDJSON stream + tool execution | ☐ | ☐ | — | |
| 10.5 | `conversations` | list + messages with ownership check | ☐ | ☐ | — | |
| 10.6 | `invoices` | GİB list → `invoice_facts` upsert | ☐ | ☐ | — | |
| 10.7 | `invoice-detail` | DB read + GİB HTML backfill | ☐ | ☐ | — | |
| 10.8 | `invoice-html` | HTML preview fetch | ☐ | ☐ | — | |
| 10.9 | `excel-export` | XLSX + Storage signed URL | ☐ | ☐ | — | |
| 10.10 | `profile` | GET + PATCH | ☐ | ☐ | — | |
| 10.11 | `features` | Reads `feature_flags` table | ☐ | ☐ | — | |
| 10.12 | DB migrations | `supabase db reset` applies cleanly | ☐ | ☐ | — | |

---

## Known risk areas (check first)

1. **Feature flags all off** — `/features` fail or empty DB → invoices/profile/chat actions hidden.
2. **Local vs prod env** — Device builds can’t reach `127.0.0.1`.
3. **GİB session expiry** — Finla JWT valid while GİB session dead → `SESSION_EXPIRED` in chat.
4. **Refresh token UX** — Refresh fail shows errors but no auto-redirect to login.
5. **Excel URL expiry** — 5 min TTL; old conversations show hint only.
6. **OTP not persisted** — Reopened conversations won’t show SMS modal.
7. **Supabase + Functions** — `npm start` alone is not enough for local API QA.
8. **`expo-sharing` patch** — Broken share if `postinstall` / patch-package skipped.

---

## Suggested workflow

| Day | Focus |
|-----|--------|
| 1 | Section 0 + P0 + `npm run maestro:smoke` + Section 7 |
| 2 | Sections 1–3 (auth, menu, chat) |
| 3 | Section 4 (invoice draft, OTP, Excel) — manual GİB |
| 4 | Sections 5–6 (lists, profile) |
| 5 | Sections 8–9 (resilience, platform, EAS) |

---

## Failure log (template)

Copy rows as you find bugs:

| ID | Steps | Expected | Actual | Severity | Platform | Env | Date |
|----|-------|----------|--------|----------|----------|-----|------|
| | | | | P0–P3 | iOS/Android | local/prod | |

---

## Adding Maestro flows

When automating a checklist item:

1. Add `testID` to the React Native component.
2. Create `.maestro/flows/<name>.yaml` (or subflow under `.maestro/flows/subflows/`).
3. Mark the **Auto** column in this doc as `Maestro`.
4. Run `npm run maestro:test` before closing a QA session.

**Planned flows (not yet implemented):** profile screen, invoice row expand, chat action buttons, re-login conversation (S7).
