import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'

import { useIsLoggedIn, useLogout, useMe } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Brand } from '../components/Brand'
import { Button } from '../components/Button'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useActiveHousehold, useInvitations } from '../household/hooks'
import type { AuthRedirectState } from './AuthLayout'

// Frame for every page that needs a logged-in user: the equivalent of LoginRequiredMixin plus the base
// template with the header and navigation. Child routes render in <Outlet />.
export function AppLayout() {
  const { t } = useTranslation()
  const isLoggedIn = useIsLoggedIn()
  const location = useLocation()
  const me = useMe()

  if (!isLoggedIn) {
    // Remember where the user was going (like Django's ?next=), AuthLayout sends them back after login.
    const state: AuthRedirectState = {
      from: { pathname: location.pathname, search: location.search },
    }
    return <Navigate to="/login" replace state={state} />
  }

  let content
  if (me.isPending) {
    content = <p className="text-sm text-slate-600">{t('common.loading')}</p>
  } else if (me.isError) {
    content = (
      <Alert tone="error">
        {t('errors.loadProfile')}{' '}
        <button className="font-medium underline" onClick={() => void me.refetch()}>
          {t('common.retry')}
        </button>
      </Alert>
    )
  } else {
    content = <Outlet />
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Header />
      <main className="mx-auto max-w-3xl p-4 sm:p-6">{content}</main>
    </div>
  )
}

// Components can be split up within one file; only AppLayout is used elsewhere.
function Header() {
  const { t } = useTranslation()
  const { data: me } = useMe()
  const household = useActiveHousehold()
  const invitations = useInvitations()
  const logout = useLogout()
  const pendingCount = invitations.data?.received.length ?? 0

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" aria-label={t('nav.home')}>
            <Brand />
          </Link>
          {household && <span className="truncate text-xs text-slate-500">{household.name}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {me && (
            <Link to="/profile" className="hidden text-sm text-slate-600 hover:underline sm:inline">
              {me.email}
            </Link>
          )}
          <LanguageSwitcher />
          <Button variant="secondary" onClick={() => void logout()}>
            {t('auth.logout')}
          </Button>
        </div>
        {/* basis-full puts the navigation on its own row */}
        <nav className="flex basis-full gap-1 overflow-x-auto">
          <NavItem to="/" end>
            {t('nav.home')}
          </NavItem>
          <NavItem to="/finances">{t('nav.finances')}</NavItem>
          <NavItem to="/fitness">{t('nav.fitness')}</NavItem>
          <NavItem to="/nutrition">{t('nav.nutrition')}</NavItem>
          <NavItem to="/household">
            {t('nav.household')}
            {pendingCount > 0 && (
              <span
                className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white"
                aria-label={t('nav.pendingInvitations', { n: pendingCount })}
              >
                {pendingCount}
              </span>
            )}
          </NavItem>
          <NavItem to="/profile">{t('nav.profile')}</NavItem>
        </nav>
      </div>
    </header>
  )
}

// NavLink is a <Link> that knows whether its URL is the current page and styles itself as active.
// `end` makes "/" active only on the start page itself, not on every page below it.
function NavItem({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
          isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
