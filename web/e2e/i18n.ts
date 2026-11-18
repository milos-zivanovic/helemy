import { readFileSync } from 'node:fs'

// The tests find elements by the text the user sees (labels, button names), taken from sr.json
// instead of typed out: a reworded label doesn't break them, only a changed flow does.
const sr: unknown = JSON.parse(
  readFileSync(new URL('../src/i18n/locales/sr.json', import.meta.url), 'utf-8'),
)

/** The Serbian text of a translation key, like t() in the app: tr('home.greeting', { name }). */
export function tr(key: string, values: Record<string, string> = {}): string {
  let message: unknown = sr
  for (const part of key.split('.')) {
    message = (message as Record<string, unknown> | undefined)?.[part]
  }
  if (typeof message !== 'string') throw new Error(`Missing translation key: ${key}`)
  return message.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => values[name] ?? '')
}
