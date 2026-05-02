import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { TOOLS, SYSTEM_PROMPT } from '../_shared/tools.ts'
import { getSubjectFromAuthHeader, SessionAuthError } from '../_shared/session-auth.ts'
import { normalizeTurkish } from '../_shared/turkish.ts'
import {
  faturaCreateInvoicePreview,
  faturaConfirmInvoiceIssue,
  faturaGetInvoiceHtml,
  faturaListInvoices,
  faturaCancelInvoice,
  faturaGetUserData,
  faturaLookupRecipient,
  faturaSendSignSMSCode,
  faturaVerifySignSMSCode,
  mapInvoicesToFacts,
} from '../_shared/gib.ts'
import type {
  ChatAction,
  InvoiceSearchFilters,
  InvoiceDetailPayload,
  PendingInvoiceState,
} from './types.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const ISTANBUL_TZ = 'Europe/Istanbul'

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return '***'
  return `*** *** ** ${digits.slice(-2)}`
}

function istanbulTodayUtc(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISTANBUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = Number(parts.find(p => p.type === 'year')?.value)
  const month = Number(parts.find(p => p.type === 'month')?.value)
  const day = Number(parts.find(p => p.type === 'day')?.value)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatTrDate(dateUtc: Date): string {
  const day = String(dateUtc.getUTCDate()).padStart(2, '0')
  const month = String(dateUtc.getUTCMonth() + 1).padStart(2, '0')
  const year = dateUtc.getUTCFullYear()
  return `${day}/${month}/${year}`
}

function parseTrDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{2})[./-](\d{2})[./-](\d{2,4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3])
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return null
  return new Date(Date.UTC(year, month - 1, day))
}

function resolveDateRangeFromText(text: string): { startDate: string; endDate: string } | null {
  const lower = text.toLocaleLowerCase('tr-TR')
  const today = istanbulTodayUtc()

  const rangeMatch = lower.match(
    /(\d{2}[./-]\d{2}[./-]\d{2,4})\s*(?:-|–|—| ile | to )\s*(\d{2}[./-]\d{2}[./-]\d{2,4})/,
  )
  if (rangeMatch) {
    const start = parseTrDate(rangeMatch[1])
    const end = parseTrDate(rangeMatch[2])
    if (start && end) return { startDate: formatTrDate(start), endDate: formatTrDate(end) }
  }

  const explicit = lower.match(/\b(\d{2}[./-]\d{2}[./-]\d{2,4})\b/)
  if (explicit) {
    const day = parseTrDate(explicit[1])
    if (day) return { startDate: formatTrDate(day), endDate: formatTrDate(day) }
  }

  if (lower.includes('bu ay') || lower.includes('ayın başından') || lower.includes('ay başından')) {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    return { startDate: formatTrDate(start), endDate: formatTrDate(today) }
  }

  if (lower.includes('bugün')) {
    return { startDate: formatTrDate(today), endDate: formatTrDate(today) }
  }

  if (lower.includes('dün')) {
    const yesterday = new Date(today)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    return { startDate: formatTrDate(yesterday), endDate: formatTrDate(yesterday) }
  }

  if (lower.includes('geçen hafta') || lower.includes('gecen hafta')) {
    const currentWeekday = (today.getUTCDay() + 6) % 7
    const startOfThisWeek = new Date(today)
    startOfThisWeek.setUTCDate(today.getUTCDate() - currentWeekday)
    const startOfLastWeek = new Date(startOfThisWeek)
    startOfLastWeek.setUTCDate(startOfThisWeek.getUTCDate() - 7)
    const endOfLastWeek = new Date(startOfLastWeek)
    endOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() + 6)
    return { startDate: formatTrDate(startOfLastWeek), endDate: formatTrDate(endOfLastWeek) }
  }

  if (lower.includes('bu yıl') || lower.includes('bu yil')) {
    const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1))
    return { startDate: formatTrDate(start), endDate: formatTrDate(today) }
  }

  return null
}

