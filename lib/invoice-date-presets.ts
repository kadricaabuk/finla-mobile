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

function lastDayOfMonth(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex + 1, 0);
}

export function invoiceRangeForPreset(
  preset: InvoiceDatePreset,
): InvoiceDateRange {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (preset === "bu_ay") {
    return {
      startDate: fmt(new Date(y, m, 1)),
      endDate: fmt(lastDayOfMonth(y, m)),
    };
  }
  if (preset === "gecen_ay") {
    const prevMonth = m - 1;
    const prevYear = prevMonth < 0 ? y - 1 : y;
    const prevMonthIndex = (prevMonth + 12) % 12;
    return {
      startDate: fmt(new Date(prevYear, prevMonthIndex, 1)),
      endDate: fmt(lastDayOfMonth(prevYear, prevMonthIndex)),
    };
  }
  return {
    startDate: fmt(new Date(y, 0, 1)),
    endDate: fmt(lastDayOfMonth(y, 11)),
  };
}
