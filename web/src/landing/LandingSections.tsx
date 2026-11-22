import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { LinkButton } from '../components/Button'
import { Icon, type IconName } from '../components/Icon'

// The ids of the sections the header links to (<a href="#modules">), in page order.
const LINKED_SECTIONS = ['modules', 'how', 'contact'] as const

// Read once when the file loads: calling Date in render would make the component impure.
const YEAR = new Date().getFullYear()

// Placeholder until there's a real address.
const CONTACT_EMAIL = 'kontakt@helemy.com'

// `key` as a union of the four names (not any string), so `t()` can check the keys built from it.
const MODULES: { key: 'finances' | 'fitness' | 'nutrition' | 'household'; icon: IconName }[] = [
  { key: 'finances', icon: 'wallet' },
  { key: 'fitness', icon: 'dumbbell' },
  { key: 'nutrition', icon: 'apple' },
  { key: 'household', icon: 'users' },
]

const STEPS = ['account', 'track', 'progress'] as const

// The header's links to the sections (from a tablet up; a phone just scrolls).
export function LandingNav() {
  const { t } = useTranslation()
  return (
    <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
      {LINKED_SECTIONS.map((id) => (
        <a key={id} href={`#${id}`} className="hover:text-slate-900">
          {t(`landing.nav.${id}`)}
        </a>
      ))}
    </nav>
  )
}

// Everything on the website below the hero: static content, only texts from i18n.
export function LandingSections() {
  const { t } = useTranslation()

  return (
    <>
      {/* scroll-mt: the sticky header doesn't cover the heading after a jump to the anchor */}
      <section id="modules" className="scroll-mt-16 bg-slate-50/70 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle title={t('landing.modules.title')} text={t('landing.modules.subtitle')} />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map(({ key, icon }) => (
              <div key={key} className="surface p-6">
                <span className="bg-brand-50 text-brand-600 inline-flex size-11 items-center justify-center rounded-xl">
                  <Icon name={icon} className="size-6" />
                </span>
                <h3 className="mt-4 font-semibold">{t(`landing.modules.${key}.title`)}</h3>
                <p className="mt-2 text-sm text-slate-600">{t(`landing.modules.${key}.text`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-16 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle title={t('landing.how.title')} />
          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step} className="flex flex-col items-start">
                <span className="bg-brand-gradient inline-flex size-10 items-center justify-center rounded-full font-semibold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold">{t(`landing.how.${step}.title`)}</h3>
                <p className="mt-2 text-sm text-slate-600">{t(`landing.how.${step}.text`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 sm:px-6">
        <div className="bg-brand-gradient mx-auto max-w-6xl rounded-3xl px-6 py-12 text-center text-white sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('landing.cta.title')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/85">{t('landing.cta.text')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton to="/register" variant="secondary">
              {t('landing.cta.register')}
            </LinkButton>
            {/* An outline on the gradient: none of the button variants fits there */}
            <Link
              to="/login"
              className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white ring-1 ring-white/50 transition-colors hover:bg-white/15"
            >
              {t('landing.cta.login')}
            </Link>
          </div>
        </div>
      </section>

      <section id="contact" className="scroll-mt-16 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{t('landing.about.title')}</h2>
            <p className="mt-3 text-slate-600">{t('landing.about.text')}</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{t('landing.contact.title')}</h2>
            <p className="mt-3 text-slate-600">{t('landing.contact.text')}</p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-brand-600 hover:text-brand-700 mt-3 inline-block font-medium hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        {t('landing.footer', { year: YEAR })}
      </footer>
    </>
  )
}

function SectionTitle({ title, text }: { title: string; text?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
      {text && <p className="mt-3 text-slate-600">{text}</p>}
    </div>
  )
}
