import React from "react";
import { C, FONT, KEYBOARD_H, SCREEN_W } from "../tokens";

const ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "ı", "o", "p", "ğ", "ü"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ş", "i"],
  ["z", "x", "c", "v", "b", "n", "m", "ö", "ç"],
];

const KEY_H = 42;
const GAP = 6;
const SIDE = 3;

const keyBase: React.CSSProperties = {
  height: KEY_H,
  borderRadius: 5,
  backgroundColor: C.kbKey,
  boxShadow: "0 1px 0 rgba(0,0,0,0.32)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: FONT,
  fontSize: 22,
  color: C.ink,
};

/** iOS-style Turkish QWERTY, light appearance. Purely decorative. */
export const Keyboard: React.FC = () => {
  const unit = (SCREEN_W - SIDE * 2 - GAP * 11) / 12;

  return (
    <div
      style={{
        height: KEYBOARD_H,
        backgroundColor: C.kbBg,
        paddingTop: 10,
        display: "flex",
        flexDirection: "column",
        gap: 11,
      }}
    >
      {ROWS.map((row, rowIndex) => (
        <div
          key={rowIndex}
          style={{
            display: "flex",
            gap: GAP,
            justifyContent: "center",
            paddingLeft: SIDE,
            paddingRight: SIDE,
          }}
        >
          {rowIndex === 2 ? (
            <div
              style={{
                ...keyBase,
                backgroundColor: C.kbKeyAlt,
                width: unit * 1.4,
                fontSize: 17,
              }}
            >
              ⇧
            </div>
          ) : null}
          {row.map((k) => (
            <div key={k} style={{ ...keyBase, width: unit }}>
              {k}
            </div>
          ))}
          {rowIndex === 2 ? (
            <div
              style={{
                ...keyBase,
                backgroundColor: C.kbKeyAlt,
                width: unit * 1.4,
                fontSize: 17,
              }}
            >
              ⌫
            </div>
          ) : null}
        </div>
      ))}
      <div
        style={{
          display: "flex",
          gap: GAP,
          paddingLeft: SIDE,
          paddingRight: SIDE,
        }}
      >
        <div
          style={{
            ...keyBase,
            backgroundColor: C.kbKeyAlt,
            width: unit * 1.6,
            fontSize: 15,
          }}
        >
          123
        </div>
        <div
          style={{
            ...keyBase,
            backgroundColor: C.kbKeyAlt,
            width: unit * 1.2,
            fontSize: 15,
          }}
        >
          ⊕
        </div>
        <div style={{ ...keyBase, flex: 1, fontSize: 15 }}>boşluk</div>
        <div
          style={{
            ...keyBase,
            backgroundColor: C.kbKeyAlt,
            width: unit * 2.6,
            fontSize: 17,
          }}
        >
          ⏎
        </div>
      </div>
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          justifyContent: "center",
          paddingBottom: 9,
        }}
      >
        <div
          style={{
            width: 134,
            height: 5,
            borderRadius: 99,
            backgroundColor: C.ink,
          }}
        />
      </div>
    </div>
  );
};
