import React from "react";
import { C } from "../tokens";

export const MenuIcon: React.FC = () => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    {[6, 12, 18].map((y) => (
      <rect key={y} x={3} y={y - 1} width={18} height={2} rx={1} fill={C.ink} />
    ))}
  </svg>
);

export const ArrowUpIcon: React.FC = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 19V6M12 6l-6 6M12 6l6 6"
      stroke="#fff"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const DocIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 16,
  color = C.text,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
      stroke={color}
      strokeWidth={1.7}
      strokeLinejoin="round"
    />
    <path
      d="M14 3v5h5"
      stroke={color}
      strokeWidth={1.7}
      strokeLinejoin="round"
    />
  </svg>
);

export const CheckIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M5 13l4.5 4.5L19 7"
      stroke="#fff"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Matches the RN ActivityIndicator: a spinning arc of the same weight. */
export const Spinner: React.FC<{
  frame: number;
  size?: number;
  color?: string;
}> = ({ frame, size = 18, color = C.spinner }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    style={{ transform: `rotate(${(frame * 11) % 360}deg)` }}
  >
    <circle
      cx={12}
      cy={12}
      r={9}
      stroke={color}
      strokeOpacity={0.25}
      strokeWidth={2.6}
      fill="none"
    />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke={color}
      strokeWidth={2.6}
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

const promptIconPaths: Record<string, React.ReactNode> = {
  document: (
    <>
      <path
        d="M13 2.5H6.5A1.5 1.5 0 0 0 5 4v12A1.5 1.5 0 0 0 6.5 17.5h7A1.5 1.5 0 0 0 15 16V4.5L13 2.5Z"
        stroke={C.promptText}
        strokeWidth={1.3}
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M12.6 2.6V5h2.3"
        stroke={C.promptText}
        strokeWidth={1.3}
        fill="none"
      />
    </>
  ),
  albums: (
    <>
      <rect
        x={4}
        y={6.5}
        width={12}
        height={9}
        rx={2}
        stroke={C.promptText}
        strokeWidth={1.3}
        fill="none"
      />
      <path
        d="M6 4.5h8"
        stroke={C.promptText}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </>
  ),
  mail: (
    <>
      <rect
        x={3.5}
        y={5.5}
        width={13}
        height={9}
        rx={1.8}
        stroke={C.promptText}
        strokeWidth={1.3}
        fill="none"
      />
      <path
        d="m4 7 6 4.2L16 7"
        stroke={C.promptText}
        strokeWidth={1.3}
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),
  download: (
    <>
      <path
        d="M10 3.5v8.5m0 0 3-3m-3 3-3-3"
        stroke={C.promptText}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 13.5v1.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-1.5"
        stroke={C.promptText}
        strokeWidth={1.3}
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
};

export const PromptIcon: React.FC<{ name: string }> = ({ name }) => (
  <svg width={20} height={20} viewBox="0 0 20 20">
    {promptIconPaths[name]}
  </svg>
);

export const StatusBarIcons: React.FC = () => (
  <svg width={70} height={13} viewBox="0 0 70 13" fill={C.ink}>
    {[0, 1, 2, 3].map((i) => (
      <rect
        key={i}
        x={i * 5}
        y={9 - i * 2.4}
        width={3.2}
        height={3 + i * 2.4}
        rx={1}
      />
    ))}
    <path
      d="M30 4.6a9 9 0 0 1 11 0M32.2 7.3a5.6 5.6 0 0 1 6.6 0M35.5 10.2l1.5-1.4"
      stroke={C.ink}
      strokeWidth={1.6}
      strokeLinecap="round"
      fill="none"
    />
    <rect
      x={51}
      y={2}
      width={17}
      height={9}
      rx={2.6}
      stroke={C.ink}
      strokeOpacity={0.4}
      strokeWidth={1}
      fill="none"
    />
    <rect x={52.6} y={3.6} width={12} height={5.8} rx={1.5} />
    <path
      d="M69.4 5.4v2.4"
      stroke={C.ink}
      strokeOpacity={0.4}
      strokeWidth={1.6}
    />
  </svg>
);

/** Ionicons "close" — the preview sheet's dismiss control. */
export const CloseIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M6 6l12 12M18 6L6 18"
      stroke={C.ink}
      strokeWidth={2}
      strokeLinecap="round"
    />
  </svg>
);

/** Ionicons "share-outline" — sits next to the dismiss control. */
export const ShareIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3v12M12 3L8.2 6.8M12 3l3.8 3.8"
      stroke={C.ink}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.5 10.5H5.2A1.2 1.2 0 0 0 4 11.7v7.1A1.2 1.2 0 0 0 5.2 20h13.6a1.2 1.2 0 0 0 1.2-1.2v-7.1a1.2 1.2 0 0 0-1.2-1.2h-1.3"
      stroke={C.ink}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
