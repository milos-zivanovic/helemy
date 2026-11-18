import { zodResolver } from '@hookform/resolvers/zod'
import { type ReactNode, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { showMutationError } from '../api/errors'
import type { components } from '../api/schema'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useFormatters } from '../i18n/format'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { CategoryOptions } from './CategoryOptions'
import {
  type Account,
  type TransactionInput,
  useAccounts,
  useCategories,
  useTransactionSuggestions,
} from './hooks'
import { type Carry, KindToggle } from './KindToggle'
import { type TransactionFormValues, transactionSchema } from './schemas'

type CategoryOption = components['schemas']['CategoryList']

type TransactionFormProps = {
  defaultValues: TransactionFormValues
  /** Editing: the transaction's current category, kept selectable even if it's no longer active. */
  currentCategory?: CategoryOption
  /** Editing: the transaction's account, kept selectable even if it's archived. */
  currentAccount?: Pick<Account, 'id' | 'name'>
  /** Title suggestions only help when entering a new transaction. */
  withSuggestions?: boolean
  /** New entry: a third type, "transfer", that switches to the transfer form. */
  onTransfer?: (carry: Carry) => void
  submitLabel: string
  onSubmit: (values: TransactionInput) => Promise<unknown>
  children?: ReactNode // extra actions next to the submit button (e.g. delete)
}

// Shared by "new" and "edit": the page decides what happens on submit.
export function TransactionForm({
  defaultValues,
  currentCategory,
  currentAccount,
  withSuggestions = false,
  onTransfer,
  submitLabel,
  onSubmit,
  children,
}: TransactionFormProps) {
  const { t } = useTranslation()
  const { formatMoney } = useFormatters()
  const schema = useMemo(() => transactionSchema(t), [t])
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues })

  // useWatch re-renders the form when these fields change, so their values can drive other parts
  // (the category list depends on the date, suggestions on the title, the toggle's look on the type).
  const date = useWatch({ control, name: 'date' })
  const title = useWatch({ control, name: 'title' })
  const transactionType = useWatch({ control, name: 'transaction_type' })

  // Only categories active on the chosen date can be used; the API checks it too. The transfer
  // category belongs to transfers only (they're made with the "transfer" type).
  const categories = useCategories(date)
  const options = useMemo(() => {
    const list = (categories.data ?? []).filter((category) => !category.is_transfer)
    if (currentCategory && !list.some((category) => category.id === currentCategory.id)) {
      return [...list, currentCategory]
    }
    return list
  }, [categories.data, currentCategory])

  // New money goes only to active accounts; an archived one stays on its old transactions.
  const accounts = useAccounts()
  const activeAccounts = (accounts.data ?? []).filter((account) => account.is_active)
  const accountOptions: Pick<Account, 'id' | 'name'>[] = [...activeAccounts]
  if (currentAccount && !accountOptions.some((account) => account.id === currentAccount.id)) {
    accountOptions.push(currentAccount)
  }
  const activeAccountIds = new Set(activeAccounts.map((account) => account.id))

  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const query = useDebouncedValue(title.trim())
  const suggestions = useTransactionSuggestions(withSuggestions ? query : '')
  const visibleSuggestions = suggestionsOpen ? (suggestions.data ?? []) : []

  const applySuggestion = (suggestion: components['schemas']['TransactionSuggestion']) => {
    // setValue changes a field from code, as if the user had typed it.
    setValue('title', suggestion.title)
    setValue('transaction_type', suggestion.transaction_type)
    setValue('category_id', String(suggestion.category_id))
    // The suggestion's account only if it can still take new transactions.
    if (activeAccountIds.has(suggestion.account_id)) {
      setValue('account_id', String(suggestion.account_id))
    }
    setValue('is_fixed', suggestion.is_fixed)
    setValue('amount', suggestion.last_amount)
    setSuggestionsOpen(false)
  }

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values)
    } catch (error) {
      showMutationError(
        setError,
        error,
        ['title', 'amount', 'date', 'category_id', 'account_id', 'description', 'transaction_type'],
        t,
      )
    }
  })

  const titleField = register('title')

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}

      {/* The type is a form value (set from code: setValue, like the suggestions do), except
          "transfer", which hands the entry over to the transfer form. */}
      <KindToggle
        value={transactionType}
        kinds={onTransfer ? ['expense', 'income', 'transfer'] : ['expense', 'income']}
        onChange={(kind) => {
          if (kind !== 'transfer') {
            setValue('transaction_type', kind)
            return
          }
          const [amount, date, description] = getValues(['amount', 'date', 'description'])
          onTransfer?.({ amount, date, description })
        }}
      />

      <div className="relative">
        <TextField
          label={t('finances.fields.title')}
          autoComplete="off"
          error={errors.title?.message}
          {...titleField}
          onChange={(event) => {
            void titleField.onChange(event)
            setSuggestionsOpen(true)
          }}
          onBlur={(event) => {
            void titleField.onBlur(event)
            setSuggestionsOpen(false)
          }}
        />
        {visibleSuggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
            {visibleSuggestions.map((suggestion) => (
              <li key={suggestion.title}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100"
                  // mousedown fires before the input's blur; preventDefault keeps the focus (and
                  // the list) so the click lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applySuggestion(suggestion)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{suggestion.title}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {suggestion.category_group_name} / {suggestion.category_name}
                    </span>
                  </span>
                  <span className="shrink-0 text-slate-600">
                    {formatMoney(suggestion.last_amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label={t('finances.fields.amount')}
          inputMode="decimal" // numeric keyboard with a decimal separator on phones
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label={t('finances.fields.category')}
          error={errors.category_id?.message}
          {...register('category_id')}
        >
          <option value="">
            {categories.isPending ? t('common.loading') : t('common.choose')}
          </option>
          <CategoryOptions categories={options} />
        </SelectField>
        <SelectField
          label={t('finances.fields.account')}
          error={errors.account_id?.message}
          {...register('account_id')}
        >
          <option value="">{accounts.isPending ? t('common.loading') : t('common.choose')}</option>
          {accountOptions.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </SelectField>
      </div>

      <TextField
        label={t('finances.fields.description')}
        error={errors.description?.message}
        {...register('description')}
      />

      <CheckboxField label={t('finances.fields.isFixed')} {...register('is_fixed')} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.sending') : submitLabel}
        </Button>
        {children}
      </div>
    </form>
  )
}
