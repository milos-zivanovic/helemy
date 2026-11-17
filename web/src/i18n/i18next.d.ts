import 'i18next'

import type sr from './locales/sr.json'

// Makes t('...') keys type-checked against sr.json: a missing or misspelled key is a compile error.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof sr }
  }
}
