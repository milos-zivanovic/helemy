import { useTranslation } from 'react-i18next'

import { LANGUAGES, type Language } from '../i18n'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()

  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      {t('language.label')}
      <select
        className="rounded-md border border-slate-300 bg-white px-2 py-1"
        value={i18n.resolvedLanguage}
        onChange={(event) => void i18n.changeLanguage(event.target.value as Language)}
      >
        {Object.entries(LANGUAGES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}
