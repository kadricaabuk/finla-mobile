import type { ChatAction } from "./types.ts";

/** DB'ye yazılacak action: HTML ve geçici OTP UI'sı çıkarılır (boyut ve süre dolmuş kartlar). */
export function persistableAction(
  action: ChatAction | null,
): Record<string, unknown> | null {
  if (!action) return null;
  if (action.type === "open_sign_otp") return null;
  if (action.type === "open_invoice_preview") {
    return {
      type: action.type,
      label: action.label,
      preview: {
        uuid: action.preview?.uuid,
        title: action.preview?.title ?? "Önizleme",
        draftDate: action.preview?.draftDate,
        issued:
          typeof action.preview?.issued === "boolean"
            ? action.preview.issued
            : false,
      },
    };
  }
  if (action.type === "open_excel_export") {
    return {
      type: action.type,
      label: action.label,
      excel_export: {
        file_name: action.excel_export?.file_name ?? "finla-export.xlsx",
        row_count: typeof action.excel_export?.row_count === "number"
          ? action.excel_export.row_count
          : 0,
      },
    };
  }
  try {
    return JSON.parse(JSON.stringify(action)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function assistantFallbackForAction(action: ChatAction | null): string {
  if (!action) return "";
  switch (action.type) {
    case "open_invoice_preview":
      return "Taslak hazır — önizlemeyi kontrol edebilirsin. Uygunsa onaylayıp imzalamaya geçebilirsin.";
    case "open_invoices":
      return "Fatura listesi hazır — alttaki düğmeyle ekranı açabilirsin.";
    case "open_invoice_detail":
      return "Seçilen fatura için detay düğmesine dokunabilirsin.";
    case "open_excel_export":
      return "Excel dosyan hazır — alttaki düğmeyle indirip paylaşabilirsin.";
    default:
      return "";
  }
}
