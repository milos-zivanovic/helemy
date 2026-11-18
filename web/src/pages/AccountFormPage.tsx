import { zodResolver } from '@hookform/resolvers/zod'
import { type ReactNode, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { ApiError, errorMessage, showMutationError } from '../api/errors'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { CheckboxField } from '../components/CheckboxField'
import { ConfirmButton } from '../components/ConfirmButton'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'
import {
  type AccountInput,
  useAccount,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
} from '../finances/hooks'
import { type AccountFormValues, accountSchema } from '../finances/schemas'
import { today } from '../lib/dates'

const LIST = '/finances/accounts'

/** /finances/accounts/new */
export function NewAccountPage() {
  const { t } = useTranslation()
  const create = useCreateAccount()
  const navigate = useNavigate()

  return (
    <Card title={t('finances.accounts.new')}>
      <AccountForm
        defaultValues={{ name: '', opening_balance: '0', opening_date: today(), is_active: true }}
        onSubmit={async (values) => {
          await create.mutateAsync(values)
          void navigate(LIST)
        }}
      />
    </Card>
  )
}

/** /finances/accounts/:id */
export function EditAccountPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const account = useAccount(id)
  const update = useUpdateAccount(id)
  const remove = useDeleteAccount(id)
  const navigate = useNavigate()

  if (account.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (account.isError) {
    return (
      <Alert tone="error">
        {errorMessage(account.error, t)}{' '}
        <TextLink to={LIST}>{t('finances.accounts.backToList')}</TextLink>
      </Alert>
    )
  }

  const data = account.data
  return (
    <Card title={t('finances.accounts.edit')}>
      {remove.error && (
        <div className="mb-4">
          {/* 400: the API refuses to delete an account in use; archiving is the way out. */}
          <Alert tone="error">
            {remove.error instanceof ApiError && remove.error.status === 400
              ? t('finances.accounts.inUse')
              : errorMessage(remove.error, t)}
          </Alert>
        </div>
      )}
      <AccountForm
        editing
        defaultValues={{
          name: data.name,
          opening_balance: data.opening_balance ?? '0',
          opening_date: data.opening_date ?? today(),
          is_active: data.is_active ?? true,
        }}
        onSubmit={async (values) => {
          await update.mutateAsync(values)
          void navigate(LIST)
        }}
      >
        <ConfirmButton
          variant="danger"
          question={t('finances.accounts.deleteConfirm')}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => void navigate(LIST) })}
        >
          {t('common.delete')}
        </ConfirmButton>
      </AccountForm>
    </Card>
  )
}

function AccountForm({
  defaultValues,
  editing = false,
  onSubmit,
  children,
}: {
  defaultValues: AccountFormValues
  editing?: boolean
  onSubmit: (values: AccountInput) => Promise<void>
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const schema = useMemo(() => accountSchema(t), [t])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues })

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values)
    } catch (error) {
      showMutationError(
        setError,
        error,
        ['name', 'opening_balance', 'opening_date', 'is_active'],
        t,
      )
    }
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <TextField
        label={t('finances.accounts.name')}
        error={errors.name?.message}
        {...register('name')}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label={t('finances.accounts.openingBalance')}
          inputMode="decimal"
          autoComplete="off"
          error={errors.opening_balance?.message}
          {...register('opening_balance')}
        />
        <TextField
          label={t('finances.accounts.openingDate')}
          type="date"
          error={errors.opening_date?.message}
          {...register('opening_date')}
        />
      </div>
      <p className="text-xs text-slate-500">{t('finances.accounts.openingHint')}</p>
      {editing && (
        <CheckboxField label={t('finances.accounts.isActive')} {...register('is_active')} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.sending') : t('common.save')}
        </Button>
        {children}
      </div>
    </form>
  )
}
