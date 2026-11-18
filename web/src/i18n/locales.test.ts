import { describe, expect, it } from 'vitest'

import en from './locales/en.json'
import sr from './locales/sr.json'

// TypeScript checks t('...') keys only against sr.json (see i18next.d.ts), so a key missing from
// en.json would silently show the raw key to English users. This test closes that gap.

type Messages = { [key: string]: string | Messages }

/** { finances: { title: "..." } } → { "finances.title": "..." } */
function flatten(messages: Messages, prefix = ''): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') flat[path] = value
    else Object.assign(flat, flatten(value, path))
  }
  return flat
}

/** The {{placeholders}} a message expects, e.g. ["max"] for "At most {{max}} characters". */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((match) => match[1]).sort()
}

const locales = { sr: flatten(sr), en: flatten(en) }

describe('translations', () => {
  it('have the same keys in sr.json and en.json', () => {
    const srKeys = Object.keys(locales.sr)
    const enKeys = Object.keys(locales.en)
    expect({
      missingInEn: srKeys.filter((key) => !(key in locales.en)),
      missingInSr: enKeys.filter((key) => !(key in locales.sr)),
    }).toEqual({ missingInEn: [], missingInSr: [] })
  })

  it('use the same placeholders in both languages', () => {
    const mismatched = Object.keys(locales.sr)
      .filter((key) => key in locales.en)
      .filter(
        (key) => placeholders(locales.sr[key]).join() !== placeholders(locales.en[key]).join(),
      )
    expect(mismatched).toEqual([])
  })

  it('have no empty messages', () => {
    const empty = Object.entries(locales).flatMap(([language, messages]) =>
      Object.entries(messages)
        .filter(([, message]) => message.trim() === '')
        .map(([key]) => `${language}: ${key}`),
    )
    expect(empty).toEqual([])
  })
})
