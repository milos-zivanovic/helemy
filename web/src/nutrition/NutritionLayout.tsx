import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'

// Frame of the nutrition section: a heading and tabs, the pages render in <Outlet />.
export function NutritionLayout() {
  const { t } = useTranslation()
  const tabs = [
    { to: '/nutrition/diary', label: t('nutrition.tabs.diary') },
    { to: '/nutrition/foods', label: t('nutrition.tabs.foods') },
  ]

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('nutrition.title')}</h1>
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
