import React from "react";
import { FONT } from "../../shared/brand";
import { easeRamp } from "../../shared/anim";
import { T } from "../timeline";
import type { InboxContent } from "../content";
import { grossTotal, money } from "../content";

export const Notification: React.FC<{
  frame: number;
  content: InboxContent;
}> = ({ frame, content }) => {
  const inn = easeRamp(frame, T.NOTIF_IN, T.NOTIF_IN + 22);
  const out = easeRamp(frame, T.NOTIF_OUT, T.NOTIF_OUT + 16);
  if (inn < 0.01 || out > 0.99) return null;

  const total = money(grossTotal(content.amount, content.vatRate));

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        top: 54,
        opacity: inn * (1 - out),
        transform: `translateY(${(1 - inn) * -22}px)`,
        transformOrigin: "50% 0%",
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(44,44,46,0.88)",
          borderRadius: 20,
          padding: "10px 12px",
          display: "flex",
          gap: 10,
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
          backdropFilter: "blur(24px)",
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 11,
            backgroundColor: "#000",
            color: "#fff",
            fontFamily: FONT,
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: -0.9,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            flexShrink: 0,
            boxShadow: "0 0 0 0.5px rgba(255,255,255,0.12)",
          }}
        >
          fin
        </div>
        <div style={{ flex: 1, minWidth: 0, fontFamily: FONT }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
              finla
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
              şimdi
            </span>
          </div>
          <div
            style={{
              marginTop: 1,
              fontSize: 15,
              fontWeight: 500,
              color: "#fff",
              lineHeight: "20px",
            }}
          >
            {content.notificationTitle}
          </div>
          <div
            style={{
              marginTop: 1,
              fontSize: 13,
              color: "rgba(255,255,255,0.55)",
            }}
          >
            {content.sellerShort} · {total}
          </div>
        </div>
      </div>
    </div>
  );
};
