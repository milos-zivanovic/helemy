import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation } from 'react-router'

// Pages under the "Settings" tab: set up once, opened rarely. Their URLs stay as they are
// (/finances/accounts, /finances/categories, ...); only the navigation groups them.
const SETTINGS = ['/finances/accounts', '/finances/categories']

const tabClass = (active: boolean) =>
  `-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
    active
      ? 'border-slate-900 text-slate-900'
      : 'border-transparent text-slate-600 hover:text-slate-900'
  }`

// Frame of the finance section: a heading and tabs, the pages render in <Outlet />.
export function FinancesLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const inSettings = SETTINGS.some((prefix) => pathname.startsWith(prefix))
  // `also`: other URLs that belong to the tab (a transfer opens from the transaction list).
  const tabs = [
    { to: '/finances/budgets', label: t('finances.tabs.budgets') },
    {
      to: '/finances/transactions',
      label: t('finances.tabs.transactions'),
      also: '/finances/transfers',
    },
    { to: '/finances/reports', label: t('finances.tabs.reports') },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('finances.title')}</h1>
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => (
          // NavLink passes isActive to className: true when the URL starts with `to`
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              tabClass(isActive || (tab.also !== undefined && pathname.startsWith(tab.also)))
            }
          >
            {tab.label}
          </NavLink>
        ))}
        {/* One tab for several URLs, so "active" is computed here instead of by NavLink */}
        <NavLink to="/finances/accounts" className={tabClass(inSettings)}>
          {t('finances.tabs.settings')}
        </NavLink>
      </nav>
      {inSettings && <SettingsNav />}
      <Outlet />
    </div>
  )
}

// Second level inside "Settings": accounts and categories.
function SettingsNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const items = [
    {
      to: '/finances/accounts',
      label: t('finances.tabs.accounts'),
      active: !pathname.startsWith('/finances/categories'),
    },
    {
      to: '/finances/categories',
      label: t('finances.tabs.categories'),
      active: pathname.startsWith('/finances/categories'),
    },
  ]
  return (
    <nav className="flex gap-2">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={`rounded-md px-3 py-1 text-sm font-medium ${
            item.active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
