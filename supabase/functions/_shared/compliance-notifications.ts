/**
 * FIN-63 V1 — compliance / mevzuat in-chat notification templates.
 *
 * Scope (Kadri 2026-10-17): mevzuat/uyumluluk only. Not situational invoice
 * alerts ("müşteri ödemedi") and not general sector news.
 *
 * Threshold TRY figures are NEVER hard-coded here — callers (Muhasebeci agent
 * brief, or a future config table) pass the current GİB haddi. Copy stays
 * Turkish; ids stay English snake_case for code.
 */

export type ComplianceTemplateId =
  | "efatura_threshold_approach"
  | "mevzuat_update";

export type ComplianceSeverity = "info" | "warning";

export interface ComplianceNotification {
  templateId: ComplianceTemplateId;
  severity: ComplianceSeverity;
  /** Short Turkish title for chat / future push. */
  title: string;
  /** Turkish body shown in chat. */
  body: string;
  /** Stable dedupe key: template + period (e.g. calendar year). */
  dedupeKey: string;
}

export interface ComplianceTemplateMeta {
  id: ComplianceTemplateId;
  severity: ComplianceSeverity;
  /** One-line purpose for docs / agents. */
  purpose: string;
}

/** The two V1 templates. */
export const COMPLIANCE_TEMPLATES: readonly ComplianceTemplateMeta[] = [
  {
    id: "efatura_threshold_approach",
    severity: "warning",
    purpose:
      "Warn when YTD brüt hasılat approaches the e-Fatura mükellefiyeti haddi.",
  },
  {
    id: "mevzuat_update",
    severity: "info",
    purpose:
      "Surface a Muhasebeci-confirmed UBL-TR / e-Fatura / VUK change to the user.",
  },
] as const;

export interface EFaturaThresholdInput {
  /** Calendar year the YTD figure covers (e.g. 2026). */
  year: number;
  /** Tenant YTD gross hasılat in TRY (from invoice_facts / totals). */
  ytdGrossTry: number;
  /**
   * Current e-Fatura mükellefiyeti haddi in TRY for this year.
   * Must come from Muhasebeci / GİB — do not invent in app code.
   */
  thresholdTry: number;
  /**
   * Fire when ytdGrossTry / thresholdTry >= this ratio (default 0.8).
   */
  warnAtRatio?: number;
}

/**
 * Build an e-Fatura haddi approach alert, or null when below the warn ratio
 * / misconfigured thresholds.
 */
export function evaluateEFaturaThresholdApproach(
  input: EFaturaThresholdInput,
): ComplianceNotification | null {
  const {
    year,
    ytdGrossTry,
    thresholdTry,
    warnAtRatio = 0.8,
  } = input;

  if (
    !Number.isFinite(ytdGrossTry) ||
    !Number.isFinite(thresholdTry) ||
    thresholdTry <= 0 ||
    ytdGrossTry < 0 ||
    warnAtRatio <= 0 ||
    warnAtRatio > 1
  ) {
    return null;
  }

  const ratio = ytdGrossTry / thresholdTry;
  if (ratio < warnAtRatio) return null;

  const pct = Math.min(100, Math.round(ratio * 100));
  const ytdFormatted = formatTry(ytdGrossTry);
  const haddiFormatted = formatTry(thresholdTry);

  return {
    templateId: "efatura_threshold_approach",
    severity: "warning",
    title: "e-Fatura mükellefiyeti haddine yaklaşıyorsunuz",
    body:
      `${year} yılı brüt hasılatınız yaklaşık ${ytdFormatted} TL — ` +
      `e-Fatura mükellefiyeti haddinin (~${haddiFormatted} TL) %${pct}'ine ulaştı. ` +
      `Mali müşavirinizle geçiş zamanlamasını konuşmanızı öneririz.`,
    dedupeKey: `efatura_threshold_approach:${year}`,
  };
}

export interface MevzuatUpdateInput {
  /** Short Turkish summary of the change (Muhasebeci-authored). */
  summary: string;
  /** Optional source URL (GİB / PwC / resmi gazete). */
  sourceUrl?: string;
  /** Optional effective date ISO (YYYY-MM-DD). */
  effectiveDate?: string;
  /** Dedupe bucket — usually the finding id or a week key. */
  findingKey: string;
}

/** Build a mevzuat-update alert from a Muhasebeci finding. */
export function buildMevzuatUpdateNotification(
  input: MevzuatUpdateInput,
): ComplianceNotification | null {
  const summary = (input.summary ?? "").trim();
  const findingKey = (input.findingKey ?? "").trim();
  if (!summary || !findingKey) return null;

  const parts = [summary];
  if (input.effectiveDate) {
    parts.push(`Yürürlük: ${input.effectiveDate}.`);
  }
  if (input.sourceUrl) {
    parts.push(`Kaynak: ${input.sourceUrl}`);
  }

  return {
    templateId: "mevzuat_update",
    severity: "info",
    title: "Mevzuat güncellemesi",
    body: parts.join(" "),
    dedupeKey: `mevzuat_update:${findingKey}`,
  };
}

/** Chat-ready markdown for an in-app assistant bubble. */
export function formatComplianceNotificationForChat(
  notice: ComplianceNotification,
): string {
  return `**${notice.title}**\n\n${notice.body}`;
}

function formatTry(amount: number): string {
  return Math.round(amount).toLocaleString("tr-TR");
}
