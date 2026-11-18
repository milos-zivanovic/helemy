import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'

// Frame of the finance section: a heading and tabs, the pages render in <Outlet />.
export function FinancesLayout() {
  const { t } = useTranslation()
  const tabs = [
    { to: '/finances/transactions', label: t('finances.tabs.transactions') },
    { to: '/finances/accounts', label: t('finances.tabs.accounts') },
    { to: '/finances/budgets', label: t('finances.tabs.budgets') },
    { to: '/finances/categories', label: t('finances.tabs.categories') },
    { to: '/finances/reports', label: t('finances.tabs.reports') },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('finances.title')}</h1>
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
                isActive
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
