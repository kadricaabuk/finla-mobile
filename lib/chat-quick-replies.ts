/**
 * Asistan mesajının sonuna eklenen `[öneriler: a | b | c]` satırını ayıklar.
 * Sunucu (system prompt) modele bu formatı öğretir; uygulama satırı gizleyip
 * seçenekleri dokunulabilir hızlı yanıt çipleri olarak gösterir.
 */
const MARKER_PREFIX = "[öneriler:";
const MAX_REPLIES = 4;

export interface QuickRepliesParse {
  /** Öneri satırı çıkarılmış mesaj metni. */
  text: string;
  replies: string[];
}

export function splitQuickReplies(raw: string): QuickRepliesParse {
  const trimmed = raw.trimEnd();
  const nl = trimmed.lastIndexOf("\n");
  const lastLine = trimmed.slice(nl + 1).trim();
  const lower = lastLine.toLocaleLowerCase("tr-TR");
  if (!lower.startsWith(MARKER_PREFIX) || !lastLine.endsWith("]")) {
    return { text: raw, replies: [] };
  }
  const replies = lastLine
    .slice(MARKER_PREFIX.length, -1)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_REPLIES);
  if (replies.length === 0) return { text: raw, replies: [] };
  return {
    text: nl === -1 ? "" : trimmed.slice(0, nl).trimEnd(),
    replies,
  };
}

/**
 * Görüntülenecek metin: tamamlanmış öneri satırını VE stream sırasında henüz
 * yarım yazılmış (`[öneriler: %2…` gibi kapanmamış) son satırı gizler.
 */
export function stripQuickRepliesForDisplay(raw: string): string {
  const parsed = splitQuickReplies(raw);
  if (parsed.replies.length > 0) return parsed.text;

  const trimmed = raw.trimEnd();
  const nl = trimmed.lastIndexOf("\n");
  const lastLine = trimmed.slice(nl + 1).trim();
  if (!lastLine.startsWith("[")) return raw;
  const lower = lastLine.toLocaleLowerCase("tr-TR");
  const isPartialMarker =
    MARKER_PREFIX.startsWith(lower) || lower.startsWith(MARKER_PREFIX);
  if (!isPartialMarker) return raw;
  return nl === -1 ? "" : trimmed.slice(0, nl).trimEnd();
}
