import { invalidateInvoiceCaches } from "@/lib/invoices-cache";
import {
  clearTokens,
  getTokens,
  saveTokens,
  type StoredTokens,
} from "@/lib/session";
import type { ChatMessageAction } from "@/types/chat-actions";
import {
  asChatStreamLine,
  type ChatStreamEventToolLog,
} from "@/types/chat-stream";
import type { FinlaFeatures } from "@/types/features";

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(
  /\/$/,
  "",
);
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Chat NDJSON ile birlikte aynı uç için JSON düşüşü (Accept). */
export const CHAT_STREAM_ACCEPT_HEADER =
  "application/x-ndjson, application/json;q=0.9";

const API_DEV_LOG_MAX_STRING = 2_000;
const API_DEV_LOG_MAX_ARRAY = 20;
const API_DEV_LOG_MAX_DEPTH = 6;

function newApiDevRequestId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function devLogApi(payload: Record<string, unknown>): void {
  if (!__DEV__) return;
  console.log("[finla api]", {
    ts: new Date().toISOString(),
    ...payload,
  });
}

function sanitizeForApiDevLog(value: unknown, depth = 0): unknown {
  if (depth > API_DEV_LOG_MAX_DEPTH) return "[max_depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length <= API_DEV_LOG_MAX_STRING) return value;
    return `${value.slice(0, API_DEV_LOG_MAX_STRING)}…[+${value.length - API_DEV_LOG_MAX_STRING} chars]`;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const sliced = value
      .slice(0, API_DEV_LOG_MAX_ARRAY)
      .map((item) => sanitizeForApiDevLog(item, depth + 1));
    if (value.length > API_DEV_LOG_MAX_ARRAY) {
      sliced.push(`…[+${value.length - API_DEV_LOG_MAX_ARRAY} items]`);
    }
    return sliced;
  }
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (
      /password|sms_code|token|cred|secret|refresh/i.test(key) ||
      key === "code"
    ) {
      out[key] = "[redacted]";
      continue;
    }
    if (
      (key === "preview_html" || key === "html") &&
      typeof raw === "string"
    ) {
      out[key] = `[html ${raw.length} chars]`;
      continue;
    }
    out[key] = sanitizeForApiDevLog(raw, depth + 1);
  }
  return out;
}

function assertConfig(): void {
  if (!API_BASE_URL || !ANON_KEY) {
    throw new Error(
      "EXPO_PUBLIC_API_BASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY .env içinde tanımlı olmalıdır.",
    );
  }
  if (!ANON_KEY.startsWith("eyJ")) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_ANON_KEY geçersiz görünüyor (JWT formatı bekleniyor).",
    );
  }
}

function authHeaders(
  accessToken: string,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    // Supabase gateway must receive a Supabase JWT here (anon key).
    // App-level access token is sent in a dedicated header.
    Authorization: `Bearer ${ANON_KEY}`,
    "x-finla-access-token": accessToken,
    ...extraHeaders,
  };
}

function publicHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
  };
}

function responseLooksLikeHtml(text: string): boolean {
  const t = text.trimStart();
  if (!t.startsWith("<")) return false;
  return /<\/?(html|head|body|!doctype)/i.test(t.slice(0, 400));
}

function friendlyHttpFailureMessage(
  status: number,
  nonJsonBody: boolean,
): string {
  if (nonJsonBody && (status === 404 || status === 406)) {
    return "Servis adresi bulunamadı. Güncelleme yayınlanıyorsa bir süre sonra tekrar deneyin.";
  }
  if (
    nonJsonBody ||
    status >= 500 ||
    status === 502 ||
    status === 503 ||
    status === 522 ||
    status === 524
  ) {
    return "Şu anda sunucuya bağlanılamıyor veya servis bakımda. Biraz sonra tekrar deneyin.";
  }
  return status === 401 || status === 403
    ? "Oturum süresi doldu veya erişim reddedildi. Çıkış yapıp tekrar giriş yapmayı deneyin."
    : `İstek başarısız oldu (${status}). Tekrar deneyin.`;
}

