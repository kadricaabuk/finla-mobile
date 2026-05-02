export function hasMarkdownTable(text: string): boolean {
  return /^\|.*\|$/m.test(text);
}
