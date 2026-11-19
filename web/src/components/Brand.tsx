import { useTranslation } from 'react-i18next'

// Importing an image gives its URL. Vite copies the file into the build with a content hash in the
// name (logo-3fa1c2.png), so browsers can cache it forever and still get a new logo when it
// changes, like Django's ManifestStaticFilesStorage. Source: branding/logo.png (see its README).
import logo from '../assets/logo.png'

// The app's logo and name, at the top of every page. `compact`: the logo alone (phone top bar); the
// name stays for screen readers.
export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <span className="flex items-center gap-2.5">
      {/* alt="": the name next to it already says what it is (no double reading by screen readers) */}
      <img src={logo} alt="" width={36} height={36} className="size-9 rounded-xl" />
      <span className={compact ? 'sr-only' : 'text-lg font-semibold tracking-tight'}>
        {t('app.title')}
      </span>
    </span>
  )
}
