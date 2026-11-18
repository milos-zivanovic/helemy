import { useTranslation } from 'react-i18next'

// Importing an image gives its URL. Vite copies the file into the build with a content hash in the
// name (logo-3fa1c2.png), so browsers can cache it forever and still get a new logo when it
// changes, like Django's ManifestStaticFilesStorage. Source: branding/logo.png (see its README).
import logo from '../assets/logo.png'

// The app's logo and name, at the top of every page.
export function Brand() {
  const { t } = useTranslation()
  return (
    <span className="flex items-center gap-2">
      {/* alt="": the name next to it already says what it is (no double reading by screen readers) */}
      <img src={logo} alt="" width={32} height={32} className="size-8 rounded-lg" />
      <span className="text-lg font-semibold">{t('app.title')}</span>
    </span>
  )
}
