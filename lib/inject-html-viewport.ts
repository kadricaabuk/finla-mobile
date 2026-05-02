export function injectHtmlViewport(html: string): string {
  if (!html) return html;
  const meta =
    '<meta name="viewport" content="width=device-width, initial-scale=0.65, maximum-scale=3.0">';
  if (html.includes("viewport")) return html;
  if (html.includes("<head>")) return html.replace("<head>", `<head>${meta}`);
  if (html.includes("<HEAD>")) return html.replace("<HEAD>", `<HEAD>${meta}`);
  return `<html><head>${meta}</head><body>${html}</body></html>`;
}
