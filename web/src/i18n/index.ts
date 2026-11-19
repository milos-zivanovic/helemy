import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import type { components } from '../api/schema'
import en from './locales/en.json'
import sr from './locales/sr.json'

export const LANGUAGES = { sr: 'Srpski', en: 'English' } as const
export type Language = keyof typeof LANGUAGES

type ApiLanguage = components['schemas']['LanguageEnum']

/**
 * The app's languages as the API knows them (Django's settings.LANGUAGES): sent in
 * Accept-Language and stored as User.language. Plain "sr" would be Cyrillic to Django.
 */
export const API_LANGUAGES: Record<Language, ApiLanguage> = { sr: 'sr-latn', en: 'en' }

/** An API language code ("sr-latn") → the app's ("sr"); undefined for one the app doesn't have. */
export function fromApiLanguage(code: string | undefined): Language | undefined {
  return (Object.keys(API_LANGUAGES) as Language[]).find((key) => API_LANGUAGES[key] === code)
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { sr: { translation: sr }, en: { translation: en } },
    supportedLngs: Object.keys(LANGUAGES),
    nonExplicitSupportedLngs: true, // the browser's "sr-Latn-RS" or "en-US" maps to "sr" / "en"
    fallbackLng: 'en', // like the API (LANGUAGE_CODE, User.language)
    detection: {
      // A choice made in the app wins over the browser's language and is remembered.
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'language',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false }, // React already escapes rendered text
  })

// Keep <html lang> in sync (screen readers, spell checking, hyphenation).
const syncHtmlLang = (lng: string) => {
  document.documentElement.lang = lng
}
syncHtmlLang(i18n.resolvedLanguage ?? 'en')
i18n.on('languageChanged', syncHtmlLang)

export default i18n
