import type { createFaturaClient } from "npm:fatura";
import { buildLocalDraftPreviewHtml } from "./invoice-mapper.ts";

type FaturaClient = ReturnType<typeof createFaturaClient>;

export type InvoicePreviewContent = {
  html?: string;
  pdfBase64?: string;
  local_fallback?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function looksLikePdf(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const head = new Uint8Array(buffer, 0, 4);
  return (
    head[0] === 0x25 &&
    head[1] === 0x50 &&
    head[2] === 0x44 &&
    head[3] === 0x46
  );
}

function isGibInvoiceApproved(onayDurumu: string): boolean {
  const normalized = onayDurumu.toLocaleLowerCase("tr-TR").trim();
  return normalized === "onaylandı" || normalized === "onaylandi";
}

const GIB_DOWNLOAD_HEADERS: Record<string, string> = {
  accept: "*/*",
  "accept-language": "tr,en-US;q=0.9,en;q=0.8",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

async function downloadInvoicePdfBytes(
  client: FaturaClient,
  token: string,
  uuid: string,
  signed: boolean,
): Promise<ArrayBuffer | null> {
  const url = client.getDownloadURL(token, uuid, { signed });
  const res = await fetch(url, { headers: GIB_DOWNLOAD_HEADERS });
  const contentType = res.headers.get("content-type") ?? "";
  const buf = await res.arrayBuffer();

  if (!res.ok) {
    console.warn(
      JSON.stringify({
        event: "gib_download_pdf_http_error",
        uuid,
        signed,
        status: res.status,
        content_type: contentType,
        byte_length: buf.byteLength,
      }),
    );
    return null;
  }

  if (looksLikePdf(buf)) return buf;
  if (contentType.toLowerCase().includes("pdf") && buf.byteLength > 0) {
    return buf;
  }

  const preview = new TextDecoder().decode(buf.slice(0, 200));
  console.warn(
    JSON.stringify({
      event: "gib_download_pdf_not_pdf",
      uuid,
      signed,
      content_type: contentType,
      byte_length: buf.byteLength,
      body_preview: preview.replace(/\s+/g, " ").slice(0, 120),
    }),
  );
  return null;
}

/** HTML veya PDF (base64) — GİB TEST'te HTML patlarsa download fallback. */
export async function fetchInvoicePreviewWithClient(
  client: FaturaClient,
  token: string,
  uuid: string,
  signed: boolean,
  draftDate?: string,
): Promise<InvoicePreviewContent> {
  const draftRef = { uuid, date: draftDate ?? "" };
  let htmlSigned = signed;
  let lastError = "bilinmeyen hata";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!draftDate) break;
    try {
      const found = await client.findInvoice(token, draftRef);
      if (found) {
        if (typeof found.onayDurumu === "string") {
          htmlSigned = isGibInvoiceApproved(found.onayDurumu);
        }
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        JSON.stringify({
          event: "gib_find_invoice_before_preview_failed",
          uuid,
          attempt,
          message: lastError,
        }),
      );
    }
    if (attempt < 3) await sleep(1200);
  }

  const signedAttempts = [htmlSigned, !htmlSigned];
  for (const flag of signedAttempts) {
    try {
      const html = await client.getInvoiceHTML(token, uuid, { signed: flag });
      if (typeof html === "string" && html.length > 0) return { html };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        JSON.stringify({
          event: "gib_get_invoice_html_failed",
          uuid,
          signed: flag,
          message: lastError,
        }),
      );
    }
  }

  for (const flag of signedAttempts) {
    try {
      const buf = await downloadInvoicePdfBytes(client, token, uuid, flag);
      if (buf) return { pdfBase64: arrayBufferToBase64(buf) };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        JSON.stringify({
          event: "gib_download_pdf_failed",
          uuid,
          signed: flag,
          message: lastError,
        }),
      );
    }
  }

  throw new Error(`Önizleme alınamadı (GİB HTML ve PDF): ${lastError}`);
}

export function buildLocalPreviewFromRequest(
  request: Parameters<typeof buildLocalDraftPreviewHtml>[0],
): InvoicePreviewContent {
  return {
    html: buildLocalDraftPreviewHtml(request),
    local_fallback: true,
  };
}
