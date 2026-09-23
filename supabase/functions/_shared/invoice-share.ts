/** Pure helpers for FIN-62 invoice share links (2h expiry + recipient feedback). */

export const SHARE_TTL_SECONDS = 2 * 60 * 60
export const SHARE_MAX_COMMENTS = 20
export const SHARE_MAX_BODY_CHARS = 2000
export const SHARE_MAX_AUTHOR_CHARS = 80

export type ShareDirection = "outgoing" | "incoming"

export type ShareInvoiceSummary = {
  invoice_uuid: string
  direction: ShareDirection
  issue_date: string | null
  status: string | null
  currency: string
  gross_total: number | null
  vat_total: number | null
  net_total: number | null
  customer_name: string | null
  /** Masked tax id for the recipient page (never full VKN/TCKN). */
  customer_tax_id_masked: string | null
}

export function expiresAtFromNow(nowMs = Date.now(), ttlSeconds = SHARE_TTL_SECONDS): Date {
  return new Date(nowMs + ttlSeconds * 1000)
}

export function isShareExpired(expiresAt: string | Date, nowMs = Date.now()): boolean {
  const ms = typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime()
  if (!Number.isFinite(ms)) return true
  return ms <= nowMs
}

export function normalizeShareDirection(value: unknown): ShareDirection {
  return value === "incoming" ? "incoming" : "outgoing"
}

/** URL-safe opaque token (32 random bytes → base64url). */
export function generateShareToken(randomBytes: Uint8Array = crypto.getRandomValues(new Uint8Array(32))): string {
  let binary = ""
  for (const b of randomBytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export function maskTaxId(raw: string | null | undefined): string | null {
  const value = typeof raw === "string" ? raw.trim() : ""
  if (!value) return null
  if (value.length <= 4) return "*".repeat(value.length)
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`
}

export function escapeHtml(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function formatMoney(
  amount: number | null | undefined,
  currency = "TRY",
): string {
  if (amount == null || !Number.isFinite(amount)) return "—"
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currency || "TRY",
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency || "TRY"}`
  }
}

export function sanitizeCommentBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const body = raw.trim()
  if (!body) return null
  if (body.length > SHARE_MAX_BODY_CHARS) return null
  return body
}

export function sanitizeAuthorLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const label = raw.trim()
  if (!label) return null
  if (label.length > SHARE_MAX_AUTHOR_CHARS) return label.slice(0, SHARE_MAX_AUTHOR_CHARS)
  return label
}

