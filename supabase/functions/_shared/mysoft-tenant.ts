import { isMockMode } from './invoice-provider/mock-provider.ts'
import { mysoftRequestEnvelope } from './mysoft-client.ts'
import { extractMysoftListRows } from './mysoft-mapper.ts'

/** İş ortağı hesabında tenant VKN'nin tanımlı olduğunu doğrular. */
export async function assertMysoftTenantExists(tenantVkn: string): Promise<void> {
  if (isMockMode()) return

  const year = new Date().getFullYear()
  const start = `${year}-01-01`
  const end = `${year}-12-31`

  try {
    const envelope = await mysoftRequestEnvelope(
      '/api/InvoiceOutbox/getInvoiceOutboxWithHeaderInfoList',
      {
        method: 'POST',
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          eDocumentType: null,
          afterValue: 0,
          limit: 0,
          tenantIdentifierNumber: tenantVkn,
        }),
      },
    )
    // Başarılı yanıt (boş liste dahil) yeterli — satır sayısı önemli değil.
    void extractMysoftListRows(envelope)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (
      msg.toLocaleLowerCase('tr-TR').includes('firma kaydı bulunamadı') ||
      msg.toLocaleLowerCase('tr-TR').includes('tenantidentifiernumber')
    ) {
      throw new Error(
        'Bu VKN/TCKN Mysoft test hesabında tanımlı değil. Portalda gördüğün firma VKN\'sini gir (sandbox örnek: 6271036106).',
      )
    }
    throw err
  }
}
