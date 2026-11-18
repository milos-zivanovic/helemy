import { zodResolver } from '@hookform/resolvers/zod'
import { type ReactNode, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { ApiError, errorMessage, ROOT_ERROR, showMutationError } from '../api/errors'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmButton } from '../components/ConfirmButton'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'
import { CategoryOptions } from '../finances/CategoryOptions'
import {
  type BudgetInput,
  useBudget,
  useCategories,
  useCreateBudget,
  useDeleteBudget,
  useUpdateBudget,
} from '../finances/hooks'
import { type BudgetFormValues, budgetSchema } from '../finances/schemas'
import { currentMonth, monthRange, shiftMonth, today } from '../lib/dates'

const LIST = '/finances/budgets'

/** /finances/budgets/new */
export function NewBudgetPage() {
  const { t } = useTranslation()
  const create = useCreateBudget()
  const navigate = useNavigate()
  const { start, end } = monthRange(currentMonth())

  return (
    <Card title={t('finances.budgets.new')}>
      <BudgetForm
        defaultValues={{
          category_id: '',
          amount: '',
          start_date: start,
          end_date: end,
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

/** /finances/budgets/:id */
export function EditBudgetPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const budget = useBudget(id)
  const update = useUpdateBudget(id)
  const remove = useDeleteBudget(id)
  const navigate = useNavigate()

  if (budget.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (budget.isError) {
    return (
      <Alert tone="error">
        {errorMessage(budget.error, t)}{' '}
        <TextLink to={LIST}>{t('finances.budgets.backToList')}</TextLink>
      </Alert>
    )
  }

  const data = budget.data
  return (
    <Card title={t('finances.budgets.edit')}>
      {remove.error && (
        <div className="mb-4">
          <Alert tone="error">{errorMessage(remove.error, t)}</Alert>
        </div>
      )}
      <BudgetForm
        defaultValues={{
          category_id: String(data.category.id),
          amount: data.amount,
          start_date: data.start_date,
          end_date: data.end_date,
          description: data.description ?? '',
        }}
        onSubmit={async (values) => {
          await update.mutateAsync(values)
          void navigate(LIST)
        }}
      >
        <ConfirmButton
          variant="danger"
          question={t('finances.budgets.deleteConfirm')}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => void navigate(LIST) })}
        >
          {t('common.delete')}
        </ConfirmButton>
      </BudgetForm>
    </Card>
  )
}

function BudgetForm({
  defaultValues,
  onSubmit,
  children,
}: {
  defaultValues: BudgetFormValues
  onSubmit: (values: BudgetInput) => Promise<void>
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const categories = useCategories()
  const schema = useMemo(() => budgetSchema(t), [t])
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues })

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values)
    } catch (error) {
      // The API's only non-field error here: another budget of this category overlaps the period.
      const body = error instanceof ApiError ? error.body : null
      if (typeof body === 'object' && body !== null && 'non_field_errors' in body) {
        setError(ROOT_ERROR, { message: t('finances.budgets.overlap') })
      } else {
        showMutationError(
          setError,
          error,
          ['category_id', 'amount', 'start_date', 'end_date', 'description'],
          t,
        )
      }
    }
  })

  // Quick periods: fill both dates with one click (shouldValidate clears an old date error).
  const setPeriod = (start: string, end: string) => {
    setValue('start_date', start, { shouldValidate: true })
    setValue('end_date', end, { shouldValidate: true })
  }
  const year = today().slice(0, 4)
  const presets = [
    { label: t('finances.budgets.thisMonth'), range: monthRange(currentMonth()) },
    { label: t('finances.budgets.nextMonth'), range: monthRange(shiftMonth(currentMonth(), 1)) },
    {
      label: t('finances.budgets.thisYear'),
      range: { start: `${year}-01-01`, end: `${year}-12-31` },
    },
  ]

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <SelectField
        label={t('finances.fields.category')}
        error={errors.category_id?.message}
        {...register('category_id')}
      >
        <option value="">{categories.isPending ? t('common.loading') : t('common.choose')}</option>
        <CategoryOptions categories={categories.data ?? []} />
      </SelectField>
      <TextField
        label={t('finances.budgets.amount')}
        inputMode="decimal"
        autoComplete="off"
        error={errors.amount?.message}
        {...register('amount')}
      />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="secondary"
              onClick={() => setPeriod(preset.range.start, preset.range.end)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label={t('finances.categories.startDate')}
            type="date"
            error={errors.start_date?.message}
            {...register('start_date')}
          />
          <TextField
            label={t('finances.categories.endDate')}
            type="date"
            error={errors.end_date?.message}
            {...register('end_date')}
          />
        </div>
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
