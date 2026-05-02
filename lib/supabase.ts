/**
 * API çağrıları `EXPO_PUBLIC_API_BASE_URL` üzerinden yapılır (Supabase Functions veya ileride ayrı BE).
 * @see lib/api.ts
 */
export {
  callApi,
  callEdgeFunction,
  loginRequest,
  logoutRequest,
  userFacingApiError,
  type LoginResponse,
} from './api'
