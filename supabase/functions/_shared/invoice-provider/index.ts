import type { CreateInvoiceInput } from '../invoice-mapper.ts'
import { isMockMode, mockInvoiceProvider } from './mock-provider.ts'
import { mysoftInvoiceProvider } from './mysoft-provider.ts'
import { getNilveraProvider } from './nilvera/nilvera-provider.ts'
import { resolveTenantProvider } from './resolve.ts'
import type { InvoiceProvider, InvoiceProviderContext } from './types.ts'

export async function getInvoiceProvider(
  ctx: InvoiceProviderContext,
): Promise<InvoiceProvider> {
  if (isMockMode()) return mockInvoiceProvider
  const cfg = await resolveTenantProvider(ctx.tenantVkn)
  if (cfg.provider === 'nilvera' && cfg.nilvera) {
    return await getNilveraProvider(cfg.nilvera)
  }
  return mysoftInvoiceProvider
}

export function providerContextFromSession(session: {
  userId: string
  tenantVkn?: string
  phone?: string
}): InvoiceProviderContext {
  return {
    userId: session.userId,
    tenantVkn: session.tenantVkn,
    phone: session.phone,
  }
}

export type { InvoiceProvider, InvoiceProviderContext, InvoiceDraftRef } from './types.ts'
export { isMockMode, mockInvoiceProvider }
export { mysoftInvoiceProvider }
