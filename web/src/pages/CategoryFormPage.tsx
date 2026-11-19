import { zodResolver } from '@hookform/resolvers/zod'
import { type ReactNode, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import { ApiError, errorMessage, showMutationError } from '../api/errors'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { CheckboxField } from '../components/CheckboxField'
import { ConfirmButton } from '../components/ConfirmButton'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'
import {
  type CategoryInput,
  useCategory,
  useCategoryGroups,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '../finances/hooks'
import { type CategoryFormValues, categorySchema } from '../finances/schemas'
import { useFormatters } from '../i18n/format'

const LIST = '/finances/categories'
const str = (value: number | string | null | undefined) => (value == null ? '' : String(value))

/** /finances/categories/new?group=3 */
export function NewCategoryPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const create = useCreateCategory()
  const navigate = useNavigate()

  return (
    <Card className="max-w-2xl" title={t('finances.categories.newCategory')}>
      <CategoryForm
        defaultValues={{
          name: '',
          category_group_id: searchParams.get('group') ?? '',
          is_active: true,
          start_date: '',
          end_date: '',
          start_month: '',
          start_day: '',
          end_month: '',
          end_day: '',
        }}
        onSubmit={async (values) => {
          await create.mutateAsync(values)
          void navigate(LIST)
        }}
      />
    </Card>
  )
}

/** /finances/categories/:id */
export function EditCategoryPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const category = useCategory(id)
  const update = useUpdateCategory(id)
  const remove = useDeleteCategory(id)
  const navigate = useNavigate()

  if (category.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (category.isError) {
    return (
      <Alert tone="error">
        {errorMessage(category.error, t)}{' '}
        <TextLink to={LIST}>{t('finances.categories.backToList')}</TextLink>
      </Alert>
    )
  }

  const data = category.data
  const deleteError =
    remove.error instanceof ApiError && remove.error.status === 400
      ? t('finances.categories.categoryInUse')
      : remove.error && errorMessage(remove.error, t)

  return (
    <Card className="max-w-2xl" title={t('finances.categories.editCategory')}>
      {deleteError && (
        <div className="mb-4">
          <Alert tone="error">{deleteError}</Alert>
        </div>
      )}
      <CategoryForm
        isTransfer={data.is_transfer}
        defaultValues={{
          name: data.name,
          category_group_id: str(data.category_group.id),
          is_active: data.is_active ?? true,
          start_date: str(data.start_date),
          end_date: str(data.end_date),
          start_month: str(data.start_month),
          start_day: str(data.start_day),
          end_month: str(data.end_month),
          end_day: str(data.end_day),
        }}
        onSubmit={async (values) => {
          await update.mutateAsync(values)
          void navigate(LIST)
        }}
      >
        <ConfirmButton
          variant="danger"
          question={t('finances.categories.deleteCategoryConfirm')}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => void navigate(LIST) })}
        >
          {t('common.delete')}
        </ConfirmButton>
      </CategoryForm>
    </Card>
  )
}

function CategoryForm({
  defaultValues,
  isTransfer = false,
  onSubmit,
  children,
}: {
  defaultValues: CategoryFormValues
  /** The transfer category: it can be renamed or moved, but it's always on (no periods). */
  isTransfer?: boolean
  onSubmit: (values: CategoryInput) => Promise<void>
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const { monthName } = useFormatters()
  const groups = useCategoryGroups()
  const schema = useMemo(() => categorySchema(t), [t])
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
        [
          'name',
          'category_group_id',
          'start_date',
          'end_date',
          'start_month',
          'start_day',
          'end_month',
          'end_day',
        ],
        t,
      )
    }
  })

  const months = Array.from({ length: 12 }, (_, index) => index + 1)
  const monthOptions = (
    <>
      <option value="">—</option>
      {months.map((month) => (
        <option key={month} value={month}>
          {monthName(month)}
        </option>
      ))}
    </>
  )

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <TextField
        label={t('finances.categories.name')}
        error={errors.name?.message}
        {...register('name')}
      />
      <SelectField
        label={t('finances.categories.group')}
        error={errors.category_group_id?.message}
        {...register('category_group_id')}
      >
        <option value="">{groups.isPending ? t('common.loading') : t('common.choose')}</option>
        {groups.data?.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </SelectField>
      {isTransfer ? (
        <p className="text-xs text-slate-500">{t('finances.categories.transferHint')}</p>
      ) : (
        <>
          <CheckboxField label={t('finances.categories.isActive')} {...register('is_active')} />

          <fieldset className="flex flex-col gap-3 rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium">{t('finances.categories.period')}</legend>
            <p className="text-xs text-slate-500">{t('finances.categories.periodHelp')}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </fieldset>

          <fieldset className="flex flex-col gap-3 rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium">{t('finances.categories.yearly')}</legend>
            <p className="text-xs text-slate-500">{t('finances.categories.yearlyHelp')}</p>
            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <SelectField label={t('finances.categories.fromMonth')} {...register('start_month')}>
                {monthOptions}
              </SelectField>
              <TextField
                label={t('finances.categories.day')}
                inputMode="numeric"
                error={errors.start_day?.message}
                {...register('start_day')}
              />
              <SelectField label={t('finances.categories.toMonth')} {...register('end_month')}>
                {monthOptions}
              </SelectField>
              <TextField
                label={t('finances.categories.day')}
                inputMode="numeric"
                error={errors.end_day?.message}
                {...register('end_day')}
              />
            </div>
          </fieldset>
        </>
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
