import {
  buildLocalDraftPreviewHtml,
  type CreateInvoiceInput,
} from '../invoice-mapper.ts'
import type { InvoicePreviewContent } from '../invoice-preview.ts'
import { mysoftGetBinary, mysoftRequest, mysoftRequestEnvelope } from '../mysoft-client.ts'
import {
  buildMysoftInvoiceOutboxBody,
  extractMysoftEttn,
  extractMysoftListRows,
  filterMysoftRowsByDocDate,
  mapMysoftGibAccount,
  mapMysoftHeaderToGibLike,
  mapMysoftInboxHeaderToGibLike,
  mapMysoftUserProfile,
  mysoftDateToTrDate,
  mysoftInboxListDateTimes,
  mysoftListQueryDateRange,
  pickMysoftCompanyRow,
  trDateToMysoftDate,
} from '../mysoft-mapper.ts'
import {
  fetchTenantMysoftAliases,
  resendMysoftOutboxToGib,
  sendMysoftDraftToGib,
} from '../mysoft-send.ts'
import {
  extractHtmlFromZipBytes,
  extractPdfBase64FromZipBytes,
  tryReadDirectHtml,
  tryReadDirectPdfBase64,
} from '../mysoft-zip.ts'
import type {
  InvoiceDraftRef,
  InvoiceProvider,
  InvoiceProviderContext,
  RecipientLookupResult,
} from './types.ts'

function requireTenantVkn(ctx: InvoiceProviderContext): string {
  const vkn = ctx.tenantVkn?.trim()
  if (!vkn) {
    throw new Error(
      'Fatura işlemi için firma VKN/TCKN bağlanmalı. Profilden VKN ekle.',
    )
  }
  return vkn
}

function trRangeToMysoftDates(startDate: string, endDate: string): {
  start: string
  end: string
  filterStartIso: string
  filterEndIso: string
} {
  const range = mysoftListQueryDateRange(startDate, endDate)
  return {
    start: range.queryStart,
    end: range.queryEnd,
    filterStartIso: range.filterStartIso,
    filterEndIso: range.filterEndIso,
  }
}

const INBOX_LIST_PAGE_LIMIT = 500

async function fetchAllInboxHeaderRows(
  tenantVkn: string,
  inboxRange: ReturnType<typeof mysoftInboxListDateTimes>,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let afterValue = 0

  for (let page = 0; page < 50; page++) {
    const envelope = await mysoftRequestEnvelope(
      '/api/InvoiceInbox/getInvoiceInboxWithHeaderInfoListForPeriod',
      {
        method: 'POST',
        body: JSON.stringify({
          startDate: inboxRange.startDateTime,
          endDate: inboxRange.endDateTime,
          afterValue,
          limit: INBOX_LIST_PAGE_LIMIT,
          tenantIdentifierNumber: tenantVkn,
          isUseDocDate: true,
        }),
      },
    )

    const rows = extractMysoftListRows(envelope)
    if (rows.length === 0) break
    all.push(...rows)

    let nextAfter: number | null = null
    if (typeof envelope.afterValue === 'number' && envelope.afterValue > afterValue) {
      nextAfter = envelope.afterValue
    } else if (
      envelope.data &&
      typeof envelope.data === 'object' &&
      !Array.isArray(envelope.data)
    ) {
      const nested = envelope.data as Record<string, unknown>
      if (typeof nested.afterValue === 'number' && nested.afterValue > afterValue) {
        nextAfter = nested.afterValue
      }
    }

    if (nextAfter === null && rows.length >= INBOX_LIST_PAGE_LIMIT) {
      const last = rows[rows.length - 1]
      const lastId = last?.id ?? last?.invoiceId
      if (typeof lastId === 'number' && lastId > afterValue) {
        nextAfter = lastId
      }
    }

    if (nextAfter === null) break
    afterValue = nextAfter
  }

  return filterMysoftRowsByDocDate(
    all,
    inboxRange.filterStartIso,
    inboxRange.filterEndIso,
  )
}