export function buildShareViewerHtml(opts: {
  summary: ShareInvoiceSummary
  expiresAtIso: string
  commentActionUrl: string
  token: string
  existingComments: Array<{ author_label: string | null; body: string; created_at: string }>
}): string {
  const { summary, expiresAtIso, commentActionUrl, token, existingComments } = opts
  const title = summary.customer_name
    ? `Fatura — ${summary.customer_name}`
    : "Finla fatura paylaşımı"

  const rows: Array<[string, string]> = [
    ["Karşı taraf", summary.customer_name ?? "—"],
    ["Vergi no", summary.customer_tax_id_masked ?? "—"],
    ["Tarih", summary.issue_date ?? "—"],
    ["Durum", summary.status ?? "—"],
    ["Yön", summary.direction === "incoming" ? "Gelen" : "Giden"],
    ["Ara toplam", formatMoney(summary.net_total, summary.currency)],
    ["KDV", formatMoney(summary.vat_total, summary.currency)],
    ["Genel toplam", formatMoney(summary.gross_total, summary.currency)],
  ]

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<div class="row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`,
    )
    .join("\n")

  const commentsHtml = existingComments.length === 0
    ? `<p class="muted">Henüz yorum yok. İlk geri bildirimi siz bırakabilirsiniz.</p>`
    : existingComments
      .map((c) => {
        const who = c.author_label?.trim() || "Anonim"
        const when = c.created_at ? new Date(c.created_at).toLocaleString("tr-TR") : ""
        return `<article class="bubble"><header><strong>${escapeHtml(who)}</strong><time>${escapeHtml(when)}</time></header><p>${escapeHtml(c.body)}</p></article>`
      })
      .join("\n")

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --ink:#111; --muted:#666; --line:#e6e6e6; --bg:#f7f7f5; --card:#fff; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif; background: linear-gradient(180deg,#f3f3f0 0%,#fff 40%); color:var(--ink); }
    main { max-width: 640px; margin: 0 auto; padding: 28px 18px 64px; }
    .brand { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; margin-bottom: 10px; }
    h1 { font-size: 28px; line-height: 1.15; margin: 0 0 8px; font-weight: 650; }
    .lede { color: var(--muted); margin: 0 0 22px; font-size: 15px; line-height: 1.45; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 18px; box-shadow: 0 10px 30px rgba(0,0,0,0.04); }
    .row { display:flex; justify-content:space-between; gap:16px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 15px; }
    .row:last-child { border-bottom: 0; }
    .label { color: var(--muted); }
    .value { font-weight: 600; text-align: right; }
    .expiry { margin: 14px 0 0; font-size: 13px; color: var(--muted); }
    section { margin-top: 28px; }
    section h2 { font-size: 18px; margin: 0 0 12px; }
    .bubble { background: var(--bg); border-radius: 16px; padding: 12px 14px; margin-bottom: 10px; }
    .bubble header { display:flex; justify-content:space-between; gap:12px; margin-bottom: 6px; font-size: 13px; color: var(--muted); }
    .bubble p { margin: 0; white-space: pre-wrap; line-height: 1.45; }
    label { display:block; font-size: 13px; color: var(--muted); margin: 12px 0 6px; }
    input, textarea { width:100%; border:1px solid var(--line); border-radius: 12px; padding: 12px 14px; font: inherit; background:#fff; }
    textarea { min-height: 110px; resize: vertical; }
    button { margin-top: 14px; width:100%; border:0; border-radius: 999px; background:#111; color:#fff; font: inherit; font-weight: 650; padding: 14px 18px; cursor:pointer; }
    button:disabled { opacity: 0.55; cursor: default; }
    .muted { color: var(--muted); font-size: 14px; }
    .status { margin-top: 12px; font-size: 14px; min-height: 1.2em; }
    .status.ok { color: #146c2e; }
    .status.err { color: #a11919; }
    footer { margin-top: 36px; font-size: 12px; color: var(--muted); }
  </style>
</head>
<body>
  <main>
    <div class="brand">Finla</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="lede">Bu fatura Finla üzerinden paylaşıldı. Yorumunuz fatura sahibinin sohbetine düşer.</p>
    <div class="card">
      ${rowsHtml}
      <p class="expiry">Bağlantı süresi: ${escapeHtml(new Date(expiresAtIso).toLocaleString("tr-TR"))}</p>
    </div>
    <section>
      <h2>Yorumlar</h2>
      <div id="comments">${commentsHtml}</div>
    </section>
    <section>
      <h2>Yorum bırak</h2>
      <form id="comment-form">
        <label for="author">Adınız (isteğe bağlı)</label>
        <input id="author" name="author" maxlength="${SHARE_MAX_AUTHOR_CHARS}" autocomplete="name" />
        <label for="body">Yorum</label>
        <textarea id="body" name="body" required maxlength="${SHARE_MAX_BODY_CHARS}" placeholder="Düzeltme veya notunuzu yazın…"></textarea>
        <button type="submit" id="submit">Gönder</button>
        <p class="status" id="status" aria-live="polite"></p>
      </form>
    </section>
    <footer>Finla · paylaşılan fatura görünümü</footer>
  </main>
  <script>
    (function () {
      var form = document.getElementById("comment-form");
      var statusEl = document.getElementById("status");
      var submitBtn = document.getElementById("submit");
      var comments = document.getElementById("comments");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var author = document.getElementById("author").value.trim();
        var body = document.getElementById("body").value.trim();
        if (!body) return;
        statusEl.className = "status";
        statusEl.textContent = "Gönderiliyor…";
        submitBtn.disabled = true;
        fetch(${JSON.stringify(commentActionUrl)}, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "comment", token: ${JSON.stringify(token)}, body: body, authorLabel: author || null })
        }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
          .then(function (result) {
            if (!result.ok || result.data.success === false) {
              throw new Error((result.data && result.data.error) || "Gönderilemedi.");
            }
            var who = author || "Anonim";
            var article = document.createElement("article");
            article.className = "bubble";
            article.innerHTML = "<header><strong></strong><time>az önce</time></header><p></p>";
            article.querySelector("strong").textContent = who;
            article.querySelector("p").textContent = body;
            if (comments.querySelector(".muted")) comments.innerHTML = "";
            comments.appendChild(article);
            document.getElementById("body").value = "";
            statusEl.className = "status ok";
            statusEl.textContent = "Yorumunuz iletildi. Teşekkürler.";
          })
          .catch(function (err) {
            statusEl.className = "status err";
            statusEl.textContent = err && err.message ? err.message : "Bir hata oluştu.";
          })
          .finally(function () { submitBtn.disabled = false; });
      });
    })();
  </script>
</body>
</html>`
}

export function buildOwnerFeedbackMessage(opts: {
  authorLabel: string | null
  body: string
  customerName: string | null
  invoiceUuid: string
}): string {
  const who = opts.authorLabel?.trim() || "Bir kişi"
  const about = opts.customerName?.trim()
    ? `“${opts.customerName.trim()}” faturanıza`
    : "faturanıza"
  return `${who}, ${about} yorum bıraktı:\n\n› ${opts.body.trim()}\n\nYorumu inceleyip gerekirse düzeltme yapabilirsiniz.`
}
