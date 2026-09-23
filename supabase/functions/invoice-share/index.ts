import { createClient } from "npm:@supabase/supabase-js"
import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { sha256Hex } from "../_shared/crypto.ts"
import {
  SHARE_MAX_COMMENTS,
  SHARE_TTL_SECONDS,
  buildOwnerFeedbackMessage,
  buildShareViewerHtml,
  expiresAtFromNow,
  generateShareToken,
  isShareExpired,
  maskTaxId,
  normalizeShareDirection,
  sanitizeAuthorLabel,
  sanitizeCommentBody,
  type ShareInvoiceSummary,
} from "../_shared/invoice-share.ts"
import {
  requireFinlaSession,
  SessionAuthError,
} from "../_shared/session-auth.ts"

/** Keep in sync with chat/version.ts — avoid cross-function imports in Edge bundles. */
const SHARE_NOTIFY_APP_VERSION = "invoice-share-feedback"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
)

const shareCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

type CreateBody = {
  action?: string
  invoiceUuid?: string
  direction?: string
  conversationId?: string
}

type CommentBody = {
  action?: string
  token?: string
  body?: string
  authorLabel?: string | null
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: shareCorsHeaders })
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      ...shareCorsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

function functionBaseUrl(req: Request): string {
  const envUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "")
  if (envUrl) return `${envUrl}/functions/v1/invoice-share`
  const url = new URL(req.url)
  return `${url.origin}${url.pathname}`
}

async function hashToken(token: string): Promise<string> {
  return sha256Hex(`invoice-share:${token}`)
}

async function loadSummaryForOwner(
  userId: string,
  invoiceUuid: string,
  direction: "outgoing" | "incoming",
): Promise<ShareInvoiceSummary | null> {
  const { data, error } = await supabase
    .from("invoice_facts")
    .select(
      "invoice_uuid, direction, issue_date, status, currency, gross_total, vat_total, net_total, customer_name, customer_tax_id",
    )
    .eq("user_id", userId)
    .eq("invoice_uuid", invoiceUuid)
    .eq("direction", direction)
    .maybeSingle()

  if (error || !data) return null

  return {
    invoice_uuid: data.invoice_uuid,
    direction: normalizeShareDirection(data.direction),
    issue_date: data.issue_date ?? null,
    status: data.status ?? null,
    currency: data.currency || "TRY",
    gross_total: data.gross_total == null ? null : Number(data.gross_total),
    vat_total: data.vat_total == null ? null : Number(data.vat_total),
    net_total: data.net_total == null ? null : Number(data.net_total),
    customer_name: data.customer_name ?? null,
    customer_tax_id_masked: maskTaxId(data.customer_tax_id),
  }
}

async function resolveConversationId(
  userId: string,
  preferred: string | null,
): Promise<string | null> {
  if (preferred) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", preferred)
      .eq("user_id", userId)
      .maybeSingle()
    if (data?.id) return data.id
  }

  const { data: latest } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latest?.id) return latest.id

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title: "Fatura geri bildirimi" })
    .select("id")
    .single()

  if (error || !created?.id) return null
  return created.id
}

