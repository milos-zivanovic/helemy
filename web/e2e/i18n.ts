import { readFileSync } from 'node:fs'

// The tests find elements by the text the user sees (labels, button names), taken from the app's
// translation files instead of typed out: a reworded label doesn't break them, only a changed flow
// does. Serbian unless a step switches the app's language.
const load = (language: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../src/i18n/locales/${language}.json`, import.meta.url), 'utf-8'),
  )
const messages = { sr: load('sr'), en: load('en') }

/** The text of a translation key, like t() in the app: tr('home.greeting', { name }). */
export function tr(
  key: string,
  values: Record<string, string> = {},
  language: keyof typeof messages = 'sr',
): string {
  let message: unknown = messages[language]
  for (const part of key.split('.')) {
    message = (message as Record<string, unknown> | undefined)?.[part]
  }
  if (typeof message !== 'string') throw new Error(`Missing translation key: ${key}`)
  return message.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => values[name] ?? '')
}
