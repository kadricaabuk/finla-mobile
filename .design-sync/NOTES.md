# Finla Design System — Sync Notes

## Setup

This is a bespoke web React design system created from the finla React Native app's visual identity. It is NOT converting an existing component library — the `finla-web-ds/` package was authored from scratch for the landing page.

- Source package: `finla-web-ds/` (in the finla repo root)
- Build: `cd finla-web-ds && node build.mjs` (uses esbuild installed in `finla-web-ds/node_modules/`)
- Node modules for converter: `finla-web-ds/node_modules` (React is here)
- Build entry: `finla-web-ds/dist/index.esm.js`

## Known render warns

- `[RENDER_SKIPPED]` — User opted out of Playwright render verification on first sync. Previews were not machine-verified; they render from authored `.design-sync/previews/*.tsx` files.
- `[CSS_RUNTIME]` — Expected. Components use inline styles (no CSS class system). The `styles.css` ships only CSS custom property token definitions. Non-blocking.

## Re-sync risks

- **esbuild version drift**: `finla-web-ds/node_modules/esbuild` pins the build. Upgrade carefully — esbuild minor versions can change tree-shaking behavior.
- **React version**: Finla uses React 19.x (via RN). The web DS uses the same react version. If finla upgrades React, re-check the vendor bundle.
- **Inline style convention**: All components use `style={}` objects, not CSS classes. A future change to CSS Modules or a CSS-in-JS lib would require re-authoring previews.
- **cssEntry path**: Set to `"src/styles.css"` (relative to package dir `finla-web-ds/`). If the package directory is renamed, update config.
- **Font**: "SF Pro Display" is in the font stack as a hint; `runtimeFontPrefixes` suppresses the `[FONT_MISSING]` warning. The actual rendering falls back to system-ui/sans-serif on non-Apple devices — acceptable for a landing page DS.
- **Component group**: All 14 components are in group `general`. If you want sub-groups (Brand / Layout / Landing), add `.md` doc files with `category:` frontmatter and rebuild.

## Re-sync command

```bash
node .ds-sync/package-build.mjs \
  --config .design-sync/config.json \
  --node-modules ./finla-web-ds/node_modules \
  --entry ./finla-web-ds/dist/index.esm.js \
  --out ./ds-bundle

node .ds-sync/package-validate.mjs ./ds-bundle --no-render-check
```
