import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { showMutationError } from '../api/errors'
import type { Household } from '../api/types'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { TextField } from '../components/TextField'
import { useRenameHousehold } from './hooks'

// Household name, the user's role and member count; the owner can rename it.
export function HouseholdDetails({ household }: { household: Household }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const isOwner = household.user_role === 'owner'

  return (
    <Card title={t('household.details.title')}>
      {editing ? (
        <RenameForm household={household} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">{t('household.details.name')}</dt>
            <dd className="font-medium">{household.name}</dd>
            <dt className="text-slate-500">{t('household.details.role')}</dt>
            <dd>{household.user_role ? t(`household.roles.${household.user_role}`) : '—'}</dd>
            <dt className="text-slate-500">{t('household.details.memberCount')}</dt>
            <dd>{household.member_count}</dd>
          </dl>
          {isOwner && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('household.details.rename')}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

function RenameForm({ household, onDone }: { household: Household; onDone: () => void }) {
  const { t } = useTranslation()
  const rename = useRenameHousehold(household.id)
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('validation.required'))
          .max(100, t('validation.maxLength', { max: 100 })),
      }),
    [t],
  )
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { name: household.name } })

  const onSubmit = handleSubmit(async ({ name }) => {
    try {
      // mutateAsync returns a promise (mutate doesn't), so the form can await it and catch errors.
      await rename.mutateAsync(name)
      onDone()
    } catch (error) {
      showMutationError(setError, error, ['name'], t)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <TextField
        label={t('household.details.name')}
        error={errors.name?.message}
        autoFocus
        {...register('name')}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {t('common.save')}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}
