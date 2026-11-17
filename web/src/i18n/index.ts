import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import sr from './locales/sr.json'

export const LANGUAGES = { sr: 'Srpski', en: 'English' } as const
export type Language = keyof typeof LANGUAGES

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { sr: { translation: sr }, en: { translation: en } },
    supportedLngs: Object.keys(LANGUAGES),
    nonExplicitSupportedLngs: true, // the browser's "sr-Latn-RS" or "en-US" maps to "sr" / "en"
    fallbackLng: 'sr',
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
syncHtmlLang(i18n.resolvedLanguage ?? 'sr')
i18n.on('languageChanged', syncHtmlLang)

export default i18n
