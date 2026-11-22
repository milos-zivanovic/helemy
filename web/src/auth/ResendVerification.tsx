import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { publicApi } from '../api/client'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'

type Status = 'idle' | 'sending' | 'sent' | 'throttled' | 'failed'

// "Send the link again" for an account whose email isn't confirmed yet (after sign up and on login).
// The API answers 204 whether or not it sent anything, so "sent" is all the page can say.
export function ResendVerification({ email }: { email: string }) {
  const { t } = useTranslation()
  // One state value with a few named cases instead of several booleans (sending, sent, error...).
  const [status, setStatus] = useState<Status>('idle')

  async function resend() {
    setStatus('sending')
    try {
      const { response } = await publicApi.POST('/api/auth/email/verify/resend/', {
        body: { email },
      })
      setStatus(response.ok ? 'sent' : response.status === 429 ? 'throttled' : 'failed')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {status === 'sent' && <Alert tone="success">{t('auth.verify.resent')}</Alert>}
      {status === 'throttled' && <Alert tone="error">{t('errors.throttled')}</Alert>}
      {status === 'failed' && <Alert tone="error">{t('errors.network')}</Alert>}
      <Button variant="secondary" disabled={status === 'sending'} onClick={() => void resend()}>
        {status === 'sending' ? t('common.sending') : t('auth.verify.resend')}
      </Button>
    </div>
  )
}
