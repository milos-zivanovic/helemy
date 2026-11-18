import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { errorMessage, showMutationError } from '../api/errors'
import type { Household } from '../api/types'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { TextField } from '../components/TextField'
import { useCancelInvitation, useInvitations, useInviteMember } from './hooks'

// Owner only: invite someone by email and see/cancel the invitations still waiting for an answer.
export function Invitations({ household }: { household: Household }) {
  const { t } = useTranslation()
  const invitations = useInvitations()
  const cancel = useCancelInvitation()
  const sent = invitations.data?.sent ?? []

  return (
    <Card title={t('household.invite.title')}>
      <p className="mb-4 text-sm text-slate-600">{t('household.invite.intro')}</p>
      <InviteForm householdId={household.id} />

      {sent.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold">{t('household.invite.pending')}</h3>
          {cancel.error && (
            <div className="mb-2">
              <Alert tone="error">{errorMessage(cancel.error, t)}</Alert>
            </div>
          )}
          <ul className="divide-y divide-slate-100">
            {sent.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0 truncate text-sm">{invitation.invited_user.email}</span>
                <Button
                  variant="secondary"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(invitation.id)}
                >
                  {t('household.invite.cancel')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function InviteForm({ householdId }: { householdId: number }) {
  const { t } = useTranslation()
  const invite = useInviteMember(householdId)
  const schema = useMemo(() => z.object({ email: z.email(t('validation.email')) }), [t])
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } })
  const [invited, setInvited] = useState<string | null>(null) // email of the last successful invite

  const onSubmit = handleSubmit(async ({ email }) => {
    setInvited(null)
    try {
      await invite.mutateAsync(email)
      setInvited(email)
      reset() // back to defaultValues: an empty field for the next invite
    } catch (error) {
      showMutationError(setError, error, ['email'], t)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      {invited && <Alert tone="success">{t('household.invite.sent', { email: invited })}</Alert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <TextField
            label={t('auth.fields.email')}
            type="email"
            autoComplete="off"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>
        <Button type="submit" disabled={isSubmitting} className="sm:mt-6">
          {t('household.invite.submit')}
        </Button>
      </div>
    </form>
  )
}
