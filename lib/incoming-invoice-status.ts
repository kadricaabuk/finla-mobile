import type {
  IncomingInvoiceDisplayStatus,
  IncomingInvoiceFactStatus,
} from "@/types/incoming-invoice";

const DISPLAY_PENDING: IncomingInvoiceDisplayStatus = "Yanıt Bekleniyor";
const DISPLAY_ACCEPT_QUEUE: IncomingInvoiceDisplayStatus = "Kabul Kuyruğunda";
const DISPLAY_REJECT_QUEUE: IncomingInvoiceDisplayStatus = "Red Kuyruğunda";
const DISPLAY_ACCEPTED: IncomingInvoiceDisplayStatus = "Kabul";
const DISPLAY_REJECTED: IncomingInvoiceDisplayStatus = "Red";
const DISPLAY_CANCELLED: IncomingInvoiceDisplayStatus = "İptal";

const KNOWN_DISPLAYS = new Set<IncomingInvoiceDisplayStatus>([
  DISPLAY_PENDING,
  DISPLAY_ACCEPT_QUEUE,
  DISPLAY_REJECT_QUEUE,
  DISPLAY_ACCEPTED,
  DISPLAY_REJECTED,
  DISPLAY_CANCELLED,
]);

function inboxStatusKey(raw: string): string {
  return raw.toLocaleLowerCase("tr-TR").trim().replace(/_/g, " ");
}

/** Mysoft `*_KUYRUGUNDA` → tr-TR lower `kuyruğunda` (ğ); `kuyruk` substring'i tutmaz. */
function isInboxQueueStatus(s: string): boolean {
  return s.includes("kuyru");
}

function isPendingInboxStatus(s: string): boolean {
  if (isInboxQueueStatus(s)) return false;
  return (
    s.includes("yanıt bek") ||
    s.includes("yanit bek") ||
    s.includes("bekleniyor") ||
    s.includes("wait") ||
    s === "pending_response"
  );
}

function isAcceptQueueInboxStatus(s: string): boolean {
  return isInboxQueueStatus(s) && s.includes("kabul");
}

function isRejectQueueInboxStatus(s: string): boolean {
  return isInboxQueueStatus(s) && (s.includes("red") || s.includes("redd"));
}

export function normalizeIncomingDisplayStatus(
  raw: string,
): IncomingInvoiceDisplayStatus | string {
  const s = inboxStatusKey(raw);
  if (!s) return "Bilinmiyor";
  if (isPendingInboxStatus(s)) {
    return DISPLAY_PENDING;
  }
  if (isAcceptQueueInboxStatus(s)) {
    return DISPLAY_ACCEPT_QUEUE;
  }
  if (isRejectQueueInboxStatus(s)) {
    return DISPLAY_REJECT_QUEUE;
  }
  if (s === "kabul" || s.includes("kabul edildi") || s.includes("accepted")) {
    return DISPLAY_ACCEPTED;
  }
  if (s === "red" || s.includes("redd") || s.includes("reject")) {
    return DISPLAY_REJECTED;
  }
  if (s.includes("iptal") || s.includes("cancel")) {
    return DISPLAY_CANCELLED;
  }
  return raw.trim();
}

export function incomingDisplayToFactStatus(
  display: string,
): IncomingInvoiceFactStatus {
  const s = inboxStatusKey(display);
  if (isPendingInboxStatus(s)) {
    return "pending_response";
  }
  if (isAcceptQueueInboxStatus(s) || s === "kabul" || s.includes("kabul")) {
    return "accepted";
  }
  if (
    isRejectQueueInboxStatus(s) ||
    s === "red" ||
    s.includes("redd") ||
    s.includes("reject")
  ) {
    return "rejected";
  }
  if (s.includes("iptal") || s.includes("cancel")) return "cancelled";
  return "unknown";
}

export function normalizeIncomingFactStatus(
  value?: string,
): IncomingInvoiceFactStatus {
  if (!value?.trim()) return "unknown";
  const lower = value.toLocaleLowerCase("tr-TR").trim();
  if (
    lower === "pending_response" ||
    lower === "accepted" ||
    lower === "rejected" ||
    lower === "cancelled" ||
    lower === "unknown"
  ) {
    return lower as IncomingInvoiceFactStatus;
  }
  return incomingDisplayToFactStatus(normalizeIncomingDisplayStatus(value));
}

/** Gelen faturada KABUL/RED yanıtı verilebilir mi? */
export function canRespondToIncomingInvoice(status?: string): boolean {
  const fact = normalizeIncomingFactStatus(status);
  if (fact === "pending_response") return true;
  if (fact === "accepted" || fact === "rejected" || fact === "cancelled") {
    return false;
  }
  return fact === "unknown";
}

export function prettyIncomingInvoiceStatus(status?: string): string {
  const fact = normalizeIncomingFactStatus(status);
  switch (fact) {
    case "pending_response":
      return DISPLAY_PENDING;
    case "accepted": {
      const display = normalizeIncomingDisplayStatus(status ?? "");
      if (display === DISPLAY_ACCEPT_QUEUE) return DISPLAY_ACCEPT_QUEUE;
      return DISPLAY_ACCEPTED;
    }
    case "rejected": {
      const display = normalizeIncomingDisplayStatus(status ?? "");
      if (display === DISPLAY_REJECT_QUEUE) return DISPLAY_REJECT_QUEUE;
      return DISPLAY_REJECTED;
    }
    case "cancelled":
      return DISPLAY_CANCELLED;
    default: {
      const display = normalizeIncomingDisplayStatus(status ?? "");
      if (KNOWN_DISPLAYS.has(display as IncomingInvoiceDisplayStatus)) {
        return display;
      }
      return status?.trim() || "—";
    }
  }
}
