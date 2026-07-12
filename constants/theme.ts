/**
 * finla design tokens — the single source of truth across screens.
 * Before adding a new gray tone / corner radius / font size, use the
 * closest existing value here.
 */
export const colors = {
  ink: "#000000", // primary text, filled buttons, active chip
  text: "#111111", // body text
  label: "#333333", // row labels, secondary emphasis
  muted: "#888888", // secondary text
  faint: "#ABABAB", // tertiary text, inactive icons
  border: "#E0E0E0", // prominent borders (chip, input)
  hairline: "#E8E8E8", // thin separators
  surface: "#FAFAFA", // card background
  surfaceAlt: "#F5F5F5", // info boxes
  pressed: "#F0F0F0", // pressed / active background
  background: "#FFFFFF",
  danger: "#EF4444",
  success: "#22C55E",
  warning: "#F59E0B",
} as const;

/** Corner radii: sm input/bar, md button/nav row, lg card, pill chip/avatar. */
export const radius = {
  sm: 8,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/** Spacing scale — padding/margin/gap values derive from here. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** Font-size scale: caption section label, meta date/number, small secondary
 * body, label button/row name, body text, amount row total, title screen
 * title, display single large numeral (summary total). */
export const typeScale = {
  caption: 11,
  meta: 12,
  small: 13,
  label: 14,
  body: 15,
  amount: 17,
  title: 18,
  display: 22,
} as const;
