import { zodResolver } from '@hookform/resolvers/zod'
import { type ReactNode, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { showMutationError } from '../api/errors'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { FormDateField } from '../components/FormDateField'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { type Account, type TransferInput, useAccounts } from './hooks'
import { type Carry, type Kind, KindToggle } from './KindToggle'
import { type TransferFormValues, transferSchema } from './schemas'

type AccountOption = Pick<Account, 'id' | 'name'>

// Money from one account to another. The API stores it as two linked transactions (out of the
// first account, into the second), so it shows up in the transaction list under both accounts.
export function TransferForm({
  defaultValues,
  currentAccounts = [],
  onSwitch,
  onSubmit,
  children,
}: {
  defaultValues: TransferFormValues
  /** Editing: the transfer's accounts stay selectable even if archived since. */
  currentAccounts?: AccountOption[]
  /** New entry: the type toggle, to switch to the expense / income form. */
  onSwitch?: (kind: Kind, carry: Carry) => void
  onSubmit: (values: TransferInput) => Promise<void>
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const schema = useMemo(() => transferSchema(t), [t])
  const accounts = useAccounts()
  const {
    control,
    register,
    handleSubmit,
    setError,
    getValues,
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
      {onSwitch && (
        <KindToggle
          value="transfer"
          onChange={(kind) => {
            const [amount, date, description] = getValues(['amount', 'date', 'description'])
            onSwitch(kind, { amount, date, description })
          }}
        />
      )}
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
        <FormDateField control={control} name="date" label={t('finances.fields.date')} />
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
