import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { publicApi } from '../api/client'
import { setTokens } from '../auth/tokens'
import { Alert } from '../components/Alert'
import { TextLink } from '../components/TextLink'

// The page the verification email links to (/verify-email?token=…). It posts the token right away;
// the API confirms the email and returns tokens, so the user is logged in and AuthLayout redirects.
export function VerifyEmailPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token')
  const [apiError, setError] = useState<string | null>(null)
  const error = token ? apiError : t('auth.verify.missingToken')
  // The link works only once. In development React's StrictMode runs effects twice; a ref survives
  // that (unlike state set in the effect), so the token is posted a single time.
  const posted = useRef(false)

  useEffect(() => {
    if (!token || posted.current) return
    posted.current = true
    publicApi
      .POST('/api/auth/email/verify/', { body: { token } })
      .then(({ data, error: body }) => {
        // Logged in: AuthLayout notices and goes to /home.
        if (data) setTokens(data)
        else setError(tokenError(body) ?? t('auth.reset.invalidLink'))
      })
      .catch(() => setError(t('errors.network')))
  }, [token, t])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('auth.verify.title')}</h1>
      {error ? (
        <>
          <Alert tone="error">{error}</Alert>
          {/* On login, an unconfirmed account can ask for a new link */}
          <p className="text-sm text-slate-600">{t('auth.verify.newLinkHint')}</p>
          <TextLink to="/login" className="text-sm">
            {t('auth.backToLogin')}
          </TextLink>
        </>
      ) : (
        <p className="text-sm text-slate-600">{t('auth.verify.verifying')}</p>
      )}
    </div>
  )
}

// The API's message for a bad token: {"token": ["..."]} (already translated by Accept-Language).
function tokenError(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('token' in body)) return null
  const messages = (body as { token: unknown }).token
  return Array.isArray(messages) ? messages.join(' ') : String(messages)
}
