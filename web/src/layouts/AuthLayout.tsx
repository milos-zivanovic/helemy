import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation } from 'react-router'

import { useIsLoggedIn } from '../auth/useAuth'
import { Brand } from '../components/Brand'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { LandingNav, LandingSections } from '../landing/LandingSections'

// Location state set by AppLayout when it sends a logged-out user to /login.
export type AuthRedirectState = { from?: { pathname: string; search: string } } | null

// The public one-page website, the same on /, /login, /register and the password reset pages. Like a
// base template that the pages "extend": the hero's card is the {% block content %} the matched route
// fills in (<Outlet />), everything around it stays.
export function AuthLayout() {
  const { t } = useTranslation()
  const isLoggedIn = useIsLoggedIn()
  const location = useLocation()

  // A link to another form ("Create an account" at the bottom of the page) changes the route but not
  // the scroll position, so go back up to the card. The header's anchors change only the #hash.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.pathname])

  // Already logged in (or just logged in on this page): go to the page the user originally wanted.
  // This is the only place that redirects after login and sign up, so the pages don't have to.
  if (isLoggedIn) {
    const from = (location.state as AuthRedirectState)?.from
    return <Navigate to={from ? from.pathname + from.search : '/home'} replace />
  }

  return (
    <div className="min-h-screen bg-white">
      {/* sticky: stays at the top while scrolling; backdrop-blur frosts what scrolls under it */}
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#top" aria-label={t('app.title')}>
            <Brand />
          </a>
          <LandingNav />
          <LanguageSwitcher compact />
        </div>
      </header>

      {/* Hero: the pitch on the left, the form on the right (below the pitch on a phone) */}
      <section id="top" className="relative scroll-mt-16 overflow-hidden">
        {/* Two blurred circles in the logo's colours behind the card: decoration only */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="bg-brand-200/50 absolute -top-32 -left-24 size-96 rounded-full blur-3xl" />
          <div className="bg-accent-200/50 absolute -top-24 -right-24 size-96 rounded-full blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <div>
            <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
              {t('landing.hero.eyebrow')}
            </p>
            {/* h2: the form's title in the card is the page's h1 (as before the website) */}
            <h2 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              {t('landing.hero.title')}
            </h2>
            <p className="mt-4 max-w-xl text-lg text-pretty text-slate-600">
              {t('landing.hero.subtitle')}
            </p>
          </div>
          <main className="surface shadow-brand-500/5 mx-auto w-full max-w-md p-6 shadow-lg sm:p-8">
            <Outlet />
          </main>
        </div>
      </section>

      <LandingSections />
    </div>
  )
}
