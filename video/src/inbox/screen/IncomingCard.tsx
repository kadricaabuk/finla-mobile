import React from "react";
import { FONT } from "../../shared/brand";
import { C } from "../../intro/tokens";
import { RedactedInvoice } from "./RedactedInvoice";
import type { InboxContent } from "../content";
import { grossTotal, money } from "../content";

export const IncomingCard: React.FC<{
  content: InboxContent;
  pressed?: boolean;
  accepted?: boolean;
}> = ({ content, pressed, accepted }) => {
  const total = money(grossTotal(content.amount, content.vatRate));
  const status = accepted ? "Kabul" : "Yanıt Bekleniyor";
  const statusColor = accepted ? C.successInk : C.warnInk;
  const statusBg = accepted ? C.successBg : C.warnBg;

  return (
    <div
      style={{
        alignSelf: "stretch",
        backgroundColor: C.white,
        border: `1px solid ${C.hairline}`,
        borderRadius: 16,
        overflow: "hidden",
        transform: `scale(${pressed ? 0.97 : 1})`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ padding: "12px 14px 10px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "baseline",
          }}
        >
          <span
            style={{
              fontFamily: FONT,
              fontSize: 16,
              fontWeight: 600,
              color: C.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {content.sellerShort}
          </span>
          <span
            style={{
              fontFamily: FONT,
              fontSize: 16,
              fontWeight: 600,
              color: C.ink,
              flexShrink: 0,
            }}
          >
            {total}
          </span>
        </div>
        <div
          style={{
            marginTop: 6,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontFamily: FONT,
              fontSize: 13,
              color: C.muted,
            }}
          >
            {content.invoiceDate}
          </span>
          <span
            style={{
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 600,
              color: statusColor,
              backgroundColor: statusBg,
              borderRadius: 999,
              padding: "3px 8px",
            }}
          >
            {status}
          </span>
        </div>
      </div>
      <div style={{ padding: "0 10px 10px" }}>
        <RedactedInvoice mode="card" width={341} />
      </div>
    </div>
  );
};
