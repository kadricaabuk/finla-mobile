import React from "react";
import { FONT } from "../tokens";
import { moneyTl, unitPriceTl, type IntroContent } from "../content";

/**
 * The e-Arsiv template, redrawn at screen scale.
 *
 * Kept as the alternative to the exported page that `InvoicePreview` shows: this
 * one is sized for a 393pt screen instead of for paper, so it stays legible at
 * wider framings, and every figure is bound to the schema — change `amount` in
 * the Studio and the line, the VAT and the totals all follow.
 */

const RULE = "#111111";
const GRID = "#7A7A7A";

/** Double rule — the template separates its blocks with these. */
const DoubleRule: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div style={style}>
    <div style={{ height: 1, backgroundColor: RULE }} />
    <div style={{ height: 1, marginTop: 1.5, backgroundColor: RULE }} />
  </div>
);

const meta: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 7.6,
  lineHeight: "10.5px",
  color: "#111",
};

const cell: React.CSSProperties = {
  border: `0.6px solid ${GRID}`,
  padding: "3.5px 4px",
  fontFamily: FONT,
  fontSize: 7.4,
  lineHeight: "9.5px",
  color: "#111",
};

type Col = { label: string; w?: number; align?: "left" | "right" | "center" };
const COLS: Col[] = [
  { label: "Sıra\nNo", w: 25, align: "center" },
  { label: "Mal Hizmet" },
  { label: "Açıklama", w: 42 },
  { label: "Miktar", w: 34, align: "center" },
  { label: "Birim Fiyat", w: 44, align: "right" },
  { label: "KDV\nOranı", w: 40, align: "right" },
  { label: "KDV Tutarı", w: 48, align: "right" },
  { label: "Mal Hizmet\nTutarı", w: 54, align: "right" },
];

const BANK_W = [62, 58, 44, 0, 46];
const BANK_COLS = ["BANKA ADI", "ŞUBE ADI", "HESAP NO", "IBAN", "PARA BİRİMİ"];
const BANK_ROWS = [
  [
    "VAKIF BANK",
    "ATAŞEHİR",
    "321123",
    "TR76 0009 9012 3456 7800 1000 01",
    "TRY",
  ],
  [
    "ZİRAAT BANK",
    "KOZYATAĞI",
    "123456789",
    "TR05 7776 9876 1234 9876 7890 77",
    "TRY",
  ],
];

/** A QR-shaped block with the three finder patterns. It encodes nothing. */
const QrMark: React.FC<{ size?: number }> = ({ size = 50 }) => {
  const n = 21;
  const c = size / n;
  const isFinder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x > n - 8 && y < 7) || (x < 7 && y > n - 8);
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (isFinder(x, y)) continue;
      // Deterministic speckle — identical every frame, so the mark never flickers.
      if (((x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)) % 5 > 2) {
        cells.push(
          <rect key={`${x}-${y}`} x={x * c} y={y * c} width={c} height={c} />,
        );
      }
    }
  }
  const finder = (ox: number, oy: number) => (
    <g key={`f${ox}-${oy}`}>
      <rect x={ox * c} y={oy * c} width={c * 7} height={c * 7} />
      <rect
        x={(ox + 1) * c}
        y={(oy + 1) * c}
        width={c * 5}
        height={c * 5}
        fill="#fff"
      />
      <rect x={(ox + 2) * c} y={(oy + 2) * c} width={c * 3} height={c * 3} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="#111">
      {cells}
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  );
};

/** The Revenue Administration mark at the head of the template. */
const GibMark: React.FC = () => (
  <svg width={34} height={34} viewBox="0 0 34 34">
    <circle
      cx={17}
      cy={17}
      r={16}
      fill="#fff"
      stroke="#B3261E"
      strokeWidth={1.4}
    />
    <circle
      cx={17}
      cy={17}
      r={12.5}
      fill="none"
      stroke="#B3261E"
      strokeWidth={0.7}
    />
    <text
      x={17}
      y={20.5}
      textAnchor="middle"
      fontFamily={FONT}
      fontSize={10}
      fontWeight={700}
      fill="#B3261E"
    >
      GİB
    </text>
  </svg>
);

