import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'

import { SectionHeader } from '../components/SectionHeader'

// Frame of the fitness section: a heading and tabs, the pages render in <Outlet />.
export function FitnessLayout() {
  const { t } = useTranslation()
  const tabs = [
    { to: '/fitness/trainings', label: t('fitness.tabs.trainings') },
    { to: '/fitness/exercises', label: t('fitness.tabs.exercises') },
  ]

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={t('fitness.title')} tabs={tabs} />
      <Outlet />
    </div>
  )
}
