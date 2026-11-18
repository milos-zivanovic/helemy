import { useTranslation } from 'react-i18next'

import { errorMessage } from '../api/errors'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmButton } from '../components/ConfirmButton'
import { useAcceptInvitation, useDeclineInvitation, useInvitations } from './hooks'

// Invitations other households sent to this user. Renders nothing when there are none.
export function ReceivedInvitations() {
  const { t } = useTranslation()
  const { data } = useInvitations()
  const accept = useAcceptInvitation()
  const decline = useDeclineInvitation()
  const busy = accept.isPending || decline.isPending

  if (!data || data.received.length === 0) return null

  // A mutation keeps its last error until it runs again; show whichever failed.
  const error = accept.error ?? decline.error

  return (
    <Card title={t('household.received.title')}>
      {error && (
        <div className="mb-4">
          <Alert tone="error">{errorMessage(error, t)}</Alert>
        </div>
      )}
      <ul className="flex flex-col gap-4">
        {data.received.map((invitation) => (
          // key: React's way to match list items between renders (like a primary key for each row).
          <li key={invitation.id} className="flex flex-col gap-3 rounded-md bg-slate-50 p-3">
            <p className="text-sm">
              {t('household.received.text', {
                who: invitation.invited_by.full_name || invitation.invited_by.email,
                household: invitation.household.name,
              })}
            </p>
            <p className="text-xs text-slate-500">{t('household.received.warning')}</p>
            <div className="flex flex-wrap gap-2">
              <ConfirmButton
                variant="primary"
                question={t('household.received.confirm')}
                disabled={busy}
                onConfirm={() => accept.mutate(invitation.id)}
              >
                {t('household.received.accept')}
              </ConfirmButton>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => decline.mutate(invitation.id)}
              >
                {t('household.received.decline')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
