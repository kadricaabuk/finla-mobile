import type { CreateInvoiceInput } from '../invoice-mapper.ts'
import { isMockMode, mockInvoiceProvider } from './mock-provider.ts'
import { mysoftInvoiceProvider } from './mysoft-provider.ts'
import type { InvoiceProvider, InvoiceProviderContext } from './types.ts'

export function getInvoiceProvider(): InvoiceProvider {
  if (isMockMode()) return mockInvoiceProvider
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
