import { encodeNdjsonEvent } from "./ndjson-stream.ts";

export { sanitizeForDevLog as sanitizeForToolLog } from "../../../shared/log-sanitize.ts";

/** Production'da kapalı; FINLA_STREAM_TOOL_LOGS=true ile açılır. */
export function shouldStreamToolLogsToClient(): boolean {
  const flag = Deno.env.get("FINLA_STREAM_TOOL_LOGS")?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export type ToolCallLogMeta = {
  source?: "agent" | "fast_path";
  tool_use_id?: string;
  agent_round?: number;
  ndjsonWriter?: WritableStreamDefaultWriter<Uint8Array> | null;
};

export function classifyGibOperationError(
  err: unknown,
  toolName: string,
): { code: string; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLocaleLowerCase("tr-TR");

  if (
    toolName === "confirm_invoice_issue" &&
    (lower.includes("parameter 'g'") || lower.includes("gbalias"))
  ) {
    return {
      code: "MYSOFT_SEND_CONFIG",
      message:
        "Mysoft gönderim ayarı eksik (gbAlias). Portalda firma GİB posta kutusu tanımlı mı kontrol et; sandbox tenant: 6271036106.",
    };
  }

  if (toolName === "lookup_recipient" || toolName === "create_invoice") {
    if (
      lower.includes("vkn") ||
      lower.includes("tckn") ||
      (lower.includes("vergi") &&
        (lower.includes("geçersiz") ||
          lower.includes("hatalı") ||
          lower.includes("bulunamadı")))
    ) {
      return {
        code: "INVALID_TAX_ID",
        message: "VKN veya TCKN geçersiz ya da sistemde kayıtlı değil.",
      };
    }
    if (
      toolName === "create_invoice" &&
      /\b1111111111\b/.test(raw)
    ) {
      return {
        code: "INVALID_TAX_ID",
        message:
          "Alıcı TCKN 11 hane olmalı. Sandbox e-Arşiv testi için 11111111111 kullan.",
      };
    }
  }
  if (
    (toolName === "create_invoice" || toolName === "get_exchange_rate") &&
    lower.includes("tcmb kur")
  ) {
    return {
      code: "EXCHANGE_RATE_UNAVAILABLE",
      message:
        "TCMB kur bilgisine şu an ulaşılamadı. Biraz sonra tekrar dene veya kur oranını manuel gir.",
    };
  }
  if (
    toolName === "create_invoice" &&
    (lower.includes("exchange_rate") ||
      lower.includes("kur oranı") ||
      lower.includes("kur orani") ||
      lower.includes("dövizli fatura") ||
      lower.includes("dovizli fatura"))
  ) {
    return {
      code: "MISSING_EXCHANGE_RATE",
      message:
        "Dövizli fatura için kur oranı gerekli. 1 birim dövizin TL karşılığını sor (ör. USD için 40.50).",
    };
  }
  if (
    toolName === "create_invoice" &&
    (lower.includes("önizleme html") || lower.includes("html alınamadı"))
  ) {
    return {
      code: "PREVIEW_HTML_UNAVAILABLE",
      message:
        "Fatura taslağı oluşturuldu ancak önizleme HTML'i şu an alınamadı. Taslak GİB'de mevcut; onay akışına devam edilebilir.",
    };
  }
  if (
    toolName === "create_invoice" &&
    (lower.includes("string index out of range") ||
      lower.includes("index out of range"))
  ) {
    return {
      code: "INVALID_INVOICE_DATA",
      message:
        "Fatura verisi GİB tarafından işlenemedi. Birim kodu, kur oranı veya alıcı bilgilerini kontrol et.",
    };
  }
  if (
    lower.includes("tarih") &&
    (lower.includes("geçersiz") ||
      lower.includes("hatalı") ||
      lower.includes("ileri"))
  ) {
    return {
      code: "INVALID_DATE",
      message:
        "Fatura tarihi geçersiz. Bugünün tarihi veya geçmiş bir tarih kullan.",
    };
  }
  if (
    lower.includes("timeout") ||
    lower.includes("econnrefused") ||
    lower.includes("network") ||
    lower.includes("servis kullanılamıyor") ||
    lower.includes("bağlantı hatası")
  ) {
    return {
      code: "GIB_UNAVAILABLE",
      message:
        "GİB sistemine şu an ulaşılamıyor. Birkaç dakika sonra tekrar dene.",
    };
  }
  if (
    lower.includes("oturum") &&
    (lower.includes("geçersiz") || lower.includes("sona"))
  ) {
    return {
      code: "SESSION_EXPIRED",
      message:
        "GİB oturumu sona erdi. Lütfen uygulamayı yeniden başlat veya tekrar giriş yap.",
    };
  }
  return { code: "GIB_ERROR", message: raw };
}

export async function logToolCallJson(
  payload: Record<string, unknown>,
  ndjsonWriter?: WritableStreamDefaultWriter<Uint8Array> | null,
): Promise<void> {
  const ts = new Date().toISOString();
  console.log(
    JSON.stringify({
      ts,
      event: "tool_call",
      ...payload,
    }),
  );
  if (!ndjsonWriter) return;
  if (!shouldStreamToolLogsToClient()) return;
  const phase = payload.phase;
  if (phase !== "start" && phase !== "success" && phase !== "error") return;
  const tool = payload.tool;
  const conversation_id = payload.conversation_id;
  const gib_username = payload.gib_username;
  if (
    typeof tool !== "string" ||
    typeof conversation_id !== "string" ||
    typeof gib_username !== "string"
  ) {
    return;
  }
  await ndjsonWriter.write(
    encodeNdjsonEvent({
      type: "tool_log",
      ts,
      phase,
      tool,
      conversation_id,
      gib_username,
      ...(typeof payload.source === "string"
        ? { source: payload.source as "agent" | "fast_path" }
        : {}),
      ...(typeof payload.tool_use_id === "string"
        ? { tool_use_id: payload.tool_use_id }
        : {}),
      ...(typeof payload.agent_round === "number"
        ? { agent_round: payload.agent_round }
        : {}),
      ...(payload.input !== undefined ? { input: payload.input } : {}),
      ...(payload.output !== undefined ? { output: payload.output } : {}),
      ...(typeof payload.user_message_preview === "string"
        ? { user_message_preview: payload.user_message_preview }
        : {}),
      ...(typeof payload.duration_ms === "number"
        ? { duration_ms: payload.duration_ms }
        : {}),
      ...(typeof payload.error_message === "string"
        ? { error_message: payload.error_message }
        : {}),
      ...(typeof payload.error_code === "string"
        ? { error_code: payload.error_code }
        : {}),
      ...(typeof payload.error_classified_message === "string"
        ? { error_classified_message: payload.error_classified_message }
        : {}),
      ...(payload.gib_payload_debug !== undefined
        ? { gib_payload_debug: payload.gib_payload_debug }
        : {}),
    }),
  );
}
