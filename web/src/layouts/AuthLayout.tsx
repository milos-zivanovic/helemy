import { Navigate, Outlet, useLocation } from 'react-router'

import { useIsLoggedIn } from '../auth/useAuth'
import { Brand } from '../components/Brand'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

// Location state set by AppLayout when it sends a logged-out user to /login.
export type AuthRedirectState = { from?: { pathname: string; search: string } } | null

// Frame for the public pages (login, sign up, password reset). Like a base template that the pages
// "extend": <Outlet /> is the {% block content %} the matched child route fills in.
export function AuthLayout() {
  const isLoggedIn = useIsLoggedIn()
  const location = useLocation()

  // Already logged in (or just logged in on this page): go to the page the user originally wanted.
  // This is the only place that redirects after login and sign up, so the pages don't have to.
  if (isLoggedIn) {
    const from = (location.state as AuthRedirectState)?.from
    return <Navigate to={from ? from.pathname + from.search : '/'} replace />
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-white px-4 py-10 sm:py-16">
      {/* Two blurred circles in the logo's colours behind the card: decoration only */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-brand-200/50 absolute -top-32 -left-24 size-96 rounded-full blur-3xl" />
        <div className="bg-accent-200/50 absolute -top-24 -right-24 size-96 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Brand />
          <LanguageSwitcher />
        </div>
        <main className="surface shadow-brand-500/5 p-6 shadow-lg sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