/** JSON parse/HTML proxy hatalarını kullanıcı metnine çevirir (UI için). */
export function userFacingApiError(err: unknown): string {
  const msg =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : String(err);
  const m = msg.toLowerCase();
  if (
    m.includes("unexpected token") ||
    m.includes("is not valid json") ||
    m.includes("<!doctype") ||
    (m.includes("<html") && m.includes("json"))
  ) {
    return "Sunucu beklenen veri yerine hata sayfası döndü. Bağlantınızı kontrol edin; sorun devam ederse bir süre sonra tekrar deneyin.";
  }
  if (
    m.includes("network request failed") ||
    m.includes("failed to fetch") ||
    m.includes("econnrefused")
  ) {
    return "Ağ bağlantısı kurulamadı. İnternetinizi kontrol edin.";
  }
  if (m.includes("akış") || m.includes("stream")) {
    return "Canlı yanıt alınamadı. Lütfen tekrar deneyin.";
  }
  return typeof err === "string"
    ? err
    : err instanceof Error
      ? err.message
      : "Beklenmeyen bir sorun oluştu.";
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text();
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();

  let body: unknown = null;
  let parsed = false;
  if (text.trim().length === 0) {
    parsed = true;
    body = null;
  } else {
    try {
      body = JSON.parse(text);
      parsed = true;
    } catch {
      parsed = false;
      body = null;
    }
  }

  const looksHtml =
    !parsed || responseLooksLikeHtml(text) || contentType.includes("text/html");

  if (!res.ok) {
    if (looksHtml || !parsed || typeof body !== "object" || body === null) {
      throw new Error(friendlyHttpFailureMessage(res.status, true));
    }
    const obj = body as Record<string, unknown>;
    const serverErr = typeof obj.error === "string" ? obj.error : "";
    const serverMsg = typeof obj.message === "string" ? obj.message : "";
    let detail = serverErr || serverMsg;
    if (detail.trimStart().startsWith("<") || /<html[\s>/]/i.test(detail)) {
      detail = "";
    }
    if (/unexpected token[<']|not valid json/i.test(detail)) {
      throw new Error(friendlyHttpFailureMessage(res.status, true));
    }
    if (detail) throw new Error(detail);
    throw new Error(friendlyHttpFailureMessage(res.status, looksHtml));
  }

  // 200 ama gövde JSON değil (yanlış URL, SPA index, proxy vb.)
  if (!parsed || looksHtml) {
    throw new Error(
      "Sunucu beklenenden farklı yanıt verdi (JSON yerine sayfa görünümü geldi). Bağlantınızı kontrol edin veya daha sonra yeniden deneyin.",
    );
  }

  return body;
}

let refreshPromise: Promise<StoredTokens> | null = null;

async function performRefresh(refreshToken: string): Promise<StoredTokens> {
  assertConfig();
  const requestId = newApiDevRequestId();
  const startedAt = Date.now();
  devLogApi({
    request_id: requestId,
    phase: "request",
    function: "refresh",
    method: "POST",
    body: { refreshToken: "[redacted]" },
  });
  try {
    const res = await fetch(`${API_BASE_URL}/refresh`, {
      method: "POST",
      headers: publicHeaders(),
      body: JSON.stringify({ refreshToken }),
    });
    const body = (await parseJsonOrThrow(res)) as {
      success?: boolean;
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
      error?: string;
    };
    if (body.success === false || !body.accessToken || !body.refreshToken) {
      throw new Error(body.error ?? "Token yenileme başarısız.");
    }
    const expiresIn = typeof body.expiresIn === "number" ? body.expiresIn : 900;
    const tokens: StoredTokens = {
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresAtMs: Date.now() + expiresIn * 1000,
    };
    await saveTokens(tokens);
    devLogApi({
      request_id: requestId,
      phase: "response",
      function: "refresh",
      status: res.status,
      duration_ms: Date.now() - startedAt,
      body: sanitizeForApiDevLog({
        success: body.success,
        expiresIn: body.expiresIn,
      }),
    });
    return tokens;
  } catch (err) {
    devLogApi({
      request_id: requestId,
      phase: "error",
      function: "refresh",
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function refreshTokensLocked(): Promise<StoredTokens | null> {
  const current = await getTokens();
  if (!current?.refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = performRefresh(current.refreshToken).finally(() => {
      refreshPromise = null;
    });
  }
  try {
    return await refreshPromise;
  } catch {
    const prev = await getTokens();
    await invalidateInvoiceCaches(prev?.accessToken ?? null);
    await clearTokens();
    return null;
  }
}

export interface LoginResponse {
  success: boolean;
  error?: string;
  error_code?:
    | "MULTI_SESSION_PERSISTED"
    | "BAD_CREDENTIALS"
    | "GIB_TEMPORARY"
    | "UNKNOWN";
  trace?: unknown;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface UserProfile {
  taxIDOrTRID: string;
  title: string;
  name: string;
  surname: string;
  registryNo?: string;
  mersisNo?: string;
  taxOffice?: string;
  fullAddress?: string;
  buildingName?: string;
  buildingNumber?: string;
  doorNumber?: string;
  town?: string;
  district?: string;
  city?: string;
  zipCode?: string;
  country?: string;
  phoneNumber?: string;
  faxNumber?: string;
  email?: string;
  webSite?: string;
  businessCenter?: string;
}

export interface UserProfileResponse {
  profile: UserProfile;
}

export interface FeaturesResponse {
  features: FinlaFeatures;
}

/** Login — anon gateway + credentials body */
export async function loginRequest(
  username: string,
  password: string,
): Promise<LoginResponse> {
  assertConfig();
  const requestId = newApiDevRequestId();
  const startedAt = Date.now();
  devLogApi({
    request_id: requestId,
    phase: "request",
    function: "login",
    method: "POST",
    body: sanitizeForApiDevLog({ username, password }),
  });
  try {
    const res = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: publicHeaders(),
      body: JSON.stringify({ username, password }),
    });
    const body = (await parseJsonOrThrow(res)) as LoginResponse;
    devLogApi({
      request_id: requestId,
      phase: "response",
      function: "login",
      status: res.status,
      duration_ms: Date.now() - startedAt,
      body: sanitizeForApiDevLog(body),
    });
    return body;
  } catch (err) {
    devLogApi({
      request_id: requestId,
      phase: "error",
      function: "login",
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Logout — Bearer access token */
export async function logoutRequest(accessToken: string): Promise<void> {
  assertConfig();
  const requestId = newApiDevRequestId();
  const startedAt = Date.now();
  devLogApi({
    request_id: requestId,
    phase: "request",
    function: "logout",
    method: "POST",
    body: {},
  });
  try {
    const res = await fetch(`${API_BASE_URL}/logout`, {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({}),
    });
    const body = await parseJsonOrThrow(res);
    devLogApi({
      request_id: requestId,
      phase: "response",
      function: "logout",
      status: res.status,
      duration_ms: Date.now() - startedAt,
      body: sanitizeForApiDevLog(body),
    });
  } catch (err) {
    devLogApi({
      request_id: requestId,
      phase: "error",
      function: "logout",
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Authenticated user profile from GIB session. */
export async function getUserProfile(): Promise<UserProfileResponse> {
  return callApi<UserProfileResponse>("profile", {});
}

/** Runtime feature flags (source-of-truth: Supabase DB). */
export async function getFeaturesConfig(): Promise<FeaturesResponse> {
  return callApi<FeaturesResponse>("features", {});
}

/** Fatura listesi Excel (.xlsx) — Edge Function `excel-export` */
export interface ExcelExportResponse {
  download_url: string;
  file_name: string;
  row_count: number;
  expires_in_seconds: number;
}

export async function exportInvoicesExcel(body: {
  startDate: string;
  endDate: string;
  direction?: "outgoing" | "incoming";
  customerName?: string;
  amountGte?: number;
  amountEq?: number;
}): Promise<ExcelExportResponse> {
  return callApi<ExcelExportResponse>("excel-export", body);
}

/** GİB portal profil kaydını günceller; yalnızca gönderilen alanlar değişir. */
export async function updateUserProfile(
  updates: Partial<UserProfile>,
): Promise<UserProfileResponse> {
  return callApi<UserProfileResponse>("profile", { updates });
}

/**
 * Authenticated POST to a function name (e.g. chat, invoices).
 * On 401, refreshes once and retries.
 */
export async function callApi<T>(
  functionName: string,
  body: object,
): Promise<T> {
  assertConfig();
  let tokens = await getTokens();
  if (!tokens) throw new Error("Oturum bulunamadı. Lütfen tekrar giriş yapın.");

  const requestId = newApiDevRequestId();
  const startedAt = Date.now();
  devLogApi({
    request_id: requestId,
    phase: "request",
    function: functionName,
    method: "POST",
    body: sanitizeForApiDevLog(body),
  });

  const doFetch = async (access: string) =>
    fetch(`${API_BASE_URL}/${functionName}`, {
      method: "POST",
      headers: authHeaders(access),
      body: JSON.stringify(body),
    });

  try {
    let res = await doFetch(tokens.accessToken);
    let retried = false;
    if (res.status === 401) {
      const refreshed = await refreshTokensLocked();
      if (!refreshed) {
        throw new Error("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
      }
      retried = true;
      res = await doFetch(refreshed.accessToken);
    }
    const parsed = (await parseJsonOrThrow(res)) as T;
    devLogApi({
      request_id: requestId,
      phase: "response",
      function: functionName,
      status: res.status,
      retried_after_401: retried,
      duration_ms: Date.now() - startedAt,
      body: sanitizeForApiDevLog(parsed),
    });
    return parsed;
  } catch (err) {
    devLogApi({
      request_id: requestId,
      phase: "error",
      function: functionName,
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export interface StreamChatHandlers {
  onMeta?: (conversationId: string) => void;
  onDelta?: (text: string) => void;
  onTool?: (phase: "start" | "end", name: string) => void | Promise<void>;
  onToolLog?: (log: ChatStreamEventToolLog) => void;
}

/** Aynı task icinde sirayla gelen NDJSON'da react state batching yuzunden ara durumlar boyanmayabilir. */
function yieldToUiForStreamStatus(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

async function consumeChatNdjson(
  res: Response,
  handlers: StreamChatHandlers,
): Promise<{
  message: string;
  conversationId: string;
  action?: ChatMessageAction;
}> {
  const reader = res.body?.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let donePayload: {
    message: string;
    conversationId: string;
    action?: ChatMessageAction;
  } | null = null;

  const handleEventAsync = async (raw: unknown): Promise<void> => {
    const ev = asChatStreamLine(raw);
    if (!ev) return;
    switch (ev.type) {
      case "meta":
        handlers.onMeta?.(ev.conversationId);
        await yieldToUiForStreamStatus();
        break;
      case "delta":
        handlers.onDelta?.(ev.text);
        break;
      case "tool":
        await Promise.resolve(handlers.onTool?.(ev.phase, ev.name));
        await yieldToUiForStreamStatus();
        break;
      case "tool_log":
        if (__DEV__) {
          console.log("[finla tool]", ev);
        }
        handlers.onToolLog?.(ev);
        break;
      case "error":
        throw new Error(ev.message);
      case "done":
        donePayload = {
          message: ev.message,
          conversationId: ev.conversationId,
          action: ev.action ?? undefined,
        };
        break;
      default:
        break;
    }
  };

  // RN runtimelarinda ReadableStream her zaman aktif olmayabiliyor.
  // Reader yoksa tam metni alip yine NDJSON satirlarini parse ederek geriye uyum saglariz.
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        const t = line.trim();
        if (!t) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(t) as unknown;
        } catch {
          throw new Error(
            "Canlı yanıt işlenirken bir sorun oluştu. Lütfen tekrar deneyin.",
          );
        }
        await handleEventAsync(parsed);
      }
    }
  } else {
    buf = await res.text();
  }

  const tail = buf.trim();
  if (tail && !reader) {
    for (const line of tail.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(t) as unknown;
      } catch {
        throw new Error(
          "Canlı yanıt işlenirken bir sorun oluştu. Lütfen tekrar deneyin.",
        );
      }
      await handleEventAsync(parsed);
    }
  } else if (tail) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(tail) as unknown;
    } catch {
      throw new Error("Canlı yanıt yarıda kesildi. Lütfen tekrar deneyin.");
    }
    await handleEventAsync(parsed);
  }

  if (!donePayload) {
    throw new Error("Yanıt tamamlanamadı. Lütfen tekrar deneyin.");
  }
  return donePayload;
}

/**
 * Authenticated streaming chat (NDJSON). Falls back to normal JSON body if the function
 * returns application/json (e.g. eski sürüm).
 */
export async function streamChat(
  payload: { message: string; conversationId: string | null },
  handlers: StreamChatHandlers = {},
  options?: { signal?: AbortSignal },
): Promise<{
  message: string;
  conversationId: string;
  action?: ChatMessageAction;
}> {
  assertConfig();
  let tokens = await getTokens();
  if (!tokens) throw new Error("Oturum bulunamadı. Lütfen tekrar giriş yapın.");

  const requestId = newApiDevRequestId();
  const startedAt = Date.now();
  const requestBody = {
    message: payload.message,
    conversationId: payload.conversationId,
    stream: true,
  };
  devLogApi({
    request_id: requestId,
    phase: "request",
    function: "chat",
    method: "POST",
    stream: true,
    body: sanitizeForApiDevLog(requestBody),
  });

  const body = JSON.stringify(requestBody);

  const doFetch = async (access: string) =>
    fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: authHeaders(access, { Accept: CHAT_STREAM_ACCEPT_HEADER }),
      body,
      signal: options?.signal,
    });

  try {
    let res = await doFetch(tokens.accessToken);
    let retried = false;
    if (res.status === 401) {
      const refreshed = await refreshTokensLocked();
      if (!refreshed) {
        throw new Error("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
      }
      retried = true;
      res = await doFetch(refreshed.accessToken);
    }

    if (!res.ok) {
      await parseJsonOrThrow(res);
    }

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const isNdjson = ct.includes("ndjson");
    devLogApi({
      request_id: requestId,
      phase: "response_meta",
      function: "chat",
      status: res.status,
      retried_after_401: retried,
      content_type: ct,
      stream: isNdjson,
      duration_ms: Date.now() - startedAt,
    });

    if (isNdjson) {
      const result = await consumeChatNdjson(res, handlers);
      devLogApi({
        request_id: requestId,
        phase: "response",
        function: "chat",
        stream: true,
        duration_ms: Date.now() - startedAt,
        body: sanitizeForApiDevLog({
          message: result.message,
          conversationId: result.conversationId,
          action: result.action ?? null,
        }),
      });
      return result;
    }

    const json = (await parseJsonOrThrow(res)) as {
      message?: string;
      conversationId?: string;
      action?: ChatMessageAction;
    };
    if (
      typeof json.message !== "string" ||
      typeof json.conversationId !== "string"
    ) {
      throw new Error("Sunucu yanıtı beklenen biçimde değil.");
    }
    const result = {
      message: json.message,
      conversationId: json.conversationId,
      action: json.action,
    };
    devLogApi({
      request_id: requestId,
      phase: "response",
      function: "chat",
      stream: false,
      duration_ms: Date.now() - startedAt,
      body: sanitizeForApiDevLog(result),
    });
    return result;
  } catch (err) {
    devLogApi({
      request_id: requestId,
      phase: "error",
      function: "chat",
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** @deprecated use callApi */
export async function callEdgeFunction<T>(
  name: string,
  body: object,
): Promise<T> {
  return callApi<T>(name, body);
}
