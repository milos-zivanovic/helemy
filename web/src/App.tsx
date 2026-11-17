import { useTranslation } from 'react-i18next'

import { ApiStatus } from './components/ApiStatus'
import { LanguageSwitcher } from './components/LanguageSwitcher'

export default function App() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">{t('app.title')}</h1>
        <LanguageSwitcher />
      </header>
      <main className="mx-auto max-w-xl p-6">
        <ApiStatus />
      </main>
    </div>
  )
}
