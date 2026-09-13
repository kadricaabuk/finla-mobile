import React from "react";
import { Img, staticFile } from "remotion";

const SRC = staticFile("inbox-invoice.png");
/** Native raster size (pdfium scale 2.5). */
export const INVOICE_W = 1530;
export const INVOICE_H = 1980;
export const INVOICE_RATIO = INVOICE_H / INVOICE_W;

type Mode = "card" | "full";

/**
 * The same redacted e-Arşiv raster in two crops. Mysoft is already painted
 * out of the PNG — this component does not re-draw overlays.
 */
export const RedactedInvoice: React.FC<{
  mode: Mode;
  width: number;
  /** 0..1, how far the full page has been scrolled (full mode only). */
  scroll?: number;
}> = ({ mode, width, scroll = 0 }) => {
  const height = width * INVOICE_RATIO;
  if (mode === "card") {
    const clipH = width * 0.62;
    return (
      <div
        style={{
          width,
          height: clipH,
          overflow: "hidden",
          backgroundColor: "#fff",
          borderRadius: 8,
          border: "1px solid #E4E5EC",
        }}
      >
        <Img
          src={SRC}
          style={{
            width,
            height,
            display: "block",
          }}
        />
      </div>
    );
  }

  const maxScroll = Math.max(0, height - width * 1.15);
  return (
    <div
      style={{
        width,
        height: "100%",
        overflow: "hidden",
        backgroundColor: "#fff",
      }}
    >
      <Img
        src={SRC}
        style={{
          width,
          height,
          display: "block",
          transform: `translateY(${-scroll * maxScroll}px)`,
        }}
      />
    </div>
  );
};