export const EArsivDocument: React.FC<{ content: IntroContent }> = ({
  content,
}) => {
  const vat = (content.amount * content.vatRate) / 100;
  const total = content.amount + vat;

  const row = [
    "1",
    content.itemName,
    "",
    "1 Adet",
    unitPriceTl(content.amount),
    `%${content.vatRate},00`,
    moneyTl(vat),
    moneyTl(content.amount),
  ];

  return (
    <>
      <DoubleRule />

      {/* seller · GİB mark · QR */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          paddingTop: 6,
          paddingBottom: 6,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ ...meta, fontWeight: 700 }}>{content.sellerName}</div>
          {content.sellerAddress.split("\n").map((line) => (
            <div key={line} style={meta}>
              {line}
            </div>
          ))}
          <div style={meta}>{content.sellerPhone}</div>
          <div style={meta}>Web Sitesi: {content.sellerWeb}</div>
          <div style={meta}>E-Posta: {content.sellerEmail}</div>
          <div style={meta}>Vergi Dairesi: {content.sellerTaxOffice}</div>
          <div style={meta}>VKN: {content.sellerVkn}</div>
          <div style={meta}>MERSISNO: {content.sellerMersis}</div>
          <div style={meta}>TICARETSICILNO: {content.sellerTradeReg}</div>
        </div>
        <div
          style={{
            width: 82,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 4,
          }}
        >
          <GibMark />
          <div
            style={{
              ...meta,
              fontSize: 9.5,
              fontWeight: 700,
              marginTop: 5,
              textAlign: "center",
            }}
          >
            e-Arşiv Fatura
          </div>
        </div>
        <QrMark />
      </div>

      <DoubleRule />

      {/* buyer · document meta */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          paddingTop: 6,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ ...meta, fontWeight: 700 }}>SAYIN</div>
          <div style={{ ...meta, marginTop: 2 }}>{content.buyerLegalName}</div>
          <div style={meta}>{content.buyerAddress}</div>
          <div style={meta}>TCKN: {content.buyerTckn}</div>
        </div>
        <div style={{ width: 186, flexShrink: 0 }}>
          {[
            ["Özelleştirme No:", "TR1.2"],
            ["Senaryo:", "EARSIVFATURA"],
            ["Fatura Tipi:", "SATIS"],
            ["Fatura No:", content.invoiceNo],
            ["Fatura Tarihi:", content.invoiceDate],
            ["Düzenlenme Tarihi:", content.invoiceDate],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", marginTop: -0.6 }}>
              <div style={{ ...cell, width: 82, fontWeight: 700 }}>{k}</div>
              <div style={{ ...cell, flex: 1, marginLeft: -0.6 }}>
                {v || " "}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DoubleRule style={{ marginTop: 8 }} />

      <div style={{ ...meta, fontWeight: 700, paddingTop: 5 }}>
        ETTN: {content.ettn.toLowerCase()}
      </div>

      {/* line items */}
      <div style={{ marginTop: 10 }}>
        <div style={{ display: "flex" }}>
          {COLS.map((col, i) => (
            <div
              key={col.label}
              style={{
                ...cell,
                ...(col.w ? { width: col.w, flexShrink: 0 } : { flex: 1 }),
                marginLeft: i === 0 ? 0 : -0.6,
                fontWeight: 700,
                textAlign: col.align ?? "left",
                whiteSpace: "pre-line",
              }}
            >
              {col.label}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: -0.6 }}>
          {COLS.map((col, i) => (
            <div
              key={col.label}
              style={{
                ...cell,
                ...(col.w ? { width: col.w, flexShrink: 0 } : { flex: 1 }),
                marginLeft: i === 0 ? 0 : -0.6,
                textAlign: col.align ?? "left",
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {row[i] || " "}
            </div>
          ))}
        </div>
      </div>

      {/* totals */}
      <div style={{ marginTop: 10, marginLeft: "auto", width: 246 }}>
        {[
          ["Mal Hizmet Toplam Tutarı", moneyTl(content.amount)],
          [`Hesaplanan Katma Değer Vergisi(%${content.vatRate})`, moneyTl(vat)],
          ["Vergiler Dahil Toplam Tutar", moneyTl(total)],
          ["Ödenecek Tutar", moneyTl(total)],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", marginTop: -0.6 }}>
            <div
              style={{
                ...cell,
                flex: 1,
                fontWeight: 700,
                textAlign: "right",
              }}
            >
              {k}
            </div>
            <div
              style={{
                ...cell,
                width: 66,
                marginLeft: -0.6,
                textAlign: "right",
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      {/* free-text note box, empty on this invoice */}
      <div
        style={{ marginTop: 12, border: `0.6px solid ${GRID}`, height: 44 }}
      />

      {/* bank details */}
      <div style={{ marginTop: 12, border: `0.6px solid ${GRID}`, padding: 6 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 5,
          }}
        >
          <div style={{ flex: 1, height: 1, backgroundColor: RULE }} />
          <span style={{ ...meta, fontSize: 8, fontWeight: 700 }}>
            BANKA HESAP BİLGİLERİ
          </span>
          <div style={{ flex: 1, height: 1, backgroundColor: RULE }} />
        </div>
        <div style={{ display: "flex" }}>
          {BANK_COLS.map((label, i) => (
            <div
              key={label}
              style={{
                ...meta,
                fontSize: 6.8,
                fontWeight: 700,
                ...(i === 3 ? { flex: 1 } : { width: BANK_W[i] }),
              }}
            >
              {label}
            </div>
          ))}
        </div>
        {BANK_ROWS.map((r) => (
          <div key={r[0]} style={{ display: "flex", marginTop: 2 }}>
            {r.map((v, i) => (
              <div
                key={v}
                style={{
                  ...meta,
                  fontSize: 6.8,
                  ...(i === 3 ? { flex: 1 } : { width: BANK_W[i] }),
                }}
              >
                {v}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div
        style={{
          ...meta,
          fontSize: 7,
          fontWeight: 700,
          marginTop: 10,
          textAlign: "right",
        }}
      >
        e-Arşiv Fatura izni kapsamında elektronik ortamda iletilmiştir.
      </div>

      {/* the template stamps every unsigned draft with this */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 126,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          // Sits over the empty middle of the page, the way the template
          // stamps it — clear of the figures and the document meta.
          transform: "translateX(-58px)",
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 25,
            fontWeight: 700,
            lineHeight: "27px",
            letterSpacing: 1.5,
            textAlign: "center",
            color: "rgba(214,84,84,0.45)",
            transform: "rotate(-27deg)",
          }}
        >
          İMZASIZ
          <br />
          TASLAK
          <br />
          BELGESİ
        </div>
      </div>
    </>
  );
};
