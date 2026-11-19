import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation } from 'react-router'

import { SectionHeader } from '../components/SectionHeader'
import { segmentedOption, segmentedTrack } from '../components/segmented'

// Pages under the "Settings" tab: set up once, opened rarely. Their URLs stay as they are
// (/finances/accounts, /finances/categories, ...); only the navigation groups them.
const SETTINGS = ['/finances/accounts', '/finances/categories']

// Frame of the finance section: a heading and tabs, the pages render in <Outlet />.
export function FinancesLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const inSettings = SETTINGS.some((prefix) => pathname.startsWith(prefix))
  // Transactions first: the section opens on them (/finances → /finances/transactions, router.tsx).
  const tabs = [
    {
      to: '/finances/transactions',
      label: t('finances.tabs.transactions'),
      // A transfer opens from the transaction list, so its pages belong to this tab too.
      active:
        pathname.startsWith('/finances/transactions') || pathname.startsWith('/finances/transfers'),
    },
    { to: '/finances/budgets', label: t('finances.tabs.budgets') },
    { to: '/finances/reports', label: t('finances.tabs.reports') },
    // One tab for several URLs, so "active" is computed here instead of by NavLink.
    { to: '/finances/accounts', label: t('finances.tabs.settings'), active: inSettings },
  ]

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={t('finances.title')} tabs={tabs} />
      {inSettings && <SettingsNav />}
      <Outlet />
    </div>
  )
}

// Second level inside "Settings": accounts and categories.
function SettingsNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const inCategories = pathname.startsWith('/finances/categories')
  const items = [
    { to: '/finances/accounts', label: t('finances.tabs.accounts'), active: !inCategories },
    { to: '/finances/categories', label: t('finances.tabs.categories'), active: inCategories },
  ]
  return (
    <nav className={`${segmentedTrack} self-start`}>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} className={segmentedOption(item.active)}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
