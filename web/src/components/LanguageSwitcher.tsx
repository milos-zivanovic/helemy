import { useTranslation } from 'react-i18next'

import { LANGUAGES, type Language } from '../i18n'
import { Icon } from './Icon'

// `compact`: for the phone's top bar, only a globe and the language code ("SR"); the label is still
// there for screen readers (and tests), just not shown.
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation()

  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      {compact ? <Icon name="globe" className="size-4 text-slate-400" /> : null}
      <span className={compact ? 'sr-only' : ''}>{t('language.label')}</span>
      <select
        className="focus:border-brand-400 focus:ring-brand-100 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm shadow-xs outline-none focus:ring-3"
        value={i18n.resolvedLanguage}
        onChange={(event) => void i18n.changeLanguage(event.target.value as Language)}
      >
        {Object.entries(LANGUAGES).map(([code, name]) => (
          <option key={code} value={code}>
            {compact ? code.toUpperCase() : name}
          </option>
        ))}
      </select>
    </label>
  )
}
