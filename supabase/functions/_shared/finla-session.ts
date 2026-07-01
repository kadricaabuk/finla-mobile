import {
  getSubjectFromAuthHeader,
  requireFinlaSession,
  SessionAuthError,
  verifyAccessTokenClaims,
} from './session-auth.ts'

export type { FinlaSession, FinlaSessionClaims, OnboardingStatus } from './session-auth.ts'
export { SessionAuthError }

/** @deprecated Use requireFinlaSession — kept for gradual migration */
export async function getSubjectFromAuthHeaderLegacy(req: Request): Promise<string> {
  return getSubjectFromAuthHeader(req)
}

export { requireFinlaSession, verifyAccessTokenClaims }
