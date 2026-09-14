/**
 * Avatar monogram: "Acme Yazılım Ltd. Şti." → "AY", single word → first two
 * letters. Uses the tr-TR locale for Turkish uppercasing rules (i → İ).
 */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const raw =
    words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return raw.toLocaleUpperCase("tr-TR");
}
