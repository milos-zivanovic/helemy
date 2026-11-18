import { zodResolver } from '@hookform/resolvers/zod'
import { type ReactNode, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { ApiError, errorMessage, showMutationError } from '../api/errors'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmButton } from '../components/ConfirmButton'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'
import {
  type FoodInput,
  useCreateFood,
  useDeleteFood,
  useFood,
  useUpdateFood,
} from '../nutrition/hooks'
import { type FoodFormValues, foodSchema } from '../nutrition/schemas'

const LIST = '/nutrition/foods'
type MacroField = 'calories' | 'protein' | 'carbs' | 'fat'

/** /nutrition/foods/new */
export function NewFoodPage() {
  const { t } = useTranslation()
  const create = useCreateFood()
  const navigate = useNavigate()

  return (
    <Card title={t('nutrition.foods.new')}>
      <FoodForm
        defaultValues={{ name: '', calories: '', protein: '', carbs: '', fat: '', description: '' }}
        onSubmit={async (values) => {
          await create.mutateAsync(values)
          // Back where the user came from: the diary links here when a food is missing.
          void navigate(-1)
        }}
      />
    </Card>
  )
}

/** /nutrition/foods/:id */
export function EditFoodPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const food = useFood(id)
  const update = useUpdateFood(id)
  const remove = useDeleteFood(id)
  const navigate = useNavigate()

  if (food.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (food.isError) {
    return (
      <Alert tone="error">
        {errorMessage(food.error, t)}{' '}
        <TextLink to={LIST}>{t('nutrition.foods.backToList')}</TextLink>
      </Alert>
    )
  }

  const data = food.data
  return (
    <Card title={t('nutrition.foods.edit')}>
      {remove.error && (
        <div className="mb-4">
          <Alert tone="error">
            {remove.error instanceof ApiError && remove.error.status === 400
              ? t('nutrition.foods.inUse')
              : errorMessage(remove.error, t)}
          </Alert>
        </div>
      )}
      <FoodForm
        defaultValues={{
          name: data.name,
          calories: String(data.calories),
          protein: String(data.protein),
          carbs: String(data.carbs),
          fat: String(data.fat),
          description: data.description ?? '',
        }}
        onSubmit={async (values) => {
          await update.mutateAsync(values)
          void navigate(LIST)
        }}
      >
        <ConfirmButton
          variant="danger"
          question={t('nutrition.foods.deleteConfirm')}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => void navigate(LIST) })}
        >
          {t('common.delete')}
        </ConfirmButton>
      </FoodForm>
    </Card>
  )
}

function FoodForm({
  defaultValues,
  onSubmit,
  children,
}: {
  defaultValues: FoodFormValues
  onSubmit: (values: FoodInput) => Promise<void>
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const schema = useMemo(() => foodSchema(t), [t])
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
        ['name', 'calories', 'protein', 'carbs', 'fat', 'description'],
        t,
      )
    }
  })

  const macros: [MacroField, string][] = [
    ['calories', t('nutrition.fields.kcal')],
    ['protein', t('nutrition.fields.proteinG')],
    ['carbs', t('nutrition.fields.carbsG')],
    ['fat', t('nutrition.fields.fatG')],
  ]

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <TextField
        label={t('nutrition.fields.name')}
        error={errors.name?.message}
        {...register('name')}
      />
      <fieldset>
        <legend className="mb-2 text-sm text-slate-600">{t('nutrition.foods.per100Hint')}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {macros.map(([name, label]) => (
            <TextField
              key={name}
              label={label}
              inputMode="numeric"
              autoComplete="off"
              error={errors[name]?.message}
              {...register(name)}
            />
          ))}
        </div>
      </fieldset>
      <TextField
        label={t('nutrition.fields.description')}
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
