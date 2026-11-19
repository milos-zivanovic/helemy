import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'

import { SectionHeader } from '../components/SectionHeader'

// Frame of the nutrition section: a heading and tabs, the pages render in <Outlet />.
export function NutritionLayout() {
  const { t } = useTranslation()
  const tabs = [
    { to: '/nutrition/diary', label: t('nutrition.tabs.diary') },
    { to: '/nutrition/foods', label: t('nutrition.tabs.foods') },
  ]

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={t('nutrition.title')} tabs={tabs} />
      <Outlet />
    </div>
  )
}
