import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation } from 'react-router'

import { useIsLoggedIn } from '../auth/useAuth'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

// Location state set by AppLayout when it sends a logged-out user to /login.
export type AuthRedirectState = { from?: { pathname: string; search: string } } | null

// Frame for the public pages (login, sign up, password reset). Like a base template that the pages
// "extend": <Outlet /> is the {% block content %} the matched child route fills in.
export function AuthLayout() {
  const { t } = useTranslation()
  const isLoggedIn = useIsLoggedIn()
  const location = useLocation()

  // Already logged in (or just logged in on this page): go to the page the user originally wanted.
  // This is the only place that redirects after login and sign up, so the pages don't have to.
  if (isLoggedIn) {
    const from = (location.state as AuthRedirectState)?.from
    return <Navigate to={from ? from.pathname + from.search : '/'} replace />
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-100 px-4 py-10 text-slate-900">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-lg font-semibold">{t('app.title')}</span>
          <LanguageSwitcher />
        </div>
        <main className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
