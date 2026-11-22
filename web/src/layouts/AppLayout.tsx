import { useTranslation } from 'react-i18next'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'

import { useIsLoggedIn, useLogout, useMe, useSyncLanguage } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Avatar } from '../components/Avatar'
import { Brand } from '../components/Brand'
import { Button } from '../components/Button'
import { Icon, type IconName } from '../components/Icon'
import { useActiveHousehold, useInvitations } from '../household/hooks'
import { DESKTOP, useMediaQuery } from '../lib/useMediaQuery'
import type { AuthRedirectState } from './AuthLayout'

// Frame for every page that needs a logged-in user: the equivalent of LoginRequiredMixin plus the base
// template with the navigation. Child routes render in <Outlet />.
// From a laptop up (lg, 1024 px) the navigation is a sidebar on the left and the page uses the rest of
// the width; on a phone or tablet it's a bar at the top (logo, language, logout, profile) and the
// sections at the bottom, within reach of the thumb, like in a mobile app.
export function AppLayout() {
  const { t } = useTranslation()
  const isLoggedIn = useIsLoggedIn()
  const location = useLocation()
  const me = useMe()
  const desktop = useMediaQuery(DESKTOP)
  useSyncLanguage() // hooks run on every render, before any early return (rules of hooks)

  if (!isLoggedIn) {
    // Remember where the user was going (like Django's ?next=), AuthLayout sends them back after login.
    const state: AuthRedirectState = {
      from: { pathname: location.pathname, search: location.search },
    }
    return <Navigate to="/login" replace state={state} />
  }

  let content
  if (me.isPending) {
    content = <p className="text-sm text-slate-500">{t('common.loading')}</p>
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
    <div className="min-h-screen bg-white">
      {desktop ? <Sidebar /> : <TopBar />}
      <div className={desktop ? 'pl-64' : ''}>
        {/* pb-28 on a phone: room for the bottom bar, so it never covers the end of a page */}
        <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:py-10">
          {content}
        </main>
      </div>
      {!desktop && <BottomBar />}
    </div>
  )
}

type Section = { to: string; label: string; icon: IconName; badge?: number }

// The sections of the app, the same in the sidebar and the bottom bar.
function useSections(): Section[] {
  const { t } = useTranslation()
  const invitations = useInvitations()
  return [
    { to: '/home', label: t('nav.home'), icon: 'home' },
    { to: '/finances', label: t('nav.finances'), icon: 'wallet' },
    { to: '/fitness', label: t('nav.fitness'), icon: 'dumbbell' },
    { to: '/nutrition', label: t('nav.nutrition'), icon: 'apple' },
    {
      to: '/household',
      label: t('nav.household'),
      icon: 'users',
      badge: invitations.data?.received.length ?? 0,
    },
  ]
}

// Desktop: a fixed column on the left with the logo, the sections and, at the bottom, who is
// logged in, the language and logout.
function Sidebar() {
  const { t } = useTranslation()
  const { data: me } = useMe()
  const household = useActiveHousehold()
  const logout = useLogout()
  const sections = useSections()

  return (
    <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-slate-200 bg-slate-50/70">
      <div className="px-6 pt-6 pb-4">
        <Link to="/home" aria-label={t('nav.home')}>
          <Brand large />
        </Link>
        {household && (
          <p className="mt-3 truncate text-xs font-medium text-slate-500">{household.name}</p>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        {sections.map((section) => (
          <SidebarItem key={section.to} section={section} />
        ))}
        <SidebarItem section={{ to: '/profile', label: t('nav.profile'), icon: 'user' }} />
      </nav>

      <div className="flex flex-col gap-3 border-t border-slate-200 p-4">
        {me && (
          <Link
            to="/profile"
            className="flex min-w-0 items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white"
          >
            <Avatar
              firstName={me.first_name}
              lastName={me.last_name}
              email={me.email}
              src={me.avatar_url}
            />
            <span className="min-w-0">
              {/* "First Last" from the API; it falls back to the email when no name was entered */}
              <span className="block truncate text-sm font-medium text-slate-900">
                {me.full_name}
              </span>
              <span className="block truncate text-xs text-slate-500">{me.email}</span>
            </span>
          </Link>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" className="px-3" onClick={() => void logout()}>
            <Icon name="logout" className="size-4" />
            {t('auth.logout')}
          </Button>
        </div>
      </div>
    </aside>
  )
}

// NavLink is a <Link> that knows whether its URL is the current page and styles itself as active.
function SidebarItem({ section }: { section: Section }) {
  return (
    <NavLink
      to={section.to}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'text-brand-600 bg-white shadow-sm ring-1 ring-slate-200/80'
            : 'text-slate-600 hover:bg-white hover:text-slate-900'
        }`
      }
    >
      <Icon name={section.icon} />
      {section.label}
      <Badge count={section.badge} />
    </NavLink>
  )
}

// Phone and tablet: logo and household on the left; language, logout and the profile on the right.
function TopBar() {
  const { t } = useTranslation()
  const { data: me } = useMe()
  const household = useActiveHousehold()
  const logout = useLogout()

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link to="/home" aria-label={t('nav.home')} className="flex min-w-0 items-center gap-2.5">
          <Brand compact />
          {household && (
            <span className="truncate text-sm font-medium text-slate-700">{household.name}</span>
          )}
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void logout()}
            aria-label={t('auth.logout')}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <Icon name="logout" />
          </button>
          {me && (
            <NavLink
              to="/profile"
              aria-label={t('nav.profile')}
              className={({ isActive }) =>
                `rounded-full ${isActive ? 'ring-brand-300 ring-2 ring-offset-2' : ''}`
              }
            >
              <Avatar
                firstName={me.first_name}
                lastName={me.last_name}
                email={me.email}
                src={me.avatar_url}
                className="size-8 text-xs"
              />
            </NavLink>
          )}
        </div>
      </div>
    </header>
  )
}

// Phone and tablet: the sections at the bottom of the screen, an icon over a short label.
// pb-[env(safe-area-inset-bottom)]: stays above the iPhone's home indicator.
function BottomBar() {
  const sections = useSections()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-5">
        {sections.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-1 px-1 pt-2.5 pb-2 text-[11px] font-medium transition-colors ${
                isActive ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* A short gradient line above the active section */}
                {isActive && (
                  <span className="bg-brand-gradient absolute top-0 h-0.5 w-8 rounded-full" />
                )}
                <span className="relative">
                  <Icon name={section.icon} className="size-6" />
                  {section.badge ? (
                    <span className="absolute -top-1 -right-2">
                      <Badge count={section.badge} />
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate">{section.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

// The number of pending household invitations, next to "Household".
function Badge({ count }: { count?: number }) {
  const { t } = useTranslation()
  if (!count) return null
  return (
    <span
      className="bg-accent-500 ml-auto rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white"
      aria-label={t('nav.pendingInvitations', { n: count })}
    >
      {count}
    </span>
  )
}
