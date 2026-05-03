/**
 * API çağrıları `EXPO_PUBLIC_API_BASE_URL` üzerinden yapılır (Supabase Functions veya ileride ayrı BE).
 * @see lib/api.ts
 */
export {
  callApi,
  callEdgeFunction,
  CHAT_STREAM_ACCEPT_HEADER,
  loginRequest,
  logoutRequest,
  getUserProfile,
  updateUserProfile,
  streamChat,
  userFacingApiError,
  type LoginResponse,
  type UserProfile,
  type UserProfileResponse,
  type StreamChatHandlers,
} from './api'