function resolveDateRange(
  input: Record<string, unknown>,
  userMessage: string,
  fallback: 'month' | 'none' = 'month',
): { startDate: string; endDate: string } | null {
  if (typeof input.start_date === 'string' && typeof input.end_date === 'string') {
    return { startDate: input.start_date, endDate: input.end_date }
  }
  const parsed = resolveDateRangeFromText(userMessage)
  if (parsed) return parsed
  if (fallback === 'none') return null
  const today = istanbulTodayUtc()
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  return { startDate: formatTrDate(start), endDate: formatTrDate(today) }
}

function shouldOfferInvoicesAction(userMessage: string, usedTools: Set<string>): boolean {
  if (usedTools.has('list_invoices')) return true
  const lower = userMessage.toLocaleLowerCase('tr-TR')
  return (
    (lower.includes('fatura') || lower.includes('liste')) &&
    (lower.includes('göster') || lower.includes('goster') || lower.includes('listele'))
  )
}

function parseAmount(value: string): number | null {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseFiltersFromText(text: string): InvoiceSearchFilters {
  const filters: InvoiceSearchFilters = {}
  const lower = normalizeTurkish(text)

  const aboveMatch = lower.match(/(\d[\d.,]*)\s*(tl|₺|try)?\s*(uzeri|ustunde|ustu|ve ustu)/)
  if (aboveMatch) {
    const amount = parseAmount(aboveMatch[1])
    if (amount !== null) filters.amountGte = amount
  }

  const exactMatch = lower.match(/(?:en son|son)\s+(\d[\d.,]*)\s*(tl|₺|try)/)
  if (exactMatch) {
    const amount = parseAmount(exactMatch[1])
    if (amount !== null) filters.amountEq = amount
  }

  const customerMatch =
    text.match(/([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)\s+(beye|bey|hanıma|hanima|hanim|bayan|beye)\b/i) ??
    text.match(/([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)['']?(?:ya|ye)\s+kesti/i) ??
    text.match(/([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)\s+(?:adına|adina)/i)

  if (customerMatch?.[1]) {
    const raw = customerMatch[1].trim().replace(/\s+/g, ' ')
    const cleaned = raw.split(' ').slice(-2).join(' ')
    if (cleaned.length >= 3) filters.customerName = cleaned
  }

  return filters
}

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  username: string,
  userMessage: string,
  conversationId: string,
): Promise<unknown> {
  const toIsoDate = (trDate: string): string => {
    const m = trDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!m) throw new Error('Tarih formatı GG/AA/YYYY olmalıdır.')
    return `${m[3]}-${m[2]}-${m[1]}`
  }

  const ensureFacts = async (startDate: string, endDate: string) => {
    const invoices = await faturaListInvoices(username, startDate, endDate)
    const facts = mapInvoicesToFacts(username, invoices as unknown[])
    if (facts.length === 0) return
    const { error } = await supabase
      .from('invoice_facts')
      .upsert(facts, { onConflict: 'gib_username,invoice_uuid' })
    if (error) throw error
  }

  const parsedFromText = parseFiltersFromText(userMessage)
  const amountGteFromInput =
    typeof input.amount_gte === 'number'
      ? input.amount_gte
      : typeof input.amount_gte === 'string'
        ? parseAmount(input.amount_gte)
        : null
  const amountEqFromInput =
    typeof input.amount_eq === 'number'
      ? input.amount_eq
      : typeof input.amount_eq === 'string'
        ? parseAmount(input.amount_eq as string)
        : null
  const filters: InvoiceSearchFilters = {
    customerName:
      typeof input.customer_name === 'string' ? input.customer_name : parsedFromText.customerName,
    amountGte: amountGteFromInput ?? parsedFromText.amountGte,
    amountEq: amountEqFromInput ?? parsedFromText.amountEq,
  }

  const applyFactFilters = (query: ReturnType<typeof supabase.from>) => {
    let next = query
    if (filters.customerName) {
      next = next.ilike('customer_name', `%${filters.customerName}%`)
    }
    if (typeof filters.amountGte === 'number') {
      next = next.gte('gross_total', filters.amountGte)
    }
    if (typeof filters.amountEq === 'number') {
      const min = Math.max(0, filters.amountEq - 0.5)
      const max = filters.amountEq + 0.5
      next = next.gte('gross_total', min).lte('gross_total', max)
    }
    return next
  }

  switch (toolName) {
    case 'lookup_recipient':
      return faturaLookupRecipient(username, input.tax_id as string)

    case 'create_invoice': {
      const items = input.items as {
        name: string
        quantity: number
        unit: string
        unit_price: number
        vat_rate: number
      }[]
      const preview = await faturaCreateInvoicePreview(username, {
        buyerName: input.buyer_name as string,
        buyerTaxId: input.buyer_tax_id as string | undefined,
        buyerAddress: input.buyer_address as string | undefined,
        items: items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: i.unit_price,
          vatRate: i.vat_rate,
        })),
        date: input.date as string | undefined,
        currency: input.currency as string | undefined,
      })

      await supabase
        .from('conversations')
        .update({
          pending_invoice: {
            draft: preview.draft,
            request: input,
            preview_html: preview.html,
            created_at: new Date().toISOString(),
          },
        })
        .eq('id', conversationId)

      return {
        status: 'preview_ready',
        draft_uuid: preview.draft.uuid,
        message: 'Fatura taslağı hazır. Kesmem için "onaylıyorum" yaz.',
      }
    }

    case 'request_invoice_sign_otp': {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('pending_invoice')
        .eq('id', conversationId)
        .single()
      if (convError) throw convError

      const pending = (conv?.pending_invoice as PendingInvoiceState | null) ?? {}
      const draft = pending?.draft
      if (!draft?.uuid) throw new Error('İmzalanacak taslak fatura bulunamadı.')

      const phoneCandidate =
        (typeof input.phone === 'string' && input.phone.trim()) ||
        pending.signing?.phone ||
        (await faturaGetUserData(username))?.phoneNumber
      const phone = typeof phoneCandidate === 'string' ? phoneCandidate.trim() : ''
      if (!phone) {
        return {
          status: 'phone_required',
          draft_uuid: draft.uuid,
          phone_masked: 'Numara gerekli',
        }
      }

      const operationId = await faturaSendSignSMSCode(username, phone)
      if (!operationId) throw new Error('SMS doğrulama başlatılamadı. Lütfen tekrar dene.')

      const nextPending: PendingInvoiceState = {
        ...pending,
        signing: {
          status: 'otp_sent',
          phone,
          phone_masked: maskPhone(phone),
          operation_id: operationId,
          otp_requested_at: new Date().toISOString(),
          otp_verified_at: undefined,
        },
      }
      await supabase
        .from('conversations')
        .update({ pending_invoice: nextPending })
        .eq('id', conversationId)

      return {
        status: 'otp_sent',
        draft_uuid: draft.uuid,
        phone_masked: nextPending.signing?.phone_masked ?? maskPhone(phone),
        operation_id: operationId,
      }
    }

    case 'verify_invoice_sign_otp': {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('pending_invoice')
        .eq('id', conversationId)
        .single()
      if (convError) throw convError

      const pending = conv?.pending_invoice as PendingInvoiceState | null
      const draft = pending?.draft
      if (!draft?.uuid) throw new Error('Doğrulanacak taslak fatura bulunamadı.')
      const operationId = pending?.signing?.operation_id
      if (!operationId) throw new Error('Doğrulama işlemi bulunamadı. Önce SMS kodu iste.')
      const code =
        typeof input.code === 'string'
          ? input.code.trim()
          : typeof input.sms_code === 'string'
            ? (input.sms_code as string).trim()
            : ''
      if (!code) throw new Error('SMS doğrulama kodu gerekli.')

      await faturaVerifySignSMSCode(username, code, operationId)

      const nextPending: PendingInvoiceState = {
        ...pending,
        signing: {
          ...(pending?.signing ?? {}),
          status: 'otp_verified',
          otp_verified_at: new Date().toISOString(),
        },
      }
      await supabase
        .from('conversations')
        .update({ pending_invoice: nextPending })
        .eq('id', conversationId)

      return { status: 'otp_verified', draft_uuid: draft.uuid }
    }

    case 'confirm_invoice_issue': {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('pending_invoice')
        .eq('id', conversationId)
        .single()
      if (convError) throw convError
      const pending = conv?.pending_invoice as PendingInvoiceState | null
      const draft = pending?.draft
      if (!draft?.date || !draft?.uuid) {
        throw new Error('Onay bekleyen bir fatura taslağı bulunamadı.')
      }
      if (pending?.signing?.status !== 'otp_verified') {
        throw new Error('İmzalama için SMS doğrulama tamamlanmadı.')
      }

      const issued = await faturaConfirmInvoiceIssue(username, {
        date: draft.date,
        uuid: draft.uuid,
      })
      const items = Array.isArray(pending?.request?.items) ? pending.request.items : []
      const netTotal = items.reduce(
        (sum, item) => sum + (Number(item.quantity ?? 0) * Number(item.unit_price ?? 0) || 0),
        0,
      )
      const vatTotal = items.reduce(
        (sum, item) =>
          sum +
          ((Number(item.quantity ?? 0) *
            Number(item.unit_price ?? 0) *
            Number(item.vat_rate ?? 0)) /
            100 || 0),
        0,
      )
      const grossTotal = netTotal + vatTotal

      await supabase
        .from('conversations')
        .update({
          pending_invoice: null,
          last_invoice: {
            uuid: issued.uuid,
            html: issued.html,
            issue_date: draft.date,
            status: 'approved',
            currency: pending?.request?.currency ?? 'TRY',
            gross_total: grossTotal,
            vat_total: vatTotal,
            net_total: netTotal,
            customer_name: pending?.request?.buyer_name ?? null,
            customer_tax_id: pending?.request?.buyer_tax_id ?? null,
            issued_at: new Date().toISOString(),
          },
        })
        .eq('id', conversationId)

      await supabase.from('invoice_facts').upsert(
        {
          gib_username: username,
          invoice_uuid: issued.uuid,
          issue_date: draft.date.split('/').reverse().join('-'),
          status: 'approved',
          currency: pending?.request?.currency ?? 'TRY',
          gross_total: grossTotal,
          vat_total: vatTotal,
          net_total: netTotal,
          customer_tax_id: pending?.request?.buyer_tax_id ?? null,
          customer_name: pending?.request?.buyer_name ?? null,
          raw_payload: {
            source: 'confirm_invoice_issue',
            draft,
            request: pending?.request ?? null,
          },
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'gib_username,invoice_uuid' },
      )

      return { status: 'issued', uuid: issued.uuid, message: 'Fatura başarıyla kesildi.' }
    }

    case 'list_invoices': {
      const range = resolveDateRange(input, userMessage, 'month')
      if (!range) throw new Error('Tarih aralığı belirlenemedi.')
      const hasFilters =
        !!filters.customerName ||
        typeof filters.amountGte === 'number' ||
        typeof filters.amountEq === 'number'
      if (!hasFilters) {
        return faturaListInvoices(username, range.startDate, range.endDate)
      }

      await ensureFacts(range.startDate, range.endDate)
      let query = supabase
        .from('invoice_facts')
        .select('raw_payload')
        .eq('gib_username', username)
        .gte('issue_date', toIsoDate(range.startDate))
        .lte('issue_date', toIsoDate(range.endDate))
        .order('issue_date', { ascending: false })
        .limit(100)
      query = applyFactFilters(query as ReturnType<typeof supabase.from>) as typeof query
      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map((row: { raw_payload: unknown }) => row.raw_payload)
    }

    case 'invoice_totals': {
      const range = resolveDateRange(input, userMessage, 'month')
      if (!range) throw new Error('Tarih aralığı belirlenemedi.')
      await ensureFacts(range.startDate, range.endDate)
      let query = supabase
        .from('invoice_facts')
        .select('gross_total, vat_total, net_total')
        .eq('gib_username', username)
        .eq('status', 'approved')
        .gte('issue_date', toIsoDate(range.startDate))
        .lte('issue_date', toIsoDate(range.endDate))
      query = applyFactFilters(query as ReturnType<typeof supabase.from>) as typeof query
      const { data, error } = await query
      if (error) throw error
      const totals = (
        data ?? []
      ).reduce(
        (
          acc: {
            count_total: number
            sum_gross_total: number
            sum_vat_total: number
            sum_net_total: number
          },
          row: { gross_total: number | null; vat_total: number | null; net_total: number | null },
        ) => {
          acc.count_total += 1
          acc.sum_gross_total += row.gross_total ?? 0
          acc.sum_vat_total += row.vat_total ?? 0
          acc.sum_net_total += row.net_total ?? 0
          return acc
        },
        { count_total: 0, sum_gross_total: 0, sum_vat_total: 0, sum_net_total: 0 },
      )
      return { start_date: range.startDate, end_date: range.endDate, totals }
    }

    case 'latest_invoice': {
      const range = resolveDateRange(input, userMessage, 'none')
      if (range) {
        await ensureFacts(range.startDate, range.endDate)
      } else {
        const month = resolveDateRange({}, userMessage, 'month')!
        await ensureFacts(month.startDate, month.endDate)
      }

      let query = supabase
        .from('invoice_facts')
        .select(
          'invoice_uuid, issue_date, status, currency, gross_total, vat_total, net_total, customer_tax_id, customer_name',
        )
        .eq('gib_username', username)
        .order('issue_date', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
      if (range) {
        query = query
          .gte('issue_date', toIsoDate(range.startDate))
          .lte('issue_date', toIsoDate(range.endDate))
      }
      query = applyFactFilters(query as ReturnType<typeof supabase.from>) as typeof query
      const { data, error } = await query
      if (error) throw error
      return {
        reference_date: formatTrDate(istanbulTodayUtc()),
        invoice: Array.isArray(data) ? data[0] ?? null : null,
      }
    }

    case 'cancel_invoice':
      return faturaCancelInvoice(username, input.ettn as string, (input.reason as string) || 'İptal')

    default:
      throw new Error(`Bilinmeyen araç: ${toolName}`)
  }
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const username = await getSubjectFromAuthHeader(req)
    const { message, conversationId, action: requestAction } = await req.json()

    const hasMessage = typeof message === 'string' && message.trim().length > 0
    const hasAction = !!requestAction
    if (!username || (!hasMessage && !hasAction)) {
      return Response.json({ error: 'message zorunludur.' }, { headers: corsHeaders })
    }

    // Ensure conversation exists
    let convId = conversationId
    if (!convId) {
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({ gib_username: username, title: message.slice(0, 60) })
        .select('id')
        .single()
      if (error) throw error
      convId = conv.id
    }

    // Save user message
    await supabase.from('messages').insert({
      conversation_id: convId,
      role: 'user',
      content: hasMessage ? message : '[action]',
    })

    const normalizedMessage = String(message ?? '').toLocaleLowerCase('tr-TR').trim()
    const isConfirmMessage =
      /\b(onayliyorum|onaylıyorum|onay|evet onay|devam)\b/.test(normalizedMessage) &&
      !/\b(onaylama|onaysiz|onaysız)\b/.test(normalizedMessage)
    const isConfirmAction = requestAction?.type === 'confirm_pending_invoice'
    const isRequestOtpAction = requestAction?.type === 'request_sign_otp'
    const isVerifyOtpAction = requestAction?.type === 'verify_sign_otp'

    // Deterministic fast-path: verify sms -> finalize issue
    if (isVerifyOtpAction) {
      const { data: convState, error: pendingErr } = await supabase
        .from('conversations')
        .select('pending_invoice')
        .eq('id', convId)
        .single()
      if (pendingErr) throw pendingErr

      const pending = convState?.pending_invoice as PendingInvoiceState | null
      if (pending?.draft?.date && pending?.draft?.uuid) {
        if (
          typeof requestAction?.draftUuid === 'string' &&
          requestAction.draftUuid !== pending.draft.uuid
        ) {
          const mismatchMsg =
            'Doğrulanacak taslak değişmiş görünüyor. Lütfen en son önizleme kartını kullan.'
          await supabase.from('messages').insert({
            conversation_id: convId,
            role: 'assistant',
            content: mismatchMsg,
          })
          return Response.json(
            { message: mismatchMsg, conversationId: convId, action: null },
            { headers: corsHeaders },
          )
        }
        try {
          await executeTool(
            'verify_invoice_sign_otp',
            { code: requestAction?.smsCode },
            username,
            message as string,
            convId,
          )
          const result = await executeTool(
            'confirm_invoice_issue',
            {},
            username,
            message as string,
            convId,
          )
          const payload = result as { uuid?: string; message?: string }
          const directMessage = payload?.uuid
            ? `SMS doğrulaması tamamlandı, fatura başarıyla kesildi.\n\nETTN: ${payload.uuid}\n\nİstersen şimdi "faturayı gör" veya "indir" diyebilirsin.`
            : (payload?.message ?? 'SMS doğrulaması tamamlandı, fatura kesildi.')

          await supabase.from('messages').insert({
            conversation_id: convId,
            role: 'assistant',
            content: directMessage,
          })

          return Response.json(
            { message: directMessage, conversationId: convId, action: null },
            { headers: corsHeaders },
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'SMS doğrulaması başarısız.'
          const failText = `SMS doğrulaması başarısız oldu: ${msg}. Kodu kontrol edip tekrar deneyebilirsin.`
          await supabase.from('messages').insert({
            conversation_id: convId,
            role: 'assistant',
            content: failText,
          })
          return Response.json(
            { message: failText, conversationId: convId, action: null },
            { headers: corsHeaders },
          )
        }
      }
    }

    // Deterministic fast-path: if user confirms and a pending draft exists, start sms verification
    if (isConfirmMessage || isConfirmAction || isRequestOtpAction) {
      const { data: convState, error: pendingErr } = await supabase
        .from('conversations')
        .select('pending_invoice')
        .eq('id', convId)
        .single()
      if (pendingErr) throw pendingErr

      const pending = convState?.pending_invoice as PendingInvoiceState | null
      if (pending?.draft?.date && pending?.draft?.uuid) {
        if (
          (isConfirmAction || isRequestOtpAction) &&
          typeof requestAction?.draftUuid === 'string' &&
          requestAction.draftUuid !== pending.draft.uuid
        ) {
          const mismatchMsg =
            'Onaylanacak taslak değişmiş görünüyor. Lütfen en son önizleme kartını kullan.'
          await supabase.from('messages').insert({
            conversation_id: convId,
            role: 'assistant',
            content: mismatchMsg,
          })
          return Response.json(
            { message: mismatchMsg, conversationId: convId, action: null },
            { headers: corsHeaders },
          )
        }
        try {
          const result = await executeTool(
            'request_invoice_sign_otp',
            { phone: requestAction?.phone },
            username,
            message as string,
            convId,
          )
          const payload = result as {
            status?: string
            draft_uuid?: string
            phone_masked?: string
          }
          const directMessage =
            payload?.status === 'phone_required'
              ? 'İmzalama için telefon numarası gerekli. Numaranı girip SMS kodunu isteyebilirsin.'
              : `İmzalama için SMS doğrulama bekleniyor.${payload?.phone_masked ? ` Kod ${payload.phone_masked} numarasına gönderildi.` : ''}`

          await supabase.from('messages').insert({
            conversation_id: convId,
            role: 'assistant',
            content: directMessage,
          })

          return Response.json(
            {
              message: directMessage,
              conversationId: convId,
              action: payload?.draft_uuid
                ? {
                    type: 'open_sign_otp',
                    label: 'SMS Doğrulama',
                    sign_otp: {
                      draftUuid: payload.draft_uuid,
                      phoneMasked: payload.phone_masked ?? 'Kayıtlı numara',
                    },
                  }
                : null,
            },
            { headers: corsHeaders },
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'SMS doğrulaması başlatılamadı.'
          const failText = `İmzalama adımı başlatılamadı: ${msg}`
          await supabase.from('messages').insert({
            conversation_id: convId,
            role: 'assistant',
            content: failText,
          })
          return Response.json(
            { message: failText, conversationId: convId, action: null },
            { headers: corsHeaders },
          )
        }
      }
    }

    // Load conversation history (last 20 messages for context)
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20)

    const claudeMessages: Anthropic.MessageParam[] = (history ?? []).map(
      (m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }),
    )

    // Agentic tool-use loop
    let assistantText = ''
    let usedFinanceTool = false
    const usedToolNames = new Set<string>()
    let latestInvoiceActionPayload: InvoiceDetailPayload | null = null
    const responseContract = `Yanit stili:
- Konusma dili kullan; rapor/excel dili kullanma.
- Zorunlu sabit basliklar ("Istek", "Sonuc", "Tarih Araligi", "Sonraki Adim") kullanma.
- Gerekirse tarihi cumle icinde dogalca belirt.
- Tutar/KDV gibi sayisal degerleri sadece arac sonucundan kullan; tahmin etme.
- Markdown tablo kullanma; gerekiyorsa kisa madde listesi kullan.
- Kullanici "bu ay", "ayin basindan beri", "dun", "gecen hafta" derse tarih sormadan ilgili araci cagir.
- Cevabi kisa tut (genelde 2-5 cumle).`
    const dynamicSystemPrompt = `${SYSTEM_PROMPT}

Bugunun tarihi: ${formatTrDate(istanbulTodayUtc())}
Saat dilimi: ${ISTANBUL_TZ}
${responseContract}`

    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: [
          {
            type: 'text',
            text: dynamicSystemPrompt,
            // @ts-ignore - cache_control for prompt caching
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: TOOLS.map((t, i) =>
          i === TOOLS.length - 1
            ? { ...t, cache_control: { type: 'ephemeral' } as Anthropic.CacheControlEphemeral }
            : t,
        ),
        messages: claudeMessages,
      })

      const textParts = response.content
        .filter((b: Anthropic.ContentBlock) => b.type === 'text')
        .map((b: Anthropic.ContentBlock) => (b as Anthropic.TextBlock).text)
      if (textParts.length) assistantText = textParts.join('')

      if (response.stop_reason === 'end_turn') break

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b: Anthropic.ContentBlock) => b.type === 'tool_use',
        ) as Anthropic.ToolUseBlock[]

        claudeMessages.push({ role: 'assistant', content: response.content })

        const toolResults = await Promise.all(
          toolUseBlocks.map(async block => {
            let content: string
            try {
              const result = await executeTool(
                block.name,
                block.input as Record<string, unknown>,
                username,
                message as string,
                convId,
              )
              if (block.name === 'invoice_totals' || block.name === 'latest_invoice') {
                usedFinanceTool = true
              }
              if (
                block.name === 'latest_invoice' &&
                result &&
                typeof result === 'object' &&
                (result as { invoice?: InvoiceDetailPayload }).invoice
              ) {
                latestInvoiceActionPayload = (result as { invoice: InvoiceDetailPayload }).invoice
              }
              usedToolNames.add(block.name)
              content = JSON.stringify(result)
            } catch (err) {
              content = JSON.stringify({
                error: err instanceof Error ? err.message : 'İşlem başarısız.',
              })
            }
            return { type: 'tool_result' as const, tool_use_id: block.id, content }
          }),
        )

        claudeMessages.push({ role: 'user', content: toolResults })
        continue
      }

      break
    }

    if (assistantText && usedFinanceTool) {
      assistantText = assistantText
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\*\*(İstek|Sonuç|Tarih Aralığı|Sonraki Adım):\*\*/g, '')
        .trim()
    }

    if (assistantText) {
      await supabase.from('messages').insert({
        conversation_id: convId,
        role: 'assistant',
        content: assistantText,
      })
    }

    const { data: convState } = await supabase
      .from('conversations')
      .select('pending_invoice,last_invoice')
      .eq('id', convId)
      .single()
    const pending = convState?.pending_invoice as PendingInvoiceState | null
    const last = convState?.last_invoice as {
      uuid?: string
      html?: string
      issue_date?: string
      status?: string
      currency?: string
      gross_total?: number
      vat_total?: number
      net_total?: number
      customer_tax_id?: string
      customer_name?: string
    } | null

    let action: ChatAction | null = null
    const wantsPreviewOrDownload =
      /\bfaturayi?\s*(g[oö]r|g[oö]ster|ac)\b/i.test(message as string) ||
      /\bindir|pdf\b/i.test(message as string)
    if (wantsPreviewOrDownload || usedToolNames.has('create_invoice')) {
      if (pending?.draft?.uuid && pending.preview_html) {
        action = {
          type: 'open_invoice_preview',
          label: 'Onizleme PDF',
          preview: {
            title: 'Taslak Fatura Önizleme',
            html: pending.preview_html,
            uuid: pending.draft.uuid,
          },
        }
      } else if (last?.uuid) {
        const html =
          typeof last.html === 'string' && last.html.length > 0
            ? last.html
            : await faturaGetInvoiceHtml(username, last.uuid, true)
        action = {
          type: 'open_invoice_preview',
          label: 'Faturayi PDF Ac',
          preview: { title: 'Kesilmiş Fatura', html, uuid: last.uuid },
        }
      }
    } else if (latestInvoiceActionPayload !== null) {
      let detail: InvoiceDetailPayload = latestInvoiceActionPayload
      if (
        last?.uuid &&
        detail.invoice_uuid === last.uuid &&
        (detail.gross_total === null || detail.vat_total === null)
      ) {
        detail = {
          ...detail,
          issue_date: detail.issue_date ?? last.issue_date ?? null,
          status: detail.status || last.status || 'approved',
          currency: detail.currency || last.currency || 'TRY',
          gross_total: detail.gross_total ?? last.gross_total ?? null,
          vat_total: detail.vat_total ?? last.vat_total ?? null,
          net_total: detail.net_total ?? last.net_total ?? null,
          customer_tax_id: detail.customer_tax_id ?? last.customer_tax_id ?? null,
          customer_name: detail.customer_name ?? last.customer_name ?? null,
        }
      }
      action = { type: 'open_invoice_detail', label: 'Detayi Gor', invoice: detail }
    } else if (shouldOfferInvoicesAction(message as string, usedToolNames)) {
      const parsedRange = resolveDateRange({}, message as string, 'month')
      const parsedFilters = parseFiltersFromText(message as string)
      if (parsedRange) {
        action = {
          type: 'open_invoices',
          label: 'Faturalari Gor',
          filter: {
            ...parsedRange,
            customerName: parsedFilters.customerName,
            amountGte: parsedFilters.amountGte,
            amountEq: parsedFilters.amountEq,
          },
        }
      }
    }

    return Response.json(
      { message: assistantText, conversationId: convId, action },
      { headers: corsHeaders },
    )
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json({ error: err.message }, { status: err.status, headers: corsHeaders })
    }
    console.error(err)
    const message = err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.'
    return Response.json({ error: message }, { headers: corsHeaders })
  }
})
