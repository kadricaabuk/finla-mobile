import React from "react";
import { spring } from "remotion";
import { C, FONT } from "../tokens";
import { T } from "../timeline";
import { easeRamp } from "../../shared/anim";
import { money, type IntroContent } from "../content";
import { CheckIcon, DocIcon, Spinner } from "./icons";

type Props = { frame: number; fps: number; content: IntroContent };

const label: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 13,
  color: C.muted,
};

const value: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 600,
  color: C.text,
  fontVariantNumeric: "tabular-nums",
};

/**
 * The draft-invoice summary the assistant returns. Field labels follow the
 * server-rendered draft summary in _shared/invoice-mapper.ts; the approve
 * control is the app's real one — "Onayla ve Kes" (there is no reject button).
 */
export const DraftCard: React.FC<Props> = ({ frame, fps, content }) => {
  const vat = (content.amount * content.vatRate) / 100;
  const rows = [
    ["Alıcı", content.customerName],
    ["Kalem", content.itemName],
    ["Matrah", money(content.amount)],
    [`KDV (%${content.vatRate})`, money(vat)],
  ];

  const approved = frame >= T.APPROVE_DONE;
  const pending = frame >= T.APPROVE_PENDING && !approved;
  const pressed = frame >= T.APPROVE_PRESS && frame < T.APPROVE_PRESS + 5;
  const previewPressed = frame >= T.PREVIEW_TAP && frame < T.PREVIEW_TAP + 5;

  const grow = spring({
    frame: frame - T.CARD_IN,
    fps,
    config: { damping: 24, stiffness: 130, mass: 0.7 },
  });
  const badgeFlip = spring({
    frame: frame - T.APPROVE_DONE,
    fps,
    config: { damping: 12, stiffness: 170, mass: 0.6 },
  });

  return (
    <div
      style={{
        alignSelf: "flex-start",
        width: "100%",
        marginTop: 2,
        opacity: Math.min(1, grow * 1.6),
        transform: `translateY(${(1 - grow) * 12}px) scale(${0.97 + grow * 0.03})`,
        transformOrigin: "left bottom",
        backgroundColor: C.white,
        border: `1px solid ${C.hairline}`,
        borderRadius: 14,
        padding: 14,
        boxShadow: "0 4px 14px rgba(0,0,0,0.07)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <DocIcon size={17} />
        <span
          style={{
            fontFamily: FONT,
            fontSize: 14.5,
            fontWeight: 700,
            color: C.text,
          }}
        >
          Taslak Fatura Özeti
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: FONT,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.4,
            borderRadius: 999,
            padding: "3px 8px",
            transform: `scale(${approved ? 1 + (1 - badgeFlip) * 0.14 : 1})`,
            color: approved ? C.successInk : C.warnInk,
            backgroundColor: approved ? C.successBg : C.warnBg,
          }}
        >
          {approved ? "ONAYLANDI" : "TASLAK"}
        </span>
      </div>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          flexDirection: "column",
          gap: 7,
        }}
      >
        {rows.map(([k, v], i) => {
          const at = T.CARD_ROWS + i * 5;
          const p = easeRamp(frame, at, at + 10);
          return (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                opacity: p,
                transform: `translateY(${(1 - p) * 5}px)`,
              }}
            >
              <span style={label}>{k}</span>
              <span style={value}>{v}</span>
            </div>
          );
        })}

        <div
          style={{
            height: 1,
            backgroundColor: C.tableBorder,
            margin: "3px 0",
            opacity: easeRamp(frame, T.CARD_ROWS + 20, T.CARD_ROWS + 28),
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            opacity: easeRamp(frame, T.CARD_ROWS + 22, T.CARD_ROWS + 32),
          }}
        >
          <span style={{ ...label, color: C.text, fontWeight: 600 }}>
            Genel toplam
          </span>
          <span style={{ ...value, fontSize: 15, fontWeight: 700 }}>
            {money(content.amount + vat)}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 12,
          opacity: easeRamp(frame, T.CARD_BUTTONS, T.CARD_BUTTONS + 9),
          transform: `translateY(${(1 - easeRamp(frame, T.CARD_BUTTONS, T.CARD_BUTTONS + 9)) * 6}px)`,
        }}
      >
        {approved ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              backgroundColor: C.ink,
              borderRadius: 999,
              padding: "9px 14px",
            }}
          >
            <span
              style={{
                fontFamily: FONT,
                fontSize: 13,
                fontWeight: 600,
                color: C.white,
              }}
            >
              Faturayı Gör
            </span>
          </div>
        ) : (
          <>
            <div
              style={{
                backgroundColor: previewPressed ? "#2A2A2A" : C.ink,
                borderRadius: 999,
                padding: "9px 14px",
                opacity: pending ? 0.5 : 1,
                transform: `scale(${previewPressed ? 0.955 : 1})`,
              }}
            >
              <span
                style={{
                  fontFamily: FONT,
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.white,
                }}
              >
                Taslağı Gör
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                backgroundColor: pressed ? "#F0F0F0" : C.white,
                border: `1.5px solid ${C.ink}`,
                borderRadius: 999,
                padding: "7.5px 14px",
                opacity: pending ? 0.6 : 1,
                transform: `scale(${pressed ? 0.955 : 1})`,
              }}
            >
              {pending ? (
                <Spinner frame={frame} size={13} color={C.ink} />
              ) : null}
              <span
                style={{
                  fontFamily: FONT,
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.ink,
                }}
              >
                {pending ? "Onaylanıyor..." : "Onayla ve Kes"}
              </span>
            </div>
          </>
        )}
        {approved ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginLeft: "auto",
              opacity: Math.min(1, badgeFlip * 1.5),
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                backgroundColor: C.success,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `scale(${0.6 + badgeFlip * 0.4})`,
              }}
            >
              <CheckIcon size={13} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
