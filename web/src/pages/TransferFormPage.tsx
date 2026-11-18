import { zodResolver } from '@hookform/resolvers/zod'
import { type ReactNode, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { errorMessage, showMutationError } from '../api/errors'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmButton } from '../components/ConfirmButton'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'
import {
  type Account,
  type TransferInput,
  useAccounts,
  useCreateTransfer,
  useDeleteTransfer,
  useTransfer,
  useUpdateTransfer,
} from '../finances/hooks'
import { type TransferFormValues, transferSchema } from '../finances/schemas'
import { today } from '../lib/dates'

const LIST = '/finances/accounts'

type AccountOption = Pick<Account, 'id' | 'name'>

/** /finances/transfers/new */
export function NewTransferPage() {
  const { t } = useTranslation()
  const create = useCreateTransfer()
  const navigate = useNavigate()

  return (
    <Card title={t('finances.transfers.new')}>
      <TransferForm
        defaultValues={{
          from_account_id: '',
          to_account_id: '',
          amount: '',
          date: today(),
          description: '',
        }}
        onSubmit={async (values) => {
          await create.mutateAsync(values)
          void navigate(LIST)
        }}
      />
    </Card>
  )
}

/** /finances/transfers/:id */
export function EditTransferPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const transfer = useTransfer(id)
  const update = useUpdateTransfer(id)
  const remove = useDeleteTransfer(id)
  const navigate = useNavigate()

  if (transfer.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (transfer.isError) {
    return (
      <Alert tone="error">
        {errorMessage(transfer.error, t)}{' '}
        <TextLink to={LIST}>{t('finances.accounts.backToList')}</TextLink>
      </Alert>
    )
  }

  const data = transfer.data
  return (
    <Card title={t('finances.transfers.edit')}>
      {remove.error && (
        <div className="mb-4">
          <Alert tone="error">{errorMessage(remove.error, t)}</Alert>
        </div>
      )}
      <TransferForm
        currentAccounts={[data.from_account, data.to_account]}
        defaultValues={{
          from_account_id: String(data.from_account.id),
          to_account_id: String(data.to_account.id),
          amount: data.amount,
          date: data.date ?? today(),
          description: data.description ?? '',
        }}
        onSubmit={async (values) => {
          await update.mutateAsync(values)
          void navigate(LIST)
        }}
      >
        <ConfirmButton
          variant="danger"
          question={t('finances.transfers.deleteConfirm')}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => void navigate(LIST) })}
        >
          {t('common.delete')}
        </ConfirmButton>
      </TransferForm>
    </Card>
  )
}

function TransferForm({
  defaultValues,
  currentAccounts = [],
  onSubmit,
  children,
}: {
  defaultValues: TransferFormValues
  /** Editing: the transfer's accounts stay selectable even if archived since. */
  currentAccounts?: AccountOption[]
  onSubmit: (values: TransferInput) => Promise<void>
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const schema = useMemo(() => transferSchema(t), [t])
  const accounts = useAccounts()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues })

  const options: AccountOption[] = (accounts.data ?? []).filter((account) => account.is_active)
  for (const account of currentAccounts) {
    if (!options.some((option) => option.id === account.id)) options.push(account)
  }

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values)
    } catch (error) {
      showMutationError(
        setError,
        error,
        ['from_account_id', 'to_account_id', 'amount', 'date', 'description'],
        t,
      )
    }
  })

  const accountOptions = (
    <>
      <option value="">{accounts.isPending ? t('common.loading') : t('common.choose')}</option>
      {options.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}
        </option>
      ))}
    </>
  )

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <p className="text-xs text-slate-500">{t('finances.transfers.hint')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label={t('finances.transfers.from')}
          error={errors.from_account_id?.message}
          {...register('from_account_id')}
        >
          {accountOptions}
        </SelectField>
        <SelectField
          label={t('finances.transfers.to')}
          error={errors.to_account_id?.message}
          {...register('to_account_id')}
        >
          {accountOptions}
        </SelectField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label={t('finances.fields.amount')}
          inputMode="decimal"
          autoComplete="off"
          error={errors.amount?.message}
          {...register('amount')}
        />
        <TextField
          label={t('finances.fields.date')}
          type="date"
          error={errors.date?.message}
          {...register('date')}
        />
      </div>
      <TextField
        label={t('finances.fields.description')}
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.sending') : t('common.save')}
        </Button>
        {children}
      </div>
    </form>
  )
}