async function previewFromMysoftBinary(
  raw: Uint8Array,
): Promise<InvoicePreviewContent | null> {
  const directHtml = tryReadDirectHtml(raw)
  if (directHtml) return { html: directHtml }

  const directPdf = tryReadDirectPdfBase64(raw)
  if (directPdf) return { pdfBase64: directPdf }

  const html = extractHtmlFromZipBytes(raw)
  if (html) return { html }

  const pdfBase64 = extractPdfBase64FromZipBytes(raw)
  if (pdfBase64) return { pdfBase64 }

  return null
}

async function fetchOutgoingInvoiceHtmlZip(
  ettn: string,
  tenantVkn?: string,
): Promise<InvoicePreviewContent> {
  const query = {
    invoiceETTN: ettn,
    ...(tenantVkn ? { tenantIdentifierNumber: tenantVkn } : {}),
  }

  const raw = await mysoftGetBinary(
    '/api/InvoiceOutbox/getInvoiceOutboxHTMLAsZip',
    query,
  )
  const fromHtmlZip = await previewFromMysoftBinary(raw)
  if (fromHtmlZip) return fromHtmlZip

  try {
    const pdfRaw = await mysoftGetBinary(
      '/api/InvoiceOutbox/getInvoiceOutboxPdfAsZip',
      query,
    )
    const fromPdfZip = await previewFromMysoftBinary(pdfRaw)
    if (fromPdfZip) return fromPdfZip
  } catch (err) {
    console.warn(JSON.stringify({
      event: 'mysoft_outbox_pdf_zip_fallback_failed',
      ettn,
      error: err instanceof Error ? err.message : String(err),
    }))
  }

  throw new Error('Mysoft önizleme ZIP içinden HTML/PDF çıkarılamadı.')
}

async function fetchIncomingInvoicePdfZip(
  ettn: string,
  tenantVkn?: string,
): Promise<InvoicePreviewContent> {
  const raw = await mysoftGetBinary('/api/InvoiceInbox/getInvoiceInboxPdfAsZip', {
    invoiceETTN: ettn,
    ...(tenantVkn ? { tenantIdentifierNumber: tenantVkn } : {}),
  })

  const preview = await previewFromMysoftBinary(raw)
  if (preview) return preview

  throw new Error('Mysoft gelen fatura PDF ZIP içinden çıkarılamadı.')
}

