import {
  inboxDisplayToFactStatus,
  normalizeInboxDisplayStatus,
  parseMysoftInboxStatusRaw,
} from './incoming-invoice-status.ts'
import { mysoftRequest } from './mysoft-client.ts'
import type { InvoiceProviderContext } from './invoice-provider/types.ts'

export type MysoftInvoiceDetailRow = {
  invoice_uuid: string
  issue_date: string | null
  status: string
  currency: string
  gross_total: number | null
  vat_total: number | null
  net_total: number | null
  customer_tax_id: string | null
  customer_name: string | null
}

function partyName(info: unknown): string | null {
  if (!info || typeof info !== 'object') return null
  const name = (info as Record<string, unknown>).partyName
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (!trimmed || trimmed.startsWith('urn:mail:')) return null
  return trimmed
}

function partyId(info: unknown): string | null {
  if (!info || typeof info !== 'object') return null
  const id = (info as Record<string, unknown>).identifierNumber
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

function parseDocDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const dot = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (dot) return `${dot[3]}-${dot[2]}-${dot[1]}`
  const iso = trimmed.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return iso[0]
  return null
}

function taxAmountFromModel(model: Record<string, unknown>): number | null {
  const taxTotal = model.taxTotal
  if (Array.isArray(taxTotal) && taxTotal[0] && typeof taxTotal[0] === 'object') {
    const amt = (taxTotal[0] as Record<string, unknown>).taxAmount
    return typeof amt === 'number' ? amt : null
  }
  if (taxTotal && typeof taxTotal === 'object') {
    const amt = (taxTotal as Record<string, unknown>).taxAmount
    return typeof amt === 'number' ? amt : null
  }
  return null
}

function resolveIncomingDetailStatus(
  statusPayload: unknown,
  model: Record<string, unknown>,
): string {
  const raw =
    parseMysoftInboxStatusRaw(statusPayload) ||
    parseMysoftInboxStatusRaw(model)
  const display = normalizeInboxDisplayStatus(raw || 'Bilinmiyor')
  if (
    display === 'Yanıt Bekleniyor' ||
    display === 'Kabul Kuyruğunda' ||
    display === 'Red Kuyruğunda' ||
    display === 'Kabul' ||
    display === 'Red' ||
    display === 'İptal'
  ) {
    return display
  }
  return inboxDisplayToFactStatus(display)
}

export function mapMysoftInboxModelToDetail(
  model: Record<string, unknown>,
  invoiceUuid: string,
  statusPayload?: unknown,
): MysoftInvoiceDetailRow {
  const monetary =
    model.legalMonetaryTotal && typeof model.legalMonetaryTotal === 'object'
      ? (model.legalMonetaryTotal as Record<string, unknown>)
      : {}

  const gross =
    typeof monetary.payableAmount === 'number'
      ? monetary.payableAmount
      : typeof monetary.taxInclusiveAmount === 'number'
        ? monetary.taxInclusiveAmount
        : null
  const net =
    typeof monetary.taxExclusiveAmount === 'number'
      ? monetary.taxExclusiveAmount
      : typeof monetary.lineExtensionAmount === 'number'
        ? monetary.lineExtensionAmount
        : null
  const vat =
    taxAmountFromModel(model) ??
    (gross !== null && net !== null ? gross - net : null)

  return {
    invoice_uuid: invoiceUuid,
    issue_date: parseDocDate(model.docDate),
    status: resolveIncomingDetailStatus(statusPayload, model),
    currency:
      typeof model.documentCurrencyCode === 'string'
        ? model.documentCurrencyCode
        : 'TRY',
    gross_total: gross,
    vat_total: vat,
    net_total: net,
    customer_name: partyName(model.supplierInfo),
    customer_tax_id: partyId(model.supplierInfo),
  }
}

export async function fetchMysoftIncomingInvoiceDetail(
  ctx: InvoiceProviderContext,
  invoiceUuid: string,
): Promise<MysoftInvoiceDetailRow> {
  const tenantVkn = ctx.tenantVkn?.trim()
  if (!tenantVkn) {
    throw new Error(
      'Fatura detayı için firma VKN/TCKN bağlanmalı. Profilden VKN ekle.',
    )
  }

  const query = {
    invoiceETTN: invoiceUuid,
    tenantIdentifierNumber: tenantVkn,
  }

  const [model, statusPayload] = await Promise.all([
    mysoftRequest<Record<string, unknown>>(
      '/api/InvoiceInbox/getInvoiceInboxModel',
      { method: 'GET', query },
    ),
    mysoftRequest<unknown>(
      '/api/InvoiceInbox/getInvoiceInboxStatus',
      { method: 'GET', query },
    ).catch(() => null),
  ])

  return mapMysoftInboxModelToDetail(model, invoiceUuid, statusPayload)
}