async function handleCreateBody(
  req: Request,
  body: CreateBody,
): Promise<Response> {
  const session = await requireFinlaSession(req)
  const invoiceUuid =
    typeof body.invoiceUuid === "string" ? body.invoiceUuid.trim() : ""
  const direction = normalizeShareDirection(body.direction)
  const conversationId =
    typeof body.conversationId === "string" && body.conversationId.trim()
      ? body.conversationId.trim()
      : null

  if (!invoiceUuid) {
    return json({ success: false, error: "invoiceUuid zorunludur." }, 400)
  }

  const summary = await loadSummaryForOwner(session.userId, invoiceUuid, direction)
  // Share is allowed even when invoice_facts is not synced yet — bind to owner.
  // Recipient page falls back to a minimal summary from request fields.

  const token = generateShareToken()
  const tokenHash = await hashToken(token)
  const expiresAt = expiresAtFromNow()

  const resolvedConversationId = await resolveConversationId(
    session.userId,
    conversationId,
  )

  const { data, error } = await supabase
    .from("invoice_share_links")
    .insert({
      token_hash: tokenHash,
      user_id: session.userId,
      invoice_uuid: invoiceUuid,
      direction,
      conversation_id: resolvedConversationId,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, expires_at")
    .single()

  if (error || !data) {
    return json(
      { success: false, error: "Paylaşım bağlantısı oluşturulamadı." },
      500,
    )
  }

  const shareUrl = `${functionBaseUrl(req)}?token=${encodeURIComponent(token)}`
  return json({
    success: true,
    share_url: shareUrl,
    expires_at: data.expires_at,
    expires_in_seconds: SHARE_TTL_SECONDS,
    invoice: summary ?? {
      invoice_uuid: invoiceUuid,
      direction,
      issue_date: null,
      status: null,
      currency: "TRY",
      gross_total: null,
      vat_total: null,
      net_total: null,
      customer_name: null,
      customer_tax_id_masked: null,
    },
  })
}

async function loadLinkByToken(token: string) {
  const tokenHash = await hashToken(token)
  const { data, error } = await supabase
    .from("invoice_share_links")
    .select(
      "id, user_id, invoice_uuid, direction, conversation_id, expires_at, revoked_at, comment_count",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle()
  if (error || !data) return null
  return data
}

async function handleView(req: Request, token: string): Promise<Response> {
  const link = await loadLinkByToken(token)
  if (!link || link.revoked_at) {
    return html(
      `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Bağlantı geçersiz</title></head><body style="font-family:system-ui;padding:40px;text-align:center"><h1>Bağlantı bulunamadı</h1><p>Bu paylaşım linki geçersiz veya kaldırılmış.</p></body></html>`,
      404,
    )
  }
  if (isShareExpired(link.expires_at)) {
    return html(
      `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Süresi doldu</title></head><body style="font-family:system-ui;padding:40px;text-align:center"><h1>Bağlantının süresi dolmuş</h1><p>Finla paylaşım linkleri 2 saat geçerlidir. Fatura sahibinden yeni bir link isteyin.</p></body></html>`,
      410,
    )
  }

  const summary =
    (await loadSummaryForOwner(
      link.user_id,
      link.invoice_uuid,
      normalizeShareDirection(link.direction),
    )) ?? {
      invoice_uuid: link.invoice_uuid,
      direction: normalizeShareDirection(link.direction),
      issue_date: null,
      status: null,
      currency: "TRY",
      gross_total: null,
      vat_total: null,
      net_total: null,
      customer_name: null,
      customer_tax_id_masked: null,
    }

  const { data: comments } = await supabase
    .from("invoice_share_comments")
    .select("author_label, body, created_at")
    .eq("share_link_id", link.id)
    .order("created_at", { ascending: true })
    .limit(SHARE_MAX_COMMENTS)

  const page = buildShareViewerHtml({
    summary,
    expiresAtIso: link.expires_at,
    commentActionUrl: functionBaseUrl(req),
    token,
    existingComments: (comments ?? []).map((c) => ({
      author_label: c.author_label ?? null,
      body: c.body,
      created_at: c.created_at,
    })),
  })
  return html(page)
}

async function notifyOwnerChat(opts: {
  userId: string
  conversationId: string | null
  summary: ShareInvoiceSummary
  authorLabel: string | null
  body: string
}): Promise<void> {
  const conversationId = await resolveConversationId(
    opts.userId,
    opts.conversationId,
  )
  if (!conversationId) return

  const content = buildOwnerFeedbackMessage({
    authorLabel: opts.authorLabel,
    body: opts.body,
    customerName: opts.summary.customer_name,
    invoiceUuid: opts.summary.invoice_uuid,
  })

  const action = {
    type: "open_invoice_preview",
    label: "Faturayı aç",
    preview: {
      title: opts.summary.customer_name
        ? `${opts.summary.customer_name} — geri bildirim`
        : "Fatura geri bildirimi",
      uuid: opts.summary.invoice_uuid,
      direction: opts.summary.direction,
      issued: true,
      draftDate: opts.summary.issue_date ?? undefined,
    },
    invoice: {
      invoice_uuid: opts.summary.invoice_uuid,
      issue_date: opts.summary.issue_date,
      status: opts.summary.status ?? "unknown",
      currency: opts.summary.currency,
      gross_total: opts.summary.gross_total,
      vat_total: opts.summary.vat_total,
      net_total: opts.summary.net_total,
      customer_tax_id: null,
      customer_name: opts.summary.customer_name,
      direction: opts.summary.direction,
    },
  }

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content,
    action_snapshot: action,
    app_version: SHARE_NOTIFY_APP_VERSION,
  })
}

async function handleCommentBody(body: CommentBody): Promise<Response> {
  const token = typeof body.token === "string" ? body.token.trim() : ""
  const commentBody = sanitizeCommentBody(body.body)
  const authorLabel = sanitizeAuthorLabel(body.authorLabel)

  if (!token) return json({ success: false, error: "token zorunludur." }, 400)
  if (!commentBody) {
    return json(
      { success: false, error: "Yorum boş olamaz veya çok uzun." },
      400,
    )
  }

  const link = await loadLinkByToken(token)
  if (!link || link.revoked_at) {
    return json({ success: false, error: "Bağlantı geçersiz." }, 404)
  }
  if (isShareExpired(link.expires_at)) {
    return json(
      { success: false, error: "Bağlantının süresi dolmuş (2 saat)." },
      410,
    )
  }
  if ((link.comment_count ?? 0) >= SHARE_MAX_COMMENTS) {
    return json(
      { success: false, error: "Bu paylaşım için yorum limiti doldu." },
      429,
    )
  }

  const { data: comment, error } = await supabase
    .from("invoice_share_comments")
    .insert({
      share_link_id: link.id,
      body: commentBody,
      author_label: authorLabel,
    })
    .select("id, created_at")
    .single()

  if (error || !comment) {
    return json({ success: false, error: "Yorum kaydedilemedi." }, 500)
  }

  await supabase
    .from("invoice_share_links")
    .update({ comment_count: (link.comment_count ?? 0) + 1 })
    .eq("id", link.id)

  const summary =
    (await loadSummaryForOwner(
      link.user_id,
      link.invoice_uuid,
      normalizeShareDirection(link.direction),
    )) ?? {
      invoice_uuid: link.invoice_uuid,
      direction: normalizeShareDirection(link.direction),
      issue_date: null,
      status: null,
      currency: "TRY",
      gross_total: null,
      vat_total: null,
      net_total: null,
      customer_name: null,
      customer_tax_id_masked: null,
    }

  try {
    await notifyOwnerChat({
      userId: link.user_id,
      conversationId: link.conversation_id,
      summary,
      authorLabel,
      body: commentBody,
    })
    await supabase
      .from("invoice_share_comments")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", comment.id)
  } catch {
    // Comment is saved; chat notify is best-effort for the prototype.
  }

  return json({
    success: true,
    comment: {
      id: comment.id,
      created_at: comment.created_at,
      author_label: authorLabel,
      body: commentBody,
    },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: shareCorsHeaders })
  }
  // Keep global handleCors for POST-only callers that still send preflight.
  const corsResponse = handleCors(req)
  if (corsResponse && req.method === "OPTIONS") return corsResponse

  try {
    if (req.method === "GET") {
      const url = new URL(req.url)
      const token = (url.searchParams.get("token") ?? "").trim()
      if (!token) {
        return html(
          `<!DOCTYPE html><html lang="tr"><body style="font-family:system-ui;padding:40px;text-align:center"><h1>Finla</h1><p>Geçerli bir paylaşım bağlantısı gerekli.</p></body></html>`,
          400,
        )
      }
      return await handleView(req, token)
    }

    if (req.method !== "POST") {
      return json({ success: false, error: "Method not allowed" }, 405)
    }

    const body = (await req.json().catch(() => ({}))) as CreateBody & CommentBody
    const action = typeof body.action === "string" ? body.action : "create"

    if (action === "comment") {
      // Re-wrap so handleComment can stay focused; body already parsed.
      return await handleCommentBody(body)
    }
    if (action === "create") {
      return await handleCreateBody(req, body)
    }
    return json({ success: false, error: `Bilinmeyen action: ${action}` }, 400)
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return json({ success: false, error: err.message }, err.status)
    }
    const message = err instanceof Error ? err.message : "Beklenmeyen hata."
    return json({ success: false, error: message }, 500)
  }
})
