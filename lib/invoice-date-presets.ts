export type InvoiceDatePreset = "bu_ay" | "gecen_ay" | "bu_yil";

export type InvoiceDateRange = { startDate: string; endDate: string };

export const INVOICE_DATE_PRESETS: {
  key: InvoiceDatePreset;
  label: string;
}[] = [
  { key: "bu_ay", label: "Bu Ay" },
  { key: "gecen_ay", label: "Geçen Ay" },
  { key: "bu_yil", label: "Bu Yıl" },
];

function fmt(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function invoiceRangeForPreset(
  preset: InvoiceDatePreset,
): InvoiceDateRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (preset === "bu_ay") {
    return { startDate: fmt(new Date(y, m, 1)), endDate: fmt(now) };
  }
  if (preset === "gecen_ay") {
    return {
      startDate: fmt(new Date(y, m - 1, 1)),
      endDate: fmt(new Date(y, m, 0)),
    };
  }
  return {
    startDate: fmt(new Date(y, 0, 1)),
    endDate: fmt(new Date(y, 11, 31)),
  };
}
