import {
  getInvoiceProvider,
  providerContextFromSession,
} from './invoice-provider/index.ts'
import type { FinlaSession } from './session-auth.ts'
import type { UserData } from './invoice-mapper.ts'

export async function getUserProfile(session: FinlaSession): Promise<UserData> {
  const ctx = providerContextFromSession(session)
  const provider = await getInvoiceProvider(ctx)
  const profile = await provider.getUserProfile(ctx)
  return profile as UserData
}

export async function updateUserProfile(
  _session: FinlaSession,
  _patch: Record<string, unknown>,
): Promise<UserData> {
  throw new Error(
    'Profil güncelleme henüz desteklenmiyor; yakında eklenecek.',
  )
}