export const mysoftInvoiceProvider: InvoiceProvider = {
  async lookupRecipient(_ctx, taxId) {
    const id = taxId.replace(/\s/g, '')
    if (!/^\d{10,11}$/.test(id)) return null
    const payload = await mysoftRequest<unknown>(
      '/api/GeneralCard/getGibAccountModel',
      { method: 'GET', query: { vknTckn: id } },
    )
    return mapMysoftGibAccount(id, payload)
  },

  async createInvoicePreview(ctx, input) {
    const tenantVkn = requireTenantVkn(ctx)
    const recipient = input.buyerTaxId
      ? await mysoftInvoiceProvider.lookupRecipient(ctx, input.buyerTaxId)
      : null

    const aliases = await fetchTenantMysoftAliases(tenantVkn)

    const body = buildMysoftInvoiceOutboxBody(
      input,
      tenantVkn,
      recipient,
      { isSaveAsDraft: true, gbAlias: aliases.gbAlias },
    )

    const created = await mysoftRequest<unknown>(
      '/api/InvoiceOutbox/invoiceOutbox',
      { method: 'POST', body: JSON.stringify(body) },
    )

    const ettn = extractMysoftEttn(created)
    if (!ettn) {
      throw new Error('Mysoft taslak oluşturuldu ancak ETTN dönmedi.')
    }

    const trDate = input.date?.trim() || mysoftDateToTrDate(
      String(body.docDate ?? new Date().toISOString()),
    )

    let html = ''
    try {
      const preview = await fetchOutgoingInvoiceHtmlZip(ettn, tenantVkn)
      html = preview.html ?? ''
    } catch {
      html = buildLocalDraftPreviewHtml({
        buyer_name: input.buyerName,
        buyer_tax_id: input.buyerTaxId,
        date: trDate,
        due_date: input.dueDate,
        note: input.note,
        return_ref_invoice_no: input.returnRef?.invoiceNo,
        return_ref_invoice_date: input.returnRef?.invoiceDate,
        return_reason: input.returnRef?.reason,
        currency: input.currency,
        items: input.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unitPrice,
          vat_rate: i.vatRate,
          vat_exemption_code: i.vatExemptionCode,
          withholding_code: i.withholdingCode,
          discount_rate: i.discountRate,
          discount_amount: i.discountAmount,
        })),
      })
    }

    return {
      draft: { uuid: ettn, date: trDate },
      html,
    }
  },

  async confirmInvoiceIssue(ctx, draft, options) {
    const tenantVkn = requireTenantVkn(ctx)
    const aliases = await fetchTenantMysoftAliases(tenantVkn)
    const resendInput = options?.resendInput

    let sendErr: unknown
    try {
      await sendMysoftDraftToGib(draft.uuid, tenantVkn, aliases)
    } catch (err) {
      sendErr = err
      console.warn(
        JSON.stringify({
          event: 'mysoft_send_draft_failed',
          ettn: draft.uuid,
          tenant_vkn: tenantVkn,
          has_gb_alias: Boolean(aliases.gbAlias),
          has_resend_input: Boolean(resendInput),
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }

    if (sendErr) {
      if (!resendInput) throw sendErr

      const recipient = resendInput.buyerTaxId
        ? await mysoftInvoiceProvider.lookupRecipient(ctx, resendInput.buyerTaxId)
        : null

      await resendMysoftOutboxToGib(
        resendInput,
        tenantVkn,
        draft.uuid,
        recipient,
        aliases,
      )
    }

    let html = ''
    try {
      const preview = await fetchOutgoingInvoiceHtmlZip(draft.uuid, tenantVkn)
      html = preview.html ?? ''
    } catch {
      html = `<!DOCTYPE html><html><body><h1>Fatura GİB'e gönderildi</h1><p>ETTN: ${draft.uuid}</p></body></html>`
    }

    return { uuid: draft.uuid, html }
  },

  async deleteDraftInvoice(ctx, ettn) {
    const tenantVkn = requireTenantVkn(ctx)
    await mysoftRequest<unknown>(
      '/api/InvoiceOutbox/deleteDraftInvoiceOutbox',
      {
        method: 'GET',
        query: {
          invoiceETTN: ettn,
          tenantIdentifierNumber: tenantVkn,
        },
      },
    )
  },

  async getInvoicePreview(ctx, params) {
    const tenantVkn = ctx.tenantVkn
    const direction = params.direction ?? 'outgoing'
    if (direction === 'incoming') {
      return fetchIncomingInvoicePdfZip(params.invoiceUuid, tenantVkn)
    }
    return fetchOutgoingInvoiceHtmlZip(params.invoiceUuid, tenantVkn)
  },

  async listOutgoingInvoices(ctx, startDate, endDate) {
    const tenantVkn = requireTenantVkn(ctx)
    const range = trRangeToMysoftDates(startDate, endDate)
    const envelope = await mysoftRequestEnvelope(
      '/api/InvoiceOutbox/getInvoiceOutboxWithHeaderInfoList',
      {
        method: 'POST',
        body: JSON.stringify({
          startDate: range.start,
          endDate: range.end,
          eDocumentType: null,
          afterValue: 0,
          limit: 0,
          tenantIdentifierNumber: tenantVkn,
        }),
      },
    )

    const rows = filterMysoftRowsByDocDate(
      extractMysoftListRows(envelope),
      range.filterStartIso,
      range.filterEndIso,
    )
    if (rows.length === 0) {
      console.log(JSON.stringify({
        event: 'mysoft_list_empty',
        tenant_vkn: tenantVkn,
        query_start: range.start,
        query_end: range.end,
        filter_start: range.filterStartIso,
        filter_end: range.filterEndIso,
        payload_keys: Object.keys(envelope),
        data_type: Array.isArray(envelope.data)
          ? 'array'
          : typeof envelope.data,
      }))
    }

    return rows.map(mapMysoftHeaderToGibLike)
  },

  async listIncomingInvoices(ctx, startDate, endDate) {
    const tenantVkn = requireTenantVkn(ctx)
    const inboxRange = mysoftInboxListDateTimes(startDate, endDate)

    const rows = await fetchAllInboxHeaderRows(tenantVkn, inboxRange)

    if (rows.length === 0) {
      console.log(JSON.stringify({
        event: 'mysoft_inbox_list_empty',
        tenant_vkn: tenantVkn,
        api_start: inboxRange.startDateTime,
        api_end: inboxRange.endDateTime,
        filter_start: inboxRange.filterStartIso,
        filter_end: inboxRange.filterEndIso,
      }))
    }

    return rows.map(mapMysoftInboxHeaderToGibLike)
  },

  async cancelInvoice(ctx, ettn, reason) {
    const tenantVkn = requireTenantVkn(ctx)
    const cancelDate = new Date().toISOString().slice(0, 10)
    return mysoftRequest<unknown>(
      '/api/InvoiceOutbox/cancelEArchiveInvoice',
      {
        method: 'GET',
        query: {
          invoiceETTN: ettn,
          cancelDate,
          cancelType: 'PORTAL',
          cancelNote: reason,
          tenantIdentifierNumber: tenantVkn,
        },
      },
    )
  },

  async acceptIncomingInvoice(ctx, ettn) {
    const tenantVkn = requireTenantVkn(ctx)
    await mysoftRequest<unknown>('/api/InvoiceInbox/acceptInvoice', {
      method: 'GET',
      query: {
        invoiceETTN: ettn,
        tenantIdentifierNumber: tenantVkn,
      },
    })
    return { status: 'accepted' }
  },

  async rejectIncomingInvoice(ctx, ettn, reason) {
    const tenantVkn = requireTenantVkn(ctx)
    const rejectReason = reason.trim()
    if (rejectReason.length < 3) {
      throw new Error('Red sebebi en az 3 karakter olmalıdır.')
    }
    await mysoftRequest<unknown>('/api/InvoiceInbox/denyInvoice', {
      method: 'GET',
      query: {
        invoiceETTN: ettn,
        rejectReason,
        tenantIdentifierNumber: tenantVkn,
      },
    })
    return { status: 'rejected' }
  },

  async getUserProfile(ctx) {
    const userInfoPayload = await mysoftRequest<unknown>(
      '/api/GeneralCard/getUserInfo',
      { method: 'GET' },
    )
    const userInfo =
      userInfoPayload && typeof userInfoPayload === 'object' &&
        !Array.isArray(userInfoPayload)
        ? (userInfoPayload as Record<string, unknown>)
        : {}

    if (!ctx.tenantVkn?.trim()) {
      return mapMysoftUserProfile(null, userInfo, ctx)
    }

    const companyPayload = await mysoftRequest<unknown>(
      '/api/GeneralCard/getUserCompanyInfo',
      {
        method: 'GET',
        query: { tenantIdentifierNumber: ctx.tenantVkn.trim() },
      },
    )
    const company = pickMysoftCompanyRow(companyPayload, ctx.tenantVkn)
    return mapMysoftUserProfile(company, userInfo, ctx)
  },
}

export type { RecipientLookupResult }
