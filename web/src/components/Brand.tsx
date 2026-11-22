import { useTranslation } from 'react-i18next'

// Importing an image gives its URL. Vite copies the file into the build with a content hash in the
// name (logo-3fa1c2.png), so browsers can cache it forever and still get a new logo when it
// changes, like Django's ManifestStaticFilesStorage. Source: branding/logo.png (see its README).
import logo from '../assets/logo.png'

// The app's logo and name, at the top of every page. `compact`: the logo alone (phone top bar); the
// name stays for screen readers. `large`: 25 % bigger (45 px instead of 36), for the side menu.
export function Brand({ compact = false, large = false }: { compact?: boolean; large?: boolean }) {
  const { t } = useTranslation()
  const px = large ? 45 : 36
  return (
    <span className={`flex items-center ${large ? 'gap-3' : 'gap-2.5'}`}>
      {/* alt="": the name next to it already says what it is (no double reading by screen readers) */}
      <img
        src={logo}
        alt=""
        width={px}
        height={px}
        className={`rounded-xl ${large ? 'size-11.25' : 'size-9'}`}
      />
      <span
        className={
          compact ? 'sr-only' : `font-semibold tracking-tight ${large ? 'text-xl' : 'text-lg'}`
        }
      >
        {t('app.title')}
      </span>
    </span>
  )
}
