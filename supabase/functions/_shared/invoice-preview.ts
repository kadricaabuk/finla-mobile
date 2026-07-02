import { buildLocalDraftPreviewHtml } from "./invoice-mapper.ts";

export type InvoicePreviewContent = {
  html?: string;
  pdfBase64?: string;
  local_fallback?: boolean;
};

export function buildLocalPreviewFromRequest(
  request: Parameters<typeof buildLocalDraftPreviewHtml>[0],
): InvoicePreviewContent {
  return {
    html: buildLocalDraftPreviewHtml(request),
    local_fallback: true,
  };
}
