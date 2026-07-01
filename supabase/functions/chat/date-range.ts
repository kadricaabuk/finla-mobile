export const ISTANBUL_TZ = "Europe/Istanbul";

export function istanbulTodayUtc(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISTANBUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatTrDate(dateUtc: Date): string {
  const day = String(dateUtc.getUTCDate()).padStart(2, "0");
  const month = String(dateUtc.getUTCMonth() + 1).padStart(2, "0");
  const year = dateUtc.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/** Ayın son günü (İstanbul takvim günü, UTC date). */
export function istanbulMonthEndUtc(today: Date = istanbulTodayUtc()): Date {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
}

export function parseTrDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{2})[./-](\d{2})[./-](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day));
}

export function resolveDateRangeFromText(
  text: string,
): { startDate: string; endDate: string } | null {
  const lower = text.toLocaleLowerCase("tr-TR");
  const today = istanbulTodayUtc();

  const rangeMatch = lower.match(
    /(\d{2}[./-]\d{2}[./-]\d{2,4})\s*(?:-|–|—| ile | to )\s*(\d{2}[./-]\d{2}[./-]\d{2,4})/,
  );
  if (rangeMatch) {
    const start = parseTrDate(rangeMatch[1]);
    const end = parseTrDate(rangeMatch[2]);
    if (start && end) {
      return { startDate: formatTrDate(start), endDate: formatTrDate(end) };
    }
  }

  const explicit = lower.match(/\b(\d{2}[./-]\d{2}[./-]\d{2,4})\b/);
  if (explicit) {
    const day = parseTrDate(explicit[1]);
    if (day) {
      return { startDate: formatTrDate(day), endDate: formatTrDate(day) };
    }
  }

  if (
    /son\s+(?:bir\s+)?1\s+ay\b/.test(lower.replace(/\s+/g, " ")) ||
    lower.includes("son bir ay") ||
    lower.includes("son 1 aylık") ||
    lower.includes("son bir aylık")
  ) {
    const end = today;
    const start = new Date(today);
    start.setUTCMonth(start.getUTCMonth() - 1);
    return { startDate: formatTrDate(start), endDate: formatTrDate(end) };
  }

  if (
    lower.includes("bu ay") ||
    lower.includes("aylık") ||
    lower.includes("aylik") ||
    lower.includes("ayın başından") ||
    lower.includes("ay başından") ||
    lower.includes("ayin basindan") ||
    lower.includes("ay basindan")
  ) {
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    );
    return {
      startDate: formatTrDate(start),
      endDate: formatTrDate(istanbulMonthEndUtc(today)),
    };
  }

  if (
    lower.includes("bugün") ||
    lower.includes("bugun") ||
    lower.includes("bugünkü") ||
    lower.includes("bugunku")
  ) {
    return { startDate: formatTrDate(today), endDate: formatTrDate(today) };
  }

  if (lower.includes("dün")) {
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return {
      startDate: formatTrDate(yesterday),
      endDate: formatTrDate(yesterday),
    };
  }

  if (lower.includes("geçen hafta") || lower.includes("gecen hafta")) {
    const currentWeekday = (today.getUTCDay() + 6) % 7;
    const startOfThisWeek = new Date(today);
    startOfThisWeek.setUTCDate(today.getUTCDate() - currentWeekday);
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setUTCDate(startOfThisWeek.getUTCDate() - 7);
    const endOfLastWeek = new Date(startOfLastWeek);
    endOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() + 6);
    return {
      startDate: formatTrDate(startOfLastWeek),
      endDate: formatTrDate(endOfLastWeek),
    };
  }

  if (lower.includes("bu yıl") || lower.includes("bu yil")) {
    const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    return { startDate: formatTrDate(start), endDate: formatTrDate(today) };
  }

  return null;
}

export function resolveDateRange(
  input: Record<string, unknown>,
  userMessage: string,
  fallback: "month" | "none" = "month",
): { startDate: string; endDate: string } | null {
  if (
    typeof input.start_date === "string" &&
    typeof input.end_date === "string"
  ) {
    return { startDate: input.start_date, endDate: input.end_date };
  }
  const parsed = resolveDateRangeFromText(userMessage);
  if (parsed) return parsed;
  if (fallback === "none") return null;
  const today = istanbulTodayUtc();
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  );
  return {
    startDate: formatTrDate(start),
    endDate: formatTrDate(istanbulMonthEndUtc(today)),
  };
}

/** `latest_invoice` — kullanıcı tarih vermediyse son 12 ayı senkronize et. */
export function resolveLatestInvoiceSyncRange(): {
  startDate: string;
  endDate: string;
} {
  const today = istanbulTodayUtc();
  const start = new Date(today);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  return { startDate: formatTrDate(start), endDate: formatTrDate(today) };
}
